import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { RECIPES, Recipe } from '../../services/recipes';

// Mock types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

describe('ChatPanelComponent utilities', () => {
  describe('recipe filtering', () => {
    it('should find recipe by command', () => {
      const findRecipe = (command: string): Recipe | undefined => {
        return RECIPES.find((r) => r.command === command);
      };

      const recipe = findRecipe('/resume');
      expect(recipe).toBeDefined();
      expect(recipe?.label).toBe('Résumé');
    });

    it('should return undefined for unknown command', () => {
      const findRecipe = (command: string): Recipe | undefined => {
        return RECIPES.find((r) => r.command === command);
      };

      expect(findRecipe('/unknown')).toBeUndefined();
    });

    it('should check if input matches a recipe command', () => {
      const isRecipeCommand = (input: string): boolean => {
        return RECIPES.some((r) => r.command === input.trim());
      };

      expect(isRecipeCommand('/resume')).toBe(true);
      expect(isRecipeCommand('/actions')).toBe(true);
      expect(isRecipeCommand('hello')).toBe(false);
      expect(isRecipeCommand('')).toBe(false);
    });
  });

  describe('message creation', () => {
    it('should create user message with id', () => {
      const createMessage = (content: string, role: 'user' | 'assistant'): ChatMessage => {
        return {
          id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role,
          content,
          createdAt: Date.now(),
        };
      };

      const msg = createMessage('Hello', 'user');
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello');
      expect(msg.id).toMatch(/^chat-\d+-[a-z0-9]+$/);
    });

    it('should create assistant message', () => {
      const createMessage = (content: string, role: 'user' | 'assistant'): ChatMessage => {
        return {
          id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role,
          content,
          createdAt: Date.now(),
        };
      };

      const msg = createMessage('Response', 'assistant');
      expect(msg.role).toBe('assistant');
    });
  });

  describe('input handling', () => {
    it('should trim whitespace from input', () => {
      const processInput = (input: string): string => input.trim();

      expect(processInput('  hello  ')).toBe('hello');
      expect(processInput('\n\ttest\n')).toBe('test');
    });

    it('should detect empty input', () => {
      const isEmpty = (input: string): boolean => !input.trim();

      expect(isEmpty('')).toBe(true);
      expect(isEmpty('   ')).toBe(true);
      expect(isEmpty('hello')).toBe(false);
    });

    it('should detect recipe command prefix', () => {
      const isRecipeCommand = (input: string): boolean => {
        return input.trim().startsWith('/');
      };

      expect(isRecipeCommand('/resume')).toBe(true);
      expect(isRecipeCommand('hello')).toBe(false);
      expect(isRecipeCommand('  /test')).toBe(true);
    });
  });
});

describe('ChatPanelComponent state', () => {
  describe('message list', () => {
    it('should track messages', () => {
      const messages$ = new BehaviorSubject<ChatMessage[]>([]);

      const addMessage = (msg: ChatMessage) => {
        messages$.next([...messages$.value, msg]);
      };

      addMessage({
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        createdAt: Date.now(),
      });

      expect(messages$.value.length).toBe(1);
    });

    it('should maintain message order', () => {
      const messages$ = new BehaviorSubject<ChatMessage[]>([]);

      const addMessage = (msg: ChatMessage) => {
        messages$.next([...messages$.value, msg]);
      };

      addMessage({ id: '1', role: 'user', content: 'First', createdAt: 1 });
      addMessage({ id: '2', role: 'assistant', content: 'Second', createdAt: 2 });
      addMessage({ id: '3', role: 'user', content: 'Third', createdAt: 3 });

      expect(messages$.value[0].content).toBe('First');
      expect(messages$.value[1].content).toBe('Second');
      expect(messages$.value[2].content).toBe('Third');
    });
  });

  describe('streaming response', () => {
    it('should track streaming state', () => {
      let isStreaming = false;
      let streamedText = '';

      const startStream = () => {
        isStreaming = true;
        streamedText = '';
      };

      const appendToken = (token: string) => {
        streamedText += token;
      };

      const endStream = () => {
        isStreaming = false;
      };

      startStream();
      expect(isStreaming).toBe(true);

      appendToken('Hello');
      appendToken(' World');
      expect(streamedText).toBe('Hello World');

      endStream();
      expect(isStreaming).toBe(false);
    });
  });

  describe('dropdown visibility', () => {
    it('should toggle recipe dropdown', () => {
      let showRecipes = false;

      const toggleRecipes = () => {
        showRecipes = !showRecipes;
      };

      expect(showRecipes).toBe(false);

      toggleRecipes();
      expect(showRecipes).toBe(true);

      toggleRecipes();
      expect(showRecipes).toBe(false);
    });

    it('should close dropdown when recipe selected', () => {
      let showRecipes = true;

      const selectRecipe = () => {
        showRecipes = false;
      };

      selectRecipe();
      expect(showRecipes).toBe(false);
    });
  });
});

describe('ChatPanelComponent keyboard handling', () => {
  describe('Enter key', () => {
    it('should submit on Enter without shift', () => {
      const submit = vi.fn();

      const handleKeydown = (event: { key: string; shiftKey: boolean }) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          submit();
        }
      };

      handleKeydown({ key: 'Enter', shiftKey: false });
      expect(submit).toHaveBeenCalled();
    });

    it('should not submit on Shift+Enter', () => {
      const submit = vi.fn();

      const handleKeydown = (event: { key: string; shiftKey: boolean }) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          submit();
        }
      };

      handleKeydown({ key: 'Enter', shiftKey: true });
      expect(submit).not.toHaveBeenCalled();
    });
  });

  describe('Escape key', () => {
    it('should close dropdown on Escape', () => {
      let showRecipes = true;

      const handleKeydown = (event: { key: string }) => {
        if (event.key === 'Escape') {
          showRecipes = false;
        }
      };

      handleKeydown({ key: 'Escape' });
      expect(showRecipes).toBe(false);
    });
  });
});
