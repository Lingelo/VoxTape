import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { SessionService } from '../../services/session.service';
import { AiBlock } from './ai-block.extension';
import type { EnhancedNote } from '@sourdine/shared-types';

@Component({
  selector: 'sdn-note-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="editor-container">
      <input
        class="title-input"
        type="text"
        [value]="title"
        (input)="onTitleChange($event)"
        placeholder="Titre de la session..."
      />

      <!-- AI Summary (top, main content after recording) -->
      <div class="ai-summary" *ngIf="aiSummary">
        <div class="ai-summary-body" [innerHTML]="renderedSummary"></div>
      </div>

      <!-- Tiptap editor (hidden when AI summary exists) -->
      <div
        class="tiptap-editor"
        #editorEl
        [class.hidden]="!!aiSummary"
      ></div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .editor-container {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      padding: 24px 32px;
    }

    .title-input {
      font-size: 24px;
      font-weight: 600;
      background: none;
      border: none;
      color: var(--text-primary);
      outline: none;
      padding: 0;
      margin-bottom: 24px;
      font-family: var(--font-editor);
    }
    .title-input::placeholder {
      color: var(--text-secondary);
      opacity: 0.5;
    }

    .tiptap-editor {
      flex: 1;
      min-height: 200px;
    }

    /* Tiptap ProseMirror styles */
    :host ::ng-deep .tiptap {
      outline: none;
      font-size: 16px;
      line-height: 1.6;
      font-family: var(--font-editor);
      color: var(--text-primary);
      min-height: 200px;
    }

    :host ::ng-deep .tiptap p {
      margin: 0 0 4px 0;
    }

    :host ::ng-deep .tiptap p.is-editor-empty:first-child::before {
      content: attr(data-placeholder);
      float: left;
      color: var(--text-secondary);
      opacity: 0.5;
      pointer-events: none;
      height: 0;
    }

    :host ::ng-deep .tiptap ul, :host ::ng-deep .tiptap ol {
      padding-left: 24px;
      margin: 4px 0;
    }

    /* AI Block styles */
    :host ::ng-deep .ai-block {
      position: relative;
      padding: 10px 40px 10px 14px;
      margin: 8px 0;
      border-radius: 8px;
      border-left: 3px solid var(--accent-primary);
      background: var(--bg-surface);
    }

    :host ::ng-deep .ai-block .ai-block-content {
      color: var(--text-ai);
      font-size: 14px;
      line-height: 1.5;
    }

    :host ::ng-deep .ai-block--edited .ai-block-content {
      color: var(--text-primary);
    }

    :host ::ng-deep .ai-block--summary {
      border-left-color: var(--accent-primary);
    }
    :host ::ng-deep .ai-block--decision {
      border-left-color: #f59e0b;
    }
    :host ::ng-deep .ai-block--action-item {
      border-left-color: #3b82f6;
    }
    :host ::ng-deep .ai-block--key-point {
      border-left-color: #8b5cf6;
    }

    :host ::ng-deep .ai-block-loupe {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      opacity: 0.4;
      transition: opacity 0.15s;
      padding: 4px;
    }
    :host ::ng-deep .ai-block-loupe:hover {
      opacity: 1;
    }

    .ai-summary {
      margin-bottom: 20px;
      padding: 16px 20px;
      background: var(--bg-surface);
      border-radius: 10px;
      border: 1px solid var(--border-subtle);
    }

    :host ::ng-deep .ai-summary-body h2 {
      font-size: 15px;
      font-weight: 600;
      color: var(--accent-primary);
      margin: 14px 0 6px 0;
    }
    :host ::ng-deep .ai-summary-body h2:first-child {
      margin-top: 0;
    }
    :host ::ng-deep .ai-summary-body p {
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-primary);
      margin: 0 0 4px 0;
    }
    :host ::ng-deep .ai-summary-body ul {
      padding-left: 20px;
      margin: 4px 0;
    }
    :host ::ng-deep .ai-summary-body li {
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .tiptap-editor.hidden {
      display: none;
    }

  `],
})
export class NoteEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editorEl') editorElRef!: ElementRef<HTMLDivElement>;
  @Output() loupeClicked = new EventEmitter<string[]>();

  title = '';
  aiSummary = '';
  renderedSummary = '';
  private editor: Editor | null = null;
  private subs: Subscription[] = [];
  private updatingFromExternal = false;

  constructor(private session: SessionService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.subs.push(
      this.session.title$.subscribe((t) => (this.title = t)),
      this.session.aiSummary$.subscribe((summary) => {
        setTimeout(() => {
          // Strip separators and "Mes notes" section from LLM output
          let cleaned = (summary || '')
            .replace(/---+\s*\n/g, '\n')
            .replace(/#{1,3}\s*Mes notes\s*:?[\s\S]*$/i, '')
            .trim();
          this.aiSummary = cleaned;
          this.renderedSummary = this.markdownToHtml(cleaned);
          this.cdr.markForCheck();
        });
      })
    );
  }

  ngAfterViewInit(): void {
    this.editor = new Editor({
      element: this.editorElRef.nativeElement,
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: 'Prenez vos notes ici pendant l\'enregistrement...',
        }),
        AiBlock,
      ],
      content: '',
      onUpdate: ({ editor }) => {
        if (this.updatingFromExternal) return;
        // Extract text content for session service (excludes AI blocks markup)
        const text = editor.getText();
        this.session.updateNotes(text);
      },
    });

    // Sync content from session (handles session switching)
    this.subs.push(
      this.session.userNotes$.subscribe((notes) => {
        if (!this.editor) return;
        const currentText = this.editor.getText();
        if (currentText === notes) return;
        this.updatingFromExternal = true;
        if (notes) {
          this.editor.commands.setContent(`<p>${this.escapeHtml(notes)}</p>`);
        } else {
          this.editor.commands.clearContent();
        }
        this.updatingFromExternal = false;
      })
    );

    // Listen for AI notes to insert
    this.subs.push(
      this.session.aiNotes$.subscribe((aiNotes) => {
        if (!this.editor || aiNotes.length === 0) return;
        this.insertAiBlocks(aiNotes);
      })
    );

    // Handle loupe clicks via event delegation
    this.editorElRef.nativeElement.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('ai-block-loupe')) {
        const block = target.closest('.ai-block');
        if (block) {
          const segmentIds = block.getAttribute('data-segment-ids');
          if (segmentIds) {
            this.loupeClicked.emit(JSON.parse(segmentIds));
          }
        }
      }
    });

    // Mark AI blocks as user-edited when modified
    this.editorElRef.nativeElement.addEventListener('input', (e: Event) => {
      const target = e.target as HTMLElement;
      const block = target.closest?.('.ai-block');
      if (block && !block.classList.contains('ai-block--edited')) {
        block.classList.add('ai-block--edited');
        // Update the ProseMirror node attribute
        const pos = this.editor?.view.posAtDOM(block, 0);
        if (pos !== undefined && this.editor) {
          const node = this.editor.view.state.doc.nodeAt(pos);
          if (node?.type.name === 'aiBlock') {
            this.editor.chain()
              .setNodeSelection(pos)
              .updateAttributes('aiBlock', { source: 'user' })
              .run();
          }
        }
      }
    });
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.editor?.destroy();
  }

  onTitleChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.session.updateTitle(value);
  }

  private insertAiBlocks(aiNotes: EnhancedNote[]): void {
    if (!this.editor) return;

    this.updatingFromExternal = true;

    // Remove existing AI blocks first
    const { state } = this.editor;
    const tr = state.tr;
    const nodesToRemove: { from: number; to: number }[] = [];

    state.doc.descendants((node, pos) => {
      if (node.type.name === 'aiBlock') {
        nodesToRemove.push({ from: pos, to: pos + node.nodeSize });
      }
    });

    // Remove in reverse order to preserve positions
    for (let i = nodesToRemove.length - 1; i >= 0; i--) {
      tr.delete(nodesToRemove[i].from, nodesToRemove[i].to);
    }
    this.editor.view.dispatch(tr);

    // Insert new AI blocks at the end
    this.editor.chain().focus('end').run();

    for (const note of aiNotes) {
      this.editor
        .chain()
        .focus('end')
        .insertContent({
          type: 'aiBlock',
          attrs: {
            type: note.type,
            segmentIds: note.segmentIds,
            source: 'ai',
          },
          content: [{ type: 'text', text: note.text }],
        })
        .run();
    }

    this.updatingFromExternal = false;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Basic markdown → HTML (headings, lists, bold, italic, paragraphs) */
  private markdownToHtml(md: string): string {
    if (!md) return '';
    return md
      .split('\n')
      .map((line) => {
        // Skip lines that look like "Titre: xxx" (extracted separately)
        if (line.match(/^Titre\s*:/i)) return '';
        // Headings (### ## #)
        if (line.startsWith('### ')) return `<h2>${line.slice(4)}</h2>`;
        if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
        if (line.startsWith('# ')) return `<h2>${line.slice(2)}</h2>`;
        // List items
        if (line.startsWith('- ')) return `<li>${this.inlineFormat(line.slice(2))}</li>`;
        if (line.match(/^\* /)) return `<li>${this.inlineFormat(line.slice(2))}</li>`;
        // Empty line
        if (line.trim() === '') return '';
        // Paragraph
        return `<p>${this.inlineFormat(line)}</p>`;
      })
      .join('\n')
      // Wrap consecutive <li> in <ul>
      .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  }

  private inlineFormat(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }
}
