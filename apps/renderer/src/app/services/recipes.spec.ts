import { describe, it, expect } from 'vitest';
import { RECIPES, Recipe } from './recipes';

describe('RECIPES', () => {
  it('should export an array of recipes', () => {
    expect(Array.isArray(RECIPES)).toBe(true);
    expect(RECIPES.length).toBeGreaterThan(0);
  });

  it('should have all required fields for each recipe', () => {
    RECIPES.forEach((recipe: Recipe) => {
      expect(recipe).toHaveProperty('command');
      expect(recipe).toHaveProperty('label');
      expect(recipe).toHaveProperty('prompt');
      expect(typeof recipe.command).toBe('string');
      expect(typeof recipe.label).toBe('string');
      expect(typeof recipe.prompt).toBe('string');
    });
  });

  it('should have commands starting with /', () => {
    RECIPES.forEach((recipe: Recipe) => {
      expect(recipe.command.startsWith('/')).toBe(true);
    });
  });

  it('should have unique commands', () => {
    const commands = RECIPES.map((r) => r.command);
    const uniqueCommands = new Set(commands);
    expect(commands.length).toBe(uniqueCommands.size);
  });

  it('should include essential recipe commands', () => {
    const commands = RECIPES.map((r) => r.command);
    expect(commands).toContain('/resume');
    expect(commands).toContain('/actions');
    expect(commands).toContain('/decisions');
    expect(commands).toContain('/email');
    expect(commands).toContain('/questions');
  });

  it('should have non-empty prompts with instructions', () => {
    RECIPES.forEach((recipe: Recipe) => {
      expect(recipe.prompt.length).toBeGreaterThan(20);
      // Prompts should contain formatting instructions
      expect(recipe.prompt).toMatch(/FORMAT|Si |N'invente|Base-toi/i);
    });
  });

  describe('/resume recipe', () => {
    it('should have correct structure', () => {
      const recipe = RECIPES.find((r) => r.command === '/resume');
      expect(recipe).toBeDefined();
      expect(recipe?.label).toBe('Résumé');
      expect(recipe?.prompt).toContain('bullet points');
    });
  });

  describe('/actions recipe', () => {
    it('should have correct structure', () => {
      const recipe = RECIPES.find((r) => r.command === '/actions');
      expect(recipe).toBeDefined();
      expect(recipe?.label).toBe("Points d'action");
      expect(recipe?.prompt).toContain('[ ]');
    });
  });

  describe('/decisions recipe', () => {
    it('should have correct structure', () => {
      const recipe = RECIPES.find((r) => r.command === '/decisions');
      expect(recipe).toBeDefined();
      expect(recipe?.label).toBe('Décisions prises');
    });
  });

  describe('/email recipe', () => {
    it('should have correct structure', () => {
      const recipe = RECIPES.find((r) => r.command === '/email');
      expect(recipe).toBeDefined();
      expect(recipe?.label).toBe('E-mail de suivi');
      expect(recipe?.prompt).toContain('Objet:');
      expect(recipe?.prompt).toContain('Cordialement');
    });
  });

  describe('/questions recipe', () => {
    it('should have correct structure', () => {
      const recipe = RECIPES.find((r) => r.command === '/questions');
      expect(recipe).toBeDefined();
      expect(recipe?.label).toBe('Questions ouvertes');
    });
  });
});
