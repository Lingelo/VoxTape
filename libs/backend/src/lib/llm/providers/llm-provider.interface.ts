import type { LlmProviderId } from '@voxtape/shared-types';

export interface LlmProviderStreamResult {
  token?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmProviderOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmProvider {
  id: LlmProviderId;
  stream(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    options: LlmProviderOptions,
    signal: AbortSignal,
  ): AsyncGenerator<LlmProviderStreamResult>;
}
