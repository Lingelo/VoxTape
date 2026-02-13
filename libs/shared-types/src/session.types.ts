import { TranscriptSegment } from './transcript.types.js';
import { EnhancedNote } from './llm.types.js';

export type SessionStatus = 'idle' | 'recording' | 'processing' | 'done';

export interface SessionState {
  id: string;
  title: string;
  status: SessionStatus;
  startedAt: number | null;
  segments: TranscriptSegment[];
  userNotes: string;
  aiSummary?: string;
  aiNotes: EnhancedNote[];
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
}

export type SttStatus = 'loading' | 'ready' | 'error';

export interface WidgetState {
  isRecording: boolean;
  audioLevel: number; // 0-1 normalized
}
