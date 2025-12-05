/**
 * Binary Encoding Functions Unit Tests
 *
 * Tests the binary encoding/decoding utilities and bitmap helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeBuffer,
  decodeBuffer,
  encodeBits,
  decodeBits,
  createBitmap,
  setBit,
  clearBit,
  getBit,
  toggleBit,
  countBits,
  calculateBufferSavings
} from '../../src/concerns/binary.js';

describe('Binary Encoding Functions', () => {
  describe('encodeBuffer', () => {
    it('should encode Buffer to Base64', () => {
      const buffer = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
      const encoded = encodeBuffer(buffer);

      expect(encoded).toBe('3q2+7w==');
    });

    it('should encode Uint8Array to Base64', () => {
      const uint8 = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const encoded = encodeBuffer(uint8);

      expect(encoded).toBe('AQIDBA==');
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.alloc(0);
      const encoded = encodeBuffer(buffer);

      expect(encoded).toBe('');
    });

    it('should handle null and undefined', () => {
      expect(encodeBuffer(null)).toBeNull();
      expect(encodeBuffer(undefined)).toBeNull();
    });

    it('should throw for invalid input', () => {
      expect(() => encodeBuffer('string')).toThrow();
      expect(() => encodeBuffer(12345)).toThrow();
      expect(() => encodeBuffer({ data: [] })).toThrow();
    });

    it('should encode various buffer sizes correctly', () => {
      const testCases = [
        { size: 1, expectedLength: 4 },    // 1 byte → 4 chars
        { size: 2, expectedLength: 4 },    // 2 bytes → 4 chars
        { size: 3, expectedLength: 4 },    // 3 bytes → 4 chars
        { size: 4, expectedLength: 8 },    // 4 bytes → 8 chars
        { size: 100, expectedLength: 136 }, // 100 bytes → 136 chars
        { size: 1000, expectedLength: 1336 }, // 1000 bytes → 1336 chars
      ];

      for (const { size, expectedLength } of testCases) {
        const buffer = Buffer.alloc(size).fill(0xAA);
        const encoded = encodeBuffer(buffer);
        expect(encoded.length).toBe(expectedLength);
      }
    });
  });

  describe('decodeBuffer', () => {
    it('should decode Base64 to Buffer', () => {
      const encoded = '3q2+7w==';
      const decoded = decodeBuffer(encoded);

      expect(Buffer.isBuffer(decoded)).toBe(true);
      expect(decoded.equals(Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]))).toBe(true);
    });

    it('should handle empty string', () => {
      const decoded = decodeBuffer('');
      expect(Buffer.isBuffer(decoded)).toBe(true);
      expect(decoded.length).toBe(0);
    });

    it('should handle null and undefined', () => {
      expect(decodeBuffer(null)).toBeNull();
      expect(decodeBuffer(undefined)).toBeNull();
    });

    it('should throw for non-string input', () => {
      expect(() => decodeBuffer(12345)).toThrow();
      expect(() => decodeBuffer(Buffer.from([]))).toThrow();
    });

    it('should roundtrip correctly', () => {
      const testBuffers = [
        Buffer.from([]),
        Buffer.from([0x00]),
        Buffer.from([0xFF]),
        Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]),
        Buffer.alloc(100).fill(0xAA),
        Buffer.alloc(1000).fill(0x55),
      ];

      for (const original of testBuffers) {
        const encoded = encodeBuffer(original);
        const decoded = decodeBuffer(encoded);
        expect(decoded.equals(original)).toBe(true);
      }
    });
  });

  describe('encodeBits', () => {
    it('should encode bitmap to Base64', () => {
      const bitmap = createBitmap(64);
      setBit(bitmap, 0);
      const encoded = encodeBits(bitmap);

      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBe(12); // 8 bytes → 12 Base64 chars
    });

    it('should validate bit count when specified', () => {
      const bitmap = createBitmap(64);
      const encoded = encodeBits(bitmap, 64);

      expect(typeof encoded).toBe('string');
    });

    it('should throw for size mismatch', () => {
      const bitmap = createBitmap(64); // 8 bytes

      expect(() => encodeBits(bitmap, 128)).toThrow(/size mismatch/);
      expect(() => encodeBits(bitmap, 32)).toThrow(/size mismatch/);
    });

    it('should handle null and undefined', () => {
      expect(encodeBits(null)).toBeNull();
      expect(encodeBits(undefined)).toBeNull();
    });
  });

  describe('decodeBits', () => {
    it('should decode Base64 to bitmap', () => {
      const bitmap = createBitmap(64);
      setBit(bitmap, 42);

      const encoded = encodeBits(bitmap);
      const decoded = decodeBits(encoded);

      expect(Buffer.isBuffer(decoded)).toBe(true);
      expect(getBit(decoded, 42)).toBe(1);
    });

    it('should validate bit count when specified', () => {
      const bitmap = createBitmap(64);
      const encoded = encodeBits(bitmap);
      const decoded = decodeBits(encoded, 64);

      expect(decoded.length).toBe(8);
    });

    it('should throw for size mismatch', () => {
      const bitmap = createBitmap(64);
      const encoded = encodeBits(bitmap);

      expect(() => decodeBits(encoded, 128)).toThrow(/size mismatch/);
    });

    it('should handle null and undefined', () => {
      expect(decodeBits(null)).toBeNull();
      expect(decodeBits(undefined)).toBeNull();
    });

    it('should roundtrip with bit validation', () => {
      const sizes = [64, 128, 256, 512, 1024];

      for (const bits of sizes) {
        const bitmap = createBitmap(bits);
        setBit(bitmap, 0);
        setBit(bitmap, bits - 1);

        const encoded = encodeBits(bitmap, bits);
        const decoded = decodeBits(encoded, bits);

        expect(getBit(decoded, 0)).toBe(1);
        expect(getBit(decoded, bits - 1)).toBe(1);
        expect(decoded.length).toBe(bits / 8);
      }
    });
  });

  describe('createBitmap', () => {
    it('should create bitmap of correct size', () => {
      expect(createBitmap(8).length).toBe(1);
      expect(createBitmap(64).length).toBe(8);
      expect(createBitmap(1024).length).toBe(128);
    });

    it('should round up to next byte', () => {
      expect(createBitmap(1).length).toBe(1);
      expect(createBitmap(9).length).toBe(2);
      expect(createBitmap(17).length).toBe(3);
    });

    it('should be zero-filled', () => {
      const bitmap = createBitmap(64);
      expect(countBits(bitmap)).toBe(0);
    });

    it('should throw for invalid sizes', () => {
      expect(() => createBitmap(0)).toThrow();
      expect(() => createBitmap(-1)).toThrow();
      expect(() => createBitmap(1.5)).toThrow();
      expect(() => createBitmap('64')).toThrow();
    });
  });

  describe('setBit / getBit / clearBit', () => {
    it('should set bits correctly', () => {
      const bitmap = createBitmap(64);

      setBit(bitmap, 0);
      expect(getBit(bitmap, 0)).toBe(1);
      expect(bitmap[0]).toBe(0b00000001);

      setBit(bitmap, 7);
      expect(getBit(bitmap, 7)).toBe(1);
      expect(bitmap[0]).toBe(0b10000001);

      setBit(bitmap, 8);
      expect(getBit(bitmap, 8)).toBe(1);
      expect(bitmap[1]).toBe(0b00000001);
    });

    it('should clear bits correctly', () => {
      const bitmap = createBitmap(64);

      setBit(bitmap, 10);
      expect(getBit(bitmap, 10)).toBe(1);

      clearBit(bitmap, 10);
      expect(getBit(bitmap, 10)).toBe(0);
    });

    it('should not affect other bits', () => {
      const bitmap = createBitmap(64);

      setBit(bitmap, 0);
      setBit(bitmap, 7);

      clearBit(bitmap, 0);
      expect(getBit(bitmap, 0)).toBe(0);
      expect(getBit(bitmap, 7)).toBe(1);
    });

    it('should throw for out-of-bounds access', () => {
      const bitmap = createBitmap(64);

      expect(() => getBit(bitmap, 64)).toThrow(/out of bounds/);
      expect(() => setBit(bitmap, 64)).toThrow(/out of bounds/);
      expect(() => clearBit(bitmap, 100)).toThrow(/out of bounds/);
    });

    it('should handle edge cases', () => {
      const bitmap = createBitmap(64);

      // First bit
      setBit(bitmap, 0);
      expect(getBit(bitmap, 0)).toBe(1);

      // Last bit
      setBit(bitmap, 63);
      expect(getBit(bitmap, 63)).toBe(1);
    });
  });

  describe('toggleBit', () => {
    it('should toggle 0 to 1', () => {
      const bitmap = createBitmap(64);
      expect(getBit(bitmap, 10)).toBe(0);

      toggleBit(bitmap, 10);
      expect(getBit(bitmap, 10)).toBe(1);
    });

    it('should toggle 1 to 0', () => {
      const bitmap = createBitmap(64);
      setBit(bitmap, 10);
      expect(getBit(bitmap, 10)).toBe(1);

      toggleBit(bitmap, 10);
      expect(getBit(bitmap, 10)).toBe(0);
    });

    it('should double-toggle back to original', () => {
      const bitmap = createBitmap(64);
      setBit(bitmap, 42);

      toggleBit(bitmap, 42);
      toggleBit(bitmap, 42);

      expect(getBit(bitmap, 42)).toBe(1);
    });
  });

  describe('countBits', () => {
    it('should count zero bits', () => {
      const bitmap = createBitmap(64);
      expect(countBits(bitmap)).toBe(0);
    });

    it('should count set bits', () => {
      const bitmap = createBitmap(64);

      setBit(bitmap, 0);
      expect(countBits(bitmap)).toBe(1);

      setBit(bitmap, 10);
      expect(countBits(bitmap)).toBe(2);

      setBit(bitmap, 63);
      expect(countBits(bitmap)).toBe(3);
    });

    it('should count all bits in full buffer', () => {
      const bitmap = Buffer.alloc(8).fill(0xFF);
      expect(countBits(bitmap)).toBe(64);
    });

    it('should handle alternating pattern', () => {
      const bitmap = Buffer.alloc(8).fill(0b10101010);
      expect(countBits(bitmap)).toBe(32); // Half the bits set
    });
  });

  describe('calculateBufferSavings', () => {
    it('should calculate overhead correctly', () => {
      const savings = calculateBufferSavings(100);

      expect(savings.originalBytes).toBe(100);
      expect(savings.originalBits).toBe(800);
      expect(savings.encodedSize).toBe(136); // Base64: ceil(100/3)*4 = 136
      expect(savings.overhead).toBeCloseTo(36, 0);
      expect(savings.overheadPercent).toBe('36%');
    });

    it('should accept Buffer input', () => {
      const buffer = Buffer.alloc(100);
      const savings = calculateBufferSavings(buffer);

      expect(savings.originalBytes).toBe(100);
    });

    it('should indicate metadata fit', () => {
      const smallSavings = calculateBufferSavings(100);
      expect(smallSavings.fitsInMetadata).toBe(true);

      const largeSavings = calculateBufferSavings(2000);
      expect(largeSavings.fitsInMetadata).toBe(false);
    });

    it('should calculate max bits in metadata', () => {
      const savings = calculateBufferSavings(100);

      // ~1500 bytes usable → ~1125 bytes raw → ~9000 bits
      expect(savings.maxBitsInMetadata).toBeGreaterThan(8000);
      expect(savings.maxBitsInMetadata).toBeLessThan(10000);
    });
  });

  describe('Performance characteristics', () => {
    it('should encode/decode 1MB buffer in reasonable time', () => {
      const buffer = Buffer.alloc(1024 * 1024).fill(0xAA);

      const startEncode = Date.now();
      const encoded = encodeBuffer(buffer);
      const encodeTime = Date.now() - startEncode;

      const startDecode = Date.now();
      const decoded = decodeBuffer(encoded);
      const decodeTime = Date.now() - startDecode;

      expect(encodeTime).toBeLessThan(100); // Should be < 100ms
      expect(decodeTime).toBeLessThan(100);
      expect(decoded.equals(buffer)).toBe(true);
    });

    it('should perform 10000 bit operations quickly', () => {
      const bitmap = createBitmap(10000);

      const start = Date.now();

      // Set all bits
      for (let i = 0; i < 10000; i++) {
        setBit(bitmap, i);
      }

      // Read all bits
      for (let i = 0; i < 10000; i++) {
        getBit(bitmap, i);
      }

      // Clear all bits
      for (let i = 0; i < 10000; i++) {
        clearBit(bitmap, i);
      }

      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // 30000 ops in < 100ms
    });
  });

  describe('Binary encoding vs Base64 overhead', () => {
    it('should demonstrate Base64 overhead converging to ~33%', () => {
      // Base64 overhead: ceil(n/3)*4 / n
      // For small buffers, padding adds extra overhead
      // Overhead converges to 33.33% as size increases

      const testCases = [
        { size: 3, expectedOverhead: 33.33 },   // 3 → 4 chars = 33%
        { size: 6, expectedOverhead: 33.33 },   // 6 → 8 chars = 33%
        { size: 100, expectedOverhead: 36 },    // 100 → 136 chars = 36%
        { size: 1000, expectedOverhead: 33.6 }, // 1000 → 1336 chars = 33.6%
        { size: 10000, expectedOverhead: 33.36 }, // approaches 33.33%
      ];

      for (const { size, expectedOverhead } of testCases) {
        const buffer = Buffer.alloc(size);
        const encoded = encodeBuffer(buffer);

        const overhead = ((encoded.length / size) - 1) * 100;

        // Verify overhead is within expected range
        expect(overhead).toBeCloseTo(expectedOverhead, 0);
      }
    });
  });
});
