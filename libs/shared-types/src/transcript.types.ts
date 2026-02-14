export type AudioSource = 'mic' | 'system';

export interface TranscriptSegment {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  isFinal: boolean;
  language?: string;
  source?: AudioSource;
}
