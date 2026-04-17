import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { GlitchLoaderComponent } from '../../shared/glitch-loader/glitch-loader.component';
import { LanguageService, SupportedLanguage } from '../../services/language.service';
import { AiModeStepComponent, AiModeResult } from './ai-mode-step/ai-mode-step.component';

interface ModelInfo {
  id: string;
  name: string;
  type: string;
  size: string;
  description: string;
}

interface DownloadState {
  modelId: string;
  progress: number;
  total: number;
  status: 'pending' | 'downloading' | 'done' | 'error';
  error?: string;
}

interface AudioDevice {
  deviceId: string;
  label: string;
}

interface VoxTapeOnboardingApi {
  app?: {
    getVersion: () => Promise<string>;
  };
  config?: {
    set: (key: string, value: string | boolean | number | null) => Promise<void>;
  };
  credentials?: {
    set: (provider: string, key: string) => Promise<{ ok: boolean }>;
    has: (provider: string) => Promise<boolean>;
    delete: (provider: string) => Promise<{ ok: boolean }>;
    validate: (provider: string, key: string) => Promise<{ ok: boolean; error?: string }>;
  };
  model?: {
    list: () => Promise<{ known: ModelInfo[]; downloaded: { id: string }[] }>;
    download: (modelId: string) => void;
    onDownloadProgress: (cb: (payload: { modelId: string; progress: number; total: number }) => void) => () => void;
  };
  media?: {
    requestMicAccess: () => Promise<boolean>;
  };
  systemAudio?: {
    isSupported: () => Promise<boolean>;
    start: () => void;
    stop: () => void;
    onLevel: (cb: (level: number) => void) => () => void;
  };
  stt?: {
    restart: () => void;
  };
}

@Component({
  selector: 'sdn-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, GlitchLoaderComponent, AiModeStepComponent],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
})
export class OnboardingComponent implements OnInit, OnDestroy {
  step = 0;
  steps = [0, 1, 2, 3, 4, 5, 6];
  selectedLang: SupportedLanguage = 'fr';
  appVersion = '';

  // AI Mode (step 4)
  aiModeResult: AiModeResult = { mode: 'local', llmProvider: 'openai', sttProvider: 'local' };
  aiModeCanProceed = true;

  // Mic
  audioLevel = 0;
  micState: 'idle' | 'requesting' | 'active' | 'error' = 'idle';
  micSignalDetected = false;
  audioDevices: AudioDevice[] = [];
  selectedDeviceId = '';

  // System Audio
  systemAudioSupported = false;
  systemAudioEnabled = false;
  systemAudioLevel = 0;
  private systemAudioLevelCleanup: (() => void) | null = null;

  // Install
  models: ModelInfo[] = [];
  downloads: Record<string, DownloadState> = {};
  installState: 'idle' | 'downloading' | 'done' | 'error' = 'idle';
  currentInstallLabel = '';
  overallProgress = 0;

  private micStream: MediaStream | null = null;
  private micLevelCleanup: (() => void) | null = null;
  private progressCleanup: (() => void) | null = null;

  // Required model IDs — without these, core functionality doesn't work
  private readonly REQUIRED_MODELS = [
    'silero-vad',
    'whisper-turbo',
    'ministral-3b-instruct-q4',
  ];

  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  get voxtapeApi(): VoxTapeOnboardingApi | undefined {
    return (window as Window & { voxtape?: VoxTapeOnboardingApi }).voxtape;
  }

  async ngOnInit(): Promise<void> {
    this.voxtapeApi?.app?.getVersion().then((v) => {
      this.appVersion = v;
      this.cdr.markForCheck();
    });
    await this.loadModels();
    this.setupProgressListener();
    this.checkSystemAudioSupport();
  }

  ngOnDestroy(): void {
    this.stopMicTest();
    this.stopSystemAudioTest();
    this.progressCleanup?.();
    this.systemAudioLevelCleanup?.();
  }

  get allModelsDownloaded(): boolean {
    return this.models.length > 0 &&
      this.models.every((m) => this.downloads[m.id]?.status === 'done');
  }

  get requiredModelsReady(): boolean {
    return this.REQUIRED_MODELS.every((id) => this.downloads[id]?.status === 'done');
  }

  isRequired(modelId: string): boolean {
    return this.REQUIRED_MODELS.includes(modelId);
  }

  onLanguageSelect(lang: SupportedLanguage): void {
    this.selectedLang = lang;
    this.languageService.setLanguage(lang, true);
  }

  nextStep(): void {
    if (this.step === 2) {
      if (this.selectedDeviceId) {
        this.saveConfig('audio.defaultDeviceId', this.selectedDeviceId);
      }
      this.stopMicTest();
    }
    if (this.step === 3) {
      this.stopSystemAudioTest();
    }
    // AI Mode step: save config and handle cloud skip
    if (this.step === 4 && this.aiModeResult.mode === 'cloud') {
      this.saveConfig('llm.provider', this.aiModeResult.llmProvider);
      this.saveConfig('llm.model', this.getDefaultModel(this.aiModeResult.llmProvider));
      if (this.aiModeResult.sttProvider !== 'local') {
        this.saveConfig('stt.provider', this.aiModeResult.sttProvider);
        this.saveConfig('stt.model', 'nova-3');
      }
      // Download VAD silently (2MB), skip the full install step
      this.downloadVadOnly();
      this.step = 6; // Jump to Ready
      return;
    }
    // Block progression from Install step until done
    if (this.step === 5 && this.installState !== 'done') {
      return;
    }
    this.step = Math.min(this.step + 1, this.steps.length - 1);

    if (this.step === 2) {
      this.startMicTest();
    }
  }

  prevStep(): void {
    if (this.step === 2) {
      this.stopMicTest();
    }
    this.step = Math.max(this.step - 1, 0);

    if (this.step === 2) {
      this.startMicTest();
    }
  }

  async finish(): Promise<void> {
    await this.saveConfig('onboardingComplete', true);
    this.router.navigate(['/']);
  }

  // ── Mic ─────────────────────────────────────────────────────────────

  onDeviceChange(deviceId: string): void {
    this.selectedDeviceId = deviceId;
    // Save immediately so capture uses the correct device
    this.saveConfig('audio.defaultDeviceId', deviceId);
    // Restart mic test with new device
    this.stopMicTest();
    this.startMicTest();
  }

  private async startMicTest(): Promise<void> {
    this.micState = 'requesting';
    this.micSignalDetected = false;
    this.cdr.markForCheck();
    try {
      // On macOS, request mic access through Electron's system preferences first
      const mediaApi = this.voxtapeApi?.media;
      if (mediaApi) {
        await mediaApi.requestMicAccess();
      }

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (this.selectedDeviceId) {
        audioConstraints.deviceId = { exact: this.selectedDeviceId };
      }
      const constraints: MediaStreamConstraints = { audio: audioConstraints };
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = this.micStream.getAudioTracks()[0];

      this.zone.run(async () => {
        this.micState = 'active';
        this.cdr.markForCheck();

        // Enumerate devices (labels available only after getUserMedia grant)
        await this.enumerateDevices();
        this.cdr.markForCheck();
      });

      this.micLevelCleanup = this.startLevelMeter(track);
    } catch (err) {
      console.error('[Onboarding] Mic access failed:', err);
      this.zone.run(() => {
        this.micState = 'error';
        this.cdr.markForCheck();
      });
    }
  }

  // Uses MediaStreamTrackProcessor (WebCodecs) to read raw audio frames directly.
  // Bypasses WebAudio AnalyserNode, which silently reads zeros on some Chromium + macOS
  // + USB-audio-device combinations despite a live, non-muted MediaStreamTrack.
  private startLevelMeter(track: MediaStreamTrack): () => void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MSTP = (window as unknown as { MediaStreamTrackProcessor?: any }).MediaStreamTrackProcessor;
    if (!MSTP) {
      console.warn('[Onboarding] MediaStreamTrackProcessor unavailable — level meter disabled');
      return () => { /* no-op */ };
    }

    const processor = new MSTP({ track });
    const reader: ReadableStreamDefaultReader = processor.readable.getReader();
    let cancelled = false;

    (async () => {
      while (!cancelled) {
        const { value: frame, done } = await reader.read();
        if (done || !frame) break;
        const numFrames = frame.numberOfFrames;
        const buffer = new Float32Array(numFrames);
        try {
          frame.copyTo(buffer, { planeIndex: 0, format: 'f32-planar' });
        } finally {
          frame.close();
        }
        let peak = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = Math.abs(buffer[i]);
          if (v > peak) peak = v;
        }
        this.zone.run(() => {
          // Smooth decay so the bar doesn't flicker back to zero between frames.
          this.audioLevel = Math.max(peak, this.audioLevel * 0.85);
          if (peak > 0.02) {
            this.micSignalDetected = true;
          }
          this.cdr.markForCheck();
        });
      }
    })().catch((err) => {
      if (!cancelled) console.error('[Onboarding] Level meter read failed:', err);
    });

    return () => {
      cancelled = true;
      reader.cancel().catch(() => { /* cancel errors are expected */ });
    };
  }

  private async enumerateDevices(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.audioDevices = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }));

      // Auto-select current device if not set
      if (!this.selectedDeviceId && this.audioDevices.length > 0) {
        this.selectedDeviceId = this.audioDevices[0].deviceId;
      }
    } catch {
      // Ignore enumeration errors
    }
  }

  stopMicTest(): void {
    if (this.micLevelCleanup) {
      this.micLevelCleanup();
      this.micLevelCleanup = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.audioLevel = 0;
  }

  // ── System Audio ────────────────────────────────────────────────────

  private async checkSystemAudioSupport(): Promise<void> {
    const api = this.voxtapeApi?.systemAudio;
    if (!api) return;
    try {
      this.systemAudioSupported = await api.isSupported();
      this.setupSystemAudioLevelListener();
      this.cdr.markForCheck();
    } catch {
      this.systemAudioSupported = false;
    }
  }

  private setupSystemAudioLevelListener(): void {
    const api = this.voxtapeApi?.systemAudio;
    if (!api?.onLevel) return;

    this.systemAudioLevelCleanup = api.onLevel((level: number) => {
      this.zone.run(() => {
        this.systemAudioLevel = level;
        this.cdr.markForCheck();
      });
    });
  }

  onSystemAudioToggle(): void {
    this.saveConfig('audio.systemAudioEnabled', this.systemAudioEnabled);
    const api = this.voxtapeApi?.systemAudio;
    if (!api) return;

    if (this.systemAudioEnabled) {
      api.start();
    } else {
      api.stop();
      this.systemAudioLevel = 0;
    }
  }

  stopSystemAudioTest(): void {
    const api = this.voxtapeApi?.systemAudio;
    if (api && this.systemAudioEnabled) {
      api.stop();
    }
    this.systemAudioLevel = 0;
  }

  // ── Install ───────────────────────────────────────────────────────

  private getInstallLabel(modelId: string): string {
    const labels: Record<string, string> = {
      'silero-vad': 'onboarding.installVoiceLabel',
      'whisper-turbo': 'onboarding.installTranscriptionLabel',
      'ministral-3b-instruct-q4': 'onboarding.installAILabel',
    };
    return this.translate.instant(labels[modelId] ?? 'onboarding.installDownloading');
  }

  private async loadModels(): Promise<void> {
    const api = this.voxtapeApi?.model;
    if (!api) return;

    const result = await api.list();
    this.models = result.known;

    // Mark already downloaded models
    for (const d of result.downloaded) {
      this.downloads[d.id] = {
        modelId: d.id,
        progress: 1,
        total: 1,
        status: 'done',
      };
    }

    // If all required models already installed, skip to done
    if (this.requiredModelsReady) {
      this.installState = 'done';
    }
  }

  startInstall(): void {
    const api = this.voxtapeApi?.model;
    if (!api) return;

    this.installState = 'downloading';
    const pending = this.REQUIRED_MODELS.filter((id) => this.downloads[id]?.status !== 'done');

    if (pending.length === 0) {
      this.installState = 'done';
      return;
    }

    // Start first pending model
    this.currentInstallLabel = this.getInstallLabel(pending[0]);
    this.downloads[pending[0]] = { modelId: pending[0], progress: 0, total: 0, status: 'downloading' };
    api.download(pending[0]);
    this.cdr.markForCheck();
  }

  private setupProgressListener(): void {
    const api = this.voxtapeApi?.model;
    if (!api) return;

    this.progressCleanup = api.onDownloadProgress(
      (payload: { modelId: string; progress: number; total: number }) => {
        this.zone.run(() => {
          const isDone = payload.progress >= payload.total && payload.total > 0;
          this.downloads[payload.modelId] = {
            modelId: payload.modelId,
            progress: payload.progress,
            total: payload.total,
            status: isDone ? 'done' : 'downloading',
          };

          // Update label
          this.currentInstallLabel = this.getInstallLabel(payload.modelId);

          // Calculate overall progress
          this.updateOverallProgress();

          // If this model is done, start next pending
          if (isDone) {
            const pending = this.REQUIRED_MODELS.filter((id) => this.downloads[id]?.status !== 'done');
            if (pending.length === 0) {
              this.installState = 'done';
              // Restart STT worker now that models are available
              this.voxtapeApi?.stt?.restart?.();
            } else {
              this.currentInstallLabel = this.getInstallLabel(pending[0]);
              this.downloads[pending[0]] = { modelId: pending[0], progress: 0, total: 0, status: 'downloading' };
              api.download(pending[0]);
            }
          }

          this.cdr.markForCheck();
        });
      }
    );
  }

  // Approximate sizes in bytes for weighted progress
  private readonly MODEL_WEIGHTS: Record<string, number> = {
    'silero-vad': 2_000_000,
    'whisper-turbo': 538_000_000,
    'ministral-3b-instruct-q4': 2_100_000_000,
  };

  private updateOverallProgress(): void {
    const totalWeight = this.REQUIRED_MODELS.reduce((sum, id) => sum + (this.MODEL_WEIGHTS[id] ?? 1), 0);
    let progressWeight = 0;

    for (const id of this.REQUIRED_MODELS) {
      const weight = this.MODEL_WEIGHTS[id] ?? 1;
      const dl = this.downloads[id];
      if (dl?.status === 'done') {
        progressWeight += weight;
      } else if (dl?.status === 'downloading' && dl.total > 0) {
        progressWeight += weight * (dl.progress / dl.total);
      }
    }

    this.overallProgress = (progressWeight / totalWeight) * 100;
  }

  // ── AI Mode ──────────────────────────────────────────────────────

  private getDefaultModel(provider: string): string {
    const defaults: Record<string, string> = {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-haiku-4-5-20251001',
      gemini: 'gemini-2.5-flash',
    };
    return defaults[provider] ?? '';
  }

  private downloadVadOnly(): void {
    const api = this.voxtapeApi?.model;
    if (!api) return;
    // Only download VAD if not already present
    if (this.downloads['silero-vad']?.status !== 'done') {
      api.download('silero-vad');
    }
  }

  // ── Config ────────────────────────────────────────────────────────

  private async saveConfig(key: string, value: string | boolean | number | null): Promise<void> {
    const api = this.voxtapeApi?.config;
    if (api) {
      await api.set(key, value);
    }
  }
}
