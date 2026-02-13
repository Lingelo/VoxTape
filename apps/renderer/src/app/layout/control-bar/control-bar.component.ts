import { Component, EventEmitter, Output, Input, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SessionService, SessionStatus } from '../../services/session.service';
import { AudioCaptureService } from '../../services/audio-capture.service';
import { LlmService } from '../../services/llm.service';
import { ChatPanelComponent } from '../chat-panel/chat-panel.component';
import { TranscriptPanelComponent } from '../transcript-panel/transcript-panel.component';
import type { LlmStatus } from '@sourdine/shared-types';

@Component({
  selector: 'sdn-control-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ChatPanelComponent, TranscriptPanelComponent],
  template: `
    <div class="control-wrapper">
      <!-- Floating "Generate notes" button (when done, above the pill) -->
      <button
        *ngIf="showGenerateBtn"
        class="generate-btn"
        [class.processing]="status === 'processing'"
        [disabled]="status === 'processing'"
        (click)="onEnhance()"
      >
        <svg *ngIf="status !== 'processing'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z"/>
          <circle cx="18" cy="4" r="2" fill="currentColor"/>
          <circle cx="5" cy="5" r="1.5" fill="currentColor"/>
          <circle cx="20" cy="12" r="1" fill="currentColor"/>
        </svg>
        <span *ngIf="status === 'processing'" class="spinner"></span>
        {{ status === 'processing' ? 'En cours...' : 'Générer les notes' }}
      </button>

      <!-- Bottom bar -->
      <div class="bottom-bar" [class.expanded]="chatOpen || transcriptOpen">
        <!-- Audio pill (detached) -->
        <div class="audio-pill" [class.active]="isRecording">
          <div class="vu-bars" (click)="toggleRecording()">
            <div class="vu-bar" *ngFor="let bar of vuBars; let i = index"
              [style.height.px]="isRecording ? getBarHeight(i) : 4"
              [style.opacity]="isRecording ? getBarOpacity(i) : 0.4"
            ></div>
          </div>
          <button class="chevron-btn" [class.open]="transcriptOpen" (click)="showTranscript.emit()" title="Voir la transcription">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
              <polyline points="2,6 5,3 8,6"/>
            </svg>
          </button>
          <button *ngIf="isRecording" class="stop-btn" (click)="toggleRecording()">
            <span class="stop-square"></span>
          </button>
        </div>

        <!-- Main pill — always present, expands upward -->
        <div class="main-pill" [class.expanded]="chatOpen || transcriptOpen">

          <!-- Transcript body (expanded content) -->
          <div class="pill-body" *ngIf="transcriptOpen">
            <div class="pill-header">
              <span class="pill-header-title">Transcription</span>
              <div class="pill-header-actions">
                <span class="pill-timer" *ngIf="elapsed > 0">{{ formatElapsed(elapsed) }}</span>
                <button class="pill-header-btn" (click)="closeTranscript.emit()" title="Minimiser">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
                    <line x1="2" y1="6" x2="10" y2="6"/>
                  </svg>
                </button>
              </div>
            </div>
            <sdn-transcript-panel></sdn-transcript-panel>
          </div>

          <!-- Chat body (expanded content, includes its own input) -->
          <sdn-chat-panel
            *ngIf="chatOpen"
            [initialPrompt]="chatInitialPrompt"
            (close)="closeChat.emit()"
          ></sdn-chat-panel>

          <!-- Input bar (always visible, hidden only when chat is open since chat has its own) -->
          <div class="pill-input" *ngIf="!chatOpen">
            <input
              class="chat-input"
              type="text"
              [(ngModel)]="chatInput"
              (keydown.enter)="onChatSubmit()"
              (keydown.escape)="transcriptOpen ? closeTranscript.emit() : null"
              (focus)="onInputFocus()"
              placeholder="Posez une question..."
              [disabled]="status === 'processing'"
            />
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .control-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 10px 16px 14px;
      flex-shrink: 0;
    }

    /* ── Generate notes (floating button) ── */
    .generate-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 24px;
      border-radius: 24px;
      border: none;
      background: var(--accent-generate, #6b7a2e);
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .generate-btn:hover:not(:disabled) {
      filter: brightness(1.15);
      transform: translateY(-1px);
    }
    .generate-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .generate-btn.processing {
      background: var(--accent-generate, #6b7a2e);
    }

    /* ── Bottom bar (two pills side by side) ── */
    .bottom-bar {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      width: 100%;
    }

    /* ── Audio pill (detached mini-pill) ── */
    .audio-pill {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 10px;
      border-radius: 16px;
      background: var(--bg-pill, #2a2a2e);
      border: 1px solid var(--border-subtle);
      flex-shrink: 0;
      transition: border-color 0.2s;
      height: 38px;
    }
    .audio-pill.active {
      border-color: var(--accent-recording, #ef4444);
    }

    /* ── Main pill (always present, expandable) ── */
    .main-pill {
      flex: 1;
      display: flex;
      flex-direction: column;
      border-radius: 16px;
      background: var(--bg-pill, #2a2a2e);
      border: 1px solid var(--border-subtle);
      min-width: 0;
      overflow: hidden;
      cursor: text;
    }
    .main-pill:not(.expanded) {
      height: 38px;
      justify-content: center;
    }
    .main-pill.expanded {
      animation: pillExpand 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      cursor: default;
    }

    /* ── Pill input bar (bottom of pill) ── */
    .pill-input {
      display: flex;
      align-items: center;
      padding: 0 10px;
      height: 38px;
      flex-shrink: 0;
    }
    .main-pill.expanded .pill-input {
      border-top: 1px solid var(--border-subtle);
    }

    /* ── Pill body (expanded content) ── */
    .pill-body {
      display: flex;
      flex-direction: column;
      max-height: 50vh;
      overflow: hidden;
    }
    .pill-body sdn-transcript-panel {
      display: block;
      overflow-y: auto;
      flex: 1;
    }

    /* ── Pill header ── */
    .pill-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }
    .pill-header-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .pill-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pill-timer {
      font-size: 12px;
      font-family: monospace;
      color: var(--text-secondary);
      opacity: 0.7;
    }
    .pill-header-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      opacity: 0.6;
      transition: opacity 0.15s;
    }
    .pill-header-btn:hover {
      opacity: 1;
      background: rgba(255, 255, 255, 0.06);
    }

    @keyframes pillExpand {
      from { max-height: 38px; opacity: 0.7; }
      to { max-height: 70vh; opacity: 1; }
    }

    /* ── VU bars (KITT style, centered) ── */
    .vu-bars {
      display: flex;
      align-items: center;
      gap: 2px;
      height: 24px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 6px;
      transition: background 0.15s;
    }
    .vu-bars:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .vu-bar {
      width: 2.5px;
      min-height: 3px;
      border-radius: 1.5px;
      background: var(--text-secondary);
      transition: height 0.06s ease-out, opacity 0.06s ease-out;
    }
    .chevron-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px;
      opacity: 0.5;
      margin-left: 2px;
      display: flex;
      align-items: center;
      color: inherit;
      transition: opacity 0.15s, transform 0.2s ease;
    }
    .chevron-btn:hover {
      opacity: 1;
    }
    .chevron-btn.open {
      transform: rotate(180deg);
      opacity: 0.8;
    }

    /* ── Stop button ── */
    .stop-btn {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: none;
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
    }
    .stop-btn:hover {
      background: rgba(239, 68, 68, 0.2);
    }
    .stop-square {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      background: var(--accent-recording, #ef4444);
    }

    /* ── Chat input ── */
    .chat-input {
      width: 100%;
      background: transparent;
      border: none;
      padding: 6px 10px;
      font-size: 13px;
      color: var(--text-primary);
      outline: none;
    }
    .chat-input::placeholder {
      color: var(--text-secondary);
      opacity: 0.5;
    }
    .chat-input:disabled { opacity: 0.4; }

    /* ── Spinner ── */
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class ControlBarComponent implements OnInit, OnDestroy {
  @Input() transcriptOpen = false;
  @Input() chatOpen = false;
  @Input() chatInitialPrompt = '';

  @Output() openChat = new EventEmitter<string>();
  @Output() closeChat = new EventEmitter<void>();
  @Output() showTranscript = new EventEmitter<void>();
  @Output() closeTranscript = new EventEmitter<void>();

  isRecording = false;
  status: SessionStatus = 'idle';
  llmStatus: LlmStatus = 'idle';
  audioLevel = 0;
  chatInput = '';
  hasAiSummary = false;
  elapsed = 0;

  vuBars = [0, 1, 2, 3, 4];

  private subs: Subscription[] = [];
  private selectedDeviceId = '';

  constructor(
    private session: SessionService,
    private audioCapture: AudioCaptureService,
    private llm: LlmService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.audioCapture.devices$.subscribe((d) => {
        if (!this.selectedDeviceId && d.length > 0) {
          this.selectedDeviceId = d.find((x) => x.isDefault)?.deviceId || d[0].deviceId;
        }
      }),
      this.audioCapture.isRecording$.subscribe((r) => { this.isRecording = r; this.cdr.markForCheck(); }),
      this.audioCapture.audioLevel$.subscribe((l) => { this.audioLevel = l; this.cdr.markForCheck(); }),
      this.session.status$.subscribe((s) => { this.status = s; this.cdr.markForCheck(); }),
      this.session.aiSummary$.subscribe((s) => { this.hasAiSummary = !!s; this.cdr.markForCheck(); }),
      this.session.elapsed$.subscribe((e) => { this.elapsed = e; this.cdr.markForCheck(); }),
      this.llm.status$.subscribe((s) => { this.llmStatus = s; this.cdr.markForCheck(); })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  get showGenerateBtn(): boolean {
    return (this.status === 'done' && !this.hasAiSummary) || this.status === 'processing';
  }

  getBarHeight(index: number): number {
    if (this.audioLevel < 0.01) return 4;
    // KITT wave: center bar tallest, edges shorter
    const wave = [0.5, 0.8, 1.0, 0.8, 0.5];
    return 4 + this.audioLevel * wave[index] * 16;
  }

  getBarOpacity(index: number): number {
    if (this.audioLevel < 0.01) return 0.3;
    const wave = [0.6, 0.8, 1.0, 0.8, 0.6];
    return 0.3 + this.audioLevel * wave[index] * 0.7;
  }

  toggleRecording(): void {
    if (this.isRecording) {
      this.session.stopRecording();
    } else {
      this.session.startRecording(this.selectedDeviceId);
    }
  }

  formatElapsed(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  onEnhance(): void {
    this.session.enhanceNotes();
  }

  onInputFocus(): void {
    this.openChat.emit('');
  }

  onChatSubmit(): void {
    const question = this.chatInput.trim();
    if (!question) return;
    this.chatInput = '';
    this.openChat.emit(question);
  }
}
