/**
 * Resource Concurrency Tests
 *
 * Tests concurrent operations on resources to verify
 * thread-safety and data integrity under load.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConnectedMockDatabase, createDatabaseWithResource } from '../../mocks/index.js';

describe('Resource Concurrency Tests', () => {
  let database;

  afterEach(async () => {
    if (database) {
      await database.disconnect().catch(() => {});
    }
  });

  describe('Parallel Inserts', () => {
    beforeEach(async () => {
      database = await createConnectedMockDatabase('parallel-inserts');
    });

    it('should handle multiple parallel inserts without data loss', async () => {
      const resource = await database.createResource({
        name: 'items',
        attributes: {
          name: 'string|required',
          index: 'number|required'
        }
      });

      // Insert 20 items in parallel
      const insertPromises = Array.from({ length: 20 }, (_, i) =>
        resource.insert({ name: `Item ${i}`, index: i })
      );

      const results = await Promise.all(insertPromises);

      // All inserts should succeed
      expect(results).toHaveLength(20);
      results.forEach((result, i) => {
        expect(result.id).toBeDefined();
        expect(result.name).toBe(`Item ${i}`);
        expect(result.index).toBe(i);
      });

      // All records should be retrievable
      const allItems = await resource.list();
      expect(allItems).toHaveLength(20);
    });

    it('should generate unique IDs for parallel inserts', async () => {
      const resource = await database.createResource({
        name: 'unique_ids',
        attributes: {
          value: 'string|required'
        }
      });

      // Insert 50 items in parallel
      const insertPromises = Array.from({ length: 50 }, (_, i) =>
        resource.insert({ value: `value-${i}` })
      );

      const results = await Promise.all(insertPromises);
      const ids = results.map(r => r.id);

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(50);
    });

    it('should handle parallel inserts to partitioned resource', async () => {
      const resource = await database.createResource({
        name: 'partitioned_items',
        attributes: {
          name: 'string|required',
          region: 'string|required'
        },
        partitions: {
          byRegion: {
            fields: { region: 'string' }
          }
        }
      });

      const regions = ['US', 'EU', 'ASIA'];
      const insertPromises = [];

      // Insert 10 items per region in parallel
      for (let i = 0; i < 30; i++) {
        const region = regions[i % 3];
        insertPromises.push(
          resource.insert({ name: `Item ${i}`, region })
        );
      }

      const results = await Promise.all(insertPromises);
      expect(results).toHaveLength(30);

      // Verify total count - partitions are created asynchronously
      const allItems = await resource.list();
      expect(allItems).toHaveLength(30);

      // Verify each region has items via query
      for (const region of regions) {
        const regionItems = await resource.query({ region });
        expect(regionItems).toHaveLength(10);
      }
    });
  });

  describe('Concurrent Updates', () => {
    it('should handle concurrent updates to different records', async () => {
      const result = await createDatabaseWithResource('concurrent-updates', {
        name: 'counters',
        attributes: {
          name: 'string|required',
          count: 'number|required'
        }
      });
      database = result.database;
      const resource = result.resource;

      // Create 10 records
      const records = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          resource.insert({ name: `Counter ${i}`, count: 0 })
        )
      );

      // Update all records concurrently
      const updatePromises = records.map((record, i) =>
        resource.update(record.id, { count: i + 1 })
      );

      const updated = await Promise.all(updatePromises);

      // Verify all updates succeeded
      updated.forEach((record, i) => {
        expect(record.count).toBe(i + 1);
      });
    });

    it('should handle rapid sequential updates to same record', async () => {
      const result = await createDatabaseWithResource('rapid-updates', {
        name: 'counter',
        attributes: {
          value: 'string|required'
        }
      });
      database = result.database;
      const resource = result.resource;

      const record = await resource.insert({ value: '0' });

      // Perform 10 sequential updates
      let current = record;
      for (let i = 1; i <= 10; i++) {
        current = await resource.update(current.id, { value: String(i) });
      }

      // Final value should be '10'
      const final = await resource.get(record.id);
      expect(final.value).toBe('10');
    });

    it('should handle mixed update/patch operations', async () => {
      const result = await createDatabaseWithResource('mixed-ops', {
        name: 'items',
        attributes: {
          name: 'string|required',
          status: 'string|optional',
          count: 'number|optional'
        }
      });
      database = result.database;
      const resource = result.resource;

      // Create records
      const records = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          resource.insert({ name: `Item ${i}`, status: 'pending', count: 0 })
        )
      );

      // Mix of update and patch operations
      const operations = records.flatMap((record, i) => [
        resource.update(record.id, { count: i + 1 }),
        resource.patch(record.id, { status: 'active' })
      ]);

      await Promise.all(operations);

      // Verify final states
      for (let i = 0; i < records.length; i++) {
        const final = await resource.get(records[i].id);
        expect(final.status).toBe('active');
        // count may be i+1 or 0 depending on operation order
        expect(typeof final.count).toBe('number');
      }
    });
  });

  describe('Concurrent Reads and Writes', () => {
    it('should handle reads during writes', async () => {
      const result = await createDatabaseWithResource('read-write', {
        name: 'data',
        attributes: {
          value: 'string|required'
        }
      });
      database = result.database;
      const resource = result.resource;

      // Insert initial data
      const initial = await resource.insert({ value: 'initial' });

      // Concurrent reads and writes
      const operations = [
        resource.get(initial.id),
        resource.update(initial.id, { value: 'updated1' }),
        resource.get(initial.id),
        resource.update(initial.id, { value: 'updated2' }),
        resource.get(initial.id),
      ];

      const results = await Promise.all(operations);

      // All operations should complete without error
      expect(results).toHaveLength(5);
      results.forEach(r => {
        expect(r.id).toBe(initial.id);
        expect(r.value).toBeDefined();
      });
    });

    it('should handle list during inserts', async () => {
      const result = await createDatabaseWithResource('list-during-insert', {
        name: 'items',
        attributes: {
          name: 'string|required'
        }
      });
      database = result.database;
      const resource = result.resource;

      // Start inserts
      const insertPromises = Array.from({ length: 10 }, (_, i) =>
        resource.insert({ name: `Item ${i}` })
      );

      // Concurrent list operations
      const listPromises = Array.from({ length: 3 }, () =>
        resource.list()
      );

      await Promise.all([...insertPromises, ...listPromises]);

      // Final list should have all items
      const finalList = await resource.list();
      expect(finalList).toHaveLength(10);
    });
  });

  describe('Concurrent Deletes', () => {
    it('should handle parallel deletes without errors', async () => {
      const result = await createDatabaseWithResource('parallel-deletes', {
        name: 'items',
        attributes: {
          name: 'string|required'
        }
      });
      database = result.database;
      const resource = result.resource;

      // Create records
      const records = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          resource.insert({ name: `Item ${i}` })
        )
      );

      // Delete all in parallel
      const deletePromises = records.map(r => resource.delete(r.id));
      await Promise.all(deletePromises);

      // All should be deleted
      const remaining = await resource.list();
      expect(remaining).toHaveLength(0);
    });

    it('should handle delete during read', async () => {
      const result = await createDatabaseWithResource('delete-read', {
        name: 'items',
        attributes: {
          name: 'string|required'
        }
      });
      database = result.database;
      const resource = result.resource;

      const record = await resource.insert({ name: 'Test' });

      // Start read, then delete
      const readPromise = resource.get(record.id);
      const deletePromise = resource.delete(record.id);

      // One of these scenarios should happen:
      // 1. Read completes before delete, returns data
      // 2. Delete completes before read, read throws not found
      try {
        const [readResult] = await Promise.all([readPromise, deletePromise]);
        expect(readResult.name).toBe('Test');
      } catch (error) {
        // This is also acceptable - delete happened first
        expect(error).toBeDefined();
      }

      // Record should be deleted
      const exists = await resource.exists(record.id);
      expect(exists).toBe(false);
    });
  });

  describe('Query Concurrency', () => {
    it('should handle concurrent queries', async () => {
      const result = await createDatabaseWithResource('concurrent-query', {
        name: 'products',
        attributes: {
          name: 'string|required',
          category: 'string|required',
          price: 'number|required'
        },
        partitions: {
          byCategory: {
            fields: { category: 'string' }
          }
        }
      });
      database = result.database;
      const resource = result.resource;

      // Insert test data
      const categories = ['electronics', 'clothing', 'books'];
      const insertPromises = [];
      for (let i = 0; i < 30; i++) {
        insertPromises.push(resource.insert({
          name: `Product ${i}`,
          category: categories[i % 3],
          price: (i + 1) * 10
        }));
      }
      await Promise.all(insertPromises);

      // Run multiple queries concurrently
      const queryPromises = [
        resource.query({ category: 'electronics' }),
        resource.query({ category: 'clothing' }),
        resource.query({ category: 'books' }),
        resource.list({ limit: 10 }),
        resource.count(),
      ];

      const results = await Promise.all(queryPromises);

      expect(results[0]).toHaveLength(10); // electronics
      expect(results[1]).toHaveLength(10); // clothing
      expect(results[2]).toHaveLength(10); // books
      expect(results[3]).toHaveLength(10); // list limit 10
      expect(results[4]).toBe(30); // count
    });
  });

  describe('ID Uniqueness Under Concurrent Load', () => {
    it('should generate unique IDs under concurrent load', async () => {
      const result = await createDatabaseWithResource('id-concurrent', {
        name: 'orders',
        attributes: {
          product: 'string|required'
        }
        // Use default nanoid generator (works with MemoryClient)
      });
      database = result.database;
      const resource = result.resource;

      // Insert 20 records concurrently
      const insertPromises = Array.from({ length: 20 }, (_, i) =>
        resource.insert({ product: `Product ${i}` })
      );

      const results = await Promise.all(insertPromises);

      // All IDs should be unique
      const ids = results.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(20);

      // All IDs should be valid strings
      ids.forEach(id => {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Stress Tests', () => {
    it('should handle 100 concurrent operations', async () => {
      const result = await createDatabaseWithResource('stress-test', {
        name: 'stress',
        attributes: {
          value: 'number|required',
          type: 'string|required'
        }
      });
      database = result.database;
      const resource = result.resource;

      // Mix of operations
      const operations = [];

      // 40 inserts
      for (let i = 0; i < 40; i++) {
        operations.push(
          resource.insert({ value: i, type: 'insert' })
        );
      }

      await Promise.all(operations);

      // Get all records
      const insertedRecords = await resource.list();
      expect(insertedRecords.length).toBe(40);

      // Now do mixed read/update/delete operations
      const mixedOps = [];

      // 20 reads
      for (let i = 0; i < 20 && i < insertedRecords.length; i++) {
        mixedOps.push(resource.get(insertedRecords[i].id));
      }

      // 20 updates
      for (let i = 0; i < 20 && i < insertedRecords.length; i++) {
        mixedOps.push(resource.update(insertedRecords[i].id, { value: 999 }));
      }

      // 10 deletes (from the end)
      for (let i = 0; i < 10; i++) {
        const idx = insertedRecords.length - 1 - i;
        if (idx >= 20) { // Don't delete records we're updating
          mixedOps.push(resource.delete(insertedRecords[idx].id));
        }
      }

      await Promise.all(mixedOps);

      // Final count should be 30 (40 - 10 deletes)
      const finalList = await resource.list();
      expect(finalList.length).toBe(30);
    });
  });

  describe('Error Recovery', () => {
    it('should handle some operations failing in batch', async () => {
      const result = await createDatabaseWithResource('error-recovery', {
        name: 'items',
        attributes: {
          name: 'string|required'
        }
      });
      database = result.database;
      const resource = result.resource;

      // Insert some records
      const records = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          resource.insert({ name: `Item ${i}` })
        )
      );

      // Mix of valid and invalid operations
      const operations = [
        resource.get(records[0].id), // valid
        resource.get('nonexistent-id'), // will fail
        resource.update(records[1].id, { name: 'Updated' }), // valid
        resource.delete('another-nonexistent'), // will fail
        resource.get(records[2].id), // valid
      ];

      const results = await Promise.allSettled(operations);

      // Check results
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
      expect(results[3].status).toBe('rejected');
      expect(results[4].status).toBe('fulfilled');

      // Valid operations should have succeeded
      expect(results[0].value.name).toBe('Item 0');
      expect(results[2].value.name).toBe('Updated');
    });
  });
});
