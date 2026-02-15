import { Component, EventEmitter, Output, Input, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
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
  imports: [CommonModule, FormsModule, TranslateModule, ChatPanelComponent, TranscriptPanelComponent],
  templateUrl: './control-bar.component.html',
  styleUrl: './control-bar.component.scss',
})
export class ControlBarComponent implements OnInit, OnDestroy {
  @Input() transcriptOpen = false;
  @Input() chatOpen = false;
  @Input() chatInitialPrompt = '';

  @Output() openChat = new EventEmitter<string>();
  @Output() closeChat = new EventEmitter<void>();
  @Output() showTranscript = new EventEmitter<void>();
  @Output() closeTranscript = new EventEmitter<void>();

  status: SessionStatus = 'idle';
  llmStatus: LlmStatus = 'idle';
  audioLevel = 0;
  chatInput = '';
  hasAiSummary = false;
  elapsed = 0;
  isRecordingElsewhere = false;

  vuBars = [0, 1, 2, 3, 4];

  private readonly session = inject(SessionService);
  private readonly audioCapture = inject(AudioCaptureService);
  private readonly llm = inject(LlmService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];
  private selectedDeviceId = '';

  /** True if currently recording in this session */
  get isRecording(): boolean {
    return this.status === 'recording';
  }

  ngOnInit(): void {
    // Load saved device from config
    this.loadSavedDevice();

    this.subs.push(
      this.audioCapture.devices$.subscribe((d) => {
        if (!this.selectedDeviceId && d.length > 0) {
          this.selectedDeviceId = d.find((x) => x.isDefault)?.deviceId || d[0].deviceId;
        }
      }),
      this.audioCapture.audioLevel$.subscribe((l) => { this.audioLevel = l; this.cdr.markForCheck(); }),
      this.session.status$.subscribe((s) => { this.status = s; this.cdr.markForCheck(); }),
      this.session.aiSummary$.subscribe((s) => { this.hasAiSummary = !!s; this.cdr.markForCheck(); }),
      this.session.elapsed$.subscribe((e) => { this.elapsed = e; this.cdr.markForCheck(); }),
      this.session.isRecordingElsewhere$.subscribe((e) => { this.isRecordingElsewhere = e; this.cdr.markForCheck(); }),
      this.llm.status$.subscribe((s) => { this.llmStatus = s; this.cdr.markForCheck(); })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  private async loadSavedDevice(): Promise<void> {
    try {
      const api = (window as Window & { sourdine?: { config?: { get: () => Promise<{ audio?: { defaultDeviceId?: string } }> } } }).sourdine?.config;
      if (api) {
        const cfg = await api.get();
        if (cfg?.audio?.defaultDeviceId) {
          this.selectedDeviceId = cfg.audio.defaultDeviceId;
        }
      }
    } catch {
      // Ignore config errors - silently fall back to default device
    }
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

  async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      this.session.stopRecording();
    } else {
      // Reload saved device before each recording to pick up settings changes
      await this.loadSavedDevice();
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
