export type LlmStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

export interface LlmPromptPayload {
  requestId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmTokenPayload {
  requestId: string;
  token: string;
  isLast: boolean;
}

export interface LlmCompletePayload {
  requestId: string;
  fullText: string;
  tokensGenerated: number;
  durationMs: number;
}

export interface LlmErrorPayload {
  requestId: string;
  error: string;
}

export type EnhancedNoteType = 'decision' | 'action-item' | 'key-point' | 'summary';

export interface EnhancedNote {
  id: string;
  type: EnhancedNoteType;
  text: string;
  segmentIds: string[];
}
