import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ElectronIpcService } from '../services/electron-ipc.service';

@Component({
  selector: 'sdn-widget',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="audio-pill" [class.active]="isRecording">
      <div class="vu-bars" (click)="onClick()">
        <div class="vu-bar" *ngFor="let bar of vuBars; let i = index"
          [style.height.px]="isRecording ? getBarHeight(i) : 4"
          [style.opacity]="isRecording ? getBarOpacity(i) : 0.4"
        ></div>
      </div>
      <button class="chevron-btn" (click)="focusMain()">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5">
          <polyline points="2,6 5,3 8,6"/>
        </svg>
      </button>
      <button *ngIf="isRecording" class="stop-btn" (click)="onClick()">
        <span class="stop-square"></span>
      </button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      -webkit-app-region: drag;
    }

    .audio-pill {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 10px;
      border-radius: 16px;
      background: var(--bg-pill, #2a2a2e);
      border: 1px solid var(--border-subtle, #2a2a2a);
      height: 38px;
      transition: border-color 0.2s;
      -webkit-app-region: drag;
    }
    .audio-pill.active {
      border-color: var(--accent-recording, #ef4444);
    }

    .vu-bars {
      display: flex;
      align-items: center;
      gap: 2px;
      height: 24px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 8px;
      transition: background 0.15s;
      -webkit-app-region: no-drag;
    }
    .vu-bars:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .vu-bar {
      width: 2.5px;
      min-height: 3px;
      border-radius: 1.5px;
      background: var(--text-secondary, #888);
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
      color: var(--text-primary, #e8e8e8);
      transition: opacity 0.15s;
      -webkit-app-region: no-drag;
    }
    .chevron-btn:hover {
      opacity: 1;
    }

    .stop-btn {
      width: 24px;
      height: 24px;
      border-radius: 8px;
      border: none;
      background: rgba(255, 255, 255, 0.08);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
      -webkit-app-region: no-drag;
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
  `],
})
export class WidgetComponent implements OnInit, OnDestroy {
  vuBars = [0, 1, 2, 3, 4];
  isRecording = false;
  audioLevel = 0;
  private sub?: Subscription;

  constructor(private ipc: ElectronIpcService) {}

  ngOnInit(): void {
    // Make body transparent so the Electron transparent window works
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    this.sub = this.ipc.widgetState$.subscribe((state) => {
      this.isRecording = state.isRecording;
      this.audioLevel = state.audioLevel;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  getBarHeight(index: number): number {
    if (this.audioLevel < 0.01) return 4;
    const wave = [0.5, 0.8, 1.0, 0.8, 0.5];
    return 4 + this.audioLevel * wave[index] * 16;
  }

  getBarOpacity(index: number): number {
    if (this.audioLevel < 0.01) return 0.3;
    const wave = [0.6, 0.8, 1.0, 0.8, 0.6];
    return 0.3 + this.audioLevel * wave[index] * 0.7;
  }

  onClick(): void {
    this.ipc.widgetToggleRecording();
  }

  focusMain(): void {
    this.ipc.widgetFocusMain();
  }
}
