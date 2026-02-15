/**
 * Security utility functions for HTML sanitization and validation.
 * These functions are designed to prevent XSS attacks.
 */

/**
 * Escapes HTML special characters to prevent XSS.
 * @param text - The text to escape
 * @returns The escaped text safe for HTML insertion
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes search excerpt HTML - escapes all HTML except safe <mark> tags.
 * Used for search result highlighting where <mark> tags are added by the database.
 * @param text - The text with potential <mark> tags
 * @returns Sanitized text with only <mark> tags preserved
 */
export function sanitizeExcerpt(text: string): string {
  if (!text) return '';
  // Split by <mark> and </mark>, escape content, rejoin with safe marks
  return text
    .split(/(<\/?mark>)/gi)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === '<mark>' || lower === '</mark>') {
        return lower; // Preserve mark tags
      }
      // Escape HTML in content (including quotes for attribute injection)
      return part
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    })
    .join('');
}

/**
 * Whitelist of allowed configuration keys for IPC config:set.
 */
export const CONFIG_WHITELIST: Record<string, 'string' | 'number' | 'boolean' | 'string|null'> = {
  'language': 'string',
  'theme': 'string',
  'audio.defaultDeviceId': 'string|null',
  'audio.systemAudioEnabled': 'boolean',
  'llm.modelPath': 'string|null',
  'llm.contextSize': 'number',
  'llm.temperature': 'number',
  'stt.modelPath': 'string|null',
  'onboardingComplete': 'boolean',
};

/**
 * Validates a configuration value against the whitelist.
 * @param key - The configuration key
 * @param value - The value to validate
 * @returns true if the value is valid for the given key
 */
export function validateConfigValue(key: string, value: unknown): boolean {
  const expectedType = CONFIG_WHITELIST[key];
  if (!expectedType) return false;

  if (expectedType === 'string|null') {
    return value === null || typeof value === 'string';
  }
  return typeof value === expectedType;
}

/**
 * Checks if a configuration key is in the whitelist.
 * @param key - The configuration key to check
 * @returns true if the key is allowed
 */
export function isValidConfigKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONFIG_WHITELIST, key);
}
