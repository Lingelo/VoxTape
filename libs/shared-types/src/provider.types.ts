export type LlmProviderId = 'local' | 'openai' | 'anthropic' | 'gemini';
export type SttProviderId = 'local' | 'deepgram';

export interface CloudModel {
  id: string;
  name: string;
  contextWindow: number;
  inputPricePerMToken: number;
  outputPricePerMToken: number;
}

export interface SttCloudModel {
  id: string;
  name: string;
  pricePerMinute: number;
}

export const LLM_MODELS: Record<LlmProviderId, CloudModel[]> = {
  local: [],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, inputPricePerMToken: 2.5, outputPricePerMToken: 10 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, inputPricePerMToken: 0.15, outputPricePerMToken: 0.6 },
    { id: 'gpt-4.1', name: 'GPT-4.1', contextWindow: 1047576, inputPricePerMToken: 2, outputPricePerMToken: 8 },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', contextWindow: 1047576, inputPricePerMToken: 0.4, outputPricePerMToken: 1.6 },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', contextWindow: 1047576, inputPricePerMToken: 0.1, outputPricePerMToken: 0.4 },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000, inputPricePerMToken: 3, outputPricePerMToken: 15 },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200000, inputPricePerMToken: 0.8, outputPricePerMToken: 4 },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1048576, inputPricePerMToken: 0.15, outputPricePerMToken: 0.6 },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576, inputPricePerMToken: 0.1, outputPricePerMToken: 0.4 },
  ],
};

export const STT_MODELS: Record<SttProviderId, SttCloudModel[]> = {
  local: [],
  deepgram: [
    { id: 'nova-3', name: 'Nova 3', pricePerMinute: 0.0043 },
    { id: 'nova-2', name: 'Nova 2', pricePerMinute: 0.0036 },
  ],
};
