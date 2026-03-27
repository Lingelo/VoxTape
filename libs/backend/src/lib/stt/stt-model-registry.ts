import type { SttProviderId, SttCloudModel } from '@voxtape/shared-types';

export const STT_MODELS: Record<SttProviderId, SttCloudModel[]> = {
  local: [],
  deepgram: [
    { id: 'nova-3', name: 'Nova 3', pricePerMinute: 0.0043 },
    { id: 'nova-2', name: 'Nova 2', pricePerMinute: 0.0036 },
  ],
};

export function estimateSttCostUsd(
  providerId: SttProviderId,
  modelId: string,
  durationSeconds: number,
): number {
  const models = STT_MODELS[providerId];
  const model = models.find((m) => m.id === modelId);
  if (!model) return 0;
  return (durationSeconds / 60) * model.pricePerMinute;
}
