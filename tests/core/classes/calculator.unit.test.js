/**
 * Calculator Unit Tests
 *
 * Tests the calculateTotalSize function that determines
 * if data fits in S3 metadata (2KB limit).
 */

import { describe, it, expect } from 'vitest';
import { calculateTotalSize } from '#src/concerns/calculator.js';

describe('Calculator Unit Tests', () => {
  describe('calculateTotalSize', () => {
    describe('Basic Types', () => {
      it('should calculate size of simple string', () => {
        const size = calculateTotalSize({ name: 'hello' });
        expect(size).toBeGreaterThan(0);
        expect(typeof size).toBe('number');
      });

      it('should calculate size of number', () => {
        const size = calculateTotalSize({ count: 12345 });
        expect(size).toBeGreaterThan(0);
      });

      it('should calculate size of boolean', () => {
        const size = calculateTotalSize({ active: true });
        expect(size).toBeGreaterThan(0);
      });

      it('should calculate size of null', () => {
        const size = calculateTotalSize({ value: null });
        expect(size).toBeGreaterThan(0);
      });

      it('should handle empty object', () => {
        const size = calculateTotalSize({});
        expect(size).toBeGreaterThanOrEqual(0);
      });
    });

    describe('String Length Impact', () => {
      it('should increase size with longer strings', () => {
        const small = calculateTotalSize({ text: 'a' });
        const medium = calculateTotalSize({ text: 'a'.repeat(100) });
        const large = calculateTotalSize({ text: 'a'.repeat(1000) });

        expect(medium).toBeGreaterThan(small);
        expect(large).toBeGreaterThan(medium);
      });

      it('should handle very long strings', () => {
        const size = calculateTotalSize({ text: 'x'.repeat(10000) });
        expect(size).toBeGreaterThan(10000);
      });

      it('should handle empty string', () => {
        const size = calculateTotalSize({ text: '' });
        expect(size).toBeGreaterThan(0); // Key still takes space
      });
    });

    describe('Unicode Characters', () => {
      it('should count multi-byte unicode characters correctly', () => {
        const asciiSize = calculateTotalSize({ text: 'hello' }); // 5 chars, 5 bytes
        const unicodeSize = calculateTotalSize({ text: '日本語' }); // 3 chars, 9 bytes

        // Unicode should be larger (3 chars but 9 bytes in UTF-8)
        expect(unicodeSize).toBeGreaterThan(asciiSize);
      });

      it('should handle emoji characters', () => {
        const asciiSize = calculateTotalSize({ text: 'test' });
        const emojiSize = calculateTotalSize({ text: '🎉🚀' }); // 2 chars, 8 bytes

        expect(emojiSize).toBeGreaterThan(asciiSize);
      });

      it('should handle mixed unicode content', () => {
        const size = calculateTotalSize({
          text: 'Hello 世界 🌍'
        });
        expect(size).toBeGreaterThan(0);
      });
    });

    describe('Nested Objects', () => {
      it('should calculate size of nested objects', () => {
        const flat = calculateTotalSize({ a: '1', b: '2' });
        const nested = calculateTotalSize({ obj: { a: '1', b: '2' } });

        // Both should calculate without error
        expect(flat).toBeGreaterThan(0);
        expect(nested).toBeGreaterThan(0);
      });

      it('should handle deeply nested objects', () => {
        const size = calculateTotalSize({
          level1: {
            level2: {
              level3: {
                level4: {
                  value: 'deep'
                }
              }
            }
          }
        });
        expect(size).toBeGreaterThan(0);
      });

      it('should accumulate sizes of nested properties', () => {
        const shallow = calculateTotalSize({ a: 'test' });
        const deep = calculateTotalSize({
          obj: {
            nested: {
              a: 'test'
            }
          }
        });

        // Deep should be larger due to additional key names
        expect(deep).toBeGreaterThan(shallow);
      });
    });

    describe('Arrays', () => {
      it('should calculate size of arrays', () => {
        const size = calculateTotalSize({ items: [1, 2, 3] });
        expect(size).toBeGreaterThan(0);
      });

      it('should handle array of strings', () => {
        const size = calculateTotalSize({ tags: ['a', 'b', 'c'] });
        expect(size).toBeGreaterThan(0);
      });

      it('should handle array of objects', () => {
        const size = calculateTotalSize({
          items: [
            { name: 'Item 1' },
            { name: 'Item 2' }
          ]
        });
        expect(size).toBeGreaterThan(0);
      });

      it('should handle empty array', () => {
        const size = calculateTotalSize({ items: [] });
        expect(size).toBeGreaterThan(0); // Key still takes space
      });
    });

    describe('2KB Boundary Detection', () => {
      const S3_METADATA_LIMIT = 2047;

      it('should detect data under 2KB limit', () => {
        const smallData = {
          name: 'John',
          email: 'john@example.com'
        };
        const size = calculateTotalSize(smallData);
        expect(size).toBeLessThan(S3_METADATA_LIMIT);
      });

      it('should detect data over 2KB limit', () => {
        const largeData = {
          content: 'x'.repeat(3000)
        };
        const size = calculateTotalSize(largeData);
        expect(size).toBeGreaterThan(S3_METADATA_LIMIT);
      });

      it('should accurately measure data near boundary', () => {
        // Create data that's close to 2KB
        const nearBoundary = {
          content: 'x'.repeat(1800)
        };
        const size = calculateTotalSize(nearBoundary);

        // Should be close to but under the limit
        expect(size).toBeLessThan(S3_METADATA_LIMIT);
        expect(size).toBeGreaterThan(1800);
      });
    });

    describe('Multiple Fields', () => {
      it('should sum sizes of multiple fields', () => {
        const single = calculateTotalSize({ a: 'test' });
        const multiple = calculateTotalSize({
          a: 'test',
          b: 'test',
          c: 'test'
        });

        expect(multiple).toBeGreaterThan(single);
      });

      it('should handle many small fields', () => {
        const data = {};
        for (let i = 0; i < 50; i++) {
          data[`field${i}`] = `value${i}`;
        }
        const size = calculateTotalSize(data);
        expect(size).toBeGreaterThan(0);
      });

      it('should handle combination of types', () => {
        const size = calculateTotalSize({
          string: 'hello',
          number: 42,
          boolean: true,
          array: [1, 2, 3],
          object: { nested: 'value' },
          nullValue: null
        });
        expect(size).toBeGreaterThan(0);
      });
    });

    describe('Edge Cases', () => {
      it('should handle special characters in keys', () => {
        const size = calculateTotalSize({
          'special-key': 'value',
          'key_with_underscore': 'value',
          'key.with.dots': 'value'
        });
        expect(size).toBeGreaterThan(0);
      });

      it('should handle numeric keys', () => {
        const size = calculateTotalSize({
          '0': 'value',
          '1': 'value',
          '123': 'value'
        });
        expect(size).toBeGreaterThan(0);
      });

      it('should handle special string values', () => {
        const size = calculateTotalSize({
          newlines: 'line1\nline2\nline3',
          tabs: 'col1\tcol2\tcol3',
          quotes: '"quoted" and \'single\''
        });
        expect(size).toBeGreaterThan(0);
      });

      it('should handle undefined values gracefully', () => {
        const data = { defined: 'value', notDefined: undefined };
        const size = calculateTotalSize(data);
        expect(size).toBeGreaterThan(0);
      });
    });

    describe('Performance', () => {
      it('should handle large objects efficiently', () => {
        const largeObject = {};
        for (let i = 0; i < 100; i++) {
          largeObject[`field${i}`] = `value${i}`.repeat(10);
        }

        const startTime = Date.now();
        const size = calculateTotalSize(largeObject);
        const endTime = Date.now();

        expect(size).toBeGreaterThan(0);
        expect(endTime - startTime).toBeLessThan(100); // Should be fast
      });

      it('should handle deeply nested structures efficiently', () => {
        let nested = { value: 'leaf' };
        for (let i = 0; i < 20; i++) {
          nested = { nested };
        }

        const startTime = Date.now();
        const size = calculateTotalSize(nested);
        const endTime = Date.now();

        expect(size).toBeGreaterThan(0);
        expect(endTime - startTime).toBeLessThan(100);
      });
    });
  });
});
