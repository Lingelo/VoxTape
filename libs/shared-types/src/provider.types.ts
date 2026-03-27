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
