import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, fork } from 'child_process';
import { EventEmitter } from 'events';
import { join } from 'path';
import { TranscriptSegment, SttStatus, SttProviderId } from '@voxtape/shared-types';
import { DeepgramSttProvider } from './providers/deepgram-stt.provider.js';
import type { SttProvider } from './providers/stt-provider.interface.js';
import { mixAudioChannels } from './audio-mixer.js';
import { AudioBuffer } from './audio-buffer.js';

export type AudioChannel = 'mic' | 'system';

export interface SttEvents {
  segment: [TranscriptSegment];
  partial: [{ text: string }];
  status: [SttStatus];
  'speech-detected': [boolean];
}

@Injectable()
export class SttService extends EventEmitter implements OnModuleDestroy {
  private worker: ChildProcess | null = null;
  private _status: SttStatus = 'loading';
  private workerPath: string;
  private speechState: Record<AudioChannel, boolean> = { mic: false, system: false };

  // Cloud STT support
  private _activeProvider: SttProviderId = 'local';
  private _cloudModel: string | null = null;
  private _language = 'fr';
  private cloudProvider: SttProvider | null = null;
  private _getApiKey: ((provider: string) => string | null) | null = null;
  private audioBuffer = new AudioBuffer(30);
  private latestSystemChunk: Int16Array | null = null;

  constructor() {
    super();
    this.workerPath = join(__dirname, 'stt-worker.js');
  }

  setWorkerPath(path: string): void {
    this.workerPath = path;
  }

  get status(): SttStatus {
    return this._status;
  }

  setSttConfig(opts: { provider?: SttProviderId; model?: string | null; language?: string }): void {
    if (opts.provider) this._activeProvider = opts.provider;
    if (opts.model !== undefined) this._cloudModel = opts.model;
    if (opts.language) this._language = opts.language;
  }

  setApiKeyResolver(resolver: (provider: string) => string | null): void {
    this._getApiKey = resolver;
  }

  async initialize(): Promise<void> {
    if (this._activeProvider !== 'local') {
      await this.initializeCloud();
      return;
    }
    await this.initializeLocal();
  }

  private async initializeLocal(): Promise<void> {
    if (this.worker) return;

    this._status = 'loading';
    this.emit('status', this._status);

    return new Promise<void>((resolve, reject) => {
      this.worker = fork(this.workerPath, [], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        serialization: 'advanced',
      });

      this.worker.on('message', (msg: any) => {
        switch (msg.type) {
          case 'ready':
            this._status = 'ready';
            this.emit('status', this._status);
            resolve();
            break;
          case 'segment':
            this.emit('segment', msg.data as TranscriptSegment);
            break;
          case 'partial':
            this.emit('partial', { text: msg.data.text });
            break;
          case 'speech-detected': {
            const channel = (msg.channel as AudioChannel) || 'mic';
            this.speechState[channel] = msg.data as boolean;
            const anySpeaking = this.speechState.mic || this.speechState.system;
            this.emit('speech-detected', anySpeaking);
            break;
          }
          case 'error':
            this._status = 'error';
            this.emit('status', this._status);
            console.error('[SttService] Worker error:', msg.data);
            reject(new Error(msg.data));
            break;
        }
      });

      this.worker.on('error', (err) => {
        this._status = 'error';
        this.emit('status', this._status);
        console.error('[SttService] Worker process error:', err);
        reject(err);
      });

      this.worker.on('exit', (code) => {
        console.log(`[SttService] Worker exited with code ${code}`);
        this.worker = null;
        if (this._status !== 'error') {
          this._status = 'error';
          this.emit('status', this._status);
        }
      });
    });
  }

  private async initializeCloud(): Promise<void> {
    const apiKey = this._getApiKey?.(this._activeProvider);
    if (!apiKey) {
      console.error(`[SttService] No API key for ${this._activeProvider}`);
      this._status = 'error';
      this.emit('status', this._status);
      return;
    }

    const model = this._cloudModel || 'nova-3';

    this.cloudProvider = new DeepgramSttProvider();

    this.cloudProvider.onSegment((segment) => {
      this.emit('segment', segment);
    });

    this.cloudProvider.onPartial((text) => {
      this.emit('partial', { text });
    });

    this.cloudProvider.onError((err) => {
      console.error(`[SttService] Cloud STT error: ${err.message}`);
      this.handleCloudFailover();
    });

    this.cloudProvider.start(apiKey, { language: this._language, model });
    this._status = 'ready';
    this.emit('status', this._status);
    this.audioBuffer.clear();
  }

  private async handleCloudFailover(): Promise<void> {
    console.log('[SttService] Cloud STT failed, attempting local fallback...');
    this.cloudProvider?.destroy();
    this.cloudProvider = null;

    // Switch to local and replay buffered audio
    this._activeProvider = 'local';
    this._status = 'loading';
    this.emit('status', this._status);

    try {
      await this.initializeLocal();
      // Replay buffered audio to local worker
      const buffered = this.audioBuffer.drain();
      for (const chunk of buffered) {
        this.feedAudioChunk(chunk, 'mic');
      }
      console.log(`[SttService] Replayed ${buffered.length} buffered chunks to local STT`);
    } catch (err: any) {
      console.error('[SttService] Local STT fallback also failed:', err?.message);
      this._status = 'error';
      this.emit('status', this._status);
    }
  }

  feedAudioChunk(samples: Int16Array, channel: AudioChannel = 'mic'): void {
    if (this.cloudProvider) {
      // For cloud STT, buffer audio and mix channels
      this.audioBuffer.push(samples);

      if (channel === 'system') {
        // Keep latest system chunk for mixing with next mic chunk
        this.latestSystemChunk = samples;
      } else {
        // Mix mic with latest system chunk if available
        if (this.latestSystemChunk) {
          const mixed = mixAudioChannels(samples, this.latestSystemChunk);
          this.cloudProvider.feedAudio(mixed);
          this.latestSystemChunk = null;
        } else {
          this.cloudProvider.feedAudio(samples);
        }
      }
      return;
    }

    // Local STT: forward to worker as before
    if (!this.worker || this._status !== 'ready') return;
    this.worker.send({ type: 'audio-chunk', data: Array.from(samples), channel });
  }

  startRecording(): void {
    if (this.cloudProvider) {
      // Cloud STT is already streaming
      return;
    }
    if (!this.worker) return;
    this.worker.send({ type: 'start-recording' });
  }

  stopRecording(): void {
    if (this.cloudProvider) {
      this.cloudProvider.stop();
      this.cloudProvider = null;
      this.audioBuffer.clear();
      this.latestSystemChunk = null;
      return;
    }
    if (!this.worker) return;
    this.worker.send({ type: 'stop-recording' });
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }

  async restart(): Promise<void> {
    await this.shutdown();
    this._status = 'loading';
    this.emit('status', this._status);
    await this.initialize();
  }

  async shutdown(): Promise<void> {
    this.cloudProvider?.destroy();
    this.cloudProvider = null;
    this.audioBuffer.clear();

    if (this.worker) {
      this.worker.send({ type: 'shutdown' });
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.worker?.kill('SIGKILL');
          resolve();
        }, 3000);
        this.worker!.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      this.worker = null;
    }
  }
}
