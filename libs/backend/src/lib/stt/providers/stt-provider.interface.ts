import type { SttProviderId, TranscriptSegment } from '@voxtape/shared-types';

export interface SttProvider {
  id: SttProviderId;
  start(apiKey: string, options: { language: string; model: string }): void;
  feedAudio(chunk: Int16Array): void;
  stop(): void;
  onSegment(callback: (segment: TranscriptSegment) => void): void;
  onPartial(callback: (text: string) => void): void;
  onError(callback: (error: Error) => void): void;
  destroy(): void;
}
