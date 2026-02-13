import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  Input,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SessionService, TranscriptSegment } from '../../services/session.service';
import { ElectronIpcService } from '../../services/electron-ipc.service';

@Component({
  selector: 'sdn-transcript-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="transcript-panel">
      <div class="segments-container" #scrollContainer>
        <div
          *ngFor="let segment of segments; trackBy: trackSegment"
          class="segment-block"
          [attr.data-segment-id]="segment.id"
          [class.highlighted]="isHighlighted(segment.id)"
        >{{ segment.text }}</div>

        <div *ngIf="isSpeechActive" class="listening-indicator">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>

        <div *ngIf="segments.length === 0 && !isSpeechActive" class="empty-state">
          <ng-container [ngSwitch]="sttStatus">
            <span *ngSwitchCase="'loading'">Preparation de la transcription<span class="loading-dots"></span></span>
            <span *ngSwitchCase="'error'">
              La transcription n'est pas disponible.
              <button class="retry-btn" (click)="restartStt()">Reessayer</button>
            </span>
            <span *ngSwitchDefault>Les segments transcrits apparaitront ici.</span>
          </ng-container>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .transcript-panel {
      display: flex;
      flex-direction: column;
    }

    .segments-container {
      overflow-y: auto;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .segment-block {
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      font-size: 13px;
      line-height: 1.55;
      color: var(--text-primary);
      animation: fadeIn 0.2s ease;
    }
    .segment-block:nth-child(odd) {
      background: rgba(255, 255, 255, 0.06);
    }
    .segment-block.highlighted {
      background: rgba(74, 222, 128, 0.15);
      animation: flashHighlight 2s ease-out;
    }

    .listening-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
    }
    .dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--accent-primary);
      animation: pulse 1.4s ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }

    .empty-state {
      padding: 24px;
      color: var(--text-secondary);
      font-size: 13px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .loading-dots::after {
      content: '';
      animation: dots 1.5s steps(4, end) infinite;
    }
    @keyframes dots {
      0% { content: ''; }
      25% { content: '.'; }
      50% { content: '..'; }
      75% { content: '...'; }
    }

    .retry-btn {
      display: inline-block;
      margin-top: 4px;
      padding: 6px 16px;
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      background: none;
      color: var(--text-primary);
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .retry-btn:hover {
      background: var(--accent-hover);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes pulse {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
      40% { transform: scale(1); opacity: 1; }
    }
    @keyframes flashHighlight {
      0% { background: rgba(74, 222, 128, 0.3); }
      100% { background: rgba(74, 222, 128, 0.15); }
    }
  `],
})
export class TranscriptPanelComponent implements OnInit, OnDestroy, AfterViewChecked, OnChanges {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLDivElement>;
  @Input() highlightSegmentIds: string[] = [];

  segments: TranscriptSegment[] = [];
  isSpeechActive = false;
  sttStatus: 'loading' | 'ready' | 'error' = 'loading';
  private shouldAutoScroll = true;
  private subs: Subscription[] = [];

  constructor(
    private session: SessionService,
    private ipc: ElectronIpcService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.session.segments$.subscribe((segs) => {
        this.segments = segs;
        this.shouldAutoScroll = true;
        this.cdr.markForCheck();
      }),
      this.ipc.speechDetected$.subscribe((active) => {
        this.isSpeechActive = active;
        this.cdr.markForCheck();
      }),
      this.ipc.sttStatus$.subscribe((status) => {
        this.sttStatus = status;
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

  ngAfterViewChecked(): void {
    if (this.shouldAutoScroll && this.scrollContainer) {
      const el = this.scrollContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldAutoScroll = false;
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

  private scrollToSegment(segmentId: string): void {
    if (!this.scrollContainer) return;
    const container = this.scrollContainer.nativeElement;
    const el = container.querySelector(`[data-segment-id="${segmentId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}
