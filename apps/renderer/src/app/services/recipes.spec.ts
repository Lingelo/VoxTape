import { describe, it, expect } from 'vitest';
import { RECIPES, Recipe, getRecipes } from './recipes';

describe('RECIPES (deprecated FR export)', () => {
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
    });
  });
});

describe('getRecipes', () => {
  it('should return FR recipes for fr language', () => {
    const recipes = getRecipes('fr');
    expect(recipes.length).toBe(5);
    expect(recipes[0].command).toBe('/resume');
    expect(recipes[0].label).toBe('Résumé');
  });

  it('should return EN recipes for en language', () => {
    const recipes = getRecipes('en');
    expect(recipes.length).toBe(5);
    expect(recipes[0].command).toBe('/summary');
    expect(recipes[0].label).toBe('Summary');
  });

  it('should have unique commands per language', () => {
    for (const lang of ['fr', 'en'] as const) {
      const recipes = getRecipes(lang);
      const commands = recipes.map((r) => r.command);
      expect(commands.length).toBe(new Set(commands).size);
    }
  });

  it('should have commands starting with /', () => {
    for (const lang of ['fr', 'en'] as const) {
      getRecipes(lang).forEach((recipe) => {
        expect(recipe.command.startsWith('/')).toBe(true);
      });
    }
  });

  it('should have non-empty prompts', () => {
    for (const lang of ['fr', 'en'] as const) {
      getRecipes(lang).forEach((recipe) => {
        expect(recipe.prompt.length).toBeGreaterThan(20);
      });
    }
  });
});
