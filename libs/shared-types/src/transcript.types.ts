export type AudioSource = 'mic' | 'system';

export interface TranscriptSegment {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  isFinal: boolean;
  language?: string;
  source?: AudioSource;
  /** Speaker ID from diarization (0, 1, 2, ...) */
  speaker?: number;
  /** True if user manually edited this segment */
  isEdited?: boolean;
  /** Original STT text before manual edit */
  originalText?: string;
}
