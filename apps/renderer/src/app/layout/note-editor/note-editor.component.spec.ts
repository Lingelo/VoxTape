import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';

describe('NoteEditorComponent utilities', () => {
  describe('word count', () => {
    const countWords = (text: string): number => {
      if (!text || !text.trim()) return 0;
      return text.trim().split(/\s+/).filter(Boolean).length;
    };

    it('should count words in text', () => {
      expect(countWords('Hello world')).toBe(2);
      expect(countWords('One two three four')).toBe(4);
    });

    it('should return 0 for empty text', () => {
      expect(countWords('')).toBe(0);
      expect(countWords('   ')).toBe(0);
    });

    it('should handle multiple spaces', () => {
      expect(countWords('Hello    world')).toBe(2);
    });

    it('should handle newlines', () => {
      expect(countWords('Hello\nworld')).toBe(2);
      expect(countWords('Line one\n\nLine two')).toBe(4);
    });
  });

  describe('character count', () => {
    const countCharacters = (text: string): number => {
      return text?.length || 0;
    };

    it('should count characters', () => {
      expect(countCharacters('Hello')).toBe(5);
      expect(countCharacters('Hello world')).toBe(11);
    });

    it('should return 0 for empty/null', () => {
      expect(countCharacters('')).toBe(0);
      expect(countCharacters(null as unknown as string)).toBe(0);
    });

    it('should include whitespace', () => {
      expect(countCharacters('  test  ')).toBe(8);
    });
  });
});

describe('NoteEditorComponent state', () => {
  describe('content updates', () => {
    it('should track content changes', () => {
      const content$ = new BehaviorSubject<string>('');
      const updateContent = vi.fn();

      content$.subscribe((text) => {
        updateContent(text);
      });

      content$.next('Hello');
      expect(updateContent).toHaveBeenCalledWith('Hello');

      content$.next('Hello World');
      expect(updateContent).toHaveBeenCalledWith('Hello World');
    });
  });

  describe('AI summary', () => {
    it('should display AI summary when available', () => {
      const aiSummary$ = new BehaviorSubject<string>('');
      let hasSummary = false;

      aiSummary$.subscribe((summary) => {
        hasSummary = !!summary.trim();
      });

      expect(hasSummary).toBe(false);

      aiSummary$.next('Summary: This is a meeting about...');
      expect(hasSummary).toBe(true);
    });

    it('should hide summary when empty', () => {
      const aiSummary$ = new BehaviorSubject<string>('Initial summary');
      let hasSummary = true;

      aiSummary$.subscribe((summary) => {
        hasSummary = !!summary.trim();
      });

      aiSummary$.next('');
      expect(hasSummary).toBe(false);
    });
  });

  describe('title', () => {
    it('should track title changes', () => {
      const title$ = new BehaviorSubject<string>('Untitled');

      title$.next('Meeting Notes - Q1 Review');
      expect(title$.value).toBe('Meeting Notes - Q1 Review');
    });

    it('should have default title', () => {
      const title$ = new BehaviorSubject<string>('Nouvelle session');
      expect(title$.value).toBe('Nouvelle session');
    });
  });
});

describe('NoteEditorComponent actions', () => {
  describe('copy to clipboard', () => {
    it('should format content for clipboard', () => {
      const formatForClipboard = (title: string, content: string, summary?: string): string => {
        let text = `# ${title}\n\n`;
        if (summary) {
          text += `## Summary\n${summary}\n\n`;
        }
        if (content) {
          text += `## Notes\n${content}`;
        }
        return text;
      };

      const result = formatForClipboard('Meeting', 'My notes', 'AI summary');
      expect(result).toContain('# Meeting');
      expect(result).toContain('## Summary');
      expect(result).toContain('AI summary');
      expect(result).toContain('## Notes');
      expect(result).toContain('My notes');
    });

    it('should format without summary', () => {
      const formatForClipboard = (title: string, content: string, summary?: string): string => {
        let text = `# ${title}\n\n`;
        if (summary) {
          text += `## Summary\n${summary}\n\n`;
        }
        if (content) {
          text += `## Notes\n${content}`;
        }
        return text;
      };

      const result = formatForClipboard('Meeting', 'My notes');
      expect(result).not.toContain('## Summary');
    });
  });

  describe('generate notes', () => {
    it('should be disabled during processing', () => {
      type Status = 'idle' | 'recording' | 'processing' | 'done';
      const canGenerateNotes = (status: Status, segmentsCount: number): boolean => {
        return status === 'done' && segmentsCount > 0;
      };

      expect(canGenerateNotes('processing', 10)).toBe(false);
      expect(canGenerateNotes('recording', 10)).toBe(false);
      expect(canGenerateNotes('idle', 10)).toBe(false);
    });

    it('should be disabled with no segments', () => {
      type Status = 'idle' | 'recording' | 'processing' | 'done';
      const canGenerateNotes = (status: Status, segmentsCount: number): boolean => {
        return status === 'done' && segmentsCount > 0;
      };

      expect(canGenerateNotes('done', 0)).toBe(false);
    });

    it('should be enabled when done with segments', () => {
      type Status = 'idle' | 'recording' | 'processing' | 'done';
      const canGenerateNotes = (status: Status, segmentsCount: number): boolean => {
        return status === 'done' && segmentsCount > 0;
      };

      expect(canGenerateNotes('done', 5)).toBe(true);
    });
  });
});

describe('NoteEditorComponent markdown rendering', () => {
  describe('basic markdown detection', () => {
    it('should detect headings', () => {
      const hasHeadings = (text: string): boolean => {
        return /^#{1,6}\s+.+$/m.test(text);
      };

      expect(hasHeadings('# Heading')).toBe(true);
      expect(hasHeadings('## Second level')).toBe(true);
      expect(hasHeadings('Normal text')).toBe(false);
    });

    it('should detect bullet lists', () => {
      const hasBulletList = (text: string): boolean => {
        return /^[-*]\s+.+$/m.test(text);
      };

      expect(hasBulletList('- Item 1')).toBe(true);
      expect(hasBulletList('* Item 1')).toBe(true);
      expect(hasBulletList('Normal text')).toBe(false);
    });

    it('should detect bold text', () => {
      const hasBold = (text: string): boolean => {
        return /\*\*.+\*\*/.test(text) || /__.+__/.test(text);
      };

      expect(hasBold('**bold**')).toBe(true);
      expect(hasBold('__bold__')).toBe(true);
      expect(hasBold('normal')).toBe(false);
    });
  });
});

describe('NoteEditorComponent focus management', () => {
  describe('editor focus', () => {
    it('should track focus state', () => {
      let isFocused = false;

      const onFocus = () => {
        isFocused = true;
      };

      const onBlur = () => {
        isFocused = false;
      };

      onFocus();
      expect(isFocused).toBe(true);

      onBlur();
      expect(isFocused).toBe(false);
    });
  });
});
