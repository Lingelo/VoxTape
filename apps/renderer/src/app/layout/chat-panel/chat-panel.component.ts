import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { LlmService } from '../../services/llm.service';
import { SessionService } from '../../services/session.service';
import { RECIPES, Recipe } from '../../services/recipes';
import type { ChatMessage } from '@sourdine/shared-types';

interface ChatMessageWithHtml extends ChatMessage {
  html?: string;
}

@Component({
  selector: 'sdn-chat-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="chat-expand">
      <!-- Messages area -->
      <div class="chat-messages" #messagesContainer>
        @if (messages.length === 0 && !isGenerating) {
          <div class="chat-empty">
            <p>Posez une question sur cette reunion.</p>
          </div>
        }

        @for (msg of messages; track $index) {
          <div class="chat-msg" [class]="msg.role">
            <div class="msg-bubble" [innerHTML]="msg.html || msg.content"></div>
          </div>
        }

        @if (isGenerating) {
          <div class="chat-msg assistant">
            <div class="msg-bubble typing">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          </div>
        }
      </div>

      <!-- Recipes dropdown -->
      @if (showRecipes) {
        <div class="recipes-dropdown">
          @for (r of filteredRecipes; track r.command; let i = $index) {
            <div
              class="recipe-item"
              tabindex="0"
              role="option"
              [attr.aria-selected]="i === recipeIndex"
              [class.active]="i === recipeIndex"
              (click)="selectRecipe(r)"
              (keydown.enter)="selectRecipe(r)"
              (mouseenter)="recipeIndex = i"
            >
              <span class="recipe-cmd">{{ r.command }}</span>
              <span class="recipe-label">{{ r.label }}</span>
            </div>
          }
        </div>
      }

      <!-- Input bar (continuation of the main-pill) -->
      <div class="chat-input-bar">
        <input
          class="chat-input"
          type="text"
          [(ngModel)]="input"
          (input)="onInputChange()"
          (keydown.enter)="onEnter($event)"
          (keydown.escape)="onEscape()"
          (keydown.arrowDown)="onArrowDown($event)"
          (keydown.arrowUp)="onArrowUp($event)"
          placeholder="Posez une question... (/ pour les commandes)"
          [disabled]="isGenerating"
          #chatInputEl
        />
        <button
          class="send-btn"
          (click)="onSend()"
          [disabled]="!input.trim() || isGenerating"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .chat-expand {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: expandUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      transform-origin: bottom center;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 80px;
      max-height: 50vh;
    }

    .chat-msg {
      width: 100%;
    }
    .chat-msg.user { display: flex; justify-content: flex-end; }
    .chat-msg.assistant { display: flex; justify-content: flex-start; }

    .msg-bubble {
      max-width: 90%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.6;
    }
    .chat-msg.user .msg-bubble {
      background: var(--bg-surface);
      color: var(--text-primary);
      border-bottom-right-radius: 4px;
    }
    .chat-msg.assistant .msg-bubble {
      background: transparent;
      color: var(--text-primary);
      padding-left: 4px;
    }

    .msg-bubble.typing {
      display: flex;
      gap: 4px;
      padding: 12px 16px;
    }
    .msg-bubble.typing .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-primary);
      animation: pulse 1.4s ease-in-out infinite;
    }
    .msg-bubble.typing .dot:nth-child(2) { animation-delay: 0.2s; }
    .msg-bubble.typing .dot:nth-child(3) { animation-delay: 0.4s; }

    .chat-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--text-secondary);
      font-size: 13px;
    }

    :host ::ng-deep .msg-bubble p { margin: 0 0 4px 0; }
    :host ::ng-deep .msg-bubble h3 {
      font-size: 14px;
      font-weight: 600;
      margin: 8px 0 4px 0;
    }
    :host ::ng-deep .msg-bubble ul { padding-left: 20px; margin: 4px 0; }
    :host ::ng-deep .msg-bubble li { margin-bottom: 2px; }

    /* ── Recipes dropdown ── */
    .recipes-dropdown {
      border-top: 1px solid var(--border-subtle);
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .recipe-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .recipe-item:hover, .recipe-item.active {
      background: var(--accent-hover);
    }
    .recipe-cmd {
      font-size: 13px;
      font-weight: 600;
      color: var(--accent-primary);
      min-width: 80px;
    }
    .recipe-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    /* ── Input bar ── */
    .chat-input-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-top: 1px solid var(--border-subtle);
    }
    .chat-input {
      flex: 1;
      background: transparent;
      border: none;
      padding: 6px 8px;
      font-size: 13px;
      color: var(--text-primary);
      outline: none;
    }
    .chat-input::placeholder { color: var(--text-secondary); opacity: 0.5; }
    .chat-input:disabled { opacity: 0.5; }

    .send-btn {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      border: none;
      background: var(--accent-primary);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: opacity 0.15s;
    }
    .send-btn:disabled { opacity: 0.2; cursor: not-allowed; }
    .send-btn:hover:not(:disabled) { opacity: 0.85; }

    @keyframes expandUp {
      from { max-height: 0; opacity: 0; }
      to { max-height: 70vh; opacity: 1; }
    }
    @keyframes pulse {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
      40% { transform: scale(1); opacity: 1; }
    }
  `],
})
export class ChatPanelComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesEl!: ElementRef<HTMLDivElement>;
  @ViewChild('chatInputEl') chatInputEl!: ElementRef<HTMLInputElement>;
  @Input() initialPrompt = '';
  @Output() closePanel = new EventEmitter<void>();

  sessionTitle = '';
  input = '';
  messages: ChatMessageWithHtml[] = [];
  isGenerating = false;
  showRecipes = false;
  filteredRecipes: Recipe[] = [];
  recipeIndex = 0;

  private readonly llm = inject(LlmService);
  private readonly session = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];
  private chatSubs: Subscription[] = [];

  ngOnInit(): void {
    this.subs.push(
      this.session.title$.subscribe((t) => {
        this.sessionTitle = t;
        this.cdr.markForCheck();
      }),
      this.session.chatMessages$.subscribe((msgs) => {
        this.messages = msgs.map((m) => ({
          ...m,
          html: m.role === 'assistant' ? this.markdownToHtml(m.content) : undefined,
        }));
        this.cdr.markForCheck();
        this.scrollToBottom();
      })
    );

    // Focus input on open, or auto-send initial prompt
    setTimeout(() => {
      if (this.initialPrompt) {
        // Resolve slash command to recipe prompt if applicable
        const recipe = RECIPES.find((r) => this.initialPrompt.trim() === r.command);
        this.input = recipe ? recipe.prompt : this.initialPrompt;
        this.initialPrompt = '';
        this.onSend();
      } else {
        this.chatInputEl?.nativeElement?.focus();
      }
    }, 100);
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.chatSubs.forEach((s) => s.unsubscribe());
  }

  onInputChange(): void {
    if (this.input.startsWith('/')) {
      const filter = this.input.slice(1).toLowerCase();
      this.filteredRecipes = RECIPES.filter((r) =>
        r.command.slice(1).startsWith(filter) || r.label.toLowerCase().includes(filter)
      );
      this.showRecipes = this.filteredRecipes.length > 0;
      this.recipeIndex = 0;
    } else {
      this.showRecipes = false;
    }
    this.cdr.markForCheck();
  }

  onEnter(event: Event): void {
    if (this.showRecipes && this.filteredRecipes.length > 0) {
      event.preventDefault();
      this.selectRecipe(this.filteredRecipes[this.recipeIndex]);
    } else {
      this.onSend();
    }
  }

  onEscape(): void {
    if (this.showRecipes) {
      this.showRecipes = false;
      this.cdr.markForCheck();
    } else {
      this.closePanel.emit();
    }
  }

  onArrowDown(event: Event): void {
    if (!this.showRecipes) return;
    event.preventDefault();
    this.recipeIndex = Math.min(this.recipeIndex + 1, this.filteredRecipes.length - 1);
    this.cdr.markForCheck();
  }

  onArrowUp(event: Event): void {
    if (!this.showRecipes) return;
    event.preventDefault();
    this.recipeIndex = Math.max(this.recipeIndex - 1, 0);
    this.cdr.markForCheck();
  }

  selectRecipe(recipe: Recipe): void {
    this.input = recipe.prompt;
    this.showRecipes = false;
    this.cdr.markForCheck();
    this.onSend();
  }

  onSend(): void {
    const question = this.input.trim();
    if (!question || this.isGenerating) return;

    this.session.addChatMessage({ role: 'user', content: question });
    this.input = '';
    this.isGenerating = true;
    this.cdr.markForCheck();
    this.scrollToBottom();

    const context = this.buildContext();

    this.chatSubs.forEach((s) => s.unsubscribe());
    this.chatSubs = [];

    const requestId = this.llm.chat(question, context);

    this.chatSubs.push(
      this.llm.complete$.subscribe((payload) => {
        if (payload.requestId !== requestId) return;
        setTimeout(() => {
          this.session.addChatMessage({ role: 'assistant', content: payload.fullText });
          this.isGenerating = false;
          this.cdr.markForCheck();
          this.scrollToBottom();
        });
      }),
      this.llm.error$.subscribe((payload) => {
        if (payload.requestId !== requestId) return;
        setTimeout(() => {
          this.session.addChatMessage({ role: 'assistant', content: `Erreur : ${payload.error}` });
          this.isGenerating = false;
          this.cdr.markForCheck();
          this.scrollToBottom();
        });
      })
    );
  }

  private buildContext(): string {
    const parts: string[] = [];
    let summary = '';
    let notes = '';
    let transcript = '';

    this.session.aiSummary$.subscribe((s) => (summary = s)).unsubscribe();
    this.session.userNotes$.subscribe((n) => (notes = n)).unsubscribe();
    this.session.segments$.subscribe((segs) => {
      transcript = segs.map((s) => s.text).join('\n');
    }).unsubscribe();

    if (summary) parts.push(`### Résumé de la réunion:\n${summary}`);
    if (notes) parts.push(`### Notes de l'utilisateur:\n${notes}`);
    if (transcript) parts.push(`### Transcription:\n${transcript}`);

    return parts.join('\n\n');
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesEl) {
        const el = this.messagesEl.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }

  private markdownToHtml(md: string): string {
    if (!md) return '';
    return md
      .split('\n')
      .map((line) => {
        if (line.startsWith('## ')) return `<h3>${this.escapeHtml(line.slice(3))}</h3>`;
        if (line.startsWith('# ')) return `<h3>${this.escapeHtml(line.slice(2))}</h3>`;
        if (line.startsWith('- ')) return `<li>${this.inlineFormat(line.slice(2))}</li>`;
        if (line.trim() === '') return '';
        return `<p>${this.inlineFormat(line)}</p>`;
      })
      .join('\n')
      .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  }

  /** Apply inline markdown formatting (bold, italic) with HTML escaping */
  private inlineFormat(text: string): string {
    // Escape HTML first to prevent XSS, then apply markdown formatting
    const escaped = this.escapeHtml(text);
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
