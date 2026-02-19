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
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LlmService } from '../../services/llm.service';
import { SessionService } from '../../services/session.service';
import { RECIPES, Recipe } from '../../services/recipes';
import { GlitchLoaderComponent } from '../../shared/glitch-loader/glitch-loader.component';
import type { ChatMessage } from '@voxtape/shared-types';

interface ChatMessageWithHtml extends ChatMessage {
  html?: string;
}

@Component({
  selector: 'sdn-chat-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, GlitchLoaderComponent],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss',
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
  private pendingCommandDisplay = '';  // Command to display instead of full prompt (e.g., "/resume")

  private readonly llm = inject(LlmService);
  private readonly session = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly translate = inject(TranslateService);
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
        if (recipe) {
          this.pendingCommandDisplay = recipe.command;
          this.input = recipe.prompt;
        } else {
          this.input = this.initialPrompt;
        }
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

  onWheel(event: WheelEvent): void {
    if (this.messagesEl) {
      const el = this.messagesEl.nativeElement;
      el.scrollTop += event.deltaY;
    }
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
    this.pendingCommandDisplay = recipe.command;
    this.input = recipe.prompt;
    this.showRecipes = false;
    this.cdr.markForCheck();
    this.onSend();
  }

  onSend(): void {
    const question = this.input.trim();
    if (!question || this.isGenerating) return;

    // Display command (e.g., "/resume") instead of full prompt if this was a slash command
    const displayText = this.pendingCommandDisplay || question;
    this.session.addChatMessage({ role: 'user', content: displayText });
    this.pendingCommandDisplay = '';
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
          const errorLabel = this.translate.instant('chat.error');
          this.session.addChatMessage({ role: 'assistant', content: `${errorLabel}: ${payload.error}` });
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
