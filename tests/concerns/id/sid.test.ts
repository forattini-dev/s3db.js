import { describe, it, expect } from 'vitest';
import {
  sid,
  customAlphabet,
  customAlphabetByName,
  sidWithOptions,
  sidEntropyBits,
  sidAsync,
  customAlphabetAsync,
  urlAlphabet,
  URL_SAFE,
  ALPHANUMERIC
} from '#src/concerns/id/index.js';

describe('SID Generator', () => {
  describe('sid()', () => {
    it('generates 21-character ID by default', () => {
      const id = sid();
      expect(id.length).toBe(21);
    });

    it('generates custom length', () => {
      expect(sid(10).length).toBe(10);
      expect(sid(50).length).toBe(50);
      expect(sid(100).length).toBe(100);
    });

    it('uses URL-safe characters', () => {
      const id = sid(1000);
      for (const char of id) {
        expect(URL_SAFE.includes(char)).toBe(true);
      }
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10000; i++) {
        ids.add(sid());
      }
      expect(ids.size).toBe(10000);
    });

    it('handles edge cases', () => {
      expect(sid(1).length).toBe(1);
      expect(sid(0)).toBe('');
    });
  });

  describe('customAlphabet()', () => {
    it('creates generator with custom alphabet', () => {
      const generator = customAlphabet('abc', 10);
      const id = generator();

      expect(id.length).toBe(10);
      for (const char of id) {
        expect('abc'.includes(char)).toBe(true);
      }
    });

    it('supports override length', () => {
      const generator = customAlphabet('0123456789', 8);
      expect(generator().length).toBe(8);
      expect(generator(5).length).toBe(5);
      expect(generator(15).length).toBe(15);
    });

    it('numeric alphabet', () => {
      const generator = customAlphabet('0123456789', 12);
      const id = generator();

      expect(id.length).toBe(12);
      expect(/^\d+$/.test(id)).toBe(true);
    });

    it('hex alphabet', () => {
      const generator = customAlphabet('0123456789abcdef', 32);
      const id = generator();

      expect(id.length).toBe(32);
      expect(/^[0-9a-f]+$/.test(id)).toBe(true);
    });

    it('throws on empty alphabet', () => {
      expect(() => customAlphabet('', 10)).toThrow('Invalid alphabet');
    });

    it('throws on alphabet with duplicates', () => {
      expect(() => customAlphabet('aab', 10)).toThrow('Invalid alphabet');
    });
  });

  describe('customAlphabetByName()', () => {
    it('creates generator with named alphabet', () => {
      const generator = customAlphabetByName('ALPHANUMERIC', 10);
      const id = generator();
      expect(id.length).toBe(10);
      for (const char of id) {
        expect(ALPHANUMERIC.includes(char)).toBe(true);
      }
    });

    it('creates generator with HEX_LOWER', () => {
      const generator = customAlphabetByName('HEX_LOWER', 16);
      const id = generator();
      expect(/^[0-9a-f]+$/.test(id)).toBe(true);
    });

    it('creates generator with URL_SAFE', () => {
      const generator = customAlphabetByName('URL_SAFE', 21);
      const id = generator();
      expect(id.length).toBe(21);
    });
  });

  describe('sidWithOptions()', () => {
    it('generates with default options', () => {
      const id = sidWithOptions();
      expect(id.length).toBe(21);
    });

    it('respects size option', () => {
      const id = sidWithOptions({ size: 32 });
      expect(id.length).toBe(32);
    });

    it('respects alphabet option by name', () => {
      const id = sidWithOptions({ alphabet: 'NUMERIC', size: 10 });
      expect(/^\d+$/.test(id)).toBe(true);
    });

    it('respects alphabet option by value', () => {
      const id = sidWithOptions({ alphabet: 'ABC', size: 10 });
      for (const char of id) {
        expect('ABC'.includes(char)).toBe(true);
      }
    });

    it('throws on invalid alphabet', () => {
      expect(() => sidWithOptions({ alphabet: 'aa' })).toThrow('Invalid alphabet');
    });
  });

  describe('sidEntropyBits()', () => {
    it('calculates entropy for default', () => {
      const bits = sidEntropyBits();
      expect(bits).toBe(126);
    });

    it('calculates entropy for custom alphabet', () => {
      const bits = sidEntropyBits('ALPHANUMERIC', 22);
      expect(bits).toBeGreaterThan(130);
    });

    it('calculates entropy for hex', () => {
      const bits = sidEntropyBits('HEX_LOWER', 32);
      expect(bits).toBe(128);
    });

    it('calculates entropy for raw alphabet', () => {
      const bits = sidEntropyBits('AB', 10);
      expect(bits).toBe(10);
    });
  });

  describe('Async variants', () => {
    it('sidAsync returns promise', async () => {
      const id = await sidAsync();
      expect(id.length).toBe(21);
    });

    it('sidAsync with custom size', async () => {
      const id = await sidAsync(10);
      expect(id.length).toBe(10);
    });

    it('customAlphabetAsync returns async generator', async () => {
      const generator = customAlphabetAsync('abc', 10);
      const id = await generator();
      expect(id.length).toBe(10);
    });

    it('customAlphabetAsync respects size override', async () => {
      const generator = customAlphabetAsync('abc', 10);
      const id = await generator(5);
      expect(id.length).toBe(5);
    });
  });

  describe('urlAlphabet constant', () => {
    it('equals URL_SAFE', () => {
      expect(urlAlphabet).toBe(URL_SAFE);
    });
  });

  describe('Collision Resistance', () => {
    it('no collisions in 100k IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100000; i++) {
        ids.add(sid());
      }
      expect(ids.size).toBe(100000);
    });

    it('short IDs still unique in reasonable range', () => {
      const generator = customAlphabet(ALPHANUMERIC, 8);
      const ids = new Set<string>();
      for (let i = 0; i < 10000; i++) {
        ids.add(generator());
      }
      expect(ids.size).toBe(10000);
    });
  });

  describe('Distribution Quality', () => {
    it('uniform character distribution', () => {
      const alphabet = 'abcdefghij';
      const generator = customAlphabet(alphabet, 1);
      const counts = new Map<string, number>();

      for (const char of alphabet) {
        counts.set(char, 0);
      }

      const iterations = 100000;
      for (let i = 0; i < iterations; i++) {
        const char = generator();
        counts.set(char, counts.get(char)! + 1);
      }

      const expected = iterations / alphabet.length;
      const tolerance = expected * 0.1;

      for (const [, count] of counts) {
        expect(Math.abs(count - expected)).toBeLessThan(tolerance);
      }
    });
  });

  describe('Alphabet Constants', () => {
    it('URL_SAFE has 64 unique characters', () => {
      expect(new Set(URL_SAFE).size).toBe(64);
    });

    it('ALPHANUMERIC has 62 unique characters', () => {
      expect(new Set(ALPHANUMERIC).size).toBe(62);
    });

    it('URL_SAFE is truly URL-safe', () => {
      const urlSafe = /^[A-Za-z0-9_-]+$/;
      expect(urlSafe.test(URL_SAFE)).toBe(true);
    });

    it('URL_SAFE is S3-safe', () => {
      const s3Safe = /^[A-Za-z0-9_-]+$/;
      expect(s3Safe.test(URL_SAFE)).toBe(true);
    });
  });
});
