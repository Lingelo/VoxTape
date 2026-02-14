import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

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

interface SourdineOnboardingApi {
  config?: {
    set: (key: string, value: string | boolean | number | null) => Promise<void>;
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
  imports: [CommonModule, FormsModule],
  template: `
    <div class="drag-region"></div>
    <div class="onboarding">
      <div class="onboarding-card">
        <!-- Step indicators -->
        <div class="steps">
          @for (s of steps; track s; let i = $index) {
            <div
              class="step-dot"
              [class.active]="step === i"
              [class.completed]="step > i"
            ></div>
          }
        </div>

        <!-- Step 0: Welcome -->
        @if (step === 0) {
        <div class="step-content">
          <img src="assets/logo.svg" alt="Sourdine" class="welcome-logo" />
          <h1>Sourdine</h1>
          <p class="subtitle">Votre assistant de réunion 100% local</p>

          <div class="welcome-features">
            <div class="welcome-feature">
              <div class="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              </div>
              <div class="feature-text">
                <span class="feature-title">Transcription en temps réel</span>
                <span class="feature-desc">Vos réunions transcrites automatiquement, sans connexion internet</span>
              </div>
            </div>
            <div class="welcome-feature">
              <div class="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <div class="feature-text">
                <span class="feature-title">Résumés intelligents</span>
                <span class="feature-desc">Points clés, actions et décisions extraits par une IA locale</span>
              </div>
            </div>
            <div class="welcome-feature">
              <div class="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div class="feature-text">
                <span class="feature-title">100% local, zero cloud</span>
                <span class="feature-desc">Vos données restent sur votre machine, rien n'est envoyé en ligne</span>
              </div>
            </div>
            <div class="welcome-feature">
              <div class="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.5 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
              </div>
              <div class="feature-text">
                <span class="feature-title">Empreinte écologique réduite</span>
                <span class="feature-desc">Aucun serveur distant sollicité, tout tourne sur votre machine</span>
              </div>
            </div>
          </div>

          <button class="primary-btn" (click)="nextStep()">Commencer</button>
        </div>
        }

        <!-- Step 1: Microphone -->
        @if (step === 1) {
        <div class="step-content">
          <h1>Microphone</h1>
          <p class="subtitle">Choisissez et testez votre micro</p>

          @if (audioDevices.length > 0) {
            <div class="field">
              <label for="mic-select">Microphone</label>
              <select
                id="mic-select"
                class="mic-select"
                [(ngModel)]="selectedDeviceId"
                (ngModelChange)="onDeviceChange($event)"
              >
                @for (d of audioDevices; track d.deviceId) {
                  <option [value]="d.deviceId">
                    {{ d.label }}
                  </option>
                }
              </select>
            </div>
          }

          <div class="mic-test">
            @if (micState !== 'error') {
              <div class="vu-meter">
                <div class="vu-bar" [style.width.%]="audioLevel * 100"></div>
              </div>
            }
            @if (micState === 'idle') {
              <p class="mic-status">
                Chargement...
              </p>
            }
            @if (micState === 'requesting') {
              <p class="mic-status">
                Demande d'accès au micro...
              </p>
            }
            @if (micState === 'active') {
              <p class="mic-status" [class.active]="audioLevel > 0.02">
                {{ audioLevel > 0.02 ? 'Signal détecté !' : 'Parlez pour tester...' }}
              </p>
            }
            @if (micState === 'error') {
              <p class="mic-status mic-error">
                Accès au micro refusé. Vérifiez Préférences Système &gt; Confidentialité &gt; Microphone.
              </p>
            }
          </div>

          @if (micState === 'active' && !micSignalDetected) {
            <p class="mic-warning">
              Aucun signal détecté. Vous pouvez continuer, mais vérifiez votre micro avant d'enregistrer.
            </p>
          }

          <div class="btn-group">
            <button class="secondary-btn" (click)="prevStep()">Retour</button>
            <button
              class="primary-btn"
              [disabled]="!micSignalDetected"
              [class.disabled]="!micSignalDetected"
              (click)="stopMicTest(); nextStep()"
            >Continuer</button>
          </div>
        </div>
        }

        <!-- Step 2: System Audio -->
        @if (step === 2) {
        <div class="step-content">
          <h1>Audio Système</h1>
          <p class="subtitle">Capturez le son des applications (réunions, vidéos...)</p>

          @if (!systemAudioSupported) {
            <div class="system-audio-unsupported">
              <p class="mic-warning">Nécessite macOS 14.2 ou supérieur</p>
              <p class="setting-hint">Votre système ne supporte pas cette fonctionnalité. Vous pouvez continuer sans.</p>
            </div>
          }

          @if (systemAudioSupported) {
            <div class="system-audio-setup">
              <div class="setting-row">
                <div class="setting-label-group">
                  <span class="label-text">Activer la capture audio système</span>
                  <span class="setting-hint">Transcrit le son des apps en plus du micro</span>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" [(ngModel)]="systemAudioEnabled" (change)="onSystemAudioToggle()" aria-label="Activer la capture audio système" />
                  <span class="toggle-slider"></span>
                </label>
              </div>

              @if (systemAudioEnabled) {
                <div class="mic-test">
                  <div class="vu-meter">
                    <div class="vu-bar" [style.width.%]="systemAudioLevel * 100"></div>
                  </div>
                  <p class="mic-status" [class.active]="systemAudioLevel > 0.02">
                    {{ systemAudioLevel > 0.02 ? 'Audio système détecté !' : 'Lancez une vidéo ou de la musique...' }}
                  </p>
                </div>
              }
            </div>
          }

          <div class="btn-group">
            <button class="secondary-btn" (click)="stopSystemAudioTest(); prevStep()">Retour</button>
            <button class="primary-btn" (click)="stopSystemAudioTest(); nextStep()">Continuer</button>
          </div>
        </div>
        }

        <!-- Step 3: Install -->
        @if (step === 3) {
        <div class="step-content">
          <h1>Installation</h1>
          <p class="subtitle">Sourdine a besoin de télécharger quelques composants pour fonctionner</p>

          <!-- Before install -->
          @if (installState === 'idle') {
            <div class="install-info">
              <div class="install-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                <span>Détection de voix</span>
              </div>
              <div class="install-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Transcription multilingue</span>
              </div>
              <div class="install-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>Assistant IA local (résumés, chat)</span>
              </div>
              <p class="install-size">Environ 5 Go au total</p>
            </div>
          }

          <!-- During install -->
          @if (installState === 'downloading') {
            <div class="install-progress">
              <p class="install-step-label">{{ currentInstallLabel }}</p>
              <div class="progress-bar large">
                <div class="progress-fill" [style.width.%]="overallProgress"></div>
              </div>
              <p class="install-percent">{{ overallProgress | number:'1.0-0' }}%</p>
            </div>
          }

          <!-- Done -->
          @if (installState === 'done') {
            <div class="install-done">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <p class="install-done-text">Installation terminée</p>
            </div>
          }

          <!-- Error -->
          @if (installState === 'error') {
            <div class="install-error">
              <p class="mic-error">Une erreur est survenue. Vérifiez votre connexion et réessayez.</p>
            </div>
          }

          <div class="btn-group">
            <button class="secondary-btn" (click)="prevStep()">Retour</button>
            @if (installState === 'idle' || installState === 'error') {
              <button
                class="primary-btn"
                (click)="startInstall()"
              >Installer</button>
            }
            @if (installState === 'done') {
              <button
                class="primary-btn"
                (click)="nextStep()"
              >Continuer</button>
            }
            @if (installState === 'downloading') {
              <div class="primary-btn disabled" style="text-align:center">
                Installation en cours...
              </div>
            }
          </div>
        </div>
        }

        <!-- Step 4: Ready -->
        @if (step === 4) {
        <div class="step-content">
          <h1>Prêt !</h1>
          <p class="subtitle">Sourdine est configuré. Commencez votre première session.</p>

          <div class="ready-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>

          <button class="primary-btn" (click)="finish()">Commencer</button>
        </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; }

    .drag-region {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 42px;
      -webkit-app-region: drag;
      z-index: 10;
    }

    .onboarding {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-main);
      padding: 24px;
    }

    .onboarding-card {
      width: 100%;
      max-width: 480px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      padding: 40px;
    }

    .steps {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-bottom: 32px;
    }

    .step-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--border-subtle);
      transition: all 0.2s;
    }
    .step-dot.active {
      background: var(--accent-primary);
      width: 24px;
      border-radius: 4px;
    }
    .step-dot.completed {
      background: var(--accent-primary);
    }

    .step-content { text-align: center; }

    .step-content h1 {
      font-size: 22px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .subtitle {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 32px;
    }

    .field {
      margin-bottom: 16px;
      text-align: left;
    }

    .field label {
      display: block;
      font-size: 13px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .option-group {
      display: flex;
      gap: 8px;
    }

    .option-group button {
      flex: 1;
      padding: 12px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: var(--bg-main);
      color: var(--text-primary);
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .option-group button:hover {
      border-color: var(--accent-primary);
    }
    .option-group button.selected {
      border-color: var(--accent-primary);
      background: var(--accent-primary-tint);
    }

    /* Welcome */
    .welcome-logo {
      width: 72px;
      height: 72px;
      margin-bottom: 16px;
      border-radius: 16px;
    }
    .welcome-features {
      text-align: left;
      margin-bottom: 32px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .welcome-feature {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 14px;
      border-radius: 10px;
      background: var(--bg-main);
    }
    .feature-icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: rgba(74, 222, 128, 0.1);
      color: var(--accent-primary);
    }
    .feature-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .feature-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
    }
    .feature-desc {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .mic-select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: var(--bg-main);
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      cursor: pointer;
    }
    .mic-select:focus {
      border-color: var(--accent-primary);
    }

    .primary-btn {
      width: 100%;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      background: var(--accent-primary);
      color: #1a1a1a;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .primary-btn:hover { opacity: 0.9; }
    .primary-btn.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .secondary-btn {
      padding: 12px 24px;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      background: none;
      color: var(--text-secondary);
      font-size: 14px;
      cursor: pointer;
    }
    .secondary-btn:hover { background: var(--accent-hover); }

    .btn-group {
      display: flex;
      gap: 12px;
    }
    .btn-group .primary-btn { flex: 1; }

    /* Mic test */
    .mic-test {
      margin-bottom: 16px;
      padding: 20px;
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
    .mic-status.active { color: var(--accent-primary); }
    .mic-error { color: #ef4444 !important; font-size: 12px !important; }

    .mic-warning {
      font-size: 12px;
      color: #f59e0b;
      margin-bottom: 16px;
    }

    /* System Audio */
    .system-audio-setup {
      text-align: left;
      margin-bottom: 24px;
    }
    .system-audio-setup .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      margin-bottom: 16px;
    }
    .system-audio-setup .setting-label-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .system-audio-setup .setting-label-group label {
      font-size: 14px;
      color: var(--text-primary);
      font-weight: 500;
    }
    .system-audio-setup .setting-hint {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .system-audio-unsupported {
      text-align: center;
      padding: 24px;
      margin-bottom: 24px;
    }
    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
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
      border-radius: 24px;
      transition: background 0.2s;
    }
    .toggle-slider::before {
      content: '';
      position: absolute;
      height: 18px;
      width: 18px;
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
      transform: translateX(20px);
    }

    /* Install */
    .install-info {
      text-align: left;
      margin-bottom: 24px;
    }
    .install-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      font-size: 14px;
      color: var(--text-primary);
    }
    .install-size {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 12px;
      text-align: center;
    }

    .install-progress {
      margin-bottom: 24px;
      text-align: center;
    }
    .install-step-label {
      font-size: 14px;
      color: var(--text-primary);
      margin-bottom: 16px;
    }
    .progress-bar {
      width: 100%;
      height: 6px;
      background: var(--bg-main);
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-bar.large {
      height: 8px;
      border-radius: 4px;
    }
    .progress-fill {
      height: 100%;
      background: var(--accent-primary);
      border-radius: 4px;
      transition: width 0.3s;
    }
    .install-percent {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 8px;
    }

    .install-done {
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .install-done-text {
      font-size: 16px;
      color: var(--accent-primary);
      font-weight: 500;
    }

    .install-error {
      margin-bottom: 24px;
    }

    .done-badge {
      font-size: 13px;
      color: var(--accent-primary);
      font-weight: 500;
    }

    .error-badge {
      font-size: 13px;
      color: #ef4444;
      font-weight: 500;
    }

    .ready-icon {
      margin: 24px 0 32px;
    }
  `],
})
export class OnboardingComponent implements OnInit, OnDestroy {
  step = 0;
  steps = [0, 1, 2, 3, 4];

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
  private audioCtx: AudioContext | null = null;
  private analyserInterval: ReturnType<typeof setInterval> | null = null;
  private progressCleanup: (() => void) | null = null;

  // Required model IDs — without these, core functionality doesn't work
  private readonly REQUIRED_MODELS = ['silero-vad', 'parakeet-tdt-v3', 'mistral-7b-instruct-q4'];

  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  private get sourdineApi(): SourdineOnboardingApi | undefined {
    return (window as Window & { sourdine?: SourdineOnboardingApi }).sourdine;
  }

  async ngOnInit(): Promise<void> {
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

  nextStep(): void {
    if (this.step === 1) {
      if (this.selectedDeviceId) {
        this.saveConfig('audio.defaultDeviceId', this.selectedDeviceId);
      }
      this.stopMicTest();
    }
    if (this.step === 2) {
      this.stopSystemAudioTest();
    }
    // Block progression from Install step until done
    if (this.step === 3 && this.installState !== 'done') {
      return;
    }
    this.step = Math.min(this.step + 1, this.steps.length - 1);

    if (this.step === 1) {
      this.startMicTest();
    }
  }

  prevStep(): void {
    if (this.step === 1) {
      this.stopMicTest();
    }
    this.step = Math.max(this.step - 1, 0);

    if (this.step === 1) {
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
      const mediaApi = this.sourdineApi?.media;
      if (mediaApi) {
        await mediaApi.requestMicAccess();
      }

      const constraints: MediaStreamConstraints = {
        audio: this.selectedDeviceId
          ? { deviceId: { exact: this.selectedDeviceId } }
          : true,
      };
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);

      this.zone.run(async () => {
        this.micState = 'active';
        this.cdr.markForCheck();

        // Enumerate devices (labels available only after getUserMedia grant)
        await this.enumerateDevices();
        this.cdr.markForCheck();
      });

      this.audioCtx = new AudioContext();
      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      this.analyserInterval = setInterval(() => {
        analyser.getByteFrequencyData(buffer);
        const avg = buffer.reduce((a, b) => a + b, 0) / buffer.length;
        this.zone.run(() => {
          this.audioLevel = Math.min(1, avg / 80);
          if (this.audioLevel > 0.02) {
            this.micSignalDetected = true;
          }
          this.cdr.markForCheck();
        });
      }, 50);
    } catch (err) {
      console.error('[Onboarding] Mic access failed:', err);
      this.zone.run(() => {
        this.micState = 'error';
        this.cdr.markForCheck();
      });
    }
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
    if (this.analyserInterval) {
      clearInterval(this.analyserInterval);
      this.analyserInterval = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => { /* AudioContext close errors are expected */ });
      this.audioCtx = null;
    }
    this.audioLevel = 0;
  }

  // ── System Audio ────────────────────────────────────────────────────

  private async checkSystemAudioSupport(): Promise<void> {
    const api = this.sourdineApi?.systemAudio;
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
    const api = this.sourdineApi?.systemAudio;
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
    const api = this.sourdineApi?.systemAudio;
    if (!api) return;

    if (this.systemAudioEnabled) {
      api.start();
    } else {
      api.stop();
      this.systemAudioLevel = 0;
    }
  }

  stopSystemAudioTest(): void {
    const api = this.sourdineApi?.systemAudio;
    if (api && this.systemAudioEnabled) {
      api.stop();
    }
    this.systemAudioLevel = 0;
  }

  // ── Install ───────────────────────────────────────────────────────

  private readonly INSTALL_LABELS: Record<string, string> = {
    'silero-vad': 'Détection de voix...',
    'parakeet-tdt-v3': 'Transcription multilingue...',
    'mistral-7b-instruct-q4': 'Assistant IA local...',
  };

  private async loadModels(): Promise<void> {
    const api = this.sourdineApi?.model;
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
    const api = this.sourdineApi?.model;
    if (!api) return;

    this.installState = 'downloading';
    const pending = this.REQUIRED_MODELS.filter((id) => this.downloads[id]?.status !== 'done');

    if (pending.length === 0) {
      this.installState = 'done';
      return;
    }

    // Start first pending model
    this.currentInstallLabel = this.INSTALL_LABELS[pending[0]] ?? 'Téléchargement...';
    this.downloads[pending[0]] = { modelId: pending[0], progress: 0, total: 0, status: 'downloading' };
    api.download(pending[0]);
    this.cdr.markForCheck();
  }

  private setupProgressListener(): void {
    const api = this.sourdineApi?.model;
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
          this.currentInstallLabel = this.INSTALL_LABELS[payload.modelId] ?? 'Telechargement...';

          // Calculate overall progress
          this.updateOverallProgress();

          // If this model is done, start next pending
          if (isDone) {
            const pending = this.REQUIRED_MODELS.filter((id) => this.downloads[id]?.status !== 'done');
            if (pending.length === 0) {
              this.installState = 'done';
              // Restart STT worker now that models are available
              this.sourdineApi?.stt?.restart?.();
            } else {
              this.currentInstallLabel = this.INSTALL_LABELS[pending[0]] ?? 'Téléchargement...';
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
    'parakeet-tdt-v3': 640_000_000,
    'mistral-7b-instruct-q4': 4_400_000_000,
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

  // ── Config ────────────────────────────────────────────────────────

  private async saveConfig(key: string, value: string | boolean | number | null): Promise<void> {
    const api = this.sourdineApi?.config;
    if (api) {
      await api.set(key, value);
    }
  }
}
