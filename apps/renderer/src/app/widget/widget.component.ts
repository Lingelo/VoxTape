import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ElectronIpcService } from '../services/electron-ipc.service';

@Component({
  selector: 'sdn-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="widget-capsule"
      [class.recording]="isRecording"
      (click)="onClick()"
      (dblclick)="onDblClick()"
    >
      <div class="widget-icon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3z"/>
          <path d="M3 7a1 1 0 012 0 3 3 0 006 0 1 1 0 012 0 5 5 0 01-4 4.9V14h2a1 1 0 010 2H5a1 1 0 010-2h2v-2.1A5 5 0 013 7z"/>
        </svg>
      </div>
      <div class="vu-bars">
        <div
          *ngFor="let bar of bars; let i = index"
          class="bar"
          [class.active]="isRecording"
          [style.height.px]="getBarHeight(i)"
          [style.animation-delay.ms]="i * 100"
        ></div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      -webkit-app-region: drag;
      cursor: default;
    }

    .widget-capsule {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 22px;
      background: rgba(26, 26, 26, 0.9);
      border: 1px solid #2a2a2a;
      backdrop-filter: blur(12px);
      -webkit-app-region: drag;
    }

    .widget-icon {
      color: #888;
      display: flex;
      align-items: center;
    }
    .widget-capsule.recording .widget-icon {
      color: #4ade80;
    }

    .vu-bars {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      height: 20px;
      -webkit-app-region: no-drag;
    }

    .bar {
      width: 3px;
      border-radius: 1.5px;
      background: #555;
      transition: height 0.1s ease, background 0.2s;
      min-height: 4px;
    }

    .bar.active {
      background: #4ade80;
      animation: vuBounce 0.6s ease-in-out infinite alternate;
    }
    .bar.active:nth-child(1) { animation-delay: 0ms; }
    .bar.active:nth-child(2) { animation-delay: 100ms; }
    .bar.active:nth-child(3) { animation-delay: 200ms; }
    .bar.active:nth-child(4) { animation-delay: 300ms; }

    @keyframes vuBounce {
      0% { height: 4px; }
      100% { height: 18px; }
    }
  `],
})
export class WidgetComponent implements OnInit, OnDestroy {
  bars = [0, 1, 2, 3];
  isRecording = false;
  audioLevel = 0;
  private sub?: Subscription;

  constructor(private ipc: ElectronIpcService) {}

  ngOnInit(): void {
    this.sub = this.ipc.widgetState$.subscribe((state) => {
      this.isRecording = state.isRecording;
      this.audioLevel = state.audioLevel;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  getBarHeight(index: number): number {
    if (!this.isRecording) return 4;
    const base = 4;
    const maxAdd = 14;
    // Stagger heights slightly per bar using audioLevel
    return base + maxAdd * Math.min(1, this.audioLevel + index * 0.1);
  }

  onClick(): void {
    this.ipc.widgetToggleRecording();
  }

  onDblClick(): void {
    this.ipc.widgetFocusMain();
  }
}
