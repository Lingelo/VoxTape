import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

/** Type-safe bridge to the preload API exposed via contextBridge */
interface SourdineApi {
  audio: {
    sendChunk(samples: number[]): void;
    startRecording(): void;
    stopRecording(): void;
  };
  transcript: {
    onSegment(cb: (segment: any) => void): () => void;
    onPartial(cb: (data: { text: string }) => void): () => void;
  };
  stt: {
    onStatus(cb: (status: 'loading' | 'ready' | 'error') => void): () => void;
    onSpeechDetected(cb: (detected: boolean) => void): () => void;
    restart(): Promise<void>;
  };
  widget: {
    onState(cb: (state: { isRecording: boolean; audioLevel: number }) => void): () => void;
    toggleRecording(): void;
    focusMain(): void;
  };
  media: {
    requestMicAccess(): Promise<boolean>;
    requestScreenAccess(): Promise<boolean>;
  };
  systemAudio: {
    start(): void;
    stop(): void;
    isSupported(): Promise<boolean>;
    onStatus(cb: (capturing: boolean) => void): () => void;
  };
}

declare global {
  interface Window {
    sourdine?: SourdineApi;
  }
}

@Injectable({ providedIn: 'root' })
export class ElectronIpcService {
  private readonly api: SourdineApi | undefined;

  private readonly _sttStatus$ = new BehaviorSubject<'loading' | 'ready' | 'error'>('loading');
  private readonly _speechDetected$ = new BehaviorSubject<boolean>(false);
  private readonly _segment$ = new Subject<any>();
  private readonly _partial$ = new Subject<{ text: string }>();
  private readonly _widgetState$ = new BehaviorSubject<{ isRecording: boolean; audioLevel: number }>({
    isRecording: false,
    audioLevel: 0,
  });
  private readonly _systemAudioCapturing$ = new BehaviorSubject<boolean>(false);

  readonly sttStatus$: Observable<'loading' | 'ready' | 'error'> = this._sttStatus$.asObservable();
  readonly speechDetected$: Observable<boolean> = this._speechDetected$.asObservable();
  readonly segment$: Observable<any> = this._segment$.asObservable();
  readonly partial$: Observable<{ text: string }> = this._partial$.asObservable();
  readonly widgetState$: Observable<{ isRecording: boolean; audioLevel: number }> = this._widgetState$.asObservable();
  readonly systemAudioCapturing$: Observable<boolean> = this._systemAudioCapturing$.asObservable();

  constructor(private ngZone: NgZone) {
    this.api = window.sourdine;
    if (!this.api) {
      console.warn('[ElectronIpcService] window.sourdine not available — running outside Electron?');
      // Outside Electron: hide the loading indicator
      this._sttStatus$.next('ready');
      return;
    }

    // Subscribe to IPC events, running callbacks inside Angular zone
    this.api.stt.onStatus((status) => {
      this.ngZone.run(() => this._sttStatus$.next(status));
    });

    this.api.stt.onSpeechDetected((detected) => {
      this.ngZone.run(() => this._speechDetected$.next(detected));
    });

    this.api.transcript.onSegment((segment) => {
      this.ngZone.run(() => this._segment$.next(segment));
    });

    this.api.transcript.onPartial((data) => {
      this.ngZone.run(() => this._partial$.next(data));
    });

    this.api.widget.onState((state) => {
      this.ngZone.run(() => this._widgetState$.next(state));
    });

    this.api.systemAudio.onStatus((capturing) => {
      this.ngZone.run(() => this._systemAudioCapturing$.next(capturing));
    });
  }

  get isElectron(): boolean {
    return !!this.api;
  }

  sendAudioChunk(samples: Int16Array): void {
    this.api?.audio.sendChunk(Array.from(samples));
  }

  startRecording(): void {
    this.api?.audio.startRecording();
  }

  stopRecording(): void {
    this.api?.audio.stopRecording();
  }

  widgetToggleRecording(): void {
    this.api?.widget.toggleRecording();
  }

  widgetFocusMain(): void {
    this.api?.widget.focusMain();
  }

  async restartStt(): Promise<void> {
    await this.api?.stt.restart();
  }

  async requestScreenAccess(): Promise<boolean> {
    return this.api?.media.requestScreenAccess() ?? false;
  }

  systemAudioStart(): void {
    this.api?.systemAudio.start();
  }

  systemAudioStop(): void {
    this.api?.systemAudio.stop();
  }

  async systemAudioIsSupported(): Promise<boolean> {
    return this.api?.systemAudio.isSupported() ?? false;
  }
}
