import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ElectronIpcService } from './electron-ipc.service';

export interface AudioDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

@Injectable({ providedIn: 'root' })
export class AudioCaptureService implements OnDestroy {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelAnimationId: number | null = null;

  private systemAudioActive = false;

  private readonly _isRecording$ = new BehaviorSubject<boolean>(false);
  private readonly _devices$ = new BehaviorSubject<AudioDevice[]>([]);
  private readonly _audioLevel$ = new BehaviorSubject<number>(0);
  private readonly _systemAudioSupported$ = new BehaviorSubject<boolean>(false);

  readonly isRecording$: Observable<boolean> = this._isRecording$.asObservable();
  readonly devices$: Observable<AudioDevice[]> = this._devices$.asObservable();
  /** Audio level 0-1, updated ~30fps during recording */
  readonly audioLevel$: Observable<number> = this._audioLevel$.asObservable();
  readonly systemAudioSupported$: Observable<boolean> = this._systemAudioSupported$.asObservable();

  constructor(private ipc: ElectronIpcService, private ngZone: NgZone) {
    this.refreshDevices();
    this.checkSystemAudioSupport();

    navigator.mediaDevices?.addEventListener('devicechange', () => {
      this.refreshDevices();
    });
  }

  private async checkSystemAudioSupport(): Promise<void> {
    const supported = await this.ipc.systemAudioIsSupported();
    this._systemAudioSupported$.next(supported);
  }

  async refreshDevices(): Promise<void> {
    try {
      let devices = await navigator.mediaDevices.enumerateDevices();
      let audioInputs = devices.filter((d) => d.kind === 'audioinput');

      // If labels are empty, we need mic permission first
      if (audioInputs.length > 0 && !audioInputs[0].label) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          devices = await navigator.mediaDevices.enumerateDevices();
          audioInputs = devices.filter((d) => d.kind === 'audioinput');
        } catch {
          // Permission denied — keep devices with generic labels
        }
      }

      const mapped: AudioDevice[] = audioInputs.map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
        isDefault: d.deviceId === 'default',
      }));
      this._devices$.next(mapped);
    } catch (err) {
      console.error('[AudioCaptureService] Failed to enumerate devices:', err);
    }
  }

  async startRecording(deviceId?: string, systemAudio?: boolean): Promise<void> {
    if (this._isRecording$.value) return;

    // Auto-detect system audio preference from config if not explicitly passed
    if (systemAudio === undefined) {
      try {
        const api = (window as any).sourdine?.config;
        if (api) {
          const cfg = await api.get();
          systemAudio = cfg?.audio?.systemAudioEnabled === true;
        }
      } catch {
        // Ignore config errors, default to no system audio
      }
    }

    try {
      // Request microphone permission on macOS first
      const mediaApi = (window as any).sourdine?.media;
      if (mediaApi) {
        const granted = await mediaApi.requestMicAccess();
        if (!granted) {
          throw new Error('Microphone access denied');
        }
      }

      // Use simple constraints (complex constraints can break on some systems)
      const constraints: MediaStreamConstraints = {
        audio: deviceId && deviceId !== 'default'
          ? { deviceId: { exact: deviceId } }
          : true,
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioContext = new AudioContext();

      // Force resume in case it's suspended
      if (this.audioContext.state !== 'running') {
        await this.audioContext.resume();
      }

      await this.audioContext.audioWorklet.addModule('assets/worklets/pcm-capture.worklet.js');

      const micSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture');

      // AnalyserNode for real-time audio level
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;

      micSource.connect(this.analyser);
      micSource.connect(this.workletNode);

      // Some browsers need connection to destination to activate audio graph
      // Use a gain of 0 to avoid feedback
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      this.analyser.connect(silentGain);
      silentGain.connect(this.audioContext.destination);

      // Forward PCM chunks to Electron main process via IPC
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'pcm-chunk') {
          this.ipc.sendAudioChunk(event.data.samples);
        }
      };

      // Start audio level monitoring loop
      this.startLevelMonitoring();

      // Start system audio capture if requested and supported
      if (systemAudio && this._systemAudioSupported$.value) {
        this.ipc.systemAudioStart();
        this.systemAudioActive = true;
      }

      this.ipc.startRecording();
      this._isRecording$.next(true);
    } catch (err) {
      console.error('[AudioCaptureService] Failed to start recording:', err);
      this.cleanup();
      throw err;
    }
  }

  stopRecording(): void {
    if (!this._isRecording$.value) return;

    if (this.systemAudioActive) {
      this.ipc.systemAudioStop();
      this.systemAudioActive = false;
    }

    this.ipc.stopRecording();
    this.cleanup();
    this._isRecording$.next(false);
    this._audioLevel$.next(0);
  }

  private startLevelMonitoring(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const poll = () => {
      if (!this.analyser) return;

      this.analyser.getByteFrequencyData(dataArray);

      // RMS of frequency data, normalized to 0-1
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255;

      // Apply a slight curve for better visual response
      const level = Math.min(1, rms * 2.5);

      this.ngZone.run(() => this._audioLevel$.next(level));

      this.levelAnimationId = requestAnimationFrame(poll);
    };

    // Run rAF outside zone to avoid unnecessary CD on every frame
    this.ngZone.runOutsideAngular(() => poll());
  }

  private cleanup(): void {
    if (this.levelAnimationId !== null) {
      cancelAnimationFrame(this.levelAnimationId);
      this.levelAnimationId = null;
    }

    this.analyser?.disconnect();
    this.analyser = null;

    this.workletNode?.disconnect();
    this.workletNode = null;

    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;

    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
  }

  ngOnDestroy(): void {
    this.cleanup();
  }
}
