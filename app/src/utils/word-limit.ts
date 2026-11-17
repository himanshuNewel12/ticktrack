export const MAX_LETTERS = 250;
export const MAX_CHARS = 250;

/**
 * Enforces a maximum character/letter limit on the text.
 */
export function enforceLetterLimit(text: string, maxLetters: number = MAX_LETTERS): string {
  if (!text) return text;
  return text.slice(0, maxLetters);
}

// Aliases for backwards compatibility
export const MAX_WORDS = MAX_LETTERS;
export const countWords = (text?: string | null) => (text ? text.length : 0);
export const enforceWordLimit = enforceLetterLimit;
