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
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { SessionService } from '../../services/session.service';
import { AiBlock } from './ai-block.extension';
import type { EnhancedNote } from '@voxtape/shared-types';

@Component({
  selector: 'sdn-note-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  templateUrl: './note-editor.component.html',
  styleUrl: './note-editor.component.scss',
})
export class NoteEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editorEl') editorElRef!: ElementRef<HTMLDivElement>;
  @Output() loupeClicked = new EventEmitter<string[]>();

  title = '';
  aiSummary = '';
  renderedSummary = '';
  private readonly session = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly translate = inject(TranslateService);
  private editor: Editor | null = null;
  private subs: Subscription[] = [];
  private updatingFromExternal = false;
  /** Stored event listener references for cleanup */
  private loupeClickHandler: ((e: Event) => void) | null = null;
  private inputHandler: ((e: Event) => void) | null = null;

  ngOnInit(): void {
    this.subs.push(
      this.session.title$.subscribe((t) => (this.title = t)),
      this.session.aiSummary$.subscribe((summary) => {
        setTimeout(() => {
          // Strip separators and "Mes notes" section from LLM output
          const cleaned = (summary || '')
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
          placeholder: this.translate.instant('notes.placeholder'),
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
    this.loupeClickHandler = (e: Event) => {
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
    };
    this.editorElRef.nativeElement.addEventListener('click', this.loupeClickHandler);

    // Mark AI blocks as user-edited when modified
    this.inputHandler = (e: Event) => {
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
    };
    this.editorElRef.nativeElement.addEventListener('input', this.inputHandler);
  }

  ngOnDestroy(): void {
    // Remove event listeners to prevent memory leaks
    if (this.loupeClickHandler) {
      this.editorElRef?.nativeElement?.removeEventListener('click', this.loupeClickHandler);
    }
    if (this.inputHandler) {
      this.editorElRef?.nativeElement?.removeEventListener('input', this.inputHandler);
    }
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
        if (line.startsWith('### ')) return `<h2>${this.escapeHtml(line.slice(4))}</h2>`;
        if (line.startsWith('## ')) return `<h2>${this.escapeHtml(line.slice(3))}</h2>`;
        if (line.startsWith('# ')) return `<h2>${this.escapeHtml(line.slice(2))}</h2>`;
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

  /** Apply inline markdown formatting (bold, italic) with HTML escaping */
  private inlineFormat(text: string): string {
    // Escape HTML first to prevent XSS, then apply markdown formatting
    const escaped = this.escapeHtml(text);
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }
}
