import { describe, test, expect } from '@jest/globals';
import { encodeDecimal, decodeDecimal, encodeFixedPoint, decodeFixedPoint, encodeFixedPointBatch, decodeFixedPointBatch } from '../../src/concerns/base62.js';

/**
 * Tests and analysis for embedding value encoding
 *
 * Embedding values are typically normalized to [-1, 1] range
 * Current implementation: 0.123456 → "0.123456" (no compression of decimals)
 *
 * This file explores potential optimizations for this common case.
 */

describe('Base62 Decimal Encoding - Embedding Analysis', () => {
  describe('Current Implementation Analysis', () => {
    test('should show how current encoding handles typical embedding values', () => {
      const testCases = [
        { value: 0.5, label: 'simple half' },
        { value: 0.123456789, label: 'many decimals' },
        { value: -0.8234567, label: 'negative with decimals' },
        { value: 0.0001, label: 'very small positive' },
        { value: -0.9999, label: 'near -1' },
        { value: 0, label: 'zero' },
        { value: 1, label: 'max positive' },
        { value: -1, label: 'max negative' }
      ];

      console.log('\n=== Current Encoding Size Analysis ===');
      testCases.forEach(({ value, label }) => {
        const encoded = encodeDecimal(value);
        const decoded = decodeDecimal(encoded);
        const originalBytes = value.toString().length;
        const encodedBytes = encoded.length;
        const compression = ((1 - encodedBytes / originalBytes) * 100).toFixed(1);

        console.log(`${label.padEnd(25)} | ${value.toString().padEnd(12)} → "${encoded.padEnd(12)}" | ${originalBytes}→${encodedBytes} bytes (${compression}% compression)`);

        expect(decoded).toBeCloseTo(value, 10);
      });
    });

    test('should measure size of 1536-dim embedding with current encoding', () => {
      // Typical embedding: values between -1 and 1
      const embedding = Array.from({ length: 1536 }, () =>
        (Math.random() * 2 - 1) * 0.9 // -0.9 to 0.9
      );

      const encoded = embedding.map(v => encodeDecimal(v));
      const totalBytes = encoded.reduce((sum, s) => sum + s.length, 0);
      const avgBytesPerValue = totalBytes / 1536;

      console.log(`\n=== 1536-dim Embedding Current Encoding ===`);
      console.log(`Total bytes: ${totalBytes}`);
      console.log(`Avg bytes per value: ${avgBytesPerValue.toFixed(2)}`);
      console.log(`First 10 encoded: ${encoded.slice(0, 10).join(', ')}`);

      expect(totalBytes).toBeGreaterThan(0);
    });
  });

  describe('Potential Optimization: Fixed-Point Encoding', () => {
    /**
     * For values in [-1, 1], we could use fixed-point representation:
     * - Scale value by 10^precision (e.g., 1000000 for 6 decimals)
     * - Encode as base62 integer
     * - Decode by dividing back
     *
     * Example: 0.123456 → 123456 → "w7e" (3 bytes vs 8 bytes)
     */

    const PRECISION = 1000000; // 6 decimal places

    const encodeFixedPoint = (n) => {
      if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return 'undefined';
      if (n < -1 || n > 1) return encodeDecimal(n); // Fall back for out of range

      const scaled = Math.round(n * PRECISION);
      const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const base = 62;

      if (scaled === 0) return '0';

      const negative = scaled < 0;
      let num = Math.abs(scaled);
      let s = '';

      while (num > 0) {
        s = alphabet[num % base] + s;
        num = Math.floor(num / base);
      }

      return negative ? '-' + s : s;
    };

    const decodeFixedPoint = (s) => {
      if (typeof s !== 'string') return NaN;
      if (s === '0') return 0;

      const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const charToValue = Object.fromEntries([...alphabet].map((c, i) => [c, i]));
      const base = 62;

      let negative = false;
      if (s[0] === '-') {
        negative = true;
        s = s.slice(1);
      }

      let r = 0;
      for (let i = 0; i < s.length; i++) {
        const idx = charToValue[s[i]];
        if (idx === undefined) return NaN;
        r = r * base + idx;
      }

      const scaled = negative ? -r : r;
      return scaled / PRECISION;
    };

    test('should show compression gains with fixed-point encoding', () => {
      const testCases = [
        0.5,
        0.123456789,
        -0.8234567,
        0.0001,
        -0.9999,
        0,
        0.123456
      ];

      console.log('\n=== Fixed-Point Encoding Comparison ===');
      testCases.forEach(value => {
        const currentEncoded = encodeDecimal(value);
        const fixedPointEncoded = encodeFixedPoint(value);
        const decoded = decodeFixedPoint(fixedPointEncoded);

        const currentBytes = currentEncoded.length;
        const fixedBytes = fixedPointEncoded.length;
        const savings = currentBytes - fixedBytes;
        const savingsPercent = ((savings / currentBytes) * 100).toFixed(1);

        console.log(`${value.toString().padEnd(12)} | Current: "${currentEncoded.padEnd(10)}" (${currentBytes}) | Fixed: "${fixedPointEncoded.padEnd(6)}" (${fixedBytes}) | Saves ${savings} bytes (${savingsPercent}%)`);

        expect(decoded).toBeCloseTo(value, 5); // 6 decimal precision
      });
    });

    test('should measure 1536-dim embedding size with fixed-point encoding', () => {
      const embedding = Array.from({ length: 1536 }, () =>
        (Math.random() * 2 - 1) * 0.9
      );

      const currentEncoded = embedding.map(v => encodeDecimal(v));
      const currentBytes = currentEncoded.reduce((sum, s) => sum + s.length, 0);

      const fixedEncoded = embedding.map(v => encodeFixedPoint(v));
      const fixedBytes = fixedEncoded.reduce((sum, s) => sum + s.length, 0);

      const savings = currentBytes - fixedBytes;
      const savingsPercent = ((savings / currentBytes) * 100).toFixed(1);

      console.log(`\n=== 1536-dim Embedding Fixed-Point Encoding ===`);
      console.log(`Current encoding: ${currentBytes} bytes`);
      console.log(`Fixed-point encoding: ${fixedBytes} bytes`);
      console.log(`Savings: ${savings} bytes (${savingsPercent}%)`);
      console.log(`Avg bytes per value: ${(fixedBytes / 1536).toFixed(2)}`);

      // Verify accuracy
      const decoded = fixedEncoded.map(s => decodeFixedPoint(s));
      embedding.forEach((original, i) => {
        expect(decoded[i]).toBeCloseTo(original, 5);
      });

      expect(fixedBytes).toBeLessThan(currentBytes);
    });
  });

  describe('Alternative: Scientific Notation Encoding', () => {
    /**
     * Another approach: Store as mantissa + exponent
     * 0.123456 → mantissa=123456, exponent=-6
     * Could be even more compact for very small values
     */

    test('should explore scientific notation approach', () => {
      const value = 0.000123;
      const str = value.toExponential(); // "1.23e-4"

      console.log(`\n=== Scientific Notation Exploration ===`);
      console.log(`Value: ${value}`);
      console.log(`Exponential: ${str}`);
      console.log(`Could encode mantissa and exponent separately in base62`);

      // This is more complex and may not save as much for typical embeddings
      // which are usually in [-1, 1] range with similar magnitudes
    });
  });

  describe('Recommendation', () => {
    test('should provide size analysis for different array sizes', () => {
      const sizes = [256, 512, 768, 1024, 1536, 2048, 3072];

      console.log(`\n=== Embedding Size Analysis with Fixed-Point Encoding ===`);
      console.log('Dimension | Current (bytes) | Fixed-Point (bytes) | Savings (bytes) | Savings (%)');
      console.log('----------|-----------------|---------------------|-----------------|------------');

      sizes.forEach(dim => {
        const embedding = Array.from({ dim }, () => (Math.random() * 2 - 1) * 0.9);

        const currentEncoded = embedding.map(v => encodeDecimal(v));
        const currentBytes = currentEncoded.reduce((sum, s) => sum + s.length, 0);

        const fixedEncoded = embedding.map(v => {
          const scaled = Math.round(v * 1000000);
          const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
          if (scaled === 0) return '0';
          const negative = scaled < 0;
          let num = Math.abs(scaled);
          let s = '';
          while (num > 0) {
            s = alphabet[num % 62] + s;
            num = Math.floor(num / 62);
          }
          return negative ? '-' + s : s;
        });
        const fixedBytes = fixedEncoded.reduce((sum, s) => sum + s.length, 0);

        const savings = currentBytes - fixedBytes;
        const savingsPercent = ((savings / currentBytes) * 100).toFixed(1);

        console.log(`${dim.toString().padStart(9)} | ${currentBytes.toString().padStart(15)} | ${fixedBytes.toString().padStart(19)} | ${savings.toString().padStart(15)} | ${savingsPercent.padStart(10)}%`);
      });
    });
  });

  describe('Batch Encoding (NEW - 17% additional compression)', () => {
    test('should encode/decode arrays with batch format', () => {
      const values = [0.123456, -0.456789, 0.789012, 0, -0.999999];
      const encoded = encodeFixedPointBatch(values, 6);
      const decoded = decodeFixedPointBatch(encoded, 6);

      console.log(`\n=== Batch Encoding Test ===`);
      console.log(`Original: [${values.join(', ')}]`);
      console.log(`Encoded: ${encoded}`);
      console.log(`Decoded: [${decoded.join(', ')}]`);

      expect(encoded).toMatch(/^\^\[.*\]$/); // Format: ^[...]
      expect(decoded.length).toBe(values.length);

      values.forEach((orig, i) => {
        expect(decoded[i]).toBeCloseTo(orig, 5);
      });
    });

    test('should handle empty arrays', () => {
      const encoded = encodeFixedPointBatch([], 6);
      const decoded = decodeFixedPointBatch(encoded, 6);

      expect(encoded).toBe('^[]');
      expect(decoded).toEqual([]);
    });

    test('should compare batch vs individual encoding size', () => {
      const embedding = Array.from({ length: 1536 }, () =>
        (Math.random() * 2 - 1) * 0.9
      );

      // Individual encoding (old way)
      const individualEncoded = embedding.map(v => encodeFixedPoint(v, 6));
      const individualSize = individualEncoded.join(',').length;

      // Batch encoding (new way)
      const batchEncoded = encodeFixedPointBatch(embedding, 6);
      const batchSize = batchEncoded.length;

      const savings = individualSize - batchSize;
      const savingsPercent = ((savings / individualSize) * 100).toFixed(1);

      console.log(`\n=== Batch vs Individual (1536-dim) ===`);
      console.log(`Individual encoding: ${individualSize} bytes`);
      console.log(`Batch encoding:      ${batchSize} bytes`);
      console.log(`Savings:             ${savings} bytes (${savingsPercent}%)`);

      expect(batchSize).toBeLessThan(individualSize);
      expect(parseFloat(savingsPercent)).toBeGreaterThan(15); // At least 15% savings
    });

    test('should verify batch encoding round-trip accuracy', () => {
      const values = Array.from({ length: 100 }, () =>
        (Math.random() * 2 - 1)
      );

      const encoded = encodeFixedPointBatch(values, 6);
      const decoded = decodeFixedPointBatch(encoded, 6);

      expect(decoded.length).toBe(values.length);

      values.forEach((orig, i) => {
        expect(decoded[i]).toBeCloseTo(orig, 5);
      });
    });

    test('should measure compression across different dimensions', () => {
      const dimensions = [256, 512, 768, 1024, 1536, 2048, 3072];

      console.log(`\n=== Batch Encoding Savings by Dimension ===`);
      console.log('Dimension | Individual (bytes) | Batch (bytes) | Savings (bytes) | Savings (%)');
      console.log('----------|-------------------|---------------|-----------------|------------');

      dimensions.forEach(dim => {
        const embedding = Array.from({ length: dim }, () =>
          (Math.random() * 2 - 1) * 0.9
        );

        const individualSize = embedding.map(v => encodeFixedPoint(v, 6)).join(',').length;
        const batchSize = encodeFixedPointBatch(embedding, 6).length;
        const savings = individualSize - batchSize;
        const savingsPercent = ((savings / individualSize) * 100).toFixed(1);

        console.log(`${dim.toString().padStart(9)} | ${individualSize.toString().padStart(17)} | ${batchSize.toString().padStart(13)} | ${savings.toString().padStart(15)} | ${savingsPercent.padStart(10)}%`);

        expect(batchSize).toBeLessThan(individualSize);
      });
    });

    test('should handle edge cases', () => {
      // All zeros
      const zeros = Array(100).fill(0);
      const zerosEncoded = encodeFixedPointBatch(zeros, 6);
      const zerosDecoded = decodeFixedPointBatch(zerosEncoded, 6);
      expect(zerosDecoded.every(v => v === 0)).toBe(true);

      // All ones
      const ones = Array(100).fill(1);
      const onesEncoded = encodeFixedPointBatch(ones, 6);
      const onesDecoded = decodeFixedPointBatch(onesEncoded, 6);
      expect(onesDecoded.every(v => Math.abs(v - 1) < 0.000001)).toBe(true);

      // Mixed positive and negative
      const mixed = [-1, -0.5, 0, 0.5, 1];
      const mixedEncoded = encodeFixedPointBatch(mixed, 6);
      const mixedDecoded = decodeFixedPointBatch(mixedEncoded, 6);
      mixed.forEach((orig, i) => {
        expect(mixedDecoded[i]).toBeCloseTo(orig, 5);
      });
    });

    test('should handle invalid inputs gracefully', () => {
      expect(encodeFixedPointBatch(null, 6)).toBe('');
      expect(encodeFixedPointBatch(undefined, 6)).toBe('');
      expect(encodeFixedPointBatch('not an array', 6)).toBe('');

      expect(decodeFixedPointBatch('', 6)).toEqual([]);
      expect(decodeFixedPointBatch('invalid', 6)).toEqual([]);
      expect(decodeFixedPointBatch(null, 6)).toEqual([]);
    });

    test('should verify format structure', () => {
      const values = [0.1, 0.2, 0.3];
      const encoded = encodeFixedPointBatch(values, 6);

      // Should start with ^[
      expect(encoded.startsWith('^[')).toBe(true);
      // Should end with ]
      expect(encoded.endsWith(']')).toBe(true);
      // Should contain commas
      expect(encoded.includes(',')).toBe(true);
      // Should not contain individual ^ prefixes inside
      const inner = encoded.slice(2, -1); // Remove ^[ and ]
      expect(inner.includes('^')).toBe(false);
    });
  });
});
