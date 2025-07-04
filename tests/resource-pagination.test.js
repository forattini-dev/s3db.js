import { S3db as S3DB } from '../src/index.js';
import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { join } from 'path';

const globalTestPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'resource-pagination-' + Date.now());

describe('Pagination Logic', () => {
  let db;
  let users;
  let insertedUserIds = [];

  beforeEach(async () => {
    // Use timestamp único por teste para garantir isolamento
    const testPrefix = join(globalTestPrefix, 'test-' + Date.now().toString(), Math.random().toString(36).substring(7));

    db = new S3DB({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    await db.connect();

    users = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        age: 'number|optional'
      }
    });

    // Insert 10 test users for pagination testing
    insertedUserIds = [];
    for (let i = 1; i <= 10; i++) {
      const user = await users.insert({
        name: `User ${i}`,
        email: `user${i}@test.com`,
        age: 20 + (i % 30)
      });
      insertedUserIds.push(user.id);
    }

    // Verify we have exactly 10 items
    const count = await users.count();
    expect(count).toBe(10);
  }, 30000); // 30 second timeout

  afterEach(async () => {
    // Clean up test data
    if (insertedUserIds.length > 0) {
      await users.deleteMany(insertedUserIds);
    }
  }, 30000); // 30 second timeout

  describe('page() method logic', () => {
    it('should paginate 2 pages with 5 items each', async () => {
      const pageSize = 5;
      const totalItems = 10;
      const totalPages = 2;

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        const offset = pageIdx * pageSize;
        const result = await users.page({ offset, size: pageSize });

        expect(result.items).toHaveLength(pageSize);
        expect(result.totalItems).toBe(totalItems);
        expect(result.pageSize).toBe(pageSize);
        expect(result.totalPages).toBe(totalPages);
        expect(result.page).toBe(pageIdx);
        expect(result._debug).toBeDefined();
        expect(result._debug.requestedSize).toBe(pageSize);
        expect(result._debug.requestedOffset).toBe(offset);
        expect(result._debug.skipCount).toBe(false);
        expect(result._debug.hasTotalItems).toBe(true);
      }
    }, 30000);

    it('should skip count when skipCount is true', async () => {
      const result = await users.page({
        offset: 0,
        size: 5,
        skipCount: true
      });

      expect(result.items).toHaveLength(5);
      expect(result.totalItems).toBe(null);
      expect(result.totalPages).toBe(null);
      expect(result.page).toBe(0);
      expect(result.pageSize).toBe(5);
      expect(result._debug.skipCount).toBe(true);
      expect(result._debug.hasTotalItems).toBe(false);
    }, 30000);

    it('should calculate pagination metadata correctly', async () => {
      const testCases = [
        { offset: 0, size: 2, expectedItems: 2, expectedPages: 5, expectedPage: 0 },
        { offset: 2, size: 2, expectedItems: 2, expectedPages: 5, expectedPage: 1 },
        { offset: 4, size: 2, expectedItems: 2, expectedPages: 5, expectedPage: 2 },
        { offset: 0, size: 5, expectedItems: 5, expectedPages: 2, expectedPage: 0 },
        { offset: 5, size: 3, expectedItems: 3, expectedPages: 4, expectedPage: 1 }
      ];

      for (const testCase of testCases) {
        const result = await users.page({
          offset: testCase.offset,
          size: testCase.size
        });

        expect(result.totalItems).toBe(10);
        expect(result.pageSize).toBe(testCase.size);
        expect(result.totalPages).toBe(testCase.expectedPages);
        expect(result.page).toBe(testCase.expectedPage);
        expect(result._debug).toBeDefined();
        expect(result._debug.requestedSize).toBe(testCase.size);
        expect(result._debug.requestedOffset).toBe(testCase.offset);
      }
    }, 30000);

    it('should handle empty results correctly', async () => {
      // Test with offset beyond available data
      const result = await users.page({ offset: 100, size: 5 });

      expect(result.items).toHaveLength(0);
      expect(result.totalItems).toBe(10);
      expect(result.pageSize).toBe(5);
      expect(result.page).toBe(20); // Math.floor(100 / 5)
      expect(result._debug.hasTotalItems).toBe(true);
    }, 30000);

    it('should provide debug information', async () => {
      const result = await users.page({ offset: 0, size: 3 });

      expect(result._debug).toBeDefined();
      expect(result._debug.requestedSize).toBe(3);
      expect(result._debug.requestedOffset).toBe(0);
      expect(result._debug.skipCount).toBe(false);
      expect(result._debug.hasTotalItems).toBe(true);
      expect(result._debug.actualItemsReturned).toBe(3);
    }, 30000);
  });

  describe('get() method error handling', () => {
    it('should throw enhanced error for non-existent resources', async () => {
      try {
        await users.get('non-existent-id');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain("Failed to get resource with id 'non-existent-id'");
        expect(error.resourceId).toBe('non-existent-id');
        expect(error.resourceKey).toContain('non-existent-id');
        expect(error.originalError).toBeDefined();
      }
    }, 30000);
  });
}); 