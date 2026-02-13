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

export const AiBlock = Node.create({
  name: 'aiBlock',

  group: 'block',

  content: 'inline*',

  defining: true,

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
      title: 'Voir dans la transcription',
    }, '\u{1F50D}']];
  },

  addKeyboardShortcuts() {
    return {
      // When user types in an AI block, mark it as user-edited
      'Mod-a': () => false,
    };
  },
});

/** Type label mapping for display */
export const AI_BLOCK_LABELS: Record<string, string> = {
  summary: 'Résumé',
  decision: 'Décision',
  'action-item': 'Action',
  'key-point': 'Point clé',
};
