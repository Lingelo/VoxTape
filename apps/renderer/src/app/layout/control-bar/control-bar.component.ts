import { Component, EventEmitter, Output, Input, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { SessionService, SessionStatus } from '../../services/session.service';
import { AudioCaptureService } from '../../services/audio-capture.service';
import { LlmService } from '../../services/llm.service';
import { FirstLaunchService, TooltipStep } from '../../services/first-launch.service';
import { ChatPanelComponent } from '../chat-panel/chat-panel.component';
import { TranscriptPanelComponent } from '../transcript-panel/transcript-panel.component';
import { GuideTooltipComponent } from '../../components/guide-tooltip/guide-tooltip.component';
import { GlitchLoaderComponent } from '../../shared/glitch-loader/glitch-loader.component';
import type { LlmStatus } from '@voxtape/shared-types';

@Component({
  selector: 'sdn-control-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, ChatPanelComponent, TranscriptPanelComponent, GuideTooltipComponent, GlitchLoaderComponent],
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
  hasSegments = false;
  elapsed = 0;
  isRecordingElsewhere = false;

  vuBars = [0, 1, 2];  // 3 barres comme le voice modulator de KITT

  // First-launch tooltip state
  tooltipStep: TooltipStep | null = null;

  private readonly session = inject(SessionService);
  private readonly audioCapture = inject(AudioCaptureService);
  private readonly llm = inject(LlmService);
  private readonly firstLaunch = inject(FirstLaunchService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];
  private selectedDeviceId = '';

  /** True if currently recording (or draining) in this session */
  get isRecording(): boolean {
    return this.status === 'recording' || this.status === 'draining';
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
      this.session.segments$.subscribe((segs) => { this.hasSegments = segs.length > 0; this.cdr.markForCheck(); }),
      this.session.elapsed$.subscribe((e) => { this.elapsed = e; this.cdr.markForCheck(); }),
      this.session.isRecordingElsewhere$.subscribe((e) => { this.isRecordingElsewhere = e; this.cdr.markForCheck(); }),
      this.llm.status$.subscribe((s) => { this.llmStatus = s; this.cdr.markForCheck(); }),
      this.firstLaunch.currentStep$.subscribe((s) => { this.tooltipStep = s; this.cdr.markForCheck(); })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  private async loadSavedDevice(): Promise<void> {
    try {
      const api = (window as Window & { voxtape?: { config?: { get: () => Promise<{ audio?: { defaultDeviceId?: string } }> } } }).voxtape?.config;
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
    // Show button if: recording done + has transcript + not yet summarized, OR currently processing
    return (this.status === 'done' && this.hasSegments && !this.hasAiSummary) || this.status === 'processing';
  }

  getBarHeight(index: number): number {
    // KITT voice modulator: 3 bars, center (index 1) tallest
    const heightMultiplier = [0.55, 1.0, 0.55];
    const base = 6;
    const amplifiedLevel = Math.min(1, this.audioLevel * 1.6);
    const maxHeight = 22;
    return base + amplifiedLevel * heightMultiplier[index] * maxHeight;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getBarOpacity(_index: number): number {
    return 0.85 + this.audioLevel * 0.15;
  }

  /**
   * KITT VU meter: determines if a segment should be lit
   * Lights up from CENTER outward (like real KITT voice modulator)
   * @param column 0 = left (5 segments), 1 = center (8 segments), 2 = right (5 segments)
   * @param segment index from bottom (0 = bottom)
   */
  isSegmentLit(column: number, segment: number): boolean {
    if (!this.isRecording) return false;

    // Amplify audio level for better visual response
    const amplified = Math.min(1, this.audioLevel * 1.8);

    // Number of segments per column
    const maxSegments = column === 1 ? 8 : 5;
    const center = (maxSegments - 1) / 2;

    // Distance from center (0 = center, higher = further from center)
    const distanceFromCenter = Math.abs(segment - center);

    // Max distance from center
    const maxDistance = center;

    // How far from center we light based on audio level
    const litRadius = amplified * maxDistance;

    // Light if within the lit radius from center
    return distanceFromCenter <= litRadius;
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

  // First-launch tooltip handlers
  onTooltipNext(): void {
    this.firstLaunch.nextStep();
  }

  onTooltipSkip(): void {
    this.firstLaunch.skipAll();
  }

  getTooltipText(): string {
    switch (this.tooltipStep) {
      case 'record':
        return 'Cliquez ici pour démarrer un enregistrement audio.';
      case 'transcript':
        return 'La transcription apparaît ici en temps réel.';
      case 'generate':
        return 'Générez un résumé intelligent de votre réunion.';
      default:
        return '';
    }
  }

  getTooltipStepNumber(): number {
    switch (this.tooltipStep) {
      case 'record': return 1;
      case 'transcript': return 2;
      case 'generate': return 3;
      default: return 0;
    }
  }
}
