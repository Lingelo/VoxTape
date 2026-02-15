import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  sanitizeExcerpt,
  validateConfigValue,
  isValidConfigKey,
} from './security-utils';

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('should escape ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should not modify safe text', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('should prevent XSS via img onerror', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
  });

  it('should prevent XSS via event handlers', () => {
    expect(escapeHtml('<div onclick="alert(1)">')).toBe(
      '&lt;div onclick=&quot;alert(1)&quot;&gt;'
    );
  });
});

describe('sanitizeExcerpt', () => {
  it('should preserve <mark> tags', () => {
    expect(sanitizeExcerpt('hello <mark>world</mark>!')).toBe(
      'hello <mark>world</mark>!'
    );
  });

  it('should escape other HTML tags', () => {
    expect(sanitizeExcerpt('<mark>text</mark><script>alert(1)</script>')).toBe(
      '<mark>text</mark>&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('should handle case-insensitive mark tags', () => {
    expect(sanitizeExcerpt('<MARK>text</MARK>')).toBe('<mark>text</mark>');
  });

  it('should handle empty string', () => {
    expect(sanitizeExcerpt('')).toBe('');
  });

  it('should handle null/undefined', () => {
    expect(sanitizeExcerpt(null as unknown as string)).toBe('');
    expect(sanitizeExcerpt(undefined as unknown as string)).toBe('');
  });

  it('should escape nested attack in mark content', () => {
    expect(sanitizeExcerpt('<mark><script>alert(1)</script></mark>')).toBe(
      '<mark>&lt;script&gt;alert(1)&lt;/script&gt;</mark>'
    );
  });

  it('should not allow fake mark tags', () => {
    expect(sanitizeExcerpt('<mark onclick="alert(1)">test</mark>')).toBe(
      '&lt;mark onclick=&quot;alert(1)&quot;&gt;test</mark>'
    );
  });
});

describe('validateConfigValue', () => {
  describe('string type', () => {
    it('should accept valid string for language', () => {
      expect(validateConfigValue('language', 'fr')).toBe(true);
      expect(validateConfigValue('language', 'en')).toBe(true);
    });

    it('should reject non-string for language', () => {
      expect(validateConfigValue('language', 123)).toBe(false);
      expect(validateConfigValue('language', null)).toBe(false);
      expect(validateConfigValue('language', undefined)).toBe(false);
    });
  });

  describe('number type', () => {
    it('should accept valid number for llm.contextSize', () => {
      expect(validateConfigValue('llm.contextSize', 4096)).toBe(true);
      expect(validateConfigValue('llm.contextSize', 0)).toBe(true);
    });

    it('should reject non-number for llm.contextSize', () => {
      expect(validateConfigValue('llm.contextSize', '4096')).toBe(false);
      expect(validateConfigValue('llm.contextSize', null)).toBe(false);
    });
  });

  describe('boolean type', () => {
    it('should accept valid boolean for onboardingComplete', () => {
      expect(validateConfigValue('onboardingComplete', true)).toBe(true);
      expect(validateConfigValue('onboardingComplete', false)).toBe(true);
    });

    it('should reject non-boolean for onboardingComplete', () => {
      expect(validateConfigValue('onboardingComplete', 'true')).toBe(false);
      expect(validateConfigValue('onboardingComplete', 1)).toBe(false);
    });
  });

  describe('string|null type', () => {
    it('should accept string or null for audio.defaultDeviceId', () => {
      expect(validateConfigValue('audio.defaultDeviceId', 'device-1')).toBe(true);
      expect(validateConfigValue('audio.defaultDeviceId', null)).toBe(true);
    });

    it('should reject other types for audio.defaultDeviceId', () => {
      expect(validateConfigValue('audio.defaultDeviceId', 123)).toBe(false);
      expect(validateConfigValue('audio.defaultDeviceId', undefined)).toBe(false);
    });
  });

  describe('unknown keys', () => {
    it('should reject unknown config keys', () => {
      expect(validateConfigValue('unknown.key', 'value')).toBe(false);
      expect(validateConfigValue('__proto__', {})).toBe(false);
      expect(validateConfigValue('constructor', () => {})).toBe(false);
    });
  });
});

describe('isValidConfigKey', () => {
  it('should return true for valid keys', () => {
    expect(isValidConfigKey('language')).toBe(true);
    expect(isValidConfigKey('theme')).toBe(true);
    expect(isValidConfigKey('llm.contextSize')).toBe(true);
    expect(isValidConfigKey('audio.systemAudioEnabled')).toBe(true);
  });

  it('should return false for invalid keys', () => {
    expect(isValidConfigKey('invalid')).toBe(false);
    expect(isValidConfigKey('__proto__')).toBe(false);
    expect(isValidConfigKey('constructor')).toBe(false);
    expect(isValidConfigKey('')).toBe(false);
  });
});
