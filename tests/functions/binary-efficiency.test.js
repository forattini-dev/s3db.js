/**
 * Binary Encoding Efficiency Test
 *
 * Evaluates the efficiency of Base64 encoding for binary data in s3db.js metadata.
 * Key considerations:
 * - S3 metadata limit: 2KB (2048 bytes)
 * - Base64 overhead: ~33% (4 chars per 3 bytes)
 * - Usable binary space in metadata: ~1.5KB (~12,000 bits)
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseForTest } from '../config.js';
import {
  encodeBuffer,
  decodeBuffer,
  encodeBits,
  decodeBits,
  createBitmap,
  setBit,
  getBit,
  countBits,
  calculateBufferSavings
} from '../../src/concerns/binary.js';

describe('Binary Encoding Efficiency Test', () => {
  let db;
  let bufferResource;
  let bitsResource;

  beforeAll(async () => {
    db = await createDatabaseForTest('suite=functions/binary-efficiency');

    bufferResource = await db.createResource({
      name: 'buffer_efficiency',
      attributes: {
        name: 'string',
        data: 'buffer'
      },
      behavior: 'enforce-limits'
    });

    bitsResource = await db.createResource({
      name: 'bits_efficiency',
      attributes: {
        name: 'string',
        flags: 'bits:8192'  // 8192 bits = 1KB
      },
      behavior: 'enforce-limits'
    });
  });

  afterAll(async () => {
    if (db?.teardown) await db.teardown();
  });

  describe('Base64 Overhead Analysis', () => {
    test('should calculate exact Base64 overhead for various sizes', () => {
      const testSizes = [
        { bytes: 1, expectedChars: 4, overhead: 300 },      // 1 → 4 (300%)
        { bytes: 2, expectedChars: 4, overhead: 100 },      // 2 → 4 (100%)
        { bytes: 3, expectedChars: 4, overhead: 33.33 },    // 3 → 4 (33%)
        { bytes: 6, expectedChars: 8, overhead: 33.33 },    // 6 → 8 (33%)
        { bytes: 9, expectedChars: 12, overhead: 33.33 },   // 9 → 12 (33%)
        { bytes: 100, expectedChars: 136, overhead: 36 },   // 100 → 136 (36%)
        { bytes: 128, expectedChars: 172, overhead: 34.38 }, // 128 → 172 (34.38%)
        { bytes: 1000, expectedChars: 1336, overhead: 33.6 }, // 1000 → 1336 (33.6%)
        { bytes: 1500, expectedChars: 2000, overhead: 33.33 }, // 1500 → 2000 (33.33%)
      ];

      const results = [];

      for (const { bytes, expectedChars, overhead } of testSizes) {
        const buffer = Buffer.alloc(bytes).fill(0xAA);
        const encoded = encodeBuffer(buffer);

        expect(encoded.length).toBe(expectedChars);

        const actualOverhead = ((encoded.length / bytes) - 1) * 100;
        results.push({
          bytes,
          encoded: encoded.length,
          overhead: actualOverhead.toFixed(2) + '%',
          bits: bytes * 8
        });
      }

      // Verify overhead converges to ~33.33% for larger sizes
      const largeBuffer = Buffer.alloc(10000);
      const largeEncoded = encodeBuffer(largeBuffer);
      const largeOverhead = ((largeEncoded.length / 10000) - 1) * 100;

      expect(largeOverhead).toBeGreaterThan(33);
      expect(largeOverhead).toBeLessThan(34);
    });

    test('should determine maximum usable binary in 2KB metadata', () => {
      // S3 metadata limit: 2048 bytes
      // But we need space for other fields (id, version, etc.)
      // Assume ~1800 bytes available for binary data

      const metadataLimit = 2048;
      const reservedForSystem = 200; // _v, _id, field names, etc.
      const availableForBinary = metadataLimit - reservedForSystem;

      // Base64: 4 chars per 3 bytes
      // Available chars / 4 * 3 = usable bytes
      const usableBinaryBytes = Math.floor(availableForBinary * 3 / 4);
      const usableBits = usableBinaryBytes * 8;

      expect(usableBinaryBytes).toBeGreaterThan(1300);
      expect(usableBinaryBytes).toBeLessThan(1400);
      expect(usableBits).toBeGreaterThan(10000);
      expect(usableBits).toBeLessThan(12000);

      // Report
      const report = {
        metadataLimit,
        reservedForSystem,
        availableForBinary,
        usableBinaryBytes,
        usableBits,
        usableKB: (usableBinaryBytes / 1024).toFixed(2)
      };

      expect(report.usableBits).toBeGreaterThan(10000);
    });
  });

  describe('Bitmap Storage Efficiency', () => {
    test('should store and retrieve bitmaps efficiently', async () => {
      const testCases = [
        { bits: 64, description: 'User permissions (64 flags)' },
        { bits: 256, description: 'Feature flags (256 toggles)' },
        { bits: 1024, description: 'Bloom filter (1K bits)' },
        { bits: 4096, description: 'Presence bitmap (4K users)' },
        { bits: 8192, description: 'Large bitmap (8K bits = 1KB)' },
      ];

      for (const { bits, description } of testCases) {
        const bitmap = createBitmap(bits);
        const bytes = Math.ceil(bits / 8);

        // Set some random bits
        const bitsToSet = [0, Math.floor(bits / 4), Math.floor(bits / 2), bits - 1];
        for (const bit of bitsToSet) {
          setBit(bitmap, bit);
        }

        const encoded = encodeBits(bitmap);
        const decoded = decodeBits(encoded);

        // Verify roundtrip
        for (const bit of bitsToSet) {
          expect(getBit(decoded, bit)).toBe(1);
        }
        expect(countBits(decoded)).toBe(bitsToSet.length);

        // Calculate efficiency
        const encodedSize = encoded.length;
        const overhead = ((encodedSize / bytes) - 1) * 100;

        // Base64 overhead varies: small buffers have more padding overhead
        // 8 bytes → 12 chars = 50% overhead
        // 128 bytes → 172 chars = 34% overhead
        expect(overhead).toBeLessThan(60); // Max 60% overhead for small buffers
      }
    });

    test('should fit realistic bitmap use cases in metadata', async () => {
      const useCases = [
        {
          name: 'User permissions',
          bits: 64,
          expectedEncodedSize: 12,
          fitsInMetadata: true
        },
        {
          name: 'Daily active users (30 days)',
          bits: 30,
          expectedEncodedSize: 8,
          fitsInMetadata: true
        },
        {
          name: 'Feature flags per tenant',
          bits: 256,
          expectedEncodedSize: 44,
          fitsInMetadata: true
        },
        {
          name: 'Bloom filter (1% FP rate, 1000 items)',
          bits: 9585, // ~1.2KB
          expectedEncodedSize: 1600,
          fitsInMetadata: true
        },
        {
          name: 'Bloom filter (1% FP rate, 10000 items)',
          bits: 95850, // ~12KB - TOO BIG
          expectedEncodedSize: 16000,
          fitsInMetadata: false
        }
      ];

      for (const { name, bits, expectedEncodedSize, fitsInMetadata } of useCases) {
        const bitmap = createBitmap(bits);
        const encoded = encodeBits(bitmap);

        // Allow 10% variance in expected size
        expect(encoded.length).toBeGreaterThan(expectedEncodedSize * 0.9);
        expect(encoded.length).toBeLessThan(expectedEncodedSize * 1.1);

        const actuallyFits = encoded.length < 1800; // Conservative limit
        expect(actuallyFits).toBe(fitsInMetadata);
      }
    });
  });

  describe('Real-world Storage Tests', () => {
    test('should store buffer in actual resource', async () => {
      const testData = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]);

      const record = await bufferResource.insert({
        name: 'test-buffer',
        data: testData
      });

      const retrieved = await bufferResource.get(record.id);

      expect(Buffer.isBuffer(retrieved.data)).toBe(true);
      expect(retrieved.data.equals(testData)).toBe(true);
    });

    test('should store bitmap in actual resource', async () => {
      const bitmap = createBitmap(8192);

      // Set specific bits
      setBit(bitmap, 0);
      setBit(bitmap, 100);
      setBit(bitmap, 1000);
      setBit(bitmap, 8191);

      const record = await bitsResource.insert({
        name: 'test-bitmap',
        flags: bitmap
      });

      const retrieved = await bitsResource.get(record.id);

      expect(Buffer.isBuffer(retrieved.flags)).toBe(true);
      expect(getBit(retrieved.flags, 0)).toBe(1);
      expect(getBit(retrieved.flags, 100)).toBe(1);
      expect(getBit(retrieved.flags, 1000)).toBe(1);
      expect(getBit(retrieved.flags, 8191)).toBe(1);
      expect(getBit(retrieved.flags, 500)).toBe(0);
      expect(countBits(retrieved.flags)).toBe(4);
    });

    test('should handle maximum safe bitmap size', async () => {
      // Max safe size: ~1400 bytes = ~11200 bits
      // Using 8192 bits = 1024 bytes to be safe
      const bitmap = createBitmap(8192);

      // Fill with pattern
      for (let i = 0; i < 8192; i += 7) {
        setBit(bitmap, i);
      }

      const record = await bitsResource.insert({
        name: 'max-bitmap',
        flags: bitmap
      });

      const retrieved = await bitsResource.get(record.id);

      // Verify pattern preserved
      for (let i = 0; i < 8192; i += 7) {
        expect(getBit(retrieved.flags, i)).toBe(1);
      }
    });
  });

  describe('Performance Benchmarks', () => {
    test('should encode/decode 1MB buffer quickly', () => {
      const buffer = Buffer.alloc(1024 * 1024).fill(0xAA);

      const encodeStart = performance.now();
      const encoded = encodeBuffer(buffer);
      const encodeTime = performance.now() - encodeStart;

      const decodeStart = performance.now();
      const decoded = decodeBuffer(encoded);
      const decodeTime = performance.now() - decodeStart;

      expect(encodeTime).toBeLessThan(500); // < 500ms (relaxed for CI)
      expect(decodeTime).toBeLessThan(500); // < 500ms (relaxed for CI)
      expect(decoded.equals(buffer)).toBe(true);
    });

    test('should handle 100K bit operations quickly', () => {
      const bitmap = createBitmap(100000);

      const start = performance.now();

      // Set all bits
      for (let i = 0; i < 100000; i++) {
        setBit(bitmap, i);
      }

      const setTime = performance.now() - start;

      // Count bits
      const countStart = performance.now();
      const count = countBits(bitmap);
      const countTime = performance.now() - countStart;

      expect(setTime).toBeLessThan(1000); // < 1000ms for 100K sets (relaxed)
      expect(countTime).toBeLessThan(500); // < 500ms for count (relaxed)
      expect(count).toBe(100000);
    });

    test('should measure encode/decode throughput', () => {
      const sizes = [100, 1000, 10000, 100000];
      const results = [];

      for (const size of sizes) {
        const buffer = Buffer.alloc(size).fill(0x55);

        const iterations = Math.min(1000, Math.floor(100000 / size));

        const encodeStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          encodeBuffer(buffer);
        }
        const encodeTime = performance.now() - encodeStart;

        const encoded = encodeBuffer(buffer);

        const decodeStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          decodeBuffer(encoded);
        }
        const decodeTime = performance.now() - decodeStart;

        const encodeThroughput = (size * iterations) / (encodeTime / 1000) / (1024 * 1024);
        const decodeThroughput = (size * iterations) / (decodeTime / 1000) / (1024 * 1024);

        results.push({
          size,
          iterations,
          encodeMBps: encodeThroughput.toFixed(2),
          decodeMBps: decodeThroughput.toFixed(2)
        });
      }

      // Verify reasonable throughput (> 1 MB/s for small buffers in CI environment)
      expect(parseFloat(results[0].encodeMBps)).toBeGreaterThan(1);
    });
  });

  describe('Space Efficiency Summary', () => {
    test('should generate efficiency report', () => {
      const report = {
        metadataLimit: 2048,
        base64Overhead: '33.33%',
        maxUsableBinary: '~1.5KB',
        maxUsableBits: '~12,000 bits',
        recommendations: []
      };

      // Use cases and recommendations
      const useCases = [
        { name: 'User permissions', bits: 64, fits: true },
        { name: 'Feature flags (256)', bits: 256, fits: true },
        { name: 'Daily presence (365 days)', bits: 365, fits: true },
        { name: 'Hourly presence (1 year)', bits: 8760, fits: true },
        { name: 'Bloom filter (1K items, 1% FP)', bits: 9585, fits: true },
        { name: 'Bloom filter (5K items, 1% FP)', bits: 47926, fits: false },
        { name: 'Large bitmap (>2KB)', bits: 20000, fits: false },
      ];

      for (const { name, bits, fits } of useCases) {
        const bytes = Math.ceil(bits / 8);
        const encoded = Math.ceil(bytes / 3) * 4;
        const actuallyFits = encoded < 1800;

        expect(actuallyFits).toBe(fits);

        report.recommendations.push({
          useCase: name,
          bits,
          encodedSize: encoded,
          fitsInMetadata: actuallyFits,
          recommendation: actuallyFits ? 'Use buffer/bits type' : 'Use body-only behavior'
        });
      }

      // Verify report structure
      expect(report.recommendations.length).toBe(7);
      expect(report.recommendations.filter(r => r.fitsInMetadata).length).toBe(5);
    });

    test('should compare encoding efficiency', () => {
      const comparisons = [];
      const sizes = [10, 50, 100, 500, 1000];

      for (const size of sizes) {
        const buffer = Buffer.alloc(size);

        // Base64 (what we use)
        const base64 = buffer.toString('base64');

        // Hex (alternative)
        const hex = buffer.toString('hex');

        // Raw string length if stored as JSON array (worst case)
        const jsonArray = JSON.stringify(Array.from(buffer));

        comparisons.push({
          originalBytes: size,
          base64Chars: base64.length,
          hexChars: hex.length,
          jsonArrayChars: jsonArray.length,
          base64Overhead: ((base64.length / size - 1) * 100).toFixed(1) + '%',
          hexOverhead: ((hex.length / size - 1) * 100).toFixed(1) + '%',
          jsonOverhead: ((jsonArray.length / size - 1) * 100).toFixed(1) + '%',
          base64Wins: base64.length < hex.length && base64.length < jsonArray.length
        });
      }

      // Base64 should always win
      for (const c of comparisons) {
        expect(c.base64Wins).toBe(true);
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty buffer', async () => {
      const record = await bufferResource.insert({
        name: 'empty-buffer',
        data: Buffer.alloc(0)
      });

      const retrieved = await bufferResource.get(record.id);
      expect(retrieved.data.length).toBe(0);
    });

    test('should handle all-zeros bitmap', async () => {
      const bitmap = createBitmap(8192); // Match bitsResource size

      const record = await bitsResource.insert({
        name: 'zeros-bitmap',
        flags: bitmap
      });

      const retrieved = await bitsResource.get(record.id);
      expect(Buffer.isBuffer(retrieved.flags)).toBe(true);
      expect(countBits(retrieved.flags)).toBe(0);
    });

    test('should handle all-ones bitmap', async () => {
      const bitmap = Buffer.alloc(128).fill(0xFF); // 1024 bits, all set

      const encoded = encodeBits(bitmap, 1024);
      const decoded = decodeBits(encoded, 1024);

      expect(countBits(decoded)).toBe(1024);
    });

    test('should handle alternating pattern', async () => {
      const bitmap = Buffer.alloc(128).fill(0b10101010); // 1024 bits, alternating

      const encoded = encodeBits(bitmap, 1024);
      const decoded = decodeBits(encoded, 1024);

      expect(countBits(decoded)).toBe(512); // Half the bits set
    });
  });
});
