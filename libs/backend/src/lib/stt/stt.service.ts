import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, fork } from 'child_process';
import { EventEmitter } from 'events';
import { join } from 'path';
import { TranscriptSegment, SttStatus } from '@sourdine/shared-types';

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

  async initialize(): Promise<void> {
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
          case 'speech-detected':
            this.emit('speech-detected', msg.data as boolean);
            break;
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

  feedAudioChunk(samples: Int16Array, channel: AudioChannel = 'mic'): void {
    if (!this.worker || this._status !== 'ready') return;
    this.worker.send({ type: 'audio-chunk', data: Array.from(samples), channel });
  }

  startRecording(): void {
    if (!this.worker) return;
    this.worker.send({ type: 'start-recording' });
  }

  stopRecording(): void {
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
