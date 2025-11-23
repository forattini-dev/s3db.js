/**
 * Bits Performance Benchmark
 *
 * Compares s3db.js bits implementation with manual implementations
 * to ensure we're not introducing performance regressions.
 *
 * Key operations benchmarked:
 * - createBitmap / Buffer.alloc
 * - setBit / manual bitwise
 * - getBit / manual bitwise
 * - encodeBits / Buffer.toString('base64')
 * - decodeBits / Buffer.from(str, 'base64')
 * - ID ↔ binary string conversion
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  encodeBuffer,
  decodeBuffer,
  encodeBits,
  decodeBits,
  createBitmap,
  setBit,
  getBit,
  clearBit,
  toggleBit,
  countBits,
  // Fast variants (no validation)
  createBitmapFast,
  setBitFast,
  getBitFast,
  clearBitFast,
  toggleBitFast,
  countBitsFast,
  encodeBitsFast,
  decodeBitsFast,
} from '../../src/concerns/binary.js';

// Simulate favicon-fingerprint.js manual implementation
const manualImplementation = {
  /**
   * Manual binary string to buffer (like favicon-fingerprint binaryToHex)
   */
  binaryStringToBuffer(binaryStr) {
    const bytes = Math.ceil(binaryStr.length / 8);
    const buffer = Buffer.alloc(bytes);
    for (let i = 0; i < binaryStr.length; i++) {
      if (binaryStr[i] === '1') {
        const byteIndex = Math.floor(i / 8);
        const bitIndex = 7 - (i % 8); // MSB first
        buffer[byteIndex] |= (1 << bitIndex);
      }
    }
    return buffer;
  },

  /**
   * Manual buffer to binary string
   */
  bufferToBinaryString(buffer, bits) {
    let result = '';
    for (let i = 0; i < bits; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = 7 - (i % 8); // MSB first
      const bit = (buffer[byteIndex] >> bitIndex) & 1;
      result += bit;
    }
    return result;
  },

  /**
   * Manual setBit (MSB-first like favicon implementation)
   */
  setBitMSB(buffer, index) {
    const byteIndex = Math.floor(index / 8);
    const bitIndex = 7 - (index % 8);
    buffer[byteIndex] |= (1 << bitIndex);
    return buffer;
  },

  /**
   * Manual getBit (MSB-first)
   */
  getBitMSB(buffer, index) {
    const byteIndex = Math.floor(index / 8);
    const bitIndex = 7 - (index % 8);
    return (buffer[byteIndex] >> bitIndex) & 1;
  },
};

describe('Bits Performance Benchmarks', () => {
  const WARMUP_ITERATIONS = 100;
  const BENCHMARK_ITERATIONS = 10000;
  const BITS_SIZES = [12, 32, 64, 128, 256, 1024];

  // Helper to run benchmark
  function benchmark(name, fn, iterations = BENCHMARK_ITERATIONS) {
    // Warmup
    for (let i = 0; i < WARMUP_ITERATIONS; i++) {
      fn();
    }

    // Benchmark
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const elapsed = performance.now() - start;

    return {
      name,
      iterations,
      totalMs: elapsed,
      avgNs: (elapsed / iterations) * 1_000_000,
      opsPerSec: Math.round(iterations / (elapsed / 1000)),
    };
  }

  describe('createBitmap vs Buffer.alloc', () => {
    test('should benchmark bitmap creation (safe vs fast vs direct)', () => {
      const results = [];

      for (const bits of BITS_SIZES) {
        const bytes = Math.ceil(bits / 8);

        // s3db createBitmap (safe, with validation)
        const safeResult = benchmark(
          `createBitmap(${bits})`,
          () => createBitmap(bits)
        );

        // s3db createBitmapFast (no validation)
        const fastResult = benchmark(
          `createBitmapFast(${bits})`,
          () => createBitmapFast(bits)
        );

        // Direct Buffer.alloc
        const directResult = benchmark(
          `Buffer.alloc(${bytes})`,
          () => Buffer.alloc(bytes)
        );

        results.push({
          bits,
          safe: safeResult.avgNs.toFixed(1),
          fast: fastResult.avgNs.toFixed(1),
          direct: directResult.avgNs.toFixed(1),
          safeOverhead: ((safeResult.avgNs / directResult.avgNs - 1) * 100).toFixed(1) + '%',
          fastOverhead: ((fastResult.avgNs / directResult.avgNs - 1) * 100).toFixed(1) + '%',
        });

        // Fast version should be within 5x of direct (CI environment variation)
        expect(fastResult.avgNs).toBeLessThan(directResult.avgNs * 5);
      }

      console.log('\n📊 createBitmap Performance (safe vs fast vs direct):');
      console.table(results);
    });
  });

  describe('setBit/getBit operations', () => {
    test('should benchmark bit operations (safe vs fast)', () => {
      const results = [];

      for (const bits of BITS_SIZES) {
        const bitmap = createBitmap(bits);
        const fastBitmap = createBitmapFast(bits);
        const manualBitmap = Buffer.alloc(Math.ceil(bits / 8));
        const testIndex = Math.floor(bits / 2);

        // s3db setBit (safe, with bounds check)
        const safeSetResult = benchmark(
          `setBit(${bits})`,
          () => setBit(bitmap, testIndex)
        );

        // s3db setBitFast (no bounds check)
        const fastSetResult = benchmark(
          `setBitFast(${bits})`,
          () => setBitFast(fastBitmap, testIndex)
        );

        // Manual setBit (MSB-first, like favicon)
        const manualSetResult = benchmark(
          `manual setBit(${bits})`,
          () => manualImplementation.setBitMSB(manualBitmap, testIndex)
        );

        // s3db getBit (safe)
        const safeGetResult = benchmark(
          `getBit(${bits})`,
          () => getBit(bitmap, testIndex)
        );

        // s3db getBitFast (no bounds check)
        const fastGetResult = benchmark(
          `getBitFast(${bits})`,
          () => getBitFast(fastBitmap, testIndex)
        );

        // Manual getBit
        const manualGetResult = benchmark(
          `manual getBit(${bits})`,
          () => manualImplementation.getBitMSB(manualBitmap, testIndex)
        );

        results.push({
          bits,
          safeSetNs: safeSetResult.avgNs.toFixed(1),
          fastSetNs: fastSetResult.avgNs.toFixed(1),
          manualSetNs: manualSetResult.avgNs.toFixed(1),
          safeGetNs: safeGetResult.avgNs.toFixed(1),
          fastGetNs: fastGetResult.avgNs.toFixed(1),
          manualGetNs: manualGetResult.avgNs.toFixed(1),
        });

        // Fast versions should be within 1.5x of manual
        expect(fastSetResult.avgNs).toBeLessThan(manualSetResult.avgNs * 1.5);
        expect(fastGetResult.avgNs).toBeLessThan(manualGetResult.avgNs * 1.5);
      }

      console.log('\n📊 setBit/getBit Performance (safe vs fast vs manual):');
      console.table(results);
    });
  });

  describe('encodeBits/decodeBits', () => {
    test('should benchmark encoding operations (safe vs fast)', () => {
      const results = [];

      for (const bits of BITS_SIZES) {
        const bitmap = createBitmap(bits);
        // Set some bits for realistic encoding
        for (let i = 0; i < bits; i += 3) {
          setBit(bitmap, i);
        }

        // s3db encodeBits (safe, with validation)
        const safeEncodeResult = benchmark(
          `encodeBits(${bits})`,
          () => encodeBits(bitmap, bits)
        );

        // s3db encodeBitsFast (no validation)
        const fastEncodeResult = benchmark(
          `encodeBitsFast(${bits})`,
          () => encodeBitsFast(bitmap)
        );

        // Direct Base64
        const directEncodeResult = benchmark(
          `toString('base64')`,
          () => bitmap.toString('base64')
        );

        const encoded = encodeBits(bitmap, bits);

        // s3db decodeBits (safe)
        const safeDecodeResult = benchmark(
          `decodeBits(${bits})`,
          () => decodeBits(encoded, bits)
        );

        // s3db decodeBitsFast (no validation)
        const fastDecodeResult = benchmark(
          `decodeBitsFast(${bits})`,
          () => decodeBitsFast(encoded)
        );

        // Direct Base64 decode
        const directDecodeResult = benchmark(
          `Buffer.from(base64)`,
          () => Buffer.from(encoded, 'base64')
        );

        results.push({
          bits,
          safeEnc: safeEncodeResult.avgNs.toFixed(1),
          fastEnc: fastEncodeResult.avgNs.toFixed(1),
          directEnc: directEncodeResult.avgNs.toFixed(1),
          safeDec: safeDecodeResult.avgNs.toFixed(1),
          fastDec: fastDecodeResult.avgNs.toFixed(1),
          directDec: directDecodeResult.avgNs.toFixed(1),
        });

        // Fast versions should be within 5x of direct (CI environment variation)
        expect(fastEncodeResult.avgNs).toBeLessThan(directEncodeResult.avgNs * 5);
        expect(fastDecodeResult.avgNs).toBeLessThan(directDecodeResult.avgNs * 5);
      }

      console.log('\n📊 encodeBits/decodeBits Performance (safe vs fast vs direct):');
      console.table(results);
    });
  });

  describe('countBits popcount', () => {
    test('should benchmark countBits vs countBitsFast (lookup table)', () => {
      const results = [];

      for (const bits of [64, 256, 1024, 8192]) {
        const bitmap = createBitmap(bits);
        // Set ~50% of bits
        for (let i = 0; i < bits; i += 2) {
          setBit(bitmap, i);
        }

        // countBits (original, bit-by-bit)
        const safeResult = benchmark(
          `countBits(${bits})`,
          () => countBits(bitmap),
          1000
        );

        // countBitsFast (lookup table)
        const fastResult = benchmark(
          `countBitsFast(${bits})`,
          () => countBitsFast(bitmap),
          1000
        );

        results.push({
          bits,
          safeNs: safeResult.avgNs.toFixed(1),
          fastNs: fastResult.avgNs.toFixed(1),
          speedup: (safeResult.avgNs / fastResult.avgNs).toFixed(2) + 'x',
          fastOpsPerSec: fastResult.opsPerSec,
        });

        // Fast should be roughly faster or comparable (relaxed for CI)
        expect(fastResult.avgNs).toBeLessThan(safeResult.avgNs * 3);
      }

      console.log('\n📊 countBits vs countBitsFast Performance:');
      console.table(results);
    });
  });

  describe('Real-world favicon supercookie simulation', () => {
    test('should benchmark full ID lifecycle', () => {
      const BITS = 32; // Realistic favicon bits
      const iterations = 10000;
      const results = [];

      // Scenario 1: Generate new ID → encode → store
      const writeFlowResult = benchmark('Write flow', () => {
        // Generate random ID (like favicon supercookie)
        const id = Math.floor(Math.random() * (2 ** BITS));
        const binaryStr = id.toString(2).padStart(BITS, '0');

        // Convert to bitmap using s3db
        const bitmap = createBitmap(BITS);
        for (let i = 0; i < binaryStr.length; i++) {
          if (binaryStr[i] === '1') {
            setBit(bitmap, i);
          }
        }

        // Encode for storage
        return encodeBits(bitmap, BITS);
      }, iterations);

      // Scenario 2: Read encoded → decode → get ID
      const testBitmap = createBitmap(BITS);
      setBit(testBitmap, 0);
      setBit(testBitmap, 5);
      setBit(testBitmap, 15);
      setBit(testBitmap, 31);
      const encoded = encodeBits(testBitmap, BITS);

      const readFlowResult = benchmark('Read flow', () => {
        // Decode from storage
        const bitmap = decodeBits(encoded, BITS);

        // Convert back to ID
        let id = 0;
        for (let i = 0; i < BITS; i++) {
          if (getBit(bitmap, i) === 1) {
            id |= (1 << (BITS - 1 - i));
          }
        }
        return id;
      }, iterations);

      // Scenario 3: Check specific bits (like checking cached routes)
      const checkBitsResult = benchmark('Check bits', () => {
        const bitmap = decodeBits(encoded, BITS);
        let vector = [];
        for (let i = 0; i < BITS; i++) {
          if (getBit(bitmap, i) === 1) {
            vector.push(i);
          }
        }
        return vector;
      }, iterations);

      results.push(
        { operation: 'Write flow (generate → encode)', ...writeFlowResult },
        { operation: 'Read flow (decode → extract)', ...readFlowResult },
        { operation: 'Check bits (get vector)', ...checkBitsResult },
      );

      console.log('\n📊 Favicon Supercookie Simulation (32 bits):');
      console.table(results.map(r => ({
        operation: r.operation,
        avgUs: (r.avgNs / 1000).toFixed(2),
        opsPerSec: r.opsPerSec,
      })));

      // Performance requirements for favicon supercookie:
      // - Write flow should be < 10μs (10,000ns)
      // - Read flow should be < 5μs (5,000ns)
      // - Check bits should be < 3μs (3,000ns)
      expect(writeFlowResult.avgNs).toBeLessThan(100_000); // 100μs max (relaxed for CI)
      expect(readFlowResult.avgNs).toBeLessThan(100_000);  // 100μs max (relaxed for CI)
      expect(checkBitsResult.avgNs).toBeLessThan(100_000); // 100μs max (relaxed for CI)
    });

    test('should compare s3db vs manual favicon implementation', () => {
      const BITS = 32;
      const iterations = 10000;

      // s3db implementation
      const s3dbResult = benchmark('s3db bits', () => {
        const bitmap = createBitmap(BITS);
        const id = Math.floor(Math.random() * (2 ** BITS));

        // Set bits based on ID
        for (let i = 0; i < BITS; i++) {
          if ((id >> (BITS - 1 - i)) & 1) {
            setBit(bitmap, i);
          }
        }

        const encoded = encodeBits(bitmap, BITS);
        const decoded = decodeBits(encoded, BITS);

        // Extract ID back
        let result = 0;
        for (let i = 0; i < BITS; i++) {
          if (getBit(decoded, i) === 1) {
            result |= (1 << (BITS - 1 - i));
          }
        }
        return result;
      }, iterations);

      // Manual implementation (like favicon-fingerprint.js)
      const manualResult = benchmark('manual bits', () => {
        const id = Math.floor(Math.random() * (2 ** BITS));
        const binaryStr = id.toString(2).padStart(BITS, '0');

        // Manual buffer creation and bit setting
        const buffer = Buffer.alloc(Math.ceil(BITS / 8));
        for (let i = 0; i < binaryStr.length; i++) {
          if (binaryStr[i] === '1') {
            manualImplementation.setBitMSB(buffer, i);
          }
        }

        // Manual encode/decode
        const encoded = buffer.toString('base64');
        const decoded = Buffer.from(encoded, 'base64');

        // Extract ID back
        let result = 0;
        for (let i = 0; i < BITS; i++) {
          if (manualImplementation.getBitMSB(decoded, i) === 1) {
            result |= (1 << (BITS - 1 - i));
          }
        }
        return result;
      }, iterations);

      console.log('\n📊 s3db vs Manual Implementation:');
      console.log(`  s3db:   ${(s3dbResult.avgNs / 1000).toFixed(2)}μs/op (${s3dbResult.opsPerSec.toLocaleString()} ops/sec)`);
      console.log(`  manual: ${(manualResult.avgNs / 1000).toFixed(2)}μs/op (${manualResult.opsPerSec.toLocaleString()} ops/sec)`);
      console.log(`  overhead: ${((s3dbResult.avgNs / manualResult.avgNs - 1) * 100).toFixed(1)}%`);

      // s3db should be within 2x of manual implementation
      // (validation and bounds checking add some overhead, but should be minimal)
      const overhead = s3dbResult.avgNs / manualResult.avgNs;
      expect(overhead).toBeLessThan(2.0);
    });
  });

  describe('Memory efficiency', () => {
    test('should verify memory usage is optimal', () => {
      const BITS = 1024;
      const bitmap = createBitmap(BITS);

      // Expected: exactly ceil(1024/8) = 128 bytes
      expect(bitmap.length).toBe(128);
      expect(bitmap.byteLength).toBe(128);

      // Encoded should be ~172 chars (128 * 4/3)
      const encoded = encodeBits(bitmap, BITS);
      expect(encoded.length).toBe(Math.ceil(128 / 3) * 4);

      console.log('\n📊 Memory Efficiency (1024 bits):');
      console.log(`  Raw bits: 1024 bits`);
      console.log(`  Buffer size: ${bitmap.length} bytes`);
      console.log(`  Encoded size: ${encoded.length} chars`);
      console.log(`  Overhead: ${((encoded.length / 128 - 1) * 100).toFixed(1)}%`);
    });

    test('should verify no memory leaks in repeated operations', () => {
      const ITERATIONS = 100000;
      const BITS = 32;

      // Force GC if available
      if (global.gc) {
        global.gc();
      }

      const memBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < ITERATIONS; i++) {
        const bitmap = createBitmap(BITS);
        setBit(bitmap, i % BITS);
        const encoded = encodeBits(bitmap, BITS);
        decodeBits(encoded, BITS);
      }

      // Force GC if available
      if (global.gc) {
        global.gc();
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memDiff = memAfter - memBefore;

      console.log('\n📊 Memory Usage (100K iterations):');
      console.log(`  Before: ${(memBefore / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  After: ${(memAfter / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Diff: ${(memDiff / 1024 / 1024).toFixed(2)} MB`);

      // Memory increase should be minimal (< 50MB for 100K ops)
      // This is a sanity check, not a strict requirement
      expect(Math.abs(memDiff)).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Edge case performance', () => {
    test('should handle boundary bits efficiently', () => {
      const BITS = 32;
      const bitmap = createBitmap(BITS);

      // Benchmark operations on boundary bits
      const boundaryBits = [0, 7, 8, 15, 16, 23, 24, 31];

      const results = boundaryBits.map(index => {
        const setResult = benchmark(
          `setBit(${index})`,
          () => setBit(bitmap, index),
          10000
        );
        const getResult = benchmark(
          `getBit(${index})`,
          () => getBit(bitmap, index),
          10000
        );

        return {
          bit: index,
          byteIndex: Math.floor(index / 8),
          bitIndex: index % 8,
          setNs: setResult.avgNs.toFixed(1),
          getNs: getResult.avgNs.toFixed(1),
        };
      });

      console.log('\n📊 Boundary Bit Performance:');
      console.table(results);

      // All boundary operations should have similar performance
      const setTimes = results.map(r => parseFloat(r.setNs));
      const getTimes = results.map(r => parseFloat(r.getNs));

      const setVariance = Math.max(...setTimes) / Math.min(...setTimes);
      const getVariance = Math.max(...getTimes) / Math.min(...getTimes);

      // Variance should be < 5x between any two boundary bits (relaxed for CI)
      expect(setVariance).toBeLessThan(5);
      expect(getVariance).toBeLessThan(5);
    });
  });
});
