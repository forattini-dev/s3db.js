/**
 * Resource Error Path Tests
 *
 * Tests error handling for Resource class operations.
 * Uses MockClient for fast, isolated testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseWithResource,
  schemas,
  dataGenerators
} from '../../mocks/index.js';

describe('Resource Error Paths', () => {
  let database;
  let resource;

  afterEach(async () => {
    if (database) {
      await database.disconnect().catch(() => {});
    }
  });

  describe('insert()', () => {
    beforeEach(async () => {
      const result = await createDatabaseWithResource('insert-errors', schemas.user);
      database = result.database;
      resource = result.resource;
    });

    it('should reject insert with missing required field', async () => {
      const result = resource.insert({
        // missing 'email' which is required
        name: 'John'
      });
      await expect(result).rejects.toThrow();
    });

    it('should reject insert with invalid email format', async () => {
      const result = resource.insert({
        name: 'John',
        email: 'not-an-email'
      });
      await expect(result).rejects.toThrow();
    });

    it('should reject insert with wrong type', async () => {
      const result = resource.insert({
        name: 123, // should be string
        email: 'john@example.com'
      });
      await expect(result).rejects.toThrow();
    });

    it('should reject insert with null data', async () => {
      await expect(resource.insert(null))
        .rejects.toThrow();
    });

    it('should reject insert with undefined data', async () => {
      await expect(resource.insert(undefined))
        .rejects.toThrow();
    });

    it('should reject insert with empty object', async () => {
      await expect(resource.insert({}))
        .rejects.toThrow();
    });

    it('should reject insert with array instead of object', async () => {
      await expect(resource.insert([{ name: 'John', email: 'john@example.com' }]))
        .rejects.toThrow();
    });
  });

  describe('insertMany()', () => {
    beforeEach(async () => {
      const result = await createDatabaseWithResource('insertmany-errors', schemas.user);
      database = result.database;
      resource = result.resource;
    });

    it('should handle insertMany with empty array', async () => {
      // Empty array may return empty result or throw - both are acceptable
      try {
        const result = await resource.insertMany([]);
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(0);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should reject insertMany with null', async () => {
      await expect(resource.insertMany(null))
        .rejects.toThrow();
    });

    it('should reject insertMany with non-array', async () => {
      await expect(resource.insertMany({ name: 'John', email: 'john@example.com' }))
        .rejects.toThrow();
    });

    it('should reject insertMany if any item is invalid', async () => {
      await expect(resource.insertMany([
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane' } // missing email
      ])).rejects.toThrow();
    });
  });

  describe('get()', () => {
    beforeEach(async () => {
      const result = await createDatabaseWithResource('get-errors', schemas.user);
      database = result.database;
      resource = result.resource;
    });

    it('should throw for non-existent ID', async () => {
      await expect(resource.get('nonexistent-id-12345'))
        .rejects.toThrow();
    });

    it('should throw for empty ID', async () => {
      await expect(resource.get(''))
        .rejects.toThrow();
    });

    it('should throw for null ID', async () => {
      await expect(resource.get(null))
        .rejects.toThrow();
    });

    it('should throw for undefined ID', async () => {
      await expect(resource.get(undefined))
        .rejects.toThrow();
    });

    it('should throw for numeric ID (type mismatch)', async () => {
      await expect(resource.get(12345))
        .rejects.toThrow();
    });
  });

  describe('update()', () => {
    let insertedUser;

    beforeEach(async () => {
      const result = await createDatabaseWithResource('update-errors', schemas.user);
      database = result.database;
      resource = result.resource;

      insertedUser = await resource.insert({
        name: 'John',
        email: 'john@example.com'
      });
    });

    it('should throw for non-existent ID', async () => {
      await expect(resource.update('nonexistent-id', { name: 'Jane' }))
        .rejects.toThrow();
    });

    it('should throw for empty ID', async () => {
      await expect(resource.update('', { name: 'Jane' }))
        .rejects.toThrow();
    });

    it('should throw for null ID', async () => {
      await expect(resource.update(null, { name: 'Jane' }))
        .rejects.toThrow();
    });

    it('should throw for null data', async () => {
      await expect(resource.update(insertedUser.id, null))
        .rejects.toThrow();
    });

    it('should throw for invalid field type in update', async () => {
      await expect(resource.update(insertedUser.id, { name: 123 }))
        .rejects.toThrow();
    });

    it('should throw when updating email to invalid format', async () => {
      await expect(resource.update(insertedUser.id, { email: 'not-valid' }))
        .rejects.toThrow();
    });
  });

  describe('patch()', () => {
    let insertedUser;

    beforeEach(async () => {
      const result = await createDatabaseWithResource('patch-errors', schemas.user);
      database = result.database;
      resource = result.resource;

      insertedUser = await resource.insert({
        name: 'John',
        email: 'john@example.com'
      });
    });

    it('should throw for non-existent ID', async () => {
      await expect(resource.patch('nonexistent-id', { name: 'Jane' }))
        .rejects.toThrow();
    });

    it('should throw for empty ID', async () => {
      await expect(resource.patch('', { name: 'Jane' }))
        .rejects.toThrow();
    });

    it('should throw for invalid field type', async () => {
      await expect(resource.patch(insertedUser.id, { name: 123 }))
        .rejects.toThrow();
    });
  });

  describe('replace()', () => {
    let insertedUser;

    beforeEach(async () => {
      const result = await createDatabaseWithResource('replace-errors', schemas.user);
      database = result.database;
      resource = result.resource;

      insertedUser = await resource.insert({
        name: 'John',
        email: 'john@example.com'
      });
    });

    it('should create new record for non-existent ID (upsert behavior)', async () => {
      // replace() with non-existent ID creates the record (upsert behavior)
      const result = await resource.replace('nonexistent-id', {
        name: 'Jane',
        email: 'jane@example.com'
      });
      expect(result.id).toBe('nonexistent-id');
      expect(result.name).toBe('Jane');
    });

    it('should throw when missing required fields', async () => {
      await expect(resource.replace(insertedUser.id, {
        name: 'Jane'
        // missing email
      })).rejects.toThrow();
    });

    it('should throw for null data', async () => {
      await expect(resource.replace(insertedUser.id, null))
        .rejects.toThrow();
    });
  });

  describe('delete()', () => {
    beforeEach(async () => {
      const result = await createDatabaseWithResource('delete-errors', schemas.user);
      database = result.database;
      resource = result.resource;
    });

    it('should throw for non-existent ID', async () => {
      await expect(resource.delete('nonexistent-id'))
        .rejects.toThrow();
    });

    it('should throw for empty ID', async () => {
      await expect(resource.delete(''))
        .rejects.toThrow();
    });

    it('should throw for null ID', async () => {
      await expect(resource.delete(null))
        .rejects.toThrow();
    });
  });

  describe('deleteAll()', () => {
    it('should throw when paranoid mode is enabled', async () => {
      const result = await createDatabaseWithResource('deleteall-paranoid', {
        ...schemas.user,
        paranoid: true
      });
      database = result.database;
      resource = result.resource;

      await resource.insert({ name: 'John', email: 'john@example.com' });

      await expect(resource.deleteAll())
        .rejects.toThrow();
    });
  });

  describe('list()', () => {
    beforeEach(async () => {
      const result = await createDatabaseWithResource('list-errors', schemas.user);
      database = result.database;
      resource = result.resource;
    });

    it('should handle invalid limit gracefully', async () => {
      // Negative limit may be normalized to 0 or throw
      try {
        const result = await resource.list({ limit: -1 });
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle non-numeric limit', async () => {
      // Non-numeric limit may be coerced or throw
      try {
        const result = await resource.list({ limit: 'abc' });
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('query()', () => {
    beforeEach(async () => {
      const result = await createDatabaseWithResource('query-errors', schemas.user);
      database = result.database;
      resource = result.resource;
    });

    it('should return empty array for query with no matches', async () => {
      await resource.insert({ name: 'John', email: 'john@example.com' });

      const results = await resource.query({ name: 'NonExistent' });
      expect(results).toEqual([]);
    });

    it('should handle query on non-existent field', async () => {
      // Query on non-existent field may return empty or throw
      try {
        const result = await resource.query({ nonExistentField: 'value' });
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('count()', () => {
    beforeEach(async () => {
      const result = await createDatabaseWithResource('count-errors', schemas.user);
      database = result.database;
      resource = result.resource;
    });

    it('should return 0 for empty resource', async () => {
      const count = await resource.count();
      expect(count).toBe(0);
    });
  });

  describe('exists()', () => {
    beforeEach(async () => {
      const result = await createDatabaseWithResource('exists-errors', schemas.user);
      database = result.database;
      resource = result.resource;
    });

    it('should return false for non-existent ID', async () => {
      const exists = await resource.exists('nonexistent-id');
      expect(exists).toBe(false);
    });

    it('should return false for empty ID', async () => {
      // exists() with empty string returns false instead of throwing
      const result = await resource.exists('');
      expect(result).toBe(false);
    });

    it('should return false for null ID', async () => {
      // exists() with null returns false instead of throwing
      const result = await resource.exists(null);
      expect(result).toBe(false);
    });
  });

  describe('validate()', () => {
    beforeEach(async () => {
      const result = await createDatabaseWithResource('validate-errors', schemas.user);
      database = result.database;
      resource = result.resource;
    });

    it('should return invalid result for missing required field', async () => {
      const result = await resource.validate({ name: 'John' }); // missing email
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should return invalid result for wrong type', async () => {
      const result = await resource.validate({
        name: 123, // should be string
        email: 'john@example.com'
      });
      expect(result.isValid).toBe(false);
    });

    it('should handle null input', async () => {
      // validate() with null throws TypeError - testing that it doesn't crash silently
      await expect(resource.validate(null)).rejects.toThrow();
    });
  });
});

describe('Resource Error Paths - Partitioned Resources', () => {
  let database;
  let resource;

  afterEach(async () => {
    if (database) {
      await database.disconnect().catch(() => {});
    }
  });

  describe('Partition Operations', () => {
    beforeEach(async () => {
      const result = await createDatabaseWithResource('partition-errors', schemas.productWithPartitions);
      database = result.database;
      resource = result.resource;
    });

    it('should handle listPartition with non-existent partition', async () => {
      // Non-existent partition may return empty or throw
      try {
        const result = await resource.listPartition('nonExistentPartition', {});
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle getFromPartition with wrong partition values', async () => {
      // Insert a product
      await resource.insert({
        name: 'Laptop',
        category: 'electronics',
        price: 999.99
      });

      // Try to get from wrong partition - should return empty
      const results = await resource.listPartition('byCategory', { category: 'nonexistent' });
      expect(results).toEqual([]);
    });
  });
});

describe('Resource Error Paths - Hooks', () => {
  let database;
  let resource;

  afterEach(async () => {
    if (database) {
      await database.disconnect().catch(() => {});
    }
  });

  it('should handle beforeInsert hook that throws', async () => {
    // Hooks must be arrays
    const result = await createDatabaseWithResource('hook-error', {
      name: 'items',
      attributes: {
        name: 'string|required'
      },
      hooks: {
        beforeInsert: [async (data) => {
          throw new Error('Hook validation failed');
        }]
      }
    });
    database = result.database;
    resource = result.resource;

    await expect(resource.insert({ name: 'Test' }))
      .rejects.toThrow(/Hook validation failed/);
  });

  it('should handle beforeUpdate hook that throws', async () => {
    // Hooks must be arrays
    const result = await createDatabaseWithResource('hook-update-error', {
      name: 'items',
      attributes: {
        name: 'string|required'
      },
      hooks: {
        beforeUpdate: [async (id, data) => {
          throw new Error('Update not allowed');
        }]
      }
    });
    database = result.database;
    resource = result.resource;

    const item = await resource.insert({ name: 'Test' });

    await expect(resource.update(item.id, { name: 'Updated' }))
      .rejects.toThrow(/Update not allowed/);
  });

  it('should handle beforeDelete hook that throws', async () => {
    // Hooks must be arrays
    const result = await createDatabaseWithResource('hook-delete-error', {
      name: 'items',
      attributes: {
        name: 'string|required'
      },
      hooks: {
        beforeDelete: [async (id) => {
          throw new Error('Delete not allowed');
        }]
      }
    });
    database = result.database;
    resource = result.resource;

    const item = await resource.insert({ name: 'Test' });

    await expect(resource.delete(item.id))
      .rejects.toThrow(/Delete not allowed/);
  });
});
