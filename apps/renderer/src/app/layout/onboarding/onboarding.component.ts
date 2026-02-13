import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
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
          <div
            *ngFor="let s of steps; let i = index"
            class="step-dot"
            [class.active]="step === i"
            [class.completed]="step > i"
          ></div>
        </div>

        <!-- Step 0: Welcome -->
        <div class="step-content" *ngIf="step === 0">
          <img src="assets/logo.svg" alt="Sourdine" class="welcome-logo" />
          <h1>Sourdine</h1>
          <p class="subtitle">Votre assistant de reunion 100% local</p>

          <div class="welcome-features">
            <div class="welcome-feature">
              <div class="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              </div>
              <div class="feature-text">
                <span class="feature-title">Transcription en temps reel</span>
                <span class="feature-desc">Vos reunions transcrites automatiquement, sans connexion internet</span>
              </div>
            </div>
            <div class="welcome-feature">
              <div class="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <div class="feature-text">
                <span class="feature-title">Resumes intelligents</span>
                <span class="feature-desc">Points cles, actions et decisions extraits par une IA locale</span>
              </div>
            </div>
            <div class="welcome-feature">
              <div class="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div class="feature-text">
                <span class="feature-title">100% local, zero cloud</span>
                <span class="feature-desc">Vos donnees restent sur votre machine, rien n'est envoye en ligne</span>
              </div>
            </div>
            <div class="welcome-feature">
              <div class="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.5 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
              </div>
              <div class="feature-text">
                <span class="feature-title">Empreinte ecologique reduite</span>
                <span class="feature-desc">Aucun serveur distant sollicite, tout tourne sur votre machine</span>
              </div>
            </div>
          </div>

          <button class="primary-btn" (click)="nextStep()">Commencer</button>
        </div>

        <!-- Step 1: Microphone -->
        <div class="step-content" *ngIf="step === 1">
          <h1>Microphone</h1>
          <p class="subtitle">Choisissez et testez votre micro</p>

          <div class="field" *ngIf="audioDevices.length > 0">
            <label>Microphone</label>
            <select
              class="mic-select"
              [(ngModel)]="selectedDeviceId"
              (ngModelChange)="onDeviceChange($event)"
            >
              <option *ngFor="let d of audioDevices" [value]="d.deviceId">
                {{ d.label }}
              </option>
            </select>
          </div>

          <div class="mic-test">
            <div class="vu-meter" *ngIf="micState !== 'error'">
              <div class="vu-bar" [style.width.%]="audioLevel * 100"></div>
            </div>
            <p *ngIf="micState === 'idle'" class="mic-status">
              Chargement...
            </p>
            <p *ngIf="micState === 'requesting'" class="mic-status">
              Demande d'acces au micro...
            </p>
            <p *ngIf="micState === 'active'" class="mic-status" [class.active]="audioLevel > 0.02">
              {{ audioLevel > 0.02 ? 'Signal detecte !' : 'Parlez pour tester...' }}
            </p>
            <p *ngIf="micState === 'error'" class="mic-status mic-error">
              Acces au micro refuse. Verifiez Preferences Systeme &gt; Confidentialite &gt; Microphone.
            </p>
          </div>

          <p *ngIf="micState === 'active' && !micSignalDetected" class="mic-warning">
            Aucun signal detecte. Vous pouvez continuer, mais verifiez votre micro avant d'enregistrer.
          </p>

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

        <!-- Step 2: Install -->
        <div class="step-content" *ngIf="step === 2">
          <h1>Installation</h1>
          <p class="subtitle">Sourdine a besoin de telecharger quelques composants pour fonctionner</p>

          <!-- Before install -->
          <div *ngIf="installState === 'idle'" class="install-info">
            <div class="install-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              <span>Detection de voix</span>
            </div>
            <div class="install-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>Transcription multilingue</span>
            </div>
            <div class="install-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Assistant IA local (resumes, chat)</span>
            </div>
            <p class="install-size">Environ 5 Go au total</p>
          </div>

          <!-- During install -->
          <div *ngIf="installState === 'downloading'" class="install-progress">
            <p class="install-step-label">{{ currentInstallLabel }}</p>
            <div class="progress-bar large">
              <div class="progress-fill" [style.width.%]="overallProgress"></div>
            </div>
            <p class="install-percent">{{ overallProgress | number:'1.0-0' }}%</p>
          </div>

          <!-- Done -->
          <div *ngIf="installState === 'done'" class="install-done">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p class="install-done-text">Installation terminee</p>
          </div>

          <!-- Error -->
          <div *ngIf="installState === 'error'" class="install-error">
            <p class="mic-error">Une erreur est survenue. Verifiez votre connexion et reessayez.</p>
          </div>

          <div class="btn-group">
            <button class="secondary-btn" (click)="prevStep()">Retour</button>
            <button
              *ngIf="installState === 'idle' || installState === 'error'"
              class="primary-btn"
              (click)="startInstall()"
            >Installer</button>
            <button
              *ngIf="installState === 'done'"
              class="primary-btn"
              (click)="nextStep()"
            >Continuer</button>
            <div *ngIf="installState === 'downloading'" class="primary-btn disabled" style="text-align:center">
              Installation en cours...
            </div>
          </div>
        </div>

        <!-- Step 3: Ready -->
        <div class="step-content" *ngIf="step === 3">
          <h1>Pret !</h1>
          <p class="subtitle">Sourdine est configure. Commencez votre premiere session.</p>

          <div class="ready-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>

          <button class="primary-btn" (click)="finish()">Commencer</button>
        </div>
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
      background: var(--bg-primary);
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
      background: var(--bg-primary);
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
      background: rgba(99, 102, 241, 0.1);
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
      background: var(--bg-primary);
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
      background: var(--bg-primary);
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
      background: var(--bg-primary);
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
      background: var(--bg-primary);
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
  steps = [0, 1, 2, 3];

  // Mic
  audioLevel = 0;
  micState: 'idle' | 'requesting' | 'active' | 'error' = 'idle';
  micSignalDetected = false;
  audioDevices: AudioDevice[] = [];
  selectedDeviceId = '';

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

  constructor(private router: Router, private zone: NgZone, private cdr: ChangeDetectorRef) {}

  async ngOnInit(): Promise<void> {
    await this.loadModels();
    this.setupProgressListener();
  }

  ngOnDestroy(): void {
    this.stopMicTest();
    this.progressCleanup?.();
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
    if (this.step === 2 && this.installState !== 'done') {
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
      const mediaApi = (window as any).sourdine?.media;
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
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.audioLevel = 0;
  }

  // ── Install ───────────────────────────────────────────────────────

  private readonly INSTALL_LABELS: Record<string, string> = {
    'silero-vad': 'Detection de voix...',
    'parakeet-tdt-v3': 'Transcription multilingue...',
    'mistral-7b-instruct-q4': 'Assistant IA local...',
  };

  private async loadModels(): Promise<void> {
    const api = (window as any).sourdine?.model;
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
    const api = (window as any).sourdine?.model;
    if (!api) return;

    this.installState = 'downloading';
    const pending = this.REQUIRED_MODELS.filter((id) => this.downloads[id]?.status !== 'done');

    if (pending.length === 0) {
      this.installState = 'done';
      return;
    }

    // Start first pending model
    this.currentInstallLabel = this.INSTALL_LABELS[pending[0]] ?? 'Telechargement...';
    this.downloads[pending[0]] = { modelId: pending[0], progress: 0, total: 0, status: 'downloading' };
    api.download(pending[0]);
    this.cdr.markForCheck();
  }

  private setupProgressListener(): void {
    const api = (window as any).sourdine?.model;
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
              (window as any).sourdine?.stt?.restart?.();
            } else {
              this.currentInstallLabel = this.INSTALL_LABELS[pending[0]] ?? 'Telechargement...';
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

  private async saveConfig(key: string, value: any): Promise<void> {
    const api = (window as any).sourdine?.config;
    if (api) {
      await api.set(key, value);
    }
  }
}
