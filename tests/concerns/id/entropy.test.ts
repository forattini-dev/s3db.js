import { describe, it, expect, beforeEach } from 'vitest';
import {
  initPool,
  getRandomBytes,
  fillRandomBytes,
  randomIndexUnbiased,
  randomIndicesUnbiased,
  randomString,
  random48,
  random62,
  random80,
  calculateEntropyBits,
  calculateCollisionProbability,
  resetPool
} from '#src/concerns/id/entropy.js';

describe('Entropy Module', () => {
  beforeEach(() => {
    resetPool();
  });

  describe('getRandomBytes', () => {
    it('returns correct number of bytes', () => {
      const bytes = getRandomBytes(16);
      expect(bytes.length).toBe(16);
    });

    it('returns Uint8Array', () => {
      const bytes = getRandomBytes(10);
      expect(bytes).toBeInstanceOf(Uint8Array);
    });

    it('generates different values on each call', () => {
      const a = getRandomBytes(32);
      const b = getRandomBytes(32);
      expect(a).not.toEqual(b);
    });

    it('handles large byte requests', () => {
      const bytes = getRandomBytes(4096);
      expect(bytes.length).toBe(4096);
    });

    it('auto-initializes pool when not initialized', () => {
      resetPool();
      const bytes = getRandomBytes(8);
      expect(bytes.length).toBe(8);
    });
  });

  describe('fillRandomBytes', () => {
    it('fills pre-allocated buffer', () => {
      const buffer = new Uint8Array(16);
      const result = fillRandomBytes(buffer);
      expect(result).toBe(buffer);
      expect(buffer.some(b => b !== 0)).toBe(true);
    });

    it('fills buffer completely', () => {
      const buffer = new Uint8Array(100);
      fillRandomBytes(buffer);
      let nonZeroCount = 0;
      for (const b of buffer) {
        if (b !== 0) nonZeroCount++;
      }
      expect(nonZeroCount).toBeGreaterThan(50);
    });

    it('handles pool boundary wrap-around', () => {
      resetPool();
      initPool(256);

      const buffer1 = new Uint8Array(200);
      fillRandomBytes(buffer1);
      expect(buffer1.some(b => b !== 0)).toBe(true);

      const buffer2 = new Uint8Array(100);
      fillRandomBytes(buffer2);
      expect(buffer2.length).toBe(100);
      expect(buffer2.some(b => b !== 0)).toBe(true);
    });

    it('handles wrap-around with remaining = 0', () => {
      resetPool();
      initPool(256);

      const buffer1 = new Uint8Array(256);
      fillRandomBytes(buffer1);

      const buffer2 = new Uint8Array(100);
      fillRandomBytes(buffer2);
      expect(buffer2.length).toBe(100);
    });
  });

  describe('randomIndexUnbiased (Rejection Sampling)', () => {
    it('returns values within alphabet range', () => {
      const alphabetSize = 62;
      for (let i = 0; i < 1000; i++) {
        const index = randomIndexUnbiased(alphabetSize);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(alphabetSize);
      }
    });

    it('handles alphabet size 1', () => {
      const index = randomIndexUnbiased(1);
      expect(index).toBe(0);
    });

    it('handles power-of-2 alphabet sizes', () => {
      for (const size of [2, 4, 8, 16, 32, 64, 128, 256]) {
        for (let i = 0; i < 100; i++) {
          const index = randomIndexUnbiased(size);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(size);
        }
      }
    });

    it('handles large alphabets (> 256)', () => {
      const alphabetSize = 1000;
      for (let i = 0; i < 100; i++) {
        const index = randomIndexUnbiased(alphabetSize);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(alphabetSize);
      }
    });

    it('throws for invalid alphabet sizes', () => {
      expect(() => randomIndexUnbiased(0)).toThrow();
      expect(() => randomIndexUnbiased(-1)).toThrow();
      expect(() => randomIndexUnbiased(65537)).toThrow();
    });

    it('produces uniform distribution (chi-square test)', () => {
      const alphabetSize = 62;
      const iterations = 62000;
      const expected = iterations / alphabetSize;
      const counts = new Array(alphabetSize).fill(0);

      for (let i = 0; i < iterations; i++) {
        counts[randomIndexUnbiased(alphabetSize)]++;
      }

      let chiSquare = 0;
      for (const count of counts) {
        chiSquare += Math.pow(count - expected, 2) / expected;
      }

      expect(chiSquare).toBeLessThan(100);
    });
  });

  describe('randomIndicesUnbiased', () => {
    it('returns correct count of indices', () => {
      const indices = randomIndicesUnbiased(62, 100);
      expect(indices.length).toBe(100);
    });

    it('returns Uint16Array', () => {
      const indices = randomIndicesUnbiased(62, 10);
      expect(indices).toBeInstanceOf(Uint16Array);
    });

    it('all indices within range', () => {
      const alphabetSize = 62;
      const indices = randomIndicesUnbiased(alphabetSize, 1000);
      for (const index of indices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(alphabetSize);
      }
    });

    it('handles alphabet size 1 (returns all zeros)', () => {
      const indices = randomIndicesUnbiased(1, 100);
      expect(indices.length).toBe(100);
      for (const index of indices) {
        expect(index).toBe(0);
      }
    });

    it('throws for invalid alphabet sizes', () => {
      expect(() => randomIndicesUnbiased(0, 10)).toThrow('Invalid alphabet size');
      expect(() => randomIndicesUnbiased(-1, 10)).toThrow('Invalid alphabet size');
      expect(() => randomIndicesUnbiased(65537, 10)).toThrow('Invalid alphabet size');
    });

    it('handles large alphabets (> 256 chars) with 16-bit path', () => {
      const alphabetSize = 1000;
      const indices = randomIndicesUnbiased(alphabetSize, 500);
      expect(indices.length).toBe(500);
      for (const index of indices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(alphabetSize);
      }
    });

    it('handles very large alphabets near 65536', () => {
      const alphabetSize = 60000;
      const indices = randomIndicesUnbiased(alphabetSize, 100);
      expect(indices.length).toBe(100);
      for (const index of indices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(alphabetSize);
      }
    });

    it('produces uniform distribution for large alphabets', () => {
      const alphabetSize = 1000;
      const iterations = 10000;
      const indices = randomIndicesUnbiased(alphabetSize, iterations);
      const counts = new Map<number, number>();

      for (const index of indices) {
        counts.set(index, (counts.get(index) || 0) + 1);
      }

      const expectedPerBucket = iterations / alphabetSize;
      const tolerance = expectedPerBucket * 3;

      for (const count of counts.values()) {
        expect(count).toBeLessThan(expectedPerBucket + tolerance);
      }
    });

    it('handles worst-case rejection rate for small alphabet', () => {
      const indices = randomIndicesUnbiased(129, 1000);
      expect(indices.length).toBe(1000);
      for (const index of indices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(129);
      }
    });

    it('handles worst-case rejection rate for large alphabet', () => {
      const indices = randomIndicesUnbiased(32769, 500);
      expect(indices.length).toBe(500);
      for (const index of indices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(32769);
      }
    });
  });

  describe('randomString', () => {
    it('generates string of correct length', () => {
      const str = randomString('abc', 10);
      expect(str.length).toBe(10);
    });

    it('uses only alphabet characters', () => {
      const alphabet = 'ABCDEF';
      const str = randomString(alphabet, 100);
      for (const char of str) {
        expect(alphabet.includes(char)).toBe(true);
      }
    });
  });

  describe('random48', () => {
    it('returns BigInt', () => {
      const value = random48();
      expect(typeof value).toBe('bigint');
    });

    it('fits in 48 bits', () => {
      for (let i = 0; i < 100; i++) {
        const value = random48();
        expect(value).toBeGreaterThanOrEqual(0n);
        expect(value).toBeLessThan(2n ** 48n);
      }
    });
  });

  describe('random62', () => {
    it('returns BigInt', () => {
      const value = random62();
      expect(typeof value).toBe('bigint');
    });

    it('fits in 62 bits (signed 64-bit safe)', () => {
      for (let i = 0; i < 100; i++) {
        const value = random62();
        expect(value).toBeGreaterThanOrEqual(0n);
        expect(value).toBeLessThan(2n ** 62n);
      }
    });
  });

  describe('random80', () => {
    it('returns BigInt', () => {
      const value = random80();
      expect(typeof value).toBe('bigint');
    });

    it('fits in 80 bits', () => {
      for (let i = 0; i < 100; i++) {
        const value = random80();
        expect(value).toBeGreaterThanOrEqual(0n);
        expect(value).toBeLessThan(2n ** 80n);
      }
    });
  });

  describe('calculateEntropyBits', () => {
    it('calculates correctly for base64', () => {
      const bits = calculateEntropyBits(64, 21);
      expect(bits).toBe(126);
    });

    it('calculates correctly for hex', () => {
      const bits = calculateEntropyBits(16, 32);
      expect(bits).toBe(128);
    });

    it('calculates correctly for alphanumeric (62)', () => {
      const bits = calculateEntropyBits(62, 22);
      expect(bits).toBeCloseTo(131, 0);
    });
  });

  describe('calculateCollisionProbability', () => {
    it('returns low probability for high entropy', () => {
      const prob = calculateCollisionProbability(128, 1000000);
      expect(prob).toBeLessThan(1e-20);
    });

    it('returns higher probability for low entropy', () => {
      const prob = calculateCollisionProbability(32, 100000);
      expect(prob).toBeGreaterThan(0.5);
    });
  });

  describe('pool management', () => {
    it('initPool creates new pool', () => {
      initPool(512);
      const bytes = getRandomBytes(256);
      expect(bytes.length).toBe(256);
    });

    it('resetPool clears state', () => {
      const a = getRandomBytes(16);
      resetPool();
      const b = getRandomBytes(16);
      expect(a).not.toEqual(b);
    });

    it('handles pool boundary wrap-around for getRandomBytes', () => {
      resetPool();
      initPool(256);

      getRandomBytes(200);
      const bytes = getRandomBytes(100);

      expect(bytes.length).toBe(100);
      expect(bytes.every(b => b >= 0 && b <= 255)).toBe(true);
    });

    it('handles pool exhaustion with multiple requests', () => {
      resetPool();
      initPool(256);

      for (let i = 0; i < 10; i++) {
        const bytes = getRandomBytes(100);
        expect(bytes.length).toBe(100);
      }
    });
  });
});
