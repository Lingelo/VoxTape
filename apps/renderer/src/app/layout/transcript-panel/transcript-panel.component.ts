import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  Input,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SessionService, TranscriptSegment } from '../../services/session.service';
import { ElectronIpcService } from '../../services/electron-ipc.service';

@Component({
  selector: 'sdn-transcript-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  templateUrl: './transcript-panel.component.html',
  styleUrl: './transcript-panel.component.scss',
})
export class TranscriptPanelComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLDivElement>;
  @Input() highlightSegmentIds: string[] = [];

  segments: TranscriptSegment[] = [];
  isSpeechActive = false;
  sttStatus: 'loading' | 'ready' | 'error' = 'loading';
  isRecordingElsewhere = false;
  private readonly session = inject(SessionService);
  private readonly ipc = inject(ElectronIpcService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly translate = inject(TranslateService);
  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.subs.push(
      this.session.segments$.subscribe((segs) => {
        this.segments = segs;
        this.cdr.markForCheck();
        // Auto-scroll after DOM update
        setTimeout(() => this.scrollToBottom(), 50);
      }),
      this.ipc.speechDetected$.subscribe((active) => {
        this.isSpeechActive = active;
        this.cdr.markForCheck();
      }),
      this.ipc.sttStatus$.subscribe((status) => {
        this.sttStatus = status;
        this.cdr.markForCheck();
      }),
      this.session.isRecordingElsewhere$.subscribe((elsewhere) => {
        this.isRecordingElsewhere = elsewhere;
        this.cdr.markForCheck();
      })
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['highlightSegmentIds'] && this.highlightSegmentIds.length > 0) {
      // Scroll to first highlighted segment
      setTimeout(() => this.scrollToSegment(this.highlightSegmentIds[0]), 50);
    }
  }

  private scrollToBottom(): void {
    const el = this.scrollContainer?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  isHighlighted(segmentId: string): boolean {
    return this.highlightSegmentIds.includes(segmentId);
  }

  restartStt(): void {
    this.ipc.restartStt();
  }

  trackSegment(_index: number, segment: TranscriptSegment): string {
    return segment.id;
  }

  formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  getSpeakerLabel(speaker: number): string {
    return this.translate.instant('transcript.speaker', { num: speaker + 1 });
  }

  private scrollToSegment(segmentId: string): void {
    if (!this.scrollContainer) return;
    const container = this.scrollContainer.nativeElement;
    const el = container.querySelector(`[data-segment-id="${segmentId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  goToRecordingSession(): void {
    this.session.goToRecordingSession();
  }
}
