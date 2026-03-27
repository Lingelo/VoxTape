import type { LlmProviderId, CloudModel } from '@voxtape/shared-types';

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

export function estimateCostUsd(
  providerId: LlmProviderId,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const models = LLM_MODELS[providerId];
  const model = models.find((m) => m.id === modelId);
  if (!model) return 0;
  return (inputTokens * model.inputPricePerMToken + outputTokens * model.outputPricePerMToken) / 1_000_000;
}

export function getModelContextWindow(providerId: LlmProviderId, modelId: string): number {
  const models = LLM_MODELS[providerId];
  const model = models.find((m) => m.id === modelId);
  return model?.contextWindow ?? 0;
}
