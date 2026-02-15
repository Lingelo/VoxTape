import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, debounceTime, takeUntil } from 'rxjs';
import { ElectronIpcService } from './electron-ipc.service';
import { AudioCaptureService } from './audio-capture.service';
import { LlmService } from './llm.service';
import type { EnhancedNote, ChatMessage } from '@sourdine/shared-types';

export interface TranscriptSegment {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  isFinal: boolean;
  language?: string;
}

export type SessionStatus = 'idle' | 'recording' | 'processing' | 'done';

interface SessionListItem {
  id: string;
  title: string;
  durationMs: number;
  hasSummary: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SessionData {
  id: string;
  title?: string;
  userNotes?: string;
  segments?: TranscriptSegment[];
  aiNotes?: EnhancedNote[];
  aiSummary?: string;
  chatMessages?: ChatMessage[];
  durationMs?: number;
}

interface SourdineSessionApi {
  session?: {
    load: (id: string) => Promise<SessionData | null>;
    save: (data: SessionData & { createdAt: number; updatedAt: number }) => Promise<void>;
    delete: (id: string) => Promise<void>;
    list: () => Promise<SessionListItem[]>;
  };
}

@Injectable({ providedIn: 'root' })
export class SessionService implements OnDestroy {
  private readonly _id$ = new BehaviorSubject<string>(this.generateId());
  private readonly _status$ = new BehaviorSubject<SessionStatus>('idle');
  private readonly _segments$ = new BehaviorSubject<TranscriptSegment[]>([]);
  private readonly _userNotes$ = new BehaviorSubject<string>('');
  private readonly _title$ = new BehaviorSubject<string>('Nouvelle session');
  private readonly _elapsed$ = new BehaviorSubject<number>(0);
  private readonly _aiNotes$ = new BehaviorSubject<EnhancedNote[]>([]);
  private readonly _aiSummary$ = new BehaviorSubject<string>('');
  private readonly _chatMessages$ = new BehaviorSubject<ChatMessage[]>([]);
  private readonly _sessions$ = new BehaviorSubject<SessionListItem[]>([]);

  private recordingStartTime = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private llmSubs: Subscription[] = [];
  /** Pending setTimeout handles for cleanup */
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  // Auto-save subject
  private readonly _saveRequested$ = new Subject<void>();
  /** Destroy signal for RxJS takeUntil pattern */
  private readonly _destroy$ = new Subject<void>();

  private readonly ipc = inject(ElectronIpcService);
  private readonly audioCapture = inject(AudioCaptureService);
  private readonly llm = inject(LlmService);

  readonly id$: Observable<string> = this._id$.asObservable();
  readonly status$: Observable<SessionStatus> = this._status$.asObservable();
  readonly segments$: Observable<TranscriptSegment[]> = this._segments$.asObservable();
  readonly userNotes$: Observable<string> = this._userNotes$.asObservable();
  readonly title$: Observable<string> = this._title$.asObservable();
  readonly elapsed$: Observable<number> = this._elapsed$.asObservable();
  readonly aiNotes$: Observable<EnhancedNote[]> = this._aiNotes$.asObservable();
  readonly aiSummary$: Observable<string> = this._aiSummary$.asObservable();
  readonly chatMessages$: Observable<ChatMessage[]> = this._chatMessages$.asObservable();
  readonly sessions$: Observable<SessionListItem[]> = this._sessions$.asObservable();

  constructor() {
    // Subscribe to incoming transcript segments with cleanup
    this.ipc.segment$
      .pipe(takeUntil(this._destroy$))
      .subscribe((segment: TranscriptSegment) => {
        const current = this._segments$.value;
        this._segments$.next([...current, segment]);
        this.requestSave();
      });

    // Auto-save with 2s debounce
    this._saveRequested$
      .pipe(debounceTime(2000), takeUntil(this._destroy$))
      .subscribe(() => {
        this.saveSession();
      });

    // Load sessions list on startup
    this.loadSessionsList();
  }

  ngOnDestroy(): void {
    // Signal all subscriptions to complete
    this._destroy$.next();
    this._destroy$.complete();

    // Clear any pending timers
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Clear pending timeouts
    for (const timeout of this.pendingTimeouts) {
      clearTimeout(timeout);
    }
    this.pendingTimeouts = [];

    // Clean up LLM subscriptions
    this.llmSubs.forEach((s) => s.unsubscribe());
    this.llmSubs = [];
  }

  async startRecording(deviceId?: string): Promise<void> {
    if (this._status$.value === 'recording') return;

    const isResume = this._status$.value === 'done';

    if (!isResume) {
      // Fresh recording: clear everything
      this._segments$.next([]);
      this._aiNotes$.next([]);
    }

    // Always clear AI summary so "Generate notes" reappears after stop
    this._aiSummary$.next('');
    this._status$.next('recording');
    this.recordingStartTime = Date.now() - (isResume ? this._elapsed$.value : 0);

    // Start elapsed timer
    this.timerInterval = setInterval(() => {
      this._elapsed$.next(Date.now() - this.recordingStartTime);
    }, 1000);

    await this.audioCapture.startRecording(deviceId);
  }

  stopRecording(): void {
    if (this._status$.value !== 'recording') return;

    this.audioCapture.stopRecording();

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this._status$.next('done');
    this.requestSave();
  }

  updateNotes(notes: string): void {
    this._userNotes$.next(notes);
    this.requestSave();
  }

  updateTitle(title: string): void {
    this._title$.next(title);
    this.requestSave();
  }

  enhanceNotes(): void {
    const segments = this._segments$.value;
    const notes = this._userNotes$.value;

    if (segments.length === 0) return;

    this._status$.next('processing');

    // Build transcript text with segment IDs
    const transcript = segments
      .map((s) => `[${s.id}] ${s.text}`)
      .join('\n');

    // Clean up previous LLM subscriptions
    this.llmSubs.forEach((s) => s.unsubscribe());
    this.llmSubs = [];

    const requestId = this.llm.enhance(notes, transcript);

    const cleanupSubs = () => {
      this.llmSubs.forEach((s) => s.unsubscribe());
      this.llmSubs = [];
    };

    // Listen for completion
    this.llmSubs.push(
      this.llm.complete$.subscribe((payload) => {
        if (payload.requestId !== requestId) return;
        try {
          const { title, body } = this.extractTitleFromSummary(payload.fullText || '');
          if (title) this._title$.next(title);
          this._aiSummary$.next(body);
        } catch (err) {
          console.error('[SessionService] Error parsing enhance result:', err);
          this._aiSummary$.next(payload.fullText || '');
        }
        this._status$.next('done');
        this.requestSave();
        cleanupSubs();
      }),
      this.llm.error$.subscribe((payload) => {
        if (payload.requestId !== requestId) return;
        console.error('[SessionService] Enhance error:', payload.error);
        this._status$.next('done');
        cleanupSubs();
      })
    );
  }

  addChatMessage(msg: { role: 'user' | 'assistant'; content: string }): void {
    const chatMessage: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: msg.role,
      content: msg.content,
      createdAt: Date.now(),
    };
    this._chatMessages$.next([...this._chatMessages$.value, chatMessage]);
    this.requestSave();
  }

  resetSession(): void {
    this._id$.next(this.generateId());
    this._status$.next('idle');
    this._segments$.next([]);
    this._userNotes$.next('');
    this._title$.next('Nouvelle session');
    this._elapsed$.next(0);
    this._aiNotes$.next([]);
    this._aiSummary$.next('');
    this._chatMessages$.next([]);
  }

  private get sourdineApi(): SourdineSessionApi | undefined {
    return (window as Window & { sourdine?: SourdineSessionApi }).sourdine;
  }

  /** Load a session from persistence */
  async loadSession(id: string): Promise<void> {
    const api = this.sourdineApi?.session;
    if (!api) return;

    const data = await api.load(id);
    if (!data) return;

    this._id$.next(data.id);
    this._title$.next(data.title || 'Sans titre');
    this._userNotes$.next(data.userNotes || '');
    this._segments$.next(data.segments || []);
    this._aiNotes$.next(data.aiNotes || []);
    this._aiSummary$.next(data.aiSummary || '');
    this._chatMessages$.next(data.chatMessages || []);
    this._elapsed$.next(data.durationMs || 0);
    this._status$.next('done');
  }

  /** Delete a session */
  async deleteSession(id: string): Promise<void> {
    const api = this.sourdineApi?.session;
    if (!api) return;
    await api.delete(id);

    // If the deleted session was active, reset to new session
    if (this._id$.value === id) {
      this.newSession();
    }

    await this.loadSessionsList();
  }

  /** Create a new session */
  newSession(): void {
    this.resetSession();
  }

  /** Refresh the sessions list from the database */
  async refreshSessions(): Promise<void> {
    await this.loadSessionsList();
  }

  /** Clear all cached state (call after app reset) */
  clearAllState(): void {
    this.resetSession();
    this._sessions$.next([]);
  }

  private parseEnhanceResponse(text: string): EnhancedNote[] {
    // Try to extract JSON from the response
    let jsonStr = text.trim();

    // Handle case where LLM wraps in markdown code block
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Find the JSON array
    const arrayStart = jsonStr.indexOf('[');
    const arrayEnd = jsonStr.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd !== -1) {
      jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error('Expected array');

    return parsed.map((item: { type?: string; text?: string; segmentIds?: string[] }, i: number) => {
      const validTypes = ['decision', 'action-item', 'key-point', 'summary'] as const;
      const noteType = validTypes.includes(item.type as typeof validTypes[number])
        ? (item.type as typeof validTypes[number])
        : 'key-point';
      return {
        id: `ai-${i}`,
        type: noteType,
        text: item.text || '',
        segmentIds: item.segmentIds || [],
      };
    });
  }

  private requestSave(): void {
    this._saveRequested$.next();
  }

  private async saveSession(): Promise<void> {
    const api = this.sourdineApi?.session;
    if (!api) return;

    // Don't persist sessions with no segments
    if (this._segments$.value.length === 0) return;

    await api.save({
      id: this._id$.value,
      title: this._title$.value,
      userNotes: this._userNotes$.value,
      segments: this._segments$.value,
      aiNotes: this._aiNotes$.value,
      aiSummary: this._aiSummary$.value,
      chatMessages: this._chatMessages$.value,
      durationMs: this._elapsed$.value,
      createdAt: this.recordingStartTime || Date.now(),
      updatedAt: Date.now(),
    });

    await this.loadSessionsList();
  }

  private async loadSessionsList(): Promise<void> {
    const api = this.sourdineApi?.session;
    if (!api) {
      // Preload not ready yet, retry after a short delay
      const timeout = setTimeout(() => this.loadSessionsList(), 500);
      this.pendingTimeouts.push(timeout);
      return;
    }

    try {
      const sessions = await api.list();
      this._sessions$.next(sessions || []);
    } catch {
      // DB not available yet, retry
      const timeout = setTimeout(() => this.loadSessionsList(), 1000);
      this.pendingTimeouts.push(timeout);
    }
  }

  private extractTitleFromSummary(text: string): { title: string; body: string } {
    const lines = text.split('\n');
    const firstLine = lines[0]?.trim() || '';

    // Check for "Titre: ..." pattern (with optional ### ## # prefix)
    const match = firstLine.match(/^(?:#{1,3}\s*)?Titre\s*:\s*(.+)$/i);
    let body = match ? lines.slice(1).join('\n').trim() : text;
    const title = match ? match[1].trim() : '';

    // Strip "Mes notes" section if the LLM included it
    body = body.replace(/---+\s*\n/g, '\n');
    body = body.replace(/#{1,3}\s*Mes notes\s*:?[\s\S]*$/i, '').trim();

    return { title, body };
  }

  private generateId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
