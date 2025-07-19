import { v4 as uuidv4 } from 'uuid';
import { describe, expect, test, beforeEach, jest, afterEach } from '@jest/globals';

import { ResourceError } from '#src/errors.js';
import { createDatabaseForTest } from '#tests/config.js';

describe('Custom ID Generators - Real Integration Tests', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('resource-ids');
    await database.connect();
  });

  afterEach(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('idSize parameter', () => {
    test('should generate IDs with custom size', async () => {
      const resource = await database.createResource({
        name: 'test-resource',
        attributes: { name: 'string|required' },
        idSize: 8
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(8);
      expect(typeof result.id).toBe('string');
    });

    test('should use default size (22) when idSize is not specified', async () => {
      const resource = await database.createResource({
        name: 'default-resource',
        attributes: { name: 'string|required' }
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(22);
      expect(typeof result.id).toBe('string');
    });

    test('should generate different IDs for different sizes', async () => {
      const shortResource = await database.createResource({
        name: 'short-resource',
        attributes: { name: 'string|required' },
        idSize: 8
      });

      const longResource = await database.createResource({
        name: 'long-resource',
        attributes: { name: 'string|required' },
        idSize: 32
      });

      const shortResult = await shortResource.insert({ name: 'Short User' });
      const longResult = await longResource.insert({ name: 'Long User' });

      expect(shortResult.id.length).toBe(8);
      expect(longResult.id.length).toBe(32);
      expect(shortResult.id).not.toBe(longResult.id);
    });
  });

  describe('idGenerator parameter', () => {
    test('should use custom function as ID generator', async () => {
      const customGenerator = jest.fn(() => 'custom-id-123');
      
      const resource = await database.createResource({
        name: 'custom-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: customGenerator
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(customGenerator).toHaveBeenCalled();
      expect(result.id).toBe('custom-id-123');
    });

    test('should use UUID v4 as ID generator', async () => {
      const resource = await database.createResource({
        name: 'uuid-resource',
        attributes: { name: 'string|required' },
        idGenerator: uuidv4
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(36);
      // Check UUID v4 format
      expect(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.id)).toBe(true);
    });

    test('should use number as ID generator size', async () => {
      const resource = await database.createResource({
        name: 'number-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: 16
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toBeDefined();
      expect(result.id.length).toBe(16);
    });

    test('should generate unique IDs with custom generator', async () => {
      let counter = 0;
      const customGenerator = () => `id-${++counter}`;
      
      const resource = await database.createResource({
        name: 'unique-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: customGenerator
      });

      const result1 = await resource.insert({ name: 'User 1' });
      const result2 = await resource.insert({ name: 'User 2' });

      expect(result1.id).toBe('id-1');
      expect(result2.id).toBe('id-2');
    });

    test('should generate unique IDs with timestamp-based generator', async () => {
      const timestampGenerator = () => `ts-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      const resource = await database.createResource({
        name: 'timestamp-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: timestampGenerator
      });

      const result1 = await resource.insert({ name: 'User 1' });
      const result2 = await resource.insert({ name: 'User 2' });

      expect(result1.id).toMatch(/^ts-\d+-\w{5}$/);
      expect(result2.id).toMatch(/^ts-\d+-\w{5}$/);
      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('validation', () => {
    test('should throw error for invalid idGenerator type', async () => {
      let error;
      try {
        await database.createResource({
          name: 'invalid-generator-resource',
          attributes: { name: 'string|required' },
          idGenerator: 'invalid'
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ResourceError);
      expect(error.validation).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Resource 'idGenerator' must be a function or a number (size)")
        ])
      );
    });

    test('should throw error for invalid idSize type', async () => {
      let error;
      try {
        await database.createResource({
          name: 'invalid-size-resource',
          attributes: { name: 'string|required' },
          idSize: 'invalid'
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ResourceError);
      expect(error.validation).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Resource 'idSize' must be an integer")
        ])
      );
    });

    test('should throw error for negative idSize', async () => {
      let error;
      try {
        await database.createResource({
          name: 'negative-size-resource',
          attributes: { name: 'string|required' },
          idSize: -1
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ResourceError);
      expect(error.validation).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Resource 'idSize' must be greater than 0")
        ])
      );
    });

    test('should throw error for zero idSize', async () => {
      let error;
      try {
        await database.createResource({
          name: 'zero-size-resource',
          attributes: { name: 'string|required' },
          idSize: 0
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ResourceError);
      expect(error.validation).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Resource 'idSize' must be greater than 0")
        ])
      );
    });

    test('should throw error for negative idGenerator size', async () => {
      let error;
      try {
        await database.createResource({
          name: 'negative-generator-resource',
          attributes: { name: 'string|required' },
          idGenerator: -1
        });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ResourceError);
      expect(error.validation).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Resource 'idGenerator' size must be greater than 0")
        ])
      );
    });
  });

  describe('priority and precedence', () => {
    test('should prioritize idGenerator function over idSize', async () => {
      const customGenerator = jest.fn(() => 'custom-id');
      
      const resource = await database.createResource({
        name: 'priority-resource',
        attributes: { name: 'string|required' },
        idGenerator: customGenerator,
        idSize: 16
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(customGenerator).toHaveBeenCalled();
      expect(result.id).toBe('custom-id');
    });

    test('should use idSize when idGenerator is not a function', async () => {
      const resource = await database.createResource({
        name: 'number-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: 12,
        idSize: 16
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id.length).toBe(12); // Uses idGenerator value
    });
  });

  describe('bulk operations', () => {
    test('should use custom ID generator for bulk insert', async () => {
      let counter = 0;
      const customGenerator = () => `bulk-id-${++counter}`;
      
      const resource = await database.createResource({
        name: 'bulk-generator-resource',
        attributes: { name: 'string|required' },
        idGenerator: customGenerator
      });

      const users = [
        { name: 'User 1' },
        { name: 'User 2' },
        { name: 'User 3' }
      ];

      const results = await resource.insertMany(users);
      
      expect(results).toHaveLength(3);
      // Verify that all IDs were generated correctly, but don't depend on order
      const ids = results.map(r => r.id);
      expect(ids).toContain('bulk-id-1');
      expect(ids).toContain('bulk-id-2');
      expect(ids).toContain('bulk-id-3');
      expect(ids[0]).not.toBe(ids[1]);
      expect(ids[1]).not.toBe(ids[2]);
      expect(ids[0]).not.toBe(ids[2]);
    });

    test('should use UUID generator for bulk insert', async () => {
      const resource = await database.createResource({
        name: 'bulk-uuid-resource',
        attributes: { name: 'string|required' },
        idGenerator: uuidv4
      });

      const users = [
        { name: 'User 1' },
        { name: 'User 2' }
      ];

      const results = await resource.insertMany(users);
      
      expect(results).toHaveLength(2);
      expect(results[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(results[1].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(results[0].id).not.toBe(results[1].id);
    });
  });

  describe('ID persistence and retrieval', () => {
    test('should persist and retrieve custom IDs', async () => {
      const customGenerator = () => `persistent-id-${Date.now()}`;
      
      const resource = await database.createResource({
        name: 'persistent-id-resource',
        attributes: { name: 'string|required' },
        idGenerator: customGenerator
      });

      const inserted = await resource.insert({ name: 'Test User' });
      expect(inserted.id).toMatch(/^persistent-id-\d+$/);

      const retrieved = await resource.get(inserted.id);
      expect(retrieved.id).toBe(inserted.id);
      expect(retrieved.name).toBe('Test User');
    });

    test('should handle ID conflicts gracefully', async () => {
      let counter = 0;
      const conflictingGenerator = () => {
        counter++;
        return counter <= 2 ? 'conflict-id' : `unique-id-${counter}`;
      };
      
      const resource = await database.createResource({
        name: 'conflict-resource',
        attributes: { name: 'string|required' },
        idGenerator: conflictingGenerator
      });

      // First insert should work
      const result1 = await resource.insert({ name: 'User 1' });
      expect(result1.id).toBe('conflict-id');

      // Second insert should also work (handles conflict internally)
      const result2 = await resource.insert({ name: 'User 2' });
      expect(result2.id).toBe('conflict-id'); // Both should get the same ID since it's the generator's behavior
    });
  });

  describe('ID format validation', () => {
    test('should generate alphanumeric IDs by default', async () => {
      const resource = await database.createResource({
        name: 'alphanumeric-resource',
        attributes: { name: 'string|required' }
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(result.id.length).toBe(22);
    });

    test('should generate custom format IDs', async () => {
      const formatGenerator = () => `USER-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      const resource = await database.createResource({
        name: 'format-resource',
        attributes: { name: 'string|required' },
        idGenerator: formatGenerator
      });

      const result = await resource.insert({ name: 'Test User' });
      
      expect(result.id).toMatch(/^USER-\d+-[A-Z0-9]{6}$/);
    });
  });

  describe('Performance with custom ID generators', () => {
    test('should handle multiple inserts with custom generator efficiently', async () => {
      let counter = 0;
      const fastGenerator = () => `fast-${++counter}`;
      
      const resource = await database.createResource({
        name: 'performance-resource',
        attributes: { name: 'string|required' },
        idGenerator: fastGenerator
      });

      const startTime = Date.now();
      
      // Insert multiple items
      const promises = Array.from({ length: 10 }, (_, i) => 
        resource.insert({ name: `User ${i}` }).catch(err => {
          console.error(`Insert ${i} failed:`, err.message);
          return null;
        })
      );
      
      const allResults = await Promise.all(promises);
      const results = allResults.filter(r => r !== null);
      
      console.log('Successful results:', results.length, 'IDs:', results.map(r => r.id));
      const endTime = Date.now();

      // Sort results by ID number since parallel operations can complete out of order
      const sortedResults = results.sort((a, b) => {
        const numA = parseInt(a.id.split('-')[1]);
        const numB = parseInt(b.id.split('-')[1]);
        return numA - numB;
      });

      expect(sortedResults).toHaveLength(10);
      expect(sortedResults[0].id).toBe('fast-1');
      expect(sortedResults[9].id).toBe('fast-10');
      
      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(5000);
    });
  });
}); 