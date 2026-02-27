import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SessionService } from '../../services/session.service';
import { LanguageService, SupportedLanguage } from '../../services/language.service';
import { GlossaryService, GlossaryEntry } from '../../services/glossary.service';

interface DownloadedModel {
  id: string;
}

interface VoxTapeSettingsApi {
  config?: {
    get: () => Promise<Config>;
    set: (key: string, value: string | boolean | number | null) => Promise<void>;
    reset: () => Promise<void>;
  };
  model?: {
    list: () => Promise<{ known: ModelInfo[]; downloaded: DownloadedModel[] }>;
    download: (modelId: string) => void;
    onDownloadProgress: (cb: (payload: { modelId: string; progress: number; total: number }) => void) => () => void;
  };
  systemAudio?: {
    isSupported: () => Promise<boolean>;
    start: () => void;
    stop: () => void;
    onLevel: (cb: (level: number) => void) => () => void;
  };
}

interface ModelInfo {
  id: string;
  name: string;
  type: string;
  size: string;
  description: string;
}

interface MeetingDetectionConfig {
  enabled: boolean;
  detectWebMeetings: boolean;
  showNotification: boolean;
  notificationDurationMs: number;
  pollIntervalMs: number;
}

interface Config {
  language: string;
  theme: 'dark' | 'light' | 'system';
  audio: { defaultDeviceId: string | null; systemAudioEnabled?: boolean };
  llm: { modelPath: string | null; contextSize: number; temperature: number };
  stt: { modelPath: string | null };
  meetingDetection?: MeetingDetectionConfig;
  onboardingComplete: boolean;
}

@Component({
  selector: 'sdn-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit, OnDestroy {
  config: Config | null = null;
  microphones: MediaDeviceInfo[] = [];
  knownModels: ModelInfo[] = [];
  downloadedModelIds: Set<string> = new Set();
  downloadProgress: Record<string, number> = {};
  systemAudioSupported = false;
  systemAudioEnabled = false;
  systemAudioLevel = 0;
  isTestingSystemAudio = false;

  // Meeting detection
  meetingDetectionEnabled = true;
  detectWebMeetings = false;
  showMeetingNotification = true;

  // Glossary
  glossaryEntries: GlossaryEntry[] = [];
  newGlossaryFrom = '';
  newGlossaryTo = '';

  // LLM context size options
  contextSizeOptions = [
    { value: 4096, label: '4096' },
    { value: 8192, label: '8192 (Recommande)' },
    { value: 16384, label: '16384 (Avance)' },
  ];

  private progressCleanup: (() => void) | null = null;
  private systemAudioLevelCleanup: (() => void) | null = null;

  // Mic test state
  isTestingMic = false;
  audioLevel = 0;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private levelAnimationId: number | null = null;

  themes = [
    { value: 'dark' as const, labelKey: 'settings.themeDark' },
    { value: 'light' as const, labelKey: 'settings.themeLight' },
    { value: 'system' as const, labelKey: 'settings.themeSystem' },
  ];

  languages = [
    { value: 'fr' as SupportedLanguage, label: 'Francais' },
    { value: 'en' as SupportedLanguage, label: 'English' },
  ];

  currentLang: SupportedLanguage = 'fr';

  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly sessionService = inject(SessionService);
  private readonly languageService = inject(LanguageService);
  private readonly glossaryService = inject(GlossaryService);

  private get voxtapeApi(): VoxTapeSettingsApi | undefined {
    return (window as Window & { voxtape?: VoxTapeSettingsApi }).voxtape;
  }

  async ngOnInit(): Promise<void> {
    const api = this.voxtapeApi?.config;
    if (api) {
      const cfg = await api.get();
      this.ngZone.run(() => {
        this.config = cfg;
        if (this.config) this.applyTheme(this.config.theme);
        // Load meeting detection config
        this.loadMeetingDetectionConfig();
        this.cdr.markForCheck();
      });
    }
    this.currentLang = this.languageService.currentLang;
    this.loadMicrophones();
    this.loadModels();
    this.setupProgressListener();
    this.checkSystemAudio();
    this.glossaryService.entries$.subscribe((entries) => {
      this.glossaryEntries = entries;
      this.cdr.markForCheck();
    });
  }

  setLanguage(lang: SupportedLanguage): void {
    this.currentLang = lang;
    this.languageService.setLanguage(lang);
  }

  private async checkSystemAudio(): Promise<void> {
    const api = this.voxtapeApi?.systemAudio;
    if (!api) return;
    try {
      this.systemAudioSupported = await api.isSupported();
    } catch {
      this.systemAudioSupported = false;
    }
    // Read persisted preference
    if (this.config) {
      this.systemAudioEnabled = (this.config as Config & { audio?: { systemAudioEnabled?: boolean } }).audio?.systemAudioEnabled ?? false;
    }
    // Set up level listener
    this.setupSystemAudioLevelListener();
    this.cdr.markForCheck();
  }

  private setupSystemAudioLevelListener(): void {
    const api = this.voxtapeApi?.systemAudio;
    if (!api?.onLevel) return;

    this.systemAudioLevelCleanup = api.onLevel((level: number) => {
      this.ngZone.run(() => {
        this.systemAudioLevel = level;
        this.cdr.markForCheck();
      });
    });
  }

  onSystemAudioToggle(): void {
    this.save('audio.systemAudioEnabled', this.systemAudioEnabled);
    // Stop test if toggle is turned off
    if (!this.systemAudioEnabled && this.isTestingSystemAudio) {
      this.stopSystemAudioTest();
    }
  }

  // ── Meeting Detection ─────────────────────────────────────────────────────

  private loadMeetingDetectionConfig(): void {
    if (!this.config?.meetingDetection) return;
    const mc = this.config.meetingDetection;
    this.meetingDetectionEnabled = mc.enabled;
    this.detectWebMeetings = mc.detectWebMeetings;
    this.showMeetingNotification = mc.showNotification;
  }

  onMeetingDetectionToggle(): void {
    this.save('meetingDetection.enabled', this.meetingDetectionEnabled);
  }

  onDetectWebMeetingsToggle(): void {
    this.save('meetingDetection.detectWebMeetings', this.detectWebMeetings);
  }

  onShowMeetingNotificationToggle(): void {
    this.save('meetingDetection.showNotification', this.showMeetingNotification);
  }

  toggleSystemAudioTest(): void {
    if (this.isTestingSystemAudio) {
      this.stopSystemAudioTest();
    } else {
      this.startSystemAudioTest();
    }
  }

  private startSystemAudioTest(): void {
    const api = this.voxtapeApi?.systemAudio;
    if (!api) return;
    api.start();
    this.isTestingSystemAudio = true;
    this.cdr.markForCheck();
  }

  private stopSystemAudioTest(): void {
    const api = this.voxtapeApi?.systemAudio;
    if (api) {
      api.stop();
    }
    this.isTestingSystemAudio = false;
    this.systemAudioLevel = 0;
    this.cdr.markForCheck();
  }

  private async loadModels(): Promise<void> {
    const api = this.voxtapeApi?.model;
    if (!api) return;
    const result = await api.list();
    this.ngZone.run(() => {
      this.knownModels = result.known;
      this.downloadedModelIds = new Set(result.downloaded.map((d: DownloadedModel) => d.id));
      this.cdr.markForCheck();
    });
  }

  private setupProgressListener(): void {
    const api = this.voxtapeApi?.model;
    if (!api) return;
    this.progressCleanup = api.onDownloadProgress(
      (payload: { modelId: string; progress: number; total: number }) => {
        this.ngZone.run(() => {
          const isDone = payload.progress >= payload.total && payload.total > 0;
          if (isDone) {
            this.downloadedModelIds.add(payload.modelId);
            delete this.downloadProgress[payload.modelId];
          } else {
            this.downloadProgress[payload.modelId] =
              payload.total > 0 ? Math.round((payload.progress / payload.total) * 100) : 0;
          }
          this.cdr.markForCheck();
        });
      }
    );
  }

  isModelDownloaded(id: string): boolean {
    return this.downloadedModelIds.has(id);
  }

  isModelDownloading(id: string): boolean {
    return id in this.downloadProgress;
  }

  getDownloadPercent(id: string): number {
    return this.downloadProgress[id] ?? 0;
  }

  downloadModel(modelId: string): void {
    const api = this.voxtapeApi?.model;
    if (!api) return;
    this.downloadProgress[modelId] = 0;
    api.download(modelId);
  }

  private async loadMicrophones(): Promise<void> {
    try {
      // Request permission first to get device labels
      const mediaApi = (window as Window & { voxtape?: { media?: { requestMicAccess: () => Promise<boolean> } } }).voxtape?.media;
      if (mediaApi) {
        await mediaApi.requestMicAccess();
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === 'audioinput' && d.deviceId);
      this.ngZone.run(() => {
        this.microphones = mics;
        this.cdr.markForCheck();
      });
    } catch {
      // Permission denied or no devices
    }
  }

  // ── LLM Context Size ────────────────────────────────────────────

  onContextSizeChange(): void {
    if (!this.config) return;
    this.save('llm.contextSize', this.config.llm.contextSize);
  }

  // ── Glossary ─────────────────────────────────────────────────────

  addGlossaryEntry(): void {
    if (!this.newGlossaryFrom.trim() || !this.newGlossaryTo.trim()) return;
    this.glossaryService.addEntry(this.newGlossaryFrom, this.newGlossaryTo);
    this.newGlossaryFrom = '';
    this.newGlossaryTo = '';
  }

  removeGlossaryEntry(index: number): void {
    this.glossaryService.removeEntry(index);
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  async resetApp(): Promise<void> {
    const api = this.voxtapeApi?.config;
    if (api) {
      await api.reset();
      // Clear frontend session state after backend reset
      this.sessionService.clearAllState();
      this.router.navigate(['/onboarding']);
    }
  }

  async save(key: string, value: string | boolean | number | null): Promise<void> {
    const api = this.voxtapeApi?.config;
    if (api) {
      await api.set(key, value);
    }
  }

  setTheme(theme: 'dark' | 'light' | 'system'): void {
    if (!this.config) return;
    this.config.theme = theme;
    this.save('theme', theme);
    this.applyTheme(theme);
  }

  private applyTheme(theme: string): void {
    const html = document.documentElement;
    if (theme === 'light') {
      html.classList.add('light');
    } else if (theme === 'dark') {
      html.classList.remove('light');
    } else {
      // system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        html.classList.remove('light');
      } else {
        html.classList.add('light');
      }
    }
  }

  // ── Mic Test ────────────────────────────────────────────────────────────────

  onMicChange(): void {
    this.save('audio.defaultDeviceId', this.config?.audio?.defaultDeviceId ?? null);
    // If testing, restart with new device
    if (this.isTestingMic) {
      this.stopMicTest();
      this.startMicTest();
    }
  }

  async toggleMicTest(): Promise<void> {
    if (this.isTestingMic) {
      this.stopMicTest();
    } else {
      await this.startMicTest();
    }
  }

  private async startMicTest(): Promise<void> {
    try {
      // Request microphone permission on macOS first
      const mediaApi = (window as Window & { voxtape?: { media?: { requestMicAccess: () => Promise<boolean> } } }).voxtape?.media;
      if (mediaApi) {
        const granted = await mediaApi.requestMicAccess();
        if (!granted) {
          console.error('[Settings] Microphone access denied');
          return;
        }
      }

      const deviceId = this.config?.audio?.defaultDeviceId;

      // Use 'exact' to ensure we get the specific device
      const constraints: MediaStreamConstraints = {
        audio: deviceId && deviceId !== 'default'
          ? { deviceId: { exact: deviceId } }
          : true,
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      this.audioContext = new AudioContext();

      if (this.audioContext.state !== 'running') {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;
      source.connect(this.analyser);

      // Connect to destination via silent gain - required for audio processing in Chromium
      const silentGain = this.audioContext.createGain();
      silentGain.gain.value = 0;
      this.analyser.connect(silentGain);
      silentGain.connect(this.audioContext.destination);

      this.isTestingMic = true;
      this.startLevelMonitoring();
      this.cdr.markForCheck();
    } catch (err) {
      console.error('[Settings] Mic test failed:', err);
    }
  }

  private stopMicTest(): void {
    if (this.levelAnimationId !== null) {
      cancelAnimationFrame(this.levelAnimationId);
      this.levelAnimationId = null;
    }

    this.analyser?.disconnect();
    this.analyser = null;

    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;

    this.audioContext?.close().catch(() => { /* AudioContext close errors are expected */ });
    this.audioContext = null;

    this.isTestingMic = false;
    this.audioLevel = 0;
    this.cdr.markForCheck();
  }

  private startLevelMonitoring(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const poll = () => {
      if (!this.analyser) return;

      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255;
      const level = Math.min(1, rms * 2.5);

      this.ngZone.run(() => {
        this.audioLevel = level;
        this.cdr.markForCheck();
      });

      this.levelAnimationId = requestAnimationFrame(poll);
    };

    this.ngZone.runOutsideAngular(() => poll());
  }

  ngOnDestroy(): void {
    this.stopMicTest();
    if (this.isTestingSystemAudio) {
      this.stopSystemAudioTest();
    }
    this.progressCleanup?.();
    this.systemAudioLevelCleanup?.();
  }
}
