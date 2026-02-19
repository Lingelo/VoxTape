import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription, debounceTime, takeUntil } from 'rxjs';
import { ElectronIpcService, DiarizationSegment } from './electron-ipc.service';
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
  /** Speaker ID from diarization (0, 1, 2, ...) */
  speaker?: number;
}

export type SessionStatus = 'idle' | 'recording' | 'draining' | 'processing' | 'done';

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
  private readonly _viewStatus$ = new BehaviorSubject<SessionStatus>('idle');
  private readonly _loadedSegments$ = new BehaviorSubject<TranscriptSegment[]>([]);
  private readonly _userNotes$ = new BehaviorSubject<string>('');
  private readonly _title$ = new BehaviorSubject<string>('Nouvelle session');
  private readonly _viewElapsed$ = new BehaviorSubject<number>(0);
  private readonly _aiNotes$ = new BehaviorSubject<EnhancedNote[]>([]);
  private readonly _aiSummary$ = new BehaviorSubject<string>('');
  private readonly _chatMessages$ = new BehaviorSubject<ChatMessage[]>([]);
  private readonly _sessions$ = new BehaviorSubject<SessionListItem[]>([]);

  // Recording state (persists across session navigation)
  private readonly _recordingSessionId$ = new BehaviorSubject<string | null>(null);
  private readonly _recordingStatus$ = new BehaviorSubject<SessionStatus>('idle');
  private readonly _liveSegments$ = new BehaviorSubject<TranscriptSegment[]>([]);
  private readonly _recordingElapsed$ = new BehaviorSubject<number>(0);

  // Computed observables (updated reactively)
  private readonly _segments$ = new BehaviorSubject<TranscriptSegment[]>([]);
  private readonly _status$ = new BehaviorSubject<SessionStatus>('idle');
  private readonly _elapsed$ = new BehaviorSubject<number>(0);
  private readonly _isRecordingElsewhere$ = new BehaviorSubject<boolean>(false);

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
  readonly recordingSessionId$: Observable<string | null> = this._recordingSessionId$.asObservable();
  readonly userNotes$: Observable<string> = this._userNotes$.asObservable();
  readonly title$: Observable<string> = this._title$.asObservable();
  readonly aiNotes$: Observable<EnhancedNote[]> = this._aiNotes$.asObservable();
  readonly aiSummary$: Observable<string> = this._aiSummary$.asObservable();
  readonly chatMessages$: Observable<ChatMessage[]> = this._chatMessages$.asObservable();
  readonly sessions$: Observable<SessionListItem[]> = this._sessions$.asObservable();
  readonly segments$: Observable<TranscriptSegment[]> = this._segments$.asObservable();
  readonly status$: Observable<SessionStatus> = this._status$.asObservable();
  readonly elapsed$: Observable<number> = this._elapsed$.asObservable();
  readonly isRecordingElsewhere$: Observable<boolean> = this._isRecordingElsewhere$.asObservable();

  private setupComputedObservables(): void {
    // Update segments when any source changes
    const updateSegments = () => {
      const viewingId = this._id$.value;
      const recordingId = this._recordingSessionId$.value;
      const loaded = this._loadedSegments$.value;
      const live = this._liveSegments$.value;
      if (viewingId === recordingId) {
        // Deduplicate by ID (live segments may already be in loaded after save)
        const loadedIds = new Set(loaded.map(s => s.id));
        const uniqueLive = live.filter(s => !loadedIds.has(s.id));
        this._segments$.next([...loaded, ...uniqueLive]);
      } else {
        this._segments$.next(loaded);
      }
    };

    // Update status when any source changes
    const updateStatus = () => {
      const viewingId = this._id$.value;
      const recordingId = this._recordingSessionId$.value;
      const recordingStatus = this._recordingStatus$.value;
      const viewStatus = this._viewStatus$.value;

      // If viewing the recording session AND actively recording/draining, show recording status
      // Otherwise, show view status (includes 'processing' for summary generation)
      if (viewingId === recordingId && (recordingStatus === 'recording' || recordingStatus === 'draining')) {
        this._status$.next(recordingStatus);
      } else {
        this._status$.next(viewStatus);
      }
    };

    // Update elapsed when any source changes
    const updateElapsed = () => {
      const viewingId = this._id$.value;
      const recordingId = this._recordingSessionId$.value;
      if (viewingId === recordingId) {
        this._elapsed$.next(this._recordingElapsed$.value);
      } else {
        this._elapsed$.next(this._viewElapsed$.value);
      }
    };

    // Update isRecordingElsewhere when any source changes
    const updateIsRecordingElsewhere = () => {
      const recordingId = this._recordingSessionId$.value;
      const viewingId = this._id$.value;
      const status = this._recordingStatus$.value;
      const isRecordingOrDraining = status === 'recording' || status === 'draining';
      this._isRecordingElsewhere$.next(isRecordingOrDraining && recordingId !== null && recordingId !== viewingId);
    };

    // Subscribe to all source changes
    this._id$.pipe(takeUntil(this._destroy$)).subscribe(() => {
      updateSegments();
      updateStatus();
      updateElapsed();
      updateIsRecordingElsewhere();
    });
    this._recordingSessionId$.pipe(takeUntil(this._destroy$)).subscribe(() => {
      updateSegments();
      updateStatus();
      updateElapsed();
      updateIsRecordingElsewhere();
    });
    this._loadedSegments$.pipe(takeUntil(this._destroy$)).subscribe(updateSegments);
    this._liveSegments$.pipe(takeUntil(this._destroy$)).subscribe(updateSegments);
    this._recordingStatus$.pipe(takeUntil(this._destroy$)).subscribe(() => {
      updateStatus();
      updateIsRecordingElsewhere();
    });
    this._viewStatus$.pipe(takeUntil(this._destroy$)).subscribe(updateStatus);
    this._recordingElapsed$.pipe(takeUntil(this._destroy$)).subscribe(updateElapsed);
    this._viewElapsed$.pipe(takeUntil(this._destroy$)).subscribe(updateElapsed);
  }

  constructor() {
    // Setup computed observables first
    this.setupComputedObservables();

    // Subscribe to incoming transcript segments - add to live segments if recording or draining
    // Includes deduplication to avoid showing same content from mic + system audio
    this.ipc.segment$
      .pipe(takeUntil(this._destroy$))
      .subscribe((segment: TranscriptSegment) => {
        const status = this._recordingStatus$.value;
        if (status === 'recording' || status === 'draining') {
          const current = this._liveSegments$.value;
          // Skip if this segment is a duplicate of a recent one
          if (!this.isDuplicateSegment(segment, current)) {
            this._liveSegments$.next([...current, segment]);
            this.requestSave();
          }
        }
      });

    // Subscribe to diarization results (applied after recording stops)
    this.ipc.diarizationResult$
      .pipe(takeUntil(this._destroy$))
      .subscribe((result) => {
        if (result.error) {
          console.warn('[SessionService] Diarization error:', result.error);
          return;
        }
        this.applyDiarizationResults(result.segments);
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
    const status = this._recordingStatus$.value;
    if (status === 'recording' || status === 'draining') return;

    const currentId = this._id$.value;
    const isResume = this._viewStatus$.value === 'done';

    if (!isResume) {
      // Fresh recording: clear everything
      this._loadedSegments$.next([]);
      this._aiNotes$.next([]);
    }

    // Set recording session
    this._recordingSessionId$.next(currentId);
    this._liveSegments$.next([]);

    // Always clear AI summary so "Generate notes" reappears after stop
    this._aiSummary$.next('');
    this._recordingStatus$.next('recording');
    this.recordingStartTime = Date.now() - (isResume ? this._viewElapsed$.value : 0);

    // Start elapsed timer
    this.timerInterval = setInterval(() => {
      this._recordingElapsed$.next(Date.now() - this.recordingStartTime);
    }, 1000);

    // Save immediately to create the session in the list
    this.saveSessionImmediate();

    await this.audioCapture.startRecording(deviceId);
  }

  /** Save session immediately (bypasses debounce) */
  private async saveSessionImmediate(): Promise<void> {
    const api = this.sourdineApi?.session;
    if (!api) return;

    const segments = this.getCurrentSegments();
    const viewingId = this._id$.value;
    const recordingId = this._recordingSessionId$.value;
    const elapsed = viewingId === recordingId
      ? this._recordingElapsed$.value
      : this._viewElapsed$.value;

    await api.save({
      id: viewingId,
      title: this._title$.value,
      userNotes: this._userNotes$.value,
      segments,
      aiNotes: this._aiNotes$.value,
      aiSummary: this._aiSummary$.value,
      chatMessages: this._chatMessages$.value,
      durationMs: elapsed,
      createdAt: this.recordingStartTime || Date.now(),
      updatedAt: Date.now(),
    });

    await this.loadSessionsList();
  }

  stopRecording(): void {
    if (this._recordingStatus$.value !== 'recording') return;

    // Enter draining state - still accept segments but no new audio
    this._recordingStatus$.next('draining');
    this.audioCapture.stopRecording();

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Wait for remaining segments to arrive from STT worker
    // The worker flushes VAD buffers on stop, which may produce final segments
    const drainTimeout = setTimeout(() => {
      this.finalizeStopRecording();
    }, 500); // 500ms should be enough for final segments to arrive
    this.pendingTimeouts.push(drainTimeout);
  }

  private finalizeStopRecording(): void {
    // Merge live segments into loaded segments for the recording session
    const recordingId = this._recordingSessionId$.value;
    if (recordingId) {
      // If we're viewing the recording session, update its segments
      if (this._id$.value === recordingId) {
        const merged = [...this._loadedSegments$.value, ...this._liveSegments$.value];
        this._loadedSegments$.next(merged);
        this._viewElapsed$.next(this._recordingElapsed$.value);
      }
    }

    this._recordingStatus$.next('done');
    this._viewStatus$.next('done');
    this._liveSegments$.next([]);
    this._recordingSessionId$.next(null);
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

  /** Get current segments (loaded + live if recording this session) */
  private getCurrentSegments(): TranscriptSegment[] {
    const viewingId = this._id$.value;
    const recordingId = this._recordingSessionId$.value;
    const loaded = this._loadedSegments$.value;
    const live = this._liveSegments$.value;
    return viewingId === recordingId ? [...loaded, ...live] : loaded;
  }

  enhanceNotes(): void {
    const segments = this.getCurrentSegments();
    const notes = this._userNotes$.value;

    if (segments.length === 0) return;

    this._viewStatus$.next('processing');

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
          // Use body if non-empty, otherwise fallback to fullText to ensure aiSummary is set
          this._aiSummary$.next(body || payload.fullText || '(Résumé généré)');
        } catch (err) {
          console.error('[SessionService] Error parsing enhance result:', err);
          this._aiSummary$.next(payload.fullText || '(Résumé généré)');
        }
        this._viewStatus$.next('done');
        this.requestSave();
        cleanupSubs();
      }),
      this.llm.error$.subscribe((payload) => {
        if (payload.requestId !== requestId) return;
        console.error('[SessionService] Enhance error:', payload.error);
        this._viewStatus$.next('done');
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
    this._viewStatus$.next('idle');
    this._loadedSegments$.next([]);
    this._userNotes$.next('');
    this._title$.next('Nouvelle session');
    this._viewElapsed$.next(0);
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
    this._loadedSegments$.next(data.segments || []);
    this._aiNotes$.next(data.aiNotes || []);
    this._aiSummary$.next(data.aiSummary || '');
    this._chatMessages$.next(data.chatMessages || []);
    this._viewElapsed$.next(data.durationMs || 0);
    // Only set status to 'done' if not viewing the recording session
    if (id !== this._recordingSessionId$.value) {
      this._viewStatus$.next('done');
    }
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

    const segments = this.getCurrentSegments();

    // Don't persist empty sessions (need at least segments OR notes)
    if (segments.length === 0 && !this._userNotes$.value.trim()) return;

    // Determine elapsed time
    const viewingId = this._id$.value;
    const recordingId = this._recordingSessionId$.value;
    const elapsed = viewingId === recordingId
      ? this._recordingElapsed$.value
      : this._viewElapsed$.value;

    await api.save({
      id: viewingId,
      title: this._title$.value,
      userNotes: this._userNotes$.value,
      segments,
      aiNotes: this._aiNotes$.value,
      aiSummary: this._aiSummary$.value,
      chatMessages: this._chatMessages$.value,
      durationMs: elapsed,
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

  /**
   * Check if a new segment is a duplicate of a recent segment.
   * This prevents showing the same content twice when both mic and system audio
   * are capturing the same sound source.
   */
  private isDuplicateSegment(newSeg: TranscriptSegment, existing: TranscriptSegment[]): boolean {
    // Only check the last few segments
    const recentSegments = existing.slice(-15);
    if (recentSegments.length === 0) return false;

    const newText = newSeg.text.toLowerCase().trim();
    if (newText.length < 8) return false; // Don't dedupe very short segments

    // Extract source from segment ID (seg-mic-X or seg-system-X)
    const newSource = newSeg.id?.includes('-system-') ? 'system' : 'mic';

    for (const seg of recentSegments) {
      const existingText = seg.text.toLowerCase().trim();
      const existingSource = seg.id?.includes('-system-') ? 'system' : 'mic';

      // Only dedupe if from different sources (mic vs system)
      if (newSource === existingSource) continue;

      // Calculate text similarity
      const similarity = this.calculateTextSimilarity(newText, existingText);

      if (similarity > 0.5) {
        console.log(`[Dedupe] Skipping duplicate: "${newText.slice(0, 50)}..." (${(similarity * 100).toFixed(0)}% similar to existing)`);
        return true;
      }
    }
    return false;
  }

  /**
   * Calculate similarity between two texts (0-1 score).
   */
  private calculateTextSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Normalize: remove punctuation and extra spaces
    const normalize = (s: string) => s.replace(/[.,!?;:'"()-]/g, ' ').replace(/\s+/g, ' ').trim();
    const normA = normalize(a);
    const normB = normalize(b);

    if (normA === normB) return 1;

    // Check if one contains most of the other
    const shorter = normA.length < normB.length ? normA : normB;
    const longer = normA.length < normB.length ? normB : normA;

    if (longer.includes(shorter) && shorter.length > 20) {
      return 0.9; // High similarity if one contains the other
    }

    // Word overlap (Jaccard similarity)
    const wordsA = new Set(normA.split(/\s+/).filter(w => w.length > 2));
    const wordsB = new Set(normB.split(/\s+/).filter(w => w.length > 2));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);

    return intersection.length / union.size;
  }

  /**
   * Apply diarization results to transcript segments.
   * Matches diarization segments with transcript segments based on timestamp overlap.
   */
  private applyDiarizationResults(diarizationSegments: DiarizationSegment[]): void {
    if (diarizationSegments.length === 0) return;

    const transcriptSegments = this.getCurrentSegments();
    if (transcriptSegments.length === 0) return;

    let updated = false;
    const updatedSegments = transcriptSegments.map((seg) => {
      // Find the best matching diarization segment (most overlap)
      let bestMatch: { speaker: number; overlap: number } | null = null;

      for (const dSeg of diarizationSegments) {
        // Calculate overlap
        const overlapStart = Math.max(seg.startTimeMs, dSeg.startMs);
        const overlapEnd = Math.min(seg.endTimeMs, dSeg.endMs);
        const overlap = Math.max(0, overlapEnd - overlapStart);

        if (overlap > 0 && (!bestMatch || overlap > bestMatch.overlap)) {
          bestMatch = { speaker: dSeg.speaker, overlap };
        }
      }

      if (bestMatch && seg.speaker !== bestMatch.speaker) {
        updated = true;
        return { ...seg, speaker: bestMatch.speaker };
      }
      return seg;
    });

    if (updated) {
      this._loadedSegments$.next(updatedSegments);
      this.requestSave();
      console.log('[SessionService] Applied diarization results to', updatedSegments.length, 'segments');
    }
  }

  /** Navigate back to the recording session */
  goToRecordingSession(): void {
    const recordingId = this._recordingSessionId$.value;
    if (recordingId && recordingId !== this._id$.value) {
      this._id$.next(recordingId);
      // Clear loaded segments since we're returning to live recording
      this._loadedSegments$.next([]);
      this._title$.next('Nouvelle session');
      this._userNotes$.next('');
      this._aiNotes$.next([]);
      this._aiSummary$.next('');
      this._chatMessages$.next([]);
    }
  }
}
