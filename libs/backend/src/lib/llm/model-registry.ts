import { LlmProviderId, LLM_MODELS } from '@voxtape/shared-types';

export { LLM_MODELS };

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
