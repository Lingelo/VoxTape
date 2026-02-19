import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ChildProcess, fork } from 'child_process';
import { EventEmitter } from 'events';
import { join } from 'path';
import {
  LlmStatus,
  LlmPromptPayload,
  LlmTokenPayload,
  LlmCompletePayload,
  LlmErrorPayload,
} from '@voxtape/shared-types';

export interface LlmEvents {
  token: [LlmTokenPayload];
  complete: [LlmCompletePayload];
  error: [LlmErrorPayload];
  status: [LlmStatus];
}

@Injectable()
export class LlmService extends EventEmitter implements OnModuleDestroy {
  private worker: ChildProcess | null = null;
  private _status: LlmStatus = 'idle';
  private workerPath: string;

  constructor() {
    super();
    this.workerPath = join(__dirname, 'llm-worker.js');
  }

  setWorkerPath(path: string): void {
    this.workerPath = path;
  }

  get status(): LlmStatus {
    return this._status;
  }

  private _contextSize = 4096;
  private _defaultTemperature = 0.7;

  setLlmConfig(opts: { contextSize?: number; temperature?: number }): void {
    if (opts.contextSize) this._contextSize = opts.contextSize;
    if (opts.temperature !== undefined) this._defaultTemperature = opts.temperature;
  }

  async initialize(): Promise<void> {
    if (this.worker) {
      // Already initialized or initializing
      if (this._status === 'ready' || this._status === 'loading') return;
    }

    this.spawnWorker();
    this.worker!.send({ type: 'initialize', data: { contextSize: this._contextSize } });
  }

  private spawnWorker(): void {
    if (this.worker) return;

    this.worker = fork(this.workerPath, [], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      serialization: 'advanced',
    });

    this.worker.on('message', (msg: any) => {
      switch (msg.type) {
        case 'status':
          this._status = msg.data as LlmStatus;
          this.emit('status', this._status);
          break;
        case 'token':
          this.emit('token', msg.data as LlmTokenPayload);
          break;
        case 'complete':
          this.emit('complete', msg.data as LlmCompletePayload);
          break;
        case 'error':
          this.emit('error', msg.data as LlmErrorPayload);
          break;
      }
    });

    this.worker.on('error', (err) => {
      console.error('[LlmService] Worker process error:', err);
      this._status = 'error';
      this.emit('status', this._status);
    });

    this.worker.on('exit', (code) => {
      console.log(`[LlmService] Worker exited with code ${code}`);
      this.worker = null;
      if (this._status !== 'idle') {
        this._status = 'error';
        this.emit('status', this._status);
      }
    });
  }

  prompt(payload: LlmPromptPayload): void {
    if (!this.worker) {
      this.spawnWorker();
    }
    // Apply default temperature from config if not explicitly set
    const data = {
      ...payload,
      temperature: payload.temperature ?? this._defaultTemperature,
    };
    this.worker!.send({ type: 'prompt', data });
  }

  cancel(): void {
    this.worker?.send({ type: 'cancel' });
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
        }, 5000);
        this.worker!.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      this.worker = null;
      this._status = 'idle';
    }
  }
}
