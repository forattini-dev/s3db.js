import { describe, it, expect } from 'vitest';
import {
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
  EMOJI,
  alphabets,
  getAlphabet,
  recommendedLength,
  validateAlphabet
} from '#src/concerns/id/index.js';

describe('Alphabets Module', () => {
  describe('Alphabet Constants', () => {
    it('URL_SAFE has 64 unique characters', () => {
      expect(URL_SAFE.length).toBe(64);
      expect(new Set(URL_SAFE).size).toBe(64);
    });

    it('ALPHANUMERIC has 62 characters', () => {
      expect(ALPHANUMERIC.length).toBe(62);
      expect(/^[A-Za-z0-9]+$/.test(ALPHANUMERIC)).toBe(true);
    });

    it('ALPHANUMERIC_LOWER has 36 characters', () => {
      expect(ALPHANUMERIC_LOWER.length).toBe(36);
      expect(/^[a-z0-9]+$/.test(ALPHANUMERIC_LOWER)).toBe(true);
    });

    it('ALPHANUMERIC_UPPER has 36 characters', () => {
      expect(ALPHANUMERIC_UPPER.length).toBe(36);
      expect(/^[A-Z0-9]+$/.test(ALPHANUMERIC_UPPER)).toBe(true);
    });

    it('HEX_LOWER has 16 characters', () => {
      expect(HEX_LOWER.length).toBe(16);
      expect(HEX_LOWER).toBe('0123456789abcdef');
    });

    it('HEX_UPPER has 16 characters', () => {
      expect(HEX_UPPER.length).toBe(16);
      expect(HEX_UPPER).toBe('0123456789ABCDEF');
    });

    it('CROCKFORD_BASE32 has 32 characters', () => {
      expect(CROCKFORD_BASE32.length).toBe(32);
      expect(CROCKFORD_BASE32).not.toContain('I');
      expect(CROCKFORD_BASE32).not.toContain('L');
      expect(CROCKFORD_BASE32).not.toContain('O');
      expect(CROCKFORD_BASE32).not.toContain('U');
    });

    it('BASE58 has 58 characters', () => {
      expect(BASE58.length).toBe(58);
      expect(BASE58).not.toContain('0');
      expect(BASE58).not.toContain('O');
      expect(BASE58).not.toContain('I');
      expect(BASE58).not.toContain('l');
    });

    it('BASE64_URL has 64 characters', () => {
      expect(BASE64_URL.length).toBe(64);
    });

    it('NUMERIC has 10 characters', () => {
      expect(NUMERIC.length).toBe(10);
      expect(NUMERIC).toBe('0123456789');
    });

    it('LOWERCASE has 26 characters', () => {
      expect(LOWERCASE.length).toBe(26);
      expect(LOWERCASE).toBe('abcdefghijklmnopqrstuvwxyz');
    });

    it('UPPERCASE has 26 characters', () => {
      expect(UPPERCASE.length).toBe(26);
      expect(UPPERCASE).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    });

    it('HUMAN_READABLE excludes confusing characters', () => {
      expect(HUMAN_READABLE).not.toContain('0');
      expect(HUMAN_READABLE).not.toContain('O');
      expect(HUMAN_READABLE).not.toContain('1');
      expect(HUMAN_READABLE).not.toContain('I');
      expect(HUMAN_READABLE).not.toContain('l');
    });

    it('NO_LOOKALIKE_LOWER excludes confusing characters', () => {
      expect(NO_LOOKALIKE_LOWER).not.toContain('0');
      expect(NO_LOOKALIKE_LOWER).not.toContain('o');
      expect(NO_LOOKALIKE_LOWER).not.toContain('1');
      expect(NO_LOOKALIKE_LOWER).not.toContain('l');
    });

    it('BINARY has 2 characters', () => {
      expect(BINARY.length).toBe(2);
      expect(BINARY).toBe('01');
    });

    it('EMOJI has emojis', () => {
      expect(EMOJI.length).toBeGreaterThan(0);
    });
  });

  describe('alphabets map', () => {
    it('contains all alphabets', () => {
      expect(alphabets.URL_SAFE).toBe(URL_SAFE);
      expect(alphabets.ALPHANUMERIC).toBe(ALPHANUMERIC);
      expect(alphabets.HEX_LOWER).toBe(HEX_LOWER);
      expect(alphabets.NUMERIC).toBe(NUMERIC);
    });
  });

  describe('getAlphabet()', () => {
    it('returns alphabet by name', () => {
      expect(getAlphabet('URL_SAFE')).toBe(URL_SAFE);
      expect(getAlphabet('ALPHANUMERIC')).toBe(ALPHANUMERIC);
      expect(getAlphabet('HEX_LOWER')).toBe(HEX_LOWER);
    });

    it('returns raw string if not a known name', () => {
      expect(getAlphabet('ABC')).toBe('ABC');
      expect(getAlphabet('xyz123')).toBe('xyz123');
    });

    it('handles case sensitivity', () => {
      expect(getAlphabet('URL_SAFE')).toBe(URL_SAFE);
    });
  });

  describe('recommendedLength()', () => {
    it('returns recommended length for URL_SAFE alphabet', () => {
      const len = recommendedLength(URL_SAFE);
      expect(len).toBe(22);
    });

    it('returns recommended length for ALPHANUMERIC alphabet', () => {
      const len = recommendedLength(ALPHANUMERIC);
      expect(len).toBe(22);
    });

    it('returns recommended length for HEX_LOWER alphabet', () => {
      const len = recommendedLength(HEX_LOWER);
      expect(len).toBe(32);
    });

    it('returns recommended length for raw alphabet', () => {
      const len = recommendedLength('AB');
      expect(len).toBe(128);
    });

    it('returns recommended length for custom target bits', () => {
      const len = recommendedLength(URL_SAFE, 256);
      expect(len).toBeGreaterThan(22);
    });
  });

  describe('validateAlphabet()', () => {
    it('returns null for valid alphabet', () => {
      expect(validateAlphabet('ABC')).toBeNull();
      expect(validateAlphabet(URL_SAFE)).toBeNull();
    });

    it('returns error for empty alphabet', () => {
      expect(validateAlphabet('')).toBe('Alphabet cannot be empty');
    });

    it('returns error for single character', () => {
      expect(validateAlphabet('A')).toBe('Alphabet must have at least 2 characters');
    });

    it('returns error for duplicate characters', () => {
      expect(validateAlphabet('AAB')).toBe('Duplicate character in alphabet: "A"');
      expect(validateAlphabet('abca')).toBe('Duplicate character in alphabet: "a"');
    });

    it('returns error for alphabet > 65536', () => {
      const tooLarge = Array.from({ length: 65537 }, (_, i) => String.fromCodePoint(i)).join('');
      expect(validateAlphabet(tooLarge)).toBe('Alphabet cannot exceed 65536 characters');
    });
  });
});
