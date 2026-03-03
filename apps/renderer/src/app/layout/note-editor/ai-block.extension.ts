import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Custom Tiptap node for AI-generated content blocks.
 * Renders with a distinct style (grey text) and a magnifier icon
 * that links back to the source transcript segments.
 */

export interface AiBlockAttributes {
  type: string; // 'decision' | 'action-item' | 'key-point' | 'summary'
  segmentIds: string[];
  source: 'ai' | 'user'; // starts as 'ai', becomes 'user' on edit
}

export interface AiBlockOptions {
  loupeTitle: string;
}

export const AiBlock = Node.create<AiBlockOptions>({
  name: 'aiBlock',

  group: 'block',

  content: 'inline*',

  defining: true,

  addOptions() {
    return {
      loupeTitle: 'View in transcript',
    };
  },

  addAttributes() {
    return {
      type: {
        default: 'key-point',
      },
      segmentIds: {
        default: [],
        parseHTML: (element) => {
          const raw = element.getAttribute('data-segment-ids');
          return raw ? JSON.parse(raw) : [];
        },
        renderHTML: (attributes) => ({
          'data-segment-ids': JSON.stringify(attributes['segmentIds']),
        }),
      },
      source: {
        default: 'ai',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-ai-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = mergeAttributes(HTMLAttributes, {
      'data-ai-block': '',
      class: `ai-block ai-block--${HTMLAttributes['type'] || 'key-point'} ${
        HTMLAttributes['source'] === 'user' ? 'ai-block--edited' : ''
      }`,
    });
    return ['div', attrs, ['span', { class: 'ai-block-content' }, 0], ['button', {
      class: 'ai-block-loupe',
      contenteditable: 'false',
      title: this.options.loupeTitle,
    }, '\u{1F50D}']];
  },

  addKeyboardShortcuts() {
    return {
      // When user types in an AI block, mark it as user-edited
      'Mod-a': () => false,
    };
  },
});

/** Bilingual type label mapping for display */
const AI_BLOCK_LABELS_I18N: Record<string, Record<string, string>> = {
  fr: {
    summary: 'Résumé',
    decision: 'Décision',
    'action-item': 'Action',
    'key-point': 'Point clé',
  },
  en: {
    summary: 'Summary',
    decision: 'Decision',
    'action-item': 'Action',
    'key-point': 'Key point',
  },
};

/** @deprecated Use getAiBlockLabels(lang) instead */
export const AI_BLOCK_LABELS: Record<string, string> = AI_BLOCK_LABELS_I18N['fr'];

export function getAiBlockLabels(lang: string): Record<string, string> {
  return AI_BLOCK_LABELS_I18N[lang] || AI_BLOCK_LABELS_I18N['fr'];
}
