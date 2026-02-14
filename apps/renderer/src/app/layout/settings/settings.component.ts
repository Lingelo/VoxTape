import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

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
        <h1>Parametres</h1>
      </div>

      <div class="settings-body" *ngIf="config">
        <!-- General -->
        <section class="settings-section">
          <h2>General</h2>

          <div class="setting-row">
            <label>Theme</label>
            <div class="theme-toggle">
              <button
                *ngFor="let t of themes"
                [class.active]="config.theme === t.value"
                (click)="setTheme(t.value)"
              >
                {{ t.label }}
              </button>
            </div>
          </div>
        </section>

        <!-- Audio -->
        <section class="settings-section">
          <h2>Audio</h2>
          <div class="setting-row">
            <label>Microphone par defaut</label>
            <select [(ngModel)]="config.audio.defaultDeviceId" (change)="save('audio.defaultDeviceId', config.audio.defaultDeviceId)">
              <option [ngValue]="null">Defaut du systeme</option>
              <option *ngFor="let mic of microphones" [ngValue]="mic.deviceId">{{ mic.label }}</option>
            </select>
          </div>
          <div class="setting-row" *ngIf="systemAudioSupported">
            <div class="setting-label-group">
              <label>Capturer l'audio systeme</label>
              <span class="setting-hint">Transcrit l'audio des applications (reunions, videos...)</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" [(ngModel)]="systemAudioEnabled" (change)="save('audio.systemAudioEnabled', systemAudioEnabled)" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-row unsupported-hint" *ngIf="!systemAudioSupported">
            <span class="setting-hint">Capture audio systeme : necessite macOS 14.2+</span>
          </div>
        </section>

        <!-- Models -->
        <section class="settings-section">
          <h2>Modèles</h2>

          <div class="model-list">
            <div *ngFor="let m of knownModels">
              <div class="model-row">
                <div class="model-info">
                  <span class="model-name">{{ m.name }}</span>
                  <span class="model-meta">{{ m.size }} · {{ m.description }}</span>
                </div>
                <div class="model-status">
                  <span *ngIf="isModelDownloaded(m.id)" class="status-badge installed">Installé</span>
                  <span *ngIf="!isModelDownloaded(m.id) && !isModelDownloading(m.id)" class="status-badge missing">Manquant</span>
                  <span *ngIf="isModelDownloading(m.id)" class="status-badge downloading">{{ getDownloadPercent(m.id) }}%</span>
                  <button
                    *ngIf="!isModelDownloaded(m.id) && !isModelDownloading(m.id)"
                    class="model-action-btn"
                    (click)="downloadModel(m.id)"
                  >Télécharger</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- About -->
        <section class="settings-section">
          <h2>A propos</h2>
          <p class="about-text">Sourdine — Notes de reunion intelligentes</p>
          <p class="about-text">100% local, zero cloud</p>
        </section>

        <!-- Reset -->
        <section class="settings-section">
          <button class="reset-btn" (click)="resetApp()">Reinitialiser l'application</button>
          <p class="about-text">Remet la configuration par defaut et relance l'assistant de configuration.</p>
        </section>
      </div>
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
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 32px;
      padding-top: 32px;
    }

    .settings-header h1 {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .back-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 6px 8px;
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
      border-radius: 6px;
      color: var(--text-primary);
      padding: 6px 12px;
      font-size: 13px;
      outline: none;
    }

    .theme-toggle {
      display: flex;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      overflow: hidden;
    }
    .theme-toggle button {
      padding: 6px 16px;
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
      background: rgba(99, 102, 241, 0.1);
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
      border-radius: 6px;
      background: none;
      color: var(--accent-primary);
      font-size: 12px;
      cursor: pointer;
    }
    .model-action-btn:hover {
      background: rgba(99, 102, 241, 0.1);
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
      padding: 8px 20px;
      border: 1px solid #ef4444;
      border-radius: 6px;
      background: none;
      color: #ef4444;
      font-size: 13px;
      cursor: pointer;
      margin-bottom: 8px;
    }
    .reset-btn:hover {
      background: rgba(239, 68, 68, 0.1);
    }
  `],
})
export class SettingsComponent implements OnInit {
  config: Config | null = null;
  microphones: MediaDeviceInfo[] = [];
  knownModels: { id: string; name: string; type: string; size: string; description: string }[] = [];
  downloadedModelIds: Set<string> = new Set();
  downloadProgress: Record<string, number> = {};
  systemAudioSupported = false;
  systemAudioEnabled = false;
  private progressCleanup: (() => void) | null = null;

  themes = [
    { value: 'dark' as const, label: 'Sombre' },
    { value: 'light' as const, label: 'Clair' },
    { value: 'system' as const, label: 'Systeme' },
  ];

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  async ngOnInit(): Promise<void> {
    const api = (window as any).sourdine?.config;
    if (api) {
      const cfg = await api.get();
      this.ngZone.run(() => {
        this.config = cfg;
        this.applyTheme(this.config!.theme);
        this.cdr.markForCheck();
      });
    }
    this.loadMicrophones();
    this.loadModels();
    this.setupProgressListener();
    this.checkSystemAudio();
  }

  private async checkSystemAudio(): Promise<void> {
    const api = (window as any).sourdine?.systemAudio;
    if (!api) return;
    try {
      this.systemAudioSupported = await api.isSupported();
    } catch {
      this.systemAudioSupported = false;
    }
    // Read persisted preference
    if (this.config) {
      this.systemAudioEnabled = (this.config as any).audio?.systemAudioEnabled ?? false;
    }
    this.cdr.markForCheck();
  }

  private async loadModels(): Promise<void> {
    const api = (window as any).sourdine?.model;
    if (!api) return;
    const result = await api.list();
    this.ngZone.run(() => {
      this.knownModels = result.known;
      this.downloadedModelIds = new Set(result.downloaded.map((d: any) => d.id));
      this.cdr.markForCheck();
    });
  }

  private setupProgressListener(): void {
    const api = (window as any).sourdine?.model;
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
    const api = (window as any).sourdine?.model;
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
    const api = (window as any).sourdine?.config;
    if (api) {
      await api.reset();
      this.router.navigate(['/onboarding']);
    }
  }

  async save(key: string, value: any): Promise<void> {
    const api = (window as any).sourdine?.config;
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
}
