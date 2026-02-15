import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, fork } from 'child_process';
import { EventEmitter } from 'events';
import { join } from 'path';

export type DiarizationStatus = 'loading' | 'ready' | 'processing' | 'not-available' | 'error';

export interface DiarizationSegment {
  startMs: number;
  endMs: number;
  speaker: number;
}

export interface DiarizationResult {
  segments: DiarizationSegment[];
  error?: string;
}

export interface DiarizationEvents {
  status: [DiarizationStatus];
  result: [DiarizationResult];
}

@Injectable()
export class DiarizationService extends EventEmitter implements OnModuleDestroy {
  private worker: ChildProcess | null = null;
  private _status: DiarizationStatus = 'loading';
  private workerPath: string;

  constructor() {
    super();
    this.workerPath = join(__dirname, 'diarization-worker.js');
  }

  setWorkerPath(path: string): void {
    this.workerPath = path;
  }

  get status(): DiarizationStatus {
    return this._status;
  }

  get isAvailable(): boolean {
    return this._status === 'ready';
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
          case 'not-available':
            this._status = 'not-available';
            this.emit('status', this._status);
            console.log('[DiarizationService] Models not available:', msg.data);
            resolve(); // Resolve anyway, diarization is optional
            break;
          case 'processing':
            // Worker is processing audio (after stop-recording)
            this._status = msg.data ? 'processing' : 'ready';
            this.emit('status', this._status);
            break;
          case 'diarization-result':
            this.emit('result', msg.data as DiarizationResult);
            break;
          case 'error':
            this._status = 'error';
            this.emit('status', this._status);
            console.error('[DiarizationService] Worker error:', msg.data);
            resolve(); // Resolve anyway, diarization is optional
            break;
        }
      });

      this.worker.on('error', (err) => {
        this._status = 'error';
        this.emit('status', this._status);
        console.error('[DiarizationService] Worker process error:', err);
        resolve(); // Resolve anyway, diarization is optional
      });

      this.worker.on('exit', (code) => {
        console.log(`[DiarizationService] Worker exited with code ${code}`);
        this.worker = null;
        if (this._status === 'ready') {
          this._status = 'error';
          this.emit('status', this._status);
        }
      });
    });
  }

  feedAudioChunk(samples: Int16Array): void {
    if (!this.worker || this._status !== 'ready') return;
    this.worker.send({ type: 'audio-chunk', data: Array.from(samples) });
  }

  startRecording(): void {
    if (!this.worker || this._status !== 'ready') return;
    this.worker.send({ type: 'start-recording' });
  }

  stopRecording(): void {
    if (!this.worker || this._status !== 'ready') return;
    this.worker.send({ type: 'stop-recording' });
  }

  /**
   * Manually trigger diarization on accumulated audio.
   * Useful for incremental updates during long recordings.
   */
  runDiarization(): void {
    if (!this.worker || this._status !== 'ready') return;
    this.worker.send({ type: 'run-diarization' });
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
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
