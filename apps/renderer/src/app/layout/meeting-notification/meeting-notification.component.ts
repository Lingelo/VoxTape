import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MeetingService } from '../../services/meeting.service';
import { AudioCaptureService } from '../../services/audio-capture.service';
import { SessionService } from '../../services/session.service';
import type { MeetingApp } from '@voxtape/shared-types';

/**
 * Meeting notification component - shows a slide-in notification when a meeting app is detected.
 * Allows the user to start recording with a single click.
 */
@Component({
  selector: 'sdn-meeting-notification',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showNotification()) {
      <div class="notification" role="alert" [class.slide-in]="visible()">
        <div class="notification-content">
          <div class="notification-icon">
            {{ getAppEmoji(currentApp()!) }}
          </div>
          <div class="notification-text">
            <strong>{{ currentApp()?.name }}</strong> detected
            <span class="notification-hint">Ready to transcribe?</span>
          </div>
        </div>
        <div class="notification-actions">
          <button
            class="btn btn-primary"
            (click)="startRecording()"
            tabindex="0"
          >
            Record
          </button>
          <button
            class="btn btn-ghost"
            (click)="dismiss()"
            tabindex="0"
            aria-label="Dismiss notification"
          >
            Ignore
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 1000;
      pointer-events: none;
    }

    .notification {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      background: var(--surface-elevated, #2a2a2a);
      border: 1px solid var(--border-subtle, #3a3a3a);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      pointer-events: auto;
      transform: translateX(120%);
      opacity: 0;
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
    }

    .notification.slide-in {
      transform: translateX(0);
      opacity: 1;
    }

    .notification-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .notification-icon {
      font-size: 28px;
      line-height: 1;
    }

    .notification-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .notification-text strong {
      color: var(--text-primary, #fff);
      font-size: 14px;
    }

    .notification-hint {
      color: var(--text-secondary, #888);
      font-size: 12px;
    }

    .notification-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: background 0.15s, transform 0.1s;
    }

    .btn:active {
      transform: scale(0.97);
    }

    .btn-primary {
      background: var(--accent-primary, #4ade80);
      color: #000;
    }

    .btn-primary:hover {
      background: var(--accent-primary-hover, #3bc96f);
    }

    .btn-ghost {
      background: transparent;
      color: var(--text-secondary, #888);
    }

    .btn-ghost:hover {
      background: var(--surface-hover, #333);
      color: var(--text-primary, #fff);
    }
  `],
})
export class MeetingNotificationComponent implements OnInit, OnDestroy {
  private readonly meetingService = inject(MeetingService);
  private readonly audioCapture = inject(AudioCaptureService);
  private readonly sessionService = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  // Signals for reactive state
  readonly visible = signal(false);
  readonly currentApp = signal<MeetingApp | null>(null);
  readonly isRecording = signal(false);

  // Computed signal: show notification only when conditions are met
  readonly showNotification = computed(() => {
    return this.currentApp() !== null && !this.isRecording();
  });

  ngOnInit(): void {
    console.log('[MeetingNotification] Component initialized');
    // Listen for meeting detection events
    this.subs.push(
      this.meetingService.detected$.subscribe((event) => {
        console.log('[MeetingNotification] Received detection event:', event);
        if (event.apps.length > 0 && !this.meetingService.notificationDismissed) {
          // Show notification for the first new app
          const newApp = event.apps.find((app) =>
            this.meetingService.shouldNotifyForApp(app.bundleId)
          );
          console.log('[MeetingNotification] New app to notify:', newApp);
          if (newApp) {
            this.showForApp(newApp);
          }
        }
      }),
      this.meetingService.ended$.subscribe(() => {
        this.hide();
      }),
      this.audioCapture.isRecording$.subscribe((recording) => {
        this.isRecording.set(recording);
        if (recording) {
          this.hide();
        }
        this.cdr.markForCheck();
      })
    );

    // Check if there's already a meeting detected
    if (this.meetingService.hasMeeting && !this.meetingService.notificationDismissed) {
      const apps = this.meetingService.detectedApps;
      const newApp = apps.find((app) =>
        this.meetingService.shouldNotifyForApp(app.bundleId)
      );
      if (newApp) {
        // Delay slightly to allow initial render
        setTimeout(() => this.showForApp(newApp), 500);
      }
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
  }

  private showForApp(app: MeetingApp): void {
    console.log('[MeetingNotification] showForApp called:', app);
    // Don't show if already recording
    if (this.isRecording()) {
      console.log('[MeetingNotification] Skipping - already recording');
      return;
    }

    this.meetingService.markNotified(app.bundleId);
    this.currentApp.set(app);
    console.log('[MeetingNotification] Set currentApp, triggering animation');

    // Trigger slide-in animation
    requestAnimationFrame(() => {
      this.visible.set(true);
      this.cdr.markForCheck();
      console.log('[MeetingNotification] Animation triggered, visible=true');
    });

    // Auto-dismiss after 30 seconds
    this.resetDismissTimer();
  }

  private resetDismissTimer(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }
    this.dismissTimer = setTimeout(() => {
      this.hide();
    }, 30000);
  }

  private hide(): void {
    this.visible.set(false);
    this.cdr.markForCheck();

    // Wait for animation to complete before removing from DOM
    setTimeout(() => {
      this.currentApp.set(null);
      this.cdr.markForCheck();
    }, 300);

    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }

  startRecording(): void {
    const app = this.currentApp();
    if (app) {
      // Create a new session with the meeting app name
      this.sessionService.newSession();
      this.sessionService.updateTitle(`${app.name} Meeting`);
    }
    this.audioCapture.startRecording();
    this.hide();
  }

  dismiss(): void {
    this.meetingService.dismissNotification();
    this.hide();
  }

  getAppEmoji(app: MeetingApp): string {
    const emojiMap: Record<string, string> = {
      'us.zoom.xos': '📹',
      'com.microsoft.teams': '👥',
      'com.microsoft.teams2': '👥',
      'com.tinyspeck.slackmacgap': '💬',
      'com.hnc.Discord': '🎮',
      'com.cisco.webexmeetingsapp': '🌐',
      'com.skype.skype': '📞',
      'com.apple.FaceTime': '📱',
    };
    return emojiMap[app.bundleId] || '🎥';
  }
}
