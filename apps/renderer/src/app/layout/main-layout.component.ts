import { Component, HostListener, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SidebarComponent } from './sidebar/sidebar.component';
import { NoteEditorComponent } from './note-editor/note-editor.component';
import { ControlBarComponent } from './control-bar/control-bar.component';
import { AudioCaptureService } from '../services/audio-capture.service';

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
  template: `
    <div class="titlebar-drag"></div>
    <div class="layout">
      <sdn-sidebar></sdn-sidebar>

      <div class="main-content">
        <!-- Backdrop to close panels on click outside -->
        <div class="panel-backdrop" *ngIf="chatOpen || transcriptOpen" (click)="closeAllPanels()"></div>

        <div class="editor-area">
          <sdn-note-editor></sdn-note-editor>
        </div>

        <sdn-control-bar
          [transcriptOpen]="transcriptOpen"
          [chatOpen]="chatOpen"
          [chatInitialPrompt]="chatInitialPrompt"
          (openChat)="openChat($event)"
          (closeChat)="chatOpen = false; chatInitialPrompt = ''"
          (showTranscript)="toggleTranscript()"
          (closeTranscript)="transcriptOpen = false"
        ></sdn-control-bar>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; overflow: hidden; }

    .layout {
      display: flex;
      height: 100%;
    }

    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      padding-top: 38px;
    }

    .editor-area {
      flex: 1;
      overflow-y: auto;
    }

    .titlebar-drag {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 38px;
      -webkit-app-region: drag;
      z-index: 50;
    }

    .panel-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10;
    }
    sdn-control-bar {
      position: relative;
      z-index: 11;
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  chatOpen = false;
  chatInitialPrompt = '';
  transcriptOpen = false;

  private subs: Subscription[] = [];

  constructor(
    private audioCapture: AudioCaptureService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.audioCapture.isRecording$.subscribe((recording) => {
        if (recording) {
          this.chatOpen = false;
          this.transcriptOpen = true;
        }
        this.cdr.markForCheck();
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
