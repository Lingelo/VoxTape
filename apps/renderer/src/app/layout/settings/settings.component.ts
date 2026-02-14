import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface DownloadedModel {
  id: string;
}

interface SourdineSettingsApi {
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

interface Config {
  language: string;
  theme: 'dark' | 'light' | 'system';
  audio: { defaultDeviceId: string | null };
  llm: { modelPath: string | null; contextSize: number; temperature: number };
  stt: { modelPath: string | null };
  onboardingComplete: boolean;
}

@Component({
  selector: 'sdn-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="drag-region"></div>
    <div class="settings-page">
      <div class="settings-header">
        <button class="back-btn" (click)="goBack()">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 12L6 8l4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <h1>Paramètres</h1>
      </div>

      @if (config) {
        <div class="settings-body">
          <!-- General -->
          <section class="settings-section">
            <h2>Général</h2>

            <div class="setting-row">
              <span class="label-text">Thème</span>
              <div class="theme-toggle" role="group" aria-label="Thème">
                @for (t of themes; track t.value) {
                  <button
                    [class.active]="config.theme === t.value"
                    (click)="setTheme(t.value)"
                  >
                    {{ t.label }}
                  </button>
                }
              </div>
            </div>
          </section>

          <!-- Audio -->
          <section class="settings-section">
            <h2>Audio</h2>
            <div class="setting-row">
              <label for="default-mic">Microphone par défaut</label>
              <div class="mic-controls">
                <select id="default-mic" [(ngModel)]="config.audio.defaultDeviceId" (change)="onMicChange()">
                  <option [ngValue]="null">Défaut du système</option>
                  @for (mic of microphones; track mic.deviceId) {
                    <option [ngValue]="mic.deviceId">{{ mic.label }}</option>
                  }
                </select>
                <button class="test-mic-btn" [class.active]="isTestingMic" (click)="toggleMicTest()">
                  {{ isTestingMic ? 'Stop' : 'Test' }}
                </button>
              </div>
            </div>
            @if (isTestingMic) {
              <div class="mic-test-box">
                <div class="vu-meter">
                  <div class="vu-bar" [style.width.%]="audioLevel * 100"></div>
                </div>
                <p class="mic-status" [class.active]="audioLevel > 0.02">
                  {{ audioLevel > 0.02 ? 'Signal détecté !' : 'Parlez pour tester...' }}
                </p>
              </div>
            }
            @if (systemAudioSupported) {
              <div class="setting-row">
                <div class="setting-label-group">
                  <span class="label-text">Capturer l'audio systeme</span>
                  <span class="setting-hint">Transcrit l'audio des applications (réunions, vidéos...)</span>
                </div>
                <div class="mic-controls">
                  <label class="toggle-switch">
                    <input type="checkbox" [(ngModel)]="systemAudioEnabled" (change)="onSystemAudioToggle()" aria-label="Capturer l'audio systeme" />
                    <span class="toggle-slider"></span>
                  </label>
                  <button
                    class="test-mic-btn"
                    [class.active]="isTestingSystemAudio"
                    [disabled]="!systemAudioEnabled"
                    (click)="toggleSystemAudioTest()"
                  >
                    {{ isTestingSystemAudio ? 'Stop' : 'Test' }}
                  </button>
                </div>
              </div>
            }
            @if (isTestingSystemAudio) {
              <div class="mic-test-box">
                <div class="vu-meter">
                  <div class="vu-bar" [style.width.%]="systemAudioLevel * 100"></div>
                </div>
                <p class="mic-status" [class.active]="systemAudioLevel > 0.02">
                  {{ systemAudioLevel > 0.02 ? 'Audio système détecté !' : 'Lancez une vidéo ou de la musique...' }}
                </p>
              </div>
            }
            @if (!systemAudioSupported) {
              <div class="setting-row unsupported-hint">
                <span class="setting-hint">Capture audio système : nécessite macOS 14.2+</span>
              </div>
            }
          </section>

          <!-- Models -->
          <section class="settings-section">
            <h2>Modèles</h2>

            <div class="model-list">
              @for (m of knownModels; track m.id) {
                <div>
                  <div class="model-row">
                    <div class="model-info">
                      <span class="model-name">{{ m.name }}</span>
                      <span class="model-meta">{{ m.size }} · {{ m.description }}</span>
                    </div>
                    <div class="model-status">
                      @if (isModelDownloaded(m.id)) {
                        <span class="status-badge installed">Installé</span>
                      }
                      @if (!isModelDownloaded(m.id) && !isModelDownloading(m.id)) {
                        <span class="status-badge missing">Manquant</span>
                      }
                      @if (isModelDownloading(m.id)) {
                        <span class="status-badge downloading">{{ getDownloadPercent(m.id) }}%</span>
                      }
                      @if (!isModelDownloaded(m.id) && !isModelDownloading(m.id)) {
                        <button
                          class="model-action-btn"
                          (click)="downloadModel(m.id)"
                        >Télécharger</button>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          </section>

        <!-- About -->
        <section class="settings-section">
          <h2>À propos</h2>
          <p class="about-text">Sourdine — Notes de réunion intelligentes</p>
          <p class="about-text">100% local, zero cloud</p>
        </section>

          <!-- Reset -->
          <section class="settings-section">
            <button class="reset-btn" (click)="resetApp()">Réinitialiser l'application</button>
            <p class="reset-warning">Supprime toutes vos sessions, transcriptions et modèles téléchargés.</p>
          </section>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; overflow-y: auto; }

    .drag-region {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 42px;
      -webkit-app-region: drag;
      z-index: 10;
    }

    .settings-page {
      max-width: 600px;
      margin: 0 auto;
      padding: 24px 32px;
    }

    .settings-header {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0 -32px 32px;
      padding: 32px 32px 16px;
      background: var(--bg-main);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border-subtle);
    }

    .settings-header h1 {
      font-size: 22px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .back-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 8px 12px;
      display: flex;
      align-items: center;
    }
    .back-btn:hover {
      background: var(--accent-hover);
      color: var(--text-primary);
    }

    .settings-section {
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .settings-section:last-child { border-bottom: none; }

    .settings-section h2 {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 16px;
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      gap: 16px;
    }

    .setting-row label {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .setting-row select {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      color: var(--text-primary);
      padding: 10px 12px;
      font-size: 13px;
      outline: none;
    }

    .theme-toggle {
      display: flex;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }
    .theme-toggle button {
      padding: 10px 16px;
      border: none;
      background: none;
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .theme-toggle button:hover {
      background: var(--accent-hover);
    }
    .theme-toggle button.active {
      background: var(--accent-primary);
      color: #1a1a1a;
    }

    .about-text {
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .subsection-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      margin: 16px 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .model-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
    }
    .model-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 0;
    }
    .model-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .model-name {
      font-size: 13px;
      color: var(--text-primary);
      font-weight: 500;
    }
    .model-meta {
      font-size: 11px;
      color: var(--text-secondary);
    }
    .model-status {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-badge {
      font-size: 12px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 4px;
    }
    .status-badge.installed {
      color: var(--accent-primary);
      background: var(--accent-primary-tint);
    }
    .status-badge.missing {
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.1);
    }
    .status-badge.downloading {
      color: var(--text-secondary);
    }
    .model-action-btn {
      padding: 4px 12px;
      border: 1px solid var(--accent-primary);
      border-radius: 8px;
      background: none;
      color: var(--accent-primary);
      font-size: 12px;
      cursor: pointer;
    }
    .model-action-btn:hover {
      background: var(--accent-primary-tint);
    }
    .setting-label-group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .setting-hint {
      font-size: 11px;
      color: var(--text-secondary);
      opacity: 0.7;
    }
    .unsupported-hint {
      justify-content: flex-start;
    }

    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 22px;
      flex-shrink: 0;
    }
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: var(--border-subtle);
      border-radius: 22px;
      transition: background 0.2s;
    }
    .toggle-slider::before {
      content: '';
      position: absolute;
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .toggle-switch input:checked + .toggle-slider {
      background: var(--accent-primary);
    }
    .toggle-switch input:checked + .toggle-slider::before {
      transform: translateX(18px);
    }

    .reset-btn {
      padding: 12px 24px;
      border: 1px solid #ef4444;
      border-radius: 8px;
      background: none;
      color: #ef4444;
      font-size: 13px;
      cursor: pointer;
      margin-bottom: 8px;
    }
    .reset-btn:hover {
      background: rgba(239, 68, 68, 0.1);
    }
    .reset-warning {
      font-size: 12px;
      color: #ef4444;
      margin-top: 8px;
    }

    .mic-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .test-mic-btn {
      padding: 10px 16px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: var(--bg-surface);
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
      flex-shrink: 0;
    }
    .test-mic-btn:hover {
      background: var(--accent-hover);
      color: var(--text-primary);
    }
    .test-mic-btn.active {
      background: var(--accent-primary);
      color: #1a1a1a;
      border-color: var(--accent-primary);
    }
    .test-mic-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .mic-test-box {
      margin-top: 12px;
      padding: 16px;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
    }

    .vu-meter {
      height: 8px;
      background: var(--bg-main);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    .vu-bar {
      height: 100%;
      background: var(--accent-primary);
      border-radius: 4px;
      transition: width 0.1s;
    }
    .mic-status {
      font-size: 13px;
      color: var(--text-secondary);
      transition: color 0.2s;
      margin: 0;
    }
    .mic-status.active {
      color: var(--accent-primary);
    }
  `],
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
    { value: 'dark' as const, label: 'Sombre' },
    { value: 'light' as const, label: 'Clair' },
    { value: 'system' as const, label: 'Système' },
  ];

  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  private get sourdineApi(): SourdineSettingsApi | undefined {
    return (window as Window & { sourdine?: SourdineSettingsApi }).sourdine;
  }

  async ngOnInit(): Promise<void> {
    const api = this.sourdineApi?.config;
    if (api) {
      const cfg = await api.get();
      this.ngZone.run(() => {
        this.config = cfg;
        if (this.config) this.applyTheme(this.config.theme);
        this.cdr.markForCheck();
      });
    }
    this.loadMicrophones();
    this.loadModels();
    this.setupProgressListener();
    this.checkSystemAudio();
  }

  private async checkSystemAudio(): Promise<void> {
    const api = this.sourdineApi?.systemAudio;
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
    const api = this.sourdineApi?.systemAudio;
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

  toggleSystemAudioTest(): void {
    if (this.isTestingSystemAudio) {
      this.stopSystemAudioTest();
    } else {
      this.startSystemAudioTest();
    }
  }

  private startSystemAudioTest(): void {
    const api = this.sourdineApi?.systemAudio;
    if (!api) return;
    api.start();
    this.isTestingSystemAudio = true;
    this.cdr.markForCheck();
  }

  private stopSystemAudioTest(): void {
    const api = this.sourdineApi?.systemAudio;
    if (api) {
      api.stop();
    }
    this.isTestingSystemAudio = false;
    this.systemAudioLevel = 0;
    this.cdr.markForCheck();
  }

  private async loadModels(): Promise<void> {
    const api = this.sourdineApi?.model;
    if (!api) return;
    const result = await api.list();
    this.ngZone.run(() => {
      this.knownModels = result.known;
      this.downloadedModelIds = new Set(result.downloaded.map((d: DownloadedModel) => d.id));
      this.cdr.markForCheck();
    });
  }

  private setupProgressListener(): void {
    const api = this.sourdineApi?.model;
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
    const api = this.sourdineApi?.model;
    if (!api) return;
    this.downloadProgress[modelId] = 0;
    api.download(modelId);
  }

  private async loadMicrophones(): Promise<void> {
    try {
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

  goBack(): void {
    this.router.navigate(['/']);
  }

  async resetApp(): Promise<void> {
    const api = this.sourdineApi?.config;
    if (api) {
      await api.reset();
      this.router.navigate(['/onboarding']);
    }
  }

  async save(key: string, value: string | boolean | number | null): Promise<void> {
    const api = this.sourdineApi?.config;
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
      const deviceId = this.config?.audio?.defaultDeviceId;
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
