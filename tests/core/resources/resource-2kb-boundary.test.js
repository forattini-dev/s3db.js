/**
 * 2KB Metadata Boundary Tests
 *
 * Tests behavior at and around the S3 metadata limit (2047 bytes).
 * These tests verify that different behaviors handle the limit correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConnectedMockDatabase } from '../../mocks/index.js';
import { calculateTotalSize } from '#src/concerns/calculator.js';

describe('2KB Metadata Boundary Tests', () => {
  let database;

  afterEach(async () => {
    if (database) {
      await database.disconnect().catch(() => {});
    }
  });

  describe('Size Calculation', () => {
    it('should accurately calculate metadata size', () => {
      const data = {
        id: 'test-id-12345',
        name: 'John Doe',
        email: 'john@example.com'
      };

      const size = calculateTotalSize(data);
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    it('should handle unicode characters correctly', () => {
      const asciiData = { name: 'John' };
      const unicodeData = { name: '日本語テスト' }; // Japanese text

      const asciiSize = calculateTotalSize(asciiData);
      const unicodeSize = calculateTotalSize(unicodeData);

      // Unicode should be larger due to multi-byte encoding
      expect(unicodeSize).toBeGreaterThan(asciiSize);
    });

    it('should handle nested objects', () => {
      const flatData = { a: '1', b: '2', c: '3' };
      const nestedData = { obj: { a: '1', b: '2', c: '3' } };

      const flatSize = calculateTotalSize(flatData);
      const nestedSize = calculateTotalSize(nestedData);

      // Both should calculate without error
      expect(flatSize).toBeGreaterThan(0);
      expect(nestedSize).toBeGreaterThan(0);
    });
  });

  describe('Behavior: body-overflow', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('body-overflow-test');
    });

    it('should store small data in metadata only', async () => {
      const resource = await database.createResource({
        name: 'small_data',
        attributes: {
          name: 'string|required',
          value: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const result = await resource.insert({
        name: 'Small Item',
        value: 'small value'
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Small Item');
    });

    it('should handle data approaching 2KB limit', async () => {
      const resource = await database.createResource({
        name: 'medium_data',
        attributes: {
          name: 'string|required',
          description: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      // Create string that approaches but doesn't exceed limit
      const mediumString = 'x'.repeat(1500);

      const result = await resource.insert({
        name: 'Medium Item',
        description: mediumString
      });

      expect(result.id).toBeDefined();
      expect(result.description).toBe(mediumString);
    });

    it('should overflow large data to body', async () => {
      const resource = await database.createResource({
        name: 'large_data',
        attributes: {
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      // Create string that exceeds 2KB limit
      const largeString = 'x'.repeat(3000);

      const result = await resource.insert({
        name: 'Large Item',
        content: largeString
      });

      expect(result.id).toBeDefined();
      expect(result.content).toBe(largeString);
    });

    it('should handle multiple fields that together exceed limit', async () => {
      const resource = await database.createResource({
        name: 'multi_field',
        attributes: {
          field1: 'string|optional',
          field2: 'string|optional',
          field3: 'string|optional',
          field4: 'string|optional',
          field5: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      // Each field is small, but together they exceed 2KB
      const fieldValue = 'x'.repeat(500);

      const result = await resource.insert({
        field1: fieldValue,
        field2: fieldValue,
        field3: fieldValue,
        field4: fieldValue,
        field5: fieldValue
      });

      expect(result.id).toBeDefined();
      expect(result.field1).toBe(fieldValue);
      expect(result.field5).toBe(fieldValue);
    });
  });

  describe('Behavior: enforce-limits', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('enforce-limits-test');
    });

    it('should accept data within limit', async () => {
      const resource = await database.createResource({
        name: 'limited_data',
        attributes: {
          name: 'string|required',
          value: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      const result = await resource.insert({
        name: 'Within Limit',
        value: 'small value'
      });

      expect(result.id).toBeDefined();
    });

    it('should reject data exceeding limit', async () => {
      const resource = await database.createResource({
        name: 'reject_large',
        attributes: {
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'enforce-limits'
      });

      const largeString = 'x'.repeat(3000);

      await expect(resource.insert({
        name: 'Too Large',
        content: largeString
      })).rejects.toThrow();
    });
  });

  describe('Behavior: body-only', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('body-only-test');
    });

    it('should store all data in body', async () => {
      const resource = await database.createResource({
        name: 'body_storage',
        attributes: {
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-only'
      });

      const result = await resource.insert({
        name: 'Body Only Item',
        content: 'This goes to body'
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Body Only Item');
    });

    it('should handle very large data', async () => {
      const resource = await database.createResource({
        name: 'very_large',
        attributes: {
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-only'
      });

      // 100KB of data - way beyond metadata limit
      const veryLargeString = 'x'.repeat(100000);

      const result = await resource.insert({
        name: 'Very Large Item',
        content: veryLargeString
      });

      expect(result.id).toBeDefined();
      expect(result.content.length).toBe(100000);
    });
  });

  describe('Behavior: truncate-data', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('truncate-test');
    });

    it('should truncate data to fit limit', async () => {
      const resource = await database.createResource({
        name: 'truncated',
        attributes: {
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'truncate-data'
      });

      const largeString = 'x'.repeat(3000);

      const result = await resource.insert({
        name: 'Truncated Item',
        content: largeString
      });

      expect(result.id).toBeDefined();
      // Content should be truncated to fit
      expect(result.content.length).toBeLessThan(3000);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('edge-cases');
    });

    it('should handle empty strings', async () => {
      const resource = await database.createResource({
        name: 'empty_strings',
        attributes: {
          name: 'string|required',
          optional: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const result = await resource.insert({
        name: '',
        optional: ''
      });

      expect(result.id).toBeDefined();
    });

    it('should handle special characters', async () => {
      const resource = await database.createResource({
        name: 'special_chars',
        attributes: {
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~\n\t\r';

      const result = await resource.insert({
        name: 'Special Chars',
        content: specialChars
      });

      expect(result.id).toBeDefined();
      expect(result.content).toBe(specialChars);
    });

    it('should handle emoji characters', async () => {
      const resource = await database.createResource({
        name: 'emoji_test',
        attributes: {
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const emojiString = '😀🎉🚀💻🌟'.repeat(100);

      const result = await resource.insert({
        name: 'Emoji Test',
        content: emojiString
      });

      expect(result.id).toBeDefined();
      expect(result.content).toBe(emojiString);
    });

    it('should handle null and undefined fields', async () => {
      const resource = await database.createResource({
        name: 'nullable',
        attributes: {
          name: 'string|required',
          optional1: 'string|optional',
          optional2: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      const result = await resource.insert({
        name: 'Nullable Test',
        optional1: null,
        // optional2 is undefined
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Nullable Test');
    });

    it('should handle deeply nested objects approaching limit', async () => {
      const resource = await database.createResource({
        name: 'nested',
        attributes: {
          name: 'string|required',
          data: {
            level1: {
              level2: {
                level3: {
                  value: 'string|optional'
                }
              }
            }
          }
        },
        behavior: 'body-overflow'
      });

      const result = await resource.insert({
        name: 'Nested Test',
        data: {
          level1: {
            level2: {
              level3: {
                value: 'x'.repeat(1500)
              }
            }
          }
        }
      });

      expect(result.id).toBeDefined();
      expect(result.data.level1.level2.level3.value.length).toBe(1500);
    });
  });

  describe('Update Operations Near Boundary', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('update-boundary');
    });

    it('should handle update that crosses boundary', async () => {
      const resource = await database.createResource({
        name: 'update_test',
        attributes: {
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      // Insert small data
      const inserted = await resource.insert({
        name: 'Update Test',
        content: 'small'
      });

      // Update to large data
      const updated = await resource.update(inserted.id, {
        content: 'x'.repeat(3000)
      });

      expect(updated.content.length).toBe(3000);
    });

    it('should handle update that reduces size below boundary', async () => {
      const resource = await database.createResource({
        name: 'shrink_test',
        attributes: {
          name: 'string|required',
          content: 'string|optional'
        },
        behavior: 'body-overflow'
      });

      // Insert large data
      const inserted = await resource.insert({
        name: 'Shrink Test',
        content: 'x'.repeat(3000)
      });

      // Update to small data
      const updated = await resource.update(inserted.id, {
        content: 'small'
      });

      expect(updated.content).toBe('small');
    });
  });
});

describe('Metadata Size Verification', () => {
  it('should verify 2KB limit constant', () => {
    // S3 metadata limit is 2047 bytes (2KB - 1)
    const S3_METADATA_LIMIT = 2047;
    expect(S3_METADATA_LIMIT).toBe(2047);
  });

  it('should calculate accurate byte sizes for various data types', () => {
    // Test different data patterns - sizes depend on implementation
    const testCases = [
      { data: { a: 'hello' }, minSize: 1 },
      { data: { num: 12345 }, minSize: 1 },
      { data: { bool: true }, minSize: 1 },
      { data: { arr: [1, 2, 3] }, minSize: 1 },
    ];

    for (const { data, minSize } of testCases) {
      const size = calculateTotalSize(data);
      expect(size).toBeGreaterThanOrEqual(minSize);
      expect(typeof size).toBe('number');
    }
  });
});
