import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, debounceTime } from 'rxjs';
import { ElectronIpcService } from './electron-ipc.service';
import { AudioCaptureService } from './audio-capture.service';
import { LlmService } from './llm.service';
import type { EnhancedNote } from '@sourdine/shared-types';

export interface TranscriptSegment {
  id: string;
  text: string;
  startTimeMs: number;
  endTimeMs: number;
  isFinal: boolean;
  language?: string;
}

export type SessionStatus = 'idle' | 'recording' | 'processing' | 'done';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly _id$ = new BehaviorSubject<string>(this.generateId());
  private readonly _status$ = new BehaviorSubject<SessionStatus>('idle');
  private readonly _segments$ = new BehaviorSubject<TranscriptSegment[]>([]);
  private readonly _userNotes$ = new BehaviorSubject<string>('');
  private readonly _title$ = new BehaviorSubject<string>('Nouvelle session');
  private readonly _elapsed$ = new BehaviorSubject<number>(0);
  private readonly _aiNotes$ = new BehaviorSubject<EnhancedNote[]>([]);
  private readonly _aiSummary$ = new BehaviorSubject<string>('');
  private readonly _chatMessages$ = new BehaviorSubject<{ role: 'user' | 'assistant'; content: string }[]>([]);
  private readonly _sessions$ = new BehaviorSubject<any[]>([]);

  private recordingStartTime = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private llmSubs: Subscription[] = [];

  // Auto-save subject
  private readonly _saveRequested$ = new Subject<void>();

  readonly id$: Observable<string> = this._id$.asObservable();
  readonly status$: Observable<SessionStatus> = this._status$.asObservable();
  readonly segments$: Observable<TranscriptSegment[]> = this._segments$.asObservable();
  readonly userNotes$: Observable<string> = this._userNotes$.asObservable();
  readonly title$: Observable<string> = this._title$.asObservable();
  readonly elapsed$: Observable<number> = this._elapsed$.asObservable();
  readonly aiNotes$: Observable<EnhancedNote[]> = this._aiNotes$.asObservable();
  readonly aiSummary$: Observable<string> = this._aiSummary$.asObservable();
  readonly chatMessages$: Observable<{ role: 'user' | 'assistant'; content: string }[]> = this._chatMessages$.asObservable();
  readonly sessions$: Observable<any[]> = this._sessions$.asObservable();

  constructor(
    private ipc: ElectronIpcService,
    private audioCapture: AudioCaptureService,
    private llm: LlmService
  ) {
    // Subscribe to incoming transcript segments
    this.ipc.segment$.subscribe((segment: TranscriptSegment) => {
      const current = this._segments$.value;
      this._segments$.next([...current, segment]);
      this.requestSave();
    });

    // Auto-save with 2s debounce
    this._saveRequested$.pipe(debounceTime(2000)).subscribe(() => {
      this.saveSession();
    });

    // Load sessions list on startup
    this.loadSessionsList();
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
    this._chatMessages$.next([...this._chatMessages$.value, msg]);
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

  /** Load a session from persistence */
  async loadSession(id: string): Promise<void> {
    const api = (window as any).sourdine?.session;
    if (!api) return;

    const data = await api.load(id);
    if (!data) return;

    this._id$.next(data.id);
    this._title$.next(data.title || 'Sans titre');
    this._userNotes$.next(data.userNotes || '');
    this._segments$.next(data.segments || []);
    this._aiNotes$.next(data.aiNotes || []);
    this._aiSummary$.next(data.aiSummary || '');
    this._chatMessages$.next([]);
    this._elapsed$.next(data.durationMs || 0);
    this._status$.next('done');
  }

  /** Delete a session */
  async deleteSession(id: string): Promise<void> {
    const api = (window as any).sourdine?.session;
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

    return parsed.map((item: any, i: number) => ({
      id: `ai-${i}`,
      type: item.type || 'key-point',
      text: item.text || '',
      segmentIds: item.segmentIds || [],
    }));
  }

  private requestSave(): void {
    this._saveRequested$.next();
  }

  private async saveSession(): Promise<void> {
    const api = (window as any).sourdine?.session;
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
      durationMs: this._elapsed$.value,
      createdAt: this.recordingStartTime || Date.now(),
      updatedAt: Date.now(),
    });

    await this.loadSessionsList();
  }

  private async loadSessionsList(): Promise<void> {
    const api = (window as any).sourdine?.session;
    if (!api) {
      // Preload not ready yet, retry after a short delay
      setTimeout(() => this.loadSessionsList(), 500);
      return;
    }

    try {
      const sessions = await api.list();
      this._sessions$.next(sessions || []);
    } catch {
      // DB not available yet, retry
      setTimeout(() => this.loadSessionsList(), 1000);
    }
  }

  private extractTitleFromSummary(text: string): { title: string; body: string } {
    const lines = text.split('\n');
    const firstLine = lines[0]?.trim() || '';

    // Check for "Titre: ..." pattern
    const match = firstLine.match(/^Titre\s*:\s*(.+)$/i);
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
