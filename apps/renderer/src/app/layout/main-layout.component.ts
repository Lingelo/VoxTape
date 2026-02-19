import { Component, HostListener, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SidebarComponent } from './sidebar/sidebar.component';
import { NoteEditorComponent } from './note-editor/note-editor.component';
import { ControlBarComponent } from './control-bar/control-bar.component';
import { AudioCaptureService } from '../services/audio-capture.service';
import { MeetingService } from '../services/meeting.service';
import { SessionService } from '../services/session.service';
import { FirstLaunchService } from '../services/first-launch.service';

@Component({
  selector: 'sdn-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    SidebarComponent,
    NoteEditorComponent,
    ControlBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  chatOpen = false;
  chatInitialPrompt = '';
  transcriptOpen = false;

  private readonly audioCapture = inject(AudioCaptureService);
  private readonly meetingService = inject(MeetingService);
  private readonly sessionService = inject(SessionService);
  private readonly firstLaunch = inject(FirstLaunchService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];

  ngOnInit(): void {
    // Check if this is first launch to show guided tooltips
    this.firstLaunch.checkFirstLaunch();

    this.subs.push(
      this.audioCapture.isRecording$.subscribe((recording) => {
        if (recording) {
          this.chatOpen = false;
          this.transcriptOpen = true;
        }
        this.cdr.markForCheck();
      }),
      // Handle system notification click to start recording
      this.meetingService.startRecordingRequested$.subscribe(async (data) => {
        // Create a new session with the meeting name
        this.sessionService.newSession();
        if (data.meetingName) {
          this.sessionService.updateTitle(`${data.meetingName} Meeting`);
        }

        // Load saved device from config (same as ControlBar)
        let deviceId: string | undefined;
        try {
          const api = (window as Window & { voxtape?: { config?: { get: () => Promise<{ audio?: { defaultDeviceId?: string } }> } } }).voxtape?.config;
          if (api) {
            const cfg = await api.get();
            deviceId = cfg?.audio?.defaultDeviceId;
          }
        } catch {
          // Ignore config errors
        }

        // Start recording with the configured device - same as ControlBar
        await this.sessionService.startRecording(deviceId);
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  openChat(prompt = ''): void {
    this.transcriptOpen = false;
    this.chatInitialPrompt = prompt;
    this.chatOpen = true;
  }

  toggleTranscript(): void {
    this.chatOpen = false;
    this.transcriptOpen = !this.transcriptOpen;
  }

  closeAllPanels(): void {
    this.chatOpen = false;
    this.chatInitialPrompt = '';
    this.transcriptOpen = false;
  }

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    // Cmd+J = toggle chat panel (closes transcript if open)
    if ((event.metaKey || event.ctrlKey) && event.key === 'j') {
      event.preventDefault();
      if (this.chatOpen) {
        this.chatOpen = false;
      } else {
        this.openChat();
      }
    }
    // Escape = close overlays
    if (event.key === 'Escape') {
      if (this.chatOpen) { this.chatOpen = false; return; }
      if (this.transcriptOpen) { this.transcriptOpen = false; return; }
    }
  }
}
