import { TranscriptSegment } from './transcript.types.js';
import { EnhancedNote } from './llm.types.js';

export type SessionStatus = 'idle' | 'recording' | 'draining' | 'processing' | 'done';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface SessionState {
  id: string;
  title: string;
  status: SessionStatus;
  startedAt: number | null;
  segments: TranscriptSegment[];
  userNotes: string;
  aiSummary?: string;
  aiNotes: EnhancedNote[];
  chatMessages?: ChatMessage[];
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
}

export type SttStatus = 'loading' | 'ready' | 'error';

