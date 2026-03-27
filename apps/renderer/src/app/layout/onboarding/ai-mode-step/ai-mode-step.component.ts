import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ApiKeyInputComponent } from '../../settings/api-key-input/api-key-input.component';
import type { LlmProviderId, SttProviderId } from '@voxtape/shared-types';

interface CredentialsApi {
  set: (provider: string, key: string) => Promise<{ ok: boolean }>;
  has: (provider: string) => Promise<boolean>;
  delete: (provider: string) => Promise<{ ok: boolean }>;
  validate: (provider: string, key: string) => Promise<{ ok: boolean; error?: string }>;
}

export interface AiModeResult {
  mode: 'local' | 'cloud';
  llmProvider: LlmProviderId;
  sttProvider: SttProviderId;
}

@Component({
  selector: 'app-ai-mode-step',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, ApiKeyInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-mode-step.component.html',
  styleUrl: './ai-mode-step.component.scss',
})
export class AiModeStepComponent {
  @Input() credentialsApi: CredentialsApi | undefined;
  @Output() canProceedChange = new EventEmitter<boolean>();

  aiMode: 'local' | 'cloud' = 'local';
  llmProvider: LlmProviderId = 'openai';
  sttProvider: SttProviderId = 'local';
  private llmKeyValid = false;

  constructor(private cdr: ChangeDetectorRef) {}

  get result(): AiModeResult {
    return {
      mode: this.aiMode,
      llmProvider: this.llmProvider,
      sttProvider: this.sttProvider,
    };
  }

  selectMode(mode: 'local' | 'cloud'): void {
    this.aiMode = mode;
    this.emitCanProceed();
    this.cdr.markForCheck();
  }

  onLlmKeyStatus(status: string): void {
    this.llmKeyValid = status === 'stored' || status === 'valid';
    this.emitCanProceed();
    this.cdr.markForCheck();
  }

  private emitCanProceed(): void {
    const canProceed = this.aiMode === 'local' || this.llmKeyValid;
    this.canProceedChange.emit(canProceed);
  }
}
