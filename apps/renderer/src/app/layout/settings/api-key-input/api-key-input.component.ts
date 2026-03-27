import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

type KeyStatus = 'stored' | 'none' | 'testing' | 'valid' | 'failed';

interface VoxTapeCredentialsApi {
  set: (provider: string, key: string) => Promise<{ ok: boolean }>;
  has: (provider: string) => Promise<boolean>;
  delete: (provider: string) => Promise<{ ok: boolean }>;
  validate: (provider: string, key: string) => Promise<{ ok: boolean; error?: string }>;
}

@Component({
  selector: 'app-api-key-input',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (status === 'stored' || status === 'valid') {
      <div class="api-key-stored">
        <span class="label-text">{{ 'settings.apiKey' | translate }} — {{ provider }}</span>
        <span class="api-key-stored-actions">
          <span class="api-key-status status-stored">{{ 'settings.keyStored' | translate }}</span>
          <button class="glossary-remove-btn" (click)="deleteKey()" [title]="'settings.deleteKey' | translate">
            &times;
          </button>
        </span>
      </div>
    } @else {
      <div class="api-key-header">
        <span class="label-text">{{ 'settings.apiKey' | translate }} — {{ provider }}</span>
        <span class="api-key-status" [ngClass]="{
          'status-none': status === 'none',
          'status-failed': status === 'failed',
          'status-testing': status === 'testing'
        }">
          @switch (status) {
            @case ('none') { {{ 'settings.noKeyStored' | translate }} }
            @case ('testing') { {{ 'settings.connectionTesting' | translate }} }
            @case ('failed') { {{ 'settings.connectionFailed' | translate }} }
          }
        </span>
      </div>
      <div class="api-key-controls">
        <input
          type="password"
          class="api-key-input"
          [(ngModel)]="keyInput"
          [placeholder]="'settings.apiKeyPlaceholder' | translate"
          (keydown.enter)="testKey()"
        />
        <button
          class="test-mic-btn"
          [disabled]="!keyInput.trim() || status === 'testing'"
          (click)="testKey()"
        >
          {{ 'settings.testConnection' | translate }}
        </button>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
      margin-top: 8px;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.02);
    }

    .api-key-stored {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .api-key-stored-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .api-key-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .api-key-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }

    .api-key-input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.3);
      color: inherit;
      font-size: 12px;
      font-family: monospace;

      &::placeholder {
        color: rgba(255, 255, 255, 0.3);
      }
    }

    .api-key-status {
      font-size: 11px;
      font-weight: 600;

      &.status-stored { color: var(--accent-primary, #4ade80); }
      &.status-none { color: rgba(255, 255, 255, 0.4); }
      &.status-failed { color: #ef4444; }
      &.status-testing { color: #f59e0b; }
    }
  `],
})
export class ApiKeyInputComponent {
  @Input() provider = '';
  @Input() credentialsApi: VoxTapeCredentialsApi | undefined;

  status: KeyStatus = 'none';
  keyInput = '';

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  async ngOnInit(): Promise<void> {
    if (this.credentialsApi) {
      const has = await this.credentialsApi.has(this.provider);
      this.status = has ? 'stored' : 'none';
      this.cdr.markForCheck();
    }
  }

  async ngOnChanges(): Promise<void> {
    if (this.credentialsApi && this.provider) {
      const has = await this.credentialsApi.has(this.provider);
      this.status = has ? 'stored' : 'none';
      this.keyInput = '';
      this.cdr.markForCheck();
    }
  }

  async testKey(): Promise<void> {
    const api = this.credentialsApi;
    const key = this.keyInput?.trim();
    if (!api || !key) return;

    this.status = 'testing';
    this.cdr.markForCheck();

    const result = await api.validate(this.provider, key);
    this.ngZone.run(() => {
      if (result.ok) {
        api.set(this.provider, key);
        this.keyInput = '';
        this.status = 'stored';
      } else {
        this.status = 'failed';
      }
      this.cdr.markForCheck();
    });
  }

  async deleteKey(): Promise<void> {
    const api = this.credentialsApi;
    if (!api) return;

    await api.delete(this.provider);
    this.status = 'none';
    this.cdr.markForCheck();
  }
}
