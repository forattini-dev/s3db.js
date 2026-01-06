/**
 * URL-safe alphabet (64 chars).
 * Entropy: 6 bits per character
 * 21 chars = 126 bits of entropy
 */
export const URL_SAFE = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

/**
 * URL-safe alphabet without special chars (62 chars).
 * Alphanumeric only: a-z, A-Z, 0-9
 * Entropy: ~5.95 bits per character
 * 22 chars = ~131 bits of entropy
 */
export const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Lowercase alphanumeric (36 chars).
 * Entropy: ~5.17 bits per character
 * 25 chars = ~129 bits of entropy
 */
export const ALPHANUMERIC_LOWER = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Uppercase alphanumeric (36 chars).
 * Entropy: ~5.17 bits per character
 */
export const ALPHANUMERIC_UPPER = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Hexadecimal lowercase (16 chars).
 * Entropy: 4 bits per character
 * 32 chars = 128 bits of entropy
 */
export const HEX_LOWER = '0123456789abcdef';

/**
 * Hexadecimal uppercase (16 chars).
 */
export const HEX_UPPER = '0123456789ABCDEF';

/**
 * Crockford Base32 (32 chars) - Used by ULID.
 * Excludes I, L, O, U to avoid confusion.
 * Entropy: 5 bits per character
 * 26 chars = 130 bits of entropy
 */
export const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Base58 Bitcoin alphabet (58 chars).
 * Excludes 0, O, I, l to avoid confusion.
 * Entropy: ~5.86 bits per character
 */
export const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Base64 URL-safe alphabet (64 chars).
 * Standard RFC 4648 with - and _ instead of + and /
 * Entropy: 6 bits per character
 */
export const BASE64_URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Numeric only (10 chars).
 * Entropy: ~3.32 bits per character
 * 39 chars = ~129 bits of entropy
 */
export const NUMERIC = '0123456789';

/**
 * Lowercase letters only (26 chars).
 * Entropy: ~4.7 bits per character
 */
export const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Uppercase letters only (26 chars).
 */
export const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Human-readable alphabet (32 chars).
 * Excludes similar-looking characters: 0, O, I, l, 1
 * Good for manual entry scenarios.
 * Entropy: 5 bits per character
 */
export const HUMAN_READABLE = '23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';

/**
 * No-look-alike lowercase (23 chars).
 * Excludes: 0, 1, l, o, i
 * Entropy: ~4.52 bits per character
 */
export const NO_LOOKALIKE_LOWER = '23456789abcdefghjkmnpqrstuvwxyz';

/**
 * Binary alphabet (2 chars).
 * Entropy: 1 bit per character
 */
export const BINARY = '01';

/**
 * Emoji alphabet (64 emojis) - Fun but use with caution.
 * UTF-8 encoding varies (2-4 bytes per emoji).
 */
export const EMOJI = '🚀🎉💡🔥⚡🌟💎🎯🏆🎨🎭🎪🎢🎡🎠🏰🗼🗽⛩️🏯🏟️🎸🎺🎻🥁🎹🎼🎤🎧🎬🎥📸🔮🎱🎲🎰🃏🀄🎴🎭🎨🖼️🎪🎢🎡🎠🏰🗼🗽⛩️🏯🏟️🎸🎺🎻🥁🎹🎼🎤🎧';

export const alphabets = {
  URL_SAFE,
  ALPHANUMERIC,
  ALPHANUMERIC_LOWER,
  ALPHANUMERIC_UPPER,
  HEX_LOWER,
  HEX_UPPER,
  CROCKFORD_BASE32,
  BASE58,
  BASE64_URL,
  NUMERIC,
  LOWERCASE,
  UPPERCASE,
  HUMAN_READABLE,
  NO_LOOKALIKE_LOWER,
  BINARY,
  EMOJI
} as const;

export type AlphabetName = keyof typeof alphabets;

/**
 * Get alphabet by name or return custom alphabet string.
 */
export function getAlphabet(nameOrCustom: AlphabetName | string): string {
  if (nameOrCustom in alphabets) {
    return alphabets[nameOrCustom as AlphabetName];
  }
  return nameOrCustom;
}

/**
 * Calculate recommended ID length for target entropy bits.
 */
export function recommendedLength(alphabet: string, targetEntropyBits: number = 128): number {
  const bitsPerChar = Math.log2(alphabet.length);
  return Math.ceil(targetEntropyBits / bitsPerChar);
}

/**
 * Validate an alphabet string.
 * Returns null if valid, error message if invalid.
 */
export function validateAlphabet(alphabet: string): string | null {
  if (!alphabet || alphabet.length === 0) {
    return 'Alphabet cannot be empty';
  }

  if (alphabet.length === 1) {
    return 'Alphabet must have at least 2 characters';
  }

  if (alphabet.length > 65536) {
    return 'Alphabet cannot exceed 65536 characters';
  }

  const seen = new Set<string>();
  for (const char of alphabet) {
    if (seen.has(char)) {
      return `Duplicate character in alphabet: "${char}"`;
    }
    seen.add(char);
  }

  return null;
}

export default alphabets;
