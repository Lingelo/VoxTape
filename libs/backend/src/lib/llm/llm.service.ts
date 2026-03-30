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
  LlmProviderId,
} from '@voxtape/shared-types';
import type { LlmProvider } from './providers/llm-provider.interface.js';
import { OpenAiLlmProvider } from './providers/openai-llm.provider.js';
import { AnthropicLlmProvider } from './providers/anthropic-llm.provider.js';
import { GeminiLlmProvider } from './providers/gemini-llm.provider.js';
import { estimateCostUsd } from './model-registry.js';

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

  // Cloud provider support
  private cloudProviders: Record<string, LlmProvider> = {
    openai: new OpenAiLlmProvider(),
    anthropic: new AnthropicLlmProvider(),
    gemini: new GeminiLlmProvider(),
  };
  private _activeProvider: LlmProviderId = 'local';
  private _cloudModel: string | null = null;
  private _cloudAbortController: AbortController | null = null;
  private _getApiKey: ((provider: string) => string | null) | null = null;

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
  private _modelPath: string | null = null;

  setLlmConfig(opts: {
    contextSize?: number;
    temperature?: number;
    modelPath?: string | null;
    provider?: LlmProviderId;
    model?: string | null;
  }): void {
    if (opts.contextSize) this._contextSize = opts.contextSize;
    if (opts.temperature !== undefined) this._defaultTemperature = opts.temperature;
    if (opts.modelPath !== undefined) this._modelPath = opts.modelPath;
    if (opts.provider) this._activeProvider = opts.provider;
    if (opts.model !== undefined) this._cloudModel = opts.model;
  }

  setApiKeyResolver(resolver: (provider: string) => string | null): void {
    this._getApiKey = resolver;
  }

  async initialize(): Promise<void> {
    if (this._activeProvider !== 'local') {
      // Cloud providers don't need initialization — mark ready
      this._status = 'ready';
      this.emit('status', this._status);
      return;
    }

    if (this.worker) {
      if (this._status === 'ready' || this._status === 'loading') return;
    }

    this.spawnWorker();
    this.worker!.send({ type: 'initialize', data: { contextSize: this._contextSize, modelPath: this._modelPath } });
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
    if (this._activeProvider !== 'local') {
      this.promptCloud(payload);
      return;
    }
    this.promptLocal(payload);
  }

  private promptLocal(payload: LlmPromptPayload): void {
    if (!this.worker) {
      this.spawnWorker();
    }
    const data = {
      ...payload,
      temperature: payload.temperature ?? this._defaultTemperature,
    };
    this.worker!.send({ type: 'prompt', data });
  }

  private async promptCloud(payload: LlmPromptPayload): Promise<void> {
    const provider = this.cloudProviders[this._activeProvider];
    if (!provider) {
      this.emit('error', { requestId: payload.requestId, error: `Unknown provider: ${this._activeProvider}` } as LlmErrorPayload);
      return;
    }

    const apiKey = this._getApiKey?.(this._activeProvider);
    if (!apiKey) {
      this.emit('error', { requestId: payload.requestId, error: `No API key for ${this._activeProvider}` } as LlmErrorPayload);
      return;
    }

    const model = this._cloudModel;
    if (!model) {
      this.emit('error', { requestId: payload.requestId, error: 'No model selected' } as LlmErrorPayload);
      return;
    }

    this._cloudAbortController = new AbortController();
    this._status = 'generating';
    this.emit('status', this._status);

    const startTime = Date.now();
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = provider.stream(
        apiKey,
        payload.systemPrompt,
        payload.userPrompt,
        {
          model,
          maxTokens: payload.maxTokens,
          temperature: payload.temperature ?? this._defaultTemperature,
        },
        this._cloudAbortController.signal,
      );

      for await (const chunk of stream) {
        if (chunk.token) {
          fullText += chunk.token;
          this.emit('token', {
            requestId: payload.requestId,
            token: chunk.token,
            isLast: false,
          } as LlmTokenPayload);
        }
        if (chunk.inputTokens !== undefined) inputTokens = chunk.inputTokens;
        if (chunk.outputTokens !== undefined) outputTokens = chunk.outputTokens;
      }

      const durationMs = Date.now() - startTime;
      const estimatedCost = estimateCostUsd(this._activeProvider, model, inputTokens, outputTokens);

      this.emit('complete', {
        requestId: payload.requestId,
        fullText,
        tokensGenerated: outputTokens || fullText.split(/\s+/).length,
        durationMs,
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimatedCost,
        provider: this._activeProvider,
      } as LlmCompletePayload);
    } catch (err: any) {
      this._cloudAbortController = null;
      if (err?.name === 'AbortError') {
        // Cancelled by user — not an error
        this._status = 'ready';
        this.emit('status', this._status);
        this.emit('complete', {
          requestId: payload.requestId,
          fullText,
          tokensGenerated: outputTokens || 0,
          durationMs: Date.now() - startTime,
          provider: this._activeProvider,
        } as LlmCompletePayload);
      } else {
        console.error(`[LlmService] Cloud provider error (${this._activeProvider}):`, err?.message);
        // One-time local fallback without mutating the configured provider
        if (this.worker || this._modelPath) {
          console.log('[LlmService] One-time fallback to local LLM (cloud provider unchanged)');
          this.emit('status', 'loading');
          this.promptLocal(payload);
        } else {
          this._status = 'ready';
          this.emit('status', this._status);
          this.emit('error', {
            requestId: payload.requestId,
            error: err?.message || 'Cloud provider error',
          } as LlmErrorPayload);
        }
      }
      return;
    }
    this._cloudAbortController = null;
    this._status = 'ready';
    this.emit('status', this._status);
  }

  cancel(): void {
    if (this._cloudAbortController) {
      this._cloudAbortController.abort();
      return;
    }
    this.worker?.send({ type: 'cancel' });
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }

  async shutdown(): Promise<void> {
    this._cloudAbortController?.abort();
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
