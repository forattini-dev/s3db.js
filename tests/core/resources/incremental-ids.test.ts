/**
 * Tests for Incremental ID Generator
 *
 * Phase 1: idGenerator: 'incremental' support
 */

import { Database } from '../../../src/database.class.js';
import { parseIncrementalConfig, formatIncrementalValue } from '../../../src/concerns/incremental-sequence.js';

describe('Incremental IDs', () => {
  let database;

  beforeAll(async () => {
    database = new Database({
      connectionString: 'memory://test-bucket/incremental-test',
      logLevel: 'silent'
    });
    await database.connect();
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('parseIncrementalConfig', () => {
    it('should parse "incremental" string', () => {
      const config = parseIncrementalConfig('incremental');
      expect(config.type).toBe('incremental');
      expect(config.start).toBe(1);
      expect(config.increment).toBe(1);
      expect(config.mode).toBe('standard');
    });

    it('should parse "incremental:1000" for custom start value', () => {
      const config = parseIncrementalConfig('incremental:1000');
      expect(config.start).toBe(1000);
      expect(config.mode).toBe('standard');
    });

    it('should parse "incremental:fast" for fast mode', () => {
      const config = parseIncrementalConfig('incremental:fast');
      expect(config.mode).toBe('fast');
      expect(config.batchSize).toBe(100);
    });

    it('should parse "incremental:fast:5000" for fast mode with start value', () => {
      const config = parseIncrementalConfig('incremental:fast:5000');
      expect(config.mode).toBe('fast');
      expect(config.start).toBe(5000);
    });

    it('should parse "incremental:ORD-0001" for prefix pattern', () => {
      const config = parseIncrementalConfig('incremental:ORD-0001');
      expect(config.prefix).toBe('ORD-');
      expect(config.start).toBe(1);
      expect(config.padding).toBe(4);
    });

    it('should parse "incremental:INV-1000" for prefix with larger start', () => {
      const config = parseIncrementalConfig('incremental:INV-1000');
      expect(config.prefix).toBe('INV-');
      expect(config.start).toBe(1000);
      expect(config.padding).toBe(4);
    });

    it('should parse object config', () => {
      const config = parseIncrementalConfig({
        type: 'incremental',
        start: 500,
        increment: 10,
        mode: 'fast',
        batchSize: 200
      });
      expect(config.start).toBe(500);
      expect(config.increment).toBe(10);
      expect(config.mode).toBe('fast');
      expect(config.batchSize).toBe(200);
    });
  });

  describe('formatIncrementalValue', () => {
    it('should return string even without formatting', () => {
      expect(formatIncrementalValue(42)).toBe('42');
    });

    it('should format with padding', () => {
      expect(formatIncrementalValue(42, { padding: 4 })).toBe('0042');
    });

    it('should format with prefix', () => {
      expect(formatIncrementalValue(42, { prefix: 'ORD-' })).toBe('ORD-42');
    });

    it('should format with prefix and padding', () => {
      expect(formatIncrementalValue(42, { prefix: 'INV-', padding: 4 })).toBe('INV-0042');
    });

    it('should handle padding overflow', () => {
      expect(formatIncrementalValue(12345, { padding: 3 })).toBe('12345');
    });
  });

  describe('Basic Incremental ID Generation', () => {
    it('should generate sequential IDs starting from 1', async () => {
      const resource = await database.createResource({
        name: 'basic_incremental',
        attributes: { name: 'string' },
        idGenerator: 'incremental'
      });

      const record1 = await resource.insert({ name: 'First' });
      const record2 = await resource.insert({ name: 'Second' });
      const record3 = await resource.insert({ name: 'Third' });

      expect(record1.id).toBe('1');
      expect(record2.id).toBe('2');
      expect(record3.id).toBe('3');
    });

    it('should start from custom value', async () => {
      const resource = await database.createResource({
        name: 'custom_start',
        attributes: { name: 'string' },
        idGenerator: 'incremental:1000'
      });

      const record1 = await resource.insert({ name: 'First' });
      const record2 = await resource.insert({ name: 'Second' });

      expect(record1.id).toBe('1000');
      expect(record2.id).toBe('1001');
    });

    it('should use custom increment step', async () => {
      const resource = await database.createResource({
        name: 'custom_increment',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', start: 100, increment: 10 }
      });

      const record1 = await resource.insert({ name: 'First' });
      const record2 = await resource.insert({ name: 'Second' });
      const record3 = await resource.insert({ name: 'Third' });

      expect(record1.id).toBe('100');
      expect(record2.id).toBe('110');
      expect(record3.id).toBe('120');
    });

    it('should respect manually provided ID', async () => {
      const resource = await database.createResource({
        name: 'manual_override',
        attributes: { name: 'string' },
        idGenerator: 'incremental'
      });

      const record1 = await resource.insert({ name: 'First' });
      const record2 = await resource.insert({ id: 'custom-id', name: 'Custom' });
      const record3 = await resource.insert({ name: 'Third' });

      expect(record1.id).toBe('1');
      expect(record2.id).toBe('custom-id');
      expect(record3.id).toBe('2'); // Sequence continues, unaffected by manual ID
    });
  });

  describe('Sequence Isolation', () => {
    it('should maintain separate sequences per resource', async () => {
      const orders = await database.createResource({
        name: 'orders_isolated',
        attributes: { product: 'string' },
        idGenerator: 'incremental'
      });

      const invoices = await database.createResource({
        name: 'invoices_isolated',
        attributes: { amount: 'number' },
        idGenerator: 'incremental'
      });

      const order1 = await orders.insert({ product: 'Widget' });
      const invoice1 = await invoices.insert({ amount: 100 });
      const order2 = await orders.insert({ product: 'Gadget' });
      const invoice2 = await invoices.insert({ amount: 200 });

      // Each resource has its own independent sequence
      expect(order1.id).toBe('1');
      expect(order2.id).toBe('2');
      expect(invoice1.id).toBe('1');
      expect(invoice2.id).toBe('2');
    });
  });

  describe('Utility Methods', () => {
    it('should get current sequence value without incrementing', async () => {
      const resource = await database.createResource({
        name: 'utility_test',
        attributes: { name: 'string' },
        idGenerator: 'incremental:100'
      });

      await resource.insert({ name: 'First' });
      await resource.insert({ name: 'Second' });

      const nextValue = await resource.getSequenceValue();
      expect(nextValue).toBe(102); // Next ID that will be assigned (number from sequence)

      // Insert another to verify it wasn't incremented
      const record3 = await resource.insert({ name: 'Third' });
      expect(record3.id).toBe('102');
    });

    it('should reset sequence value', async () => {
      const resource = await database.createResource({
        name: 'reset_test',
        attributes: { name: 'string' },
        idGenerator: 'incremental'
      });

      await resource.insert({ name: 'First' });
      await resource.insert({ name: 'Second' });

      // Reset to 500
      await resource.resetSequence('id', 500);

      const record = await resource.insert({ name: 'After Reset' });
      expect(record.id).toBe('500');
    });

    it('should list sequences', async () => {
      const resource = await database.createResource({
        name: 'list_test',
        attributes: { name: 'string' },
        idGenerator: 'incremental'
      });

      await resource.insert({ name: 'First' });

      const sequences = await resource.listSequences();
      expect(sequences).toBeDefined();
      expect(Array.isArray(sequences)).toBe(true);
    });

    it('should return null for non-incremental resources', async () => {
      const resource = await database.createResource({
        name: 'non_incremental',
        attributes: { name: 'string' }
        // Default nanoid generator
      });

      const value = await resource.getSequenceValue();
      expect(value).toBeNull();

      const sequences = await resource.listSequences();
      expect(sequences).toBeNull();
    });
  });

  describe('Concurrent Inserts', () => {
    it('should handle concurrent inserts without duplicates', async () => {
      const resource = await database.createResource({
        name: 'concurrent_test',
        attributes: { index: 'number' },
        idGenerator: 'incremental'
      });

      // Insert 10 records concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        resource.insert({ index: i })
      );

      const results = await Promise.all(promises);
      const ids = results.map(r => r.id);

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);

      // All IDs should be string representations of numbers between 1 and 10
      ids.forEach(id => {
        const numId = parseInt(id, 10);
        expect(numId).toBeGreaterThanOrEqual(1);
        expect(numId).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('Fast Mode', () => {
    it('should generate IDs in fast mode', async () => {
      const resource = await database.createResource({
        name: 'fast_mode_test',
        attributes: { name: 'string' },
        idGenerator: 'incremental:fast'
      });

      const record1 = await resource.insert({ name: 'First' });
      const record2 = await resource.insert({ name: 'Second' });
      const record3 = await resource.insert({ name: 'Third' });

      // IDs should be unique and sequential within batch
      expect(record1.id).toBe('1');
      expect(record2.id).toBe('2');
      expect(record3.id).toBe('3');
    });

    it('should report batch status', async () => {
      const resource = await database.createResource({
        name: 'batch_status_test',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', mode: 'fast', batchSize: 50 }
      });

      await resource.insert({ name: 'First' });

      const status = resource.getBatchStatus();
      expect(status).toBeDefined();
      expect(status.start).toBe(1);
      expect(status.end).toBe(51); // 1 + 50
      expect(status.remaining).toBe(49); // Used 1, 49 left
    });

    it('should reserve batch explicitly', async () => {
      const resource = await database.createResource({
        name: 'reserve_batch_test',
        attributes: { name: 'string' },
        idGenerator: 'incremental:fast'
      });

      const batch = await resource.reserveIdBatch(200);

      expect(batch).toBeDefined();
      expect(batch.end - batch.start).toBe(200);
    });
  });

  describe('Prefixed IDs', () => {
    it('should generate prefixed IDs with padding', async () => {
      const resource = await database.createResource({
        name: 'prefixed_test',
        attributes: { name: 'string' },
        idGenerator: 'incremental:ORD-0001'
      });

      const record1 = await resource.insert({ name: 'First' });
      const record2 = await resource.insert({ name: 'Second' });

      expect(record1.id).toBe('ORD-0001');
      expect(record2.id).toBe('ORD-0002');
    });

    it('should handle padding overflow', async () => {
      const resource = await database.createResource({
        name: 'overflow_test',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', start: 999, prefix: 'A-', padding: 3 }
      });

      const record1 = await resource.insert({ name: 'First' });
      const record2 = await resource.insert({ name: 'Second' });

      expect(record1.id).toBe('A-999');
      expect(record2.id).toBe('A-1000'); // Overflow extends naturally
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative increment (decrementing IDs)', async () => {
      const resource = await database.createResource({
        name: 'decrement_test',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', start: 100, increment: -1 }
      });

      const record1 = await resource.insert({ name: 'First' });
      const record2 = await resource.insert({ name: 'Second' });
      const record3 = await resource.insert({ name: 'Third' });

      expect(record1.id).toBe('100');
      expect(record2.id).toBe('99');
      expect(record3.id).toBe('98');
    });

    it('should handle large increment values', async () => {
      const resource = await database.createResource({
        name: 'large_increment_test',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', start: 0, increment: 1000000 }
      });

      const record1 = await resource.insert({ name: 'First' });
      const record2 = await resource.insert({ name: 'Second' });

      expect(record1.id).toBe('0');
      expect(record2.id).toBe('1000000');
    });

    it('should handle very large start values', async () => {
      const resource = await database.createResource({
        name: 'large_start_test',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', start: 9999999999 }
      });

      const record1 = await resource.insert({ name: 'First' });
      expect(record1.id).toBe('9999999999');
    });

    it('should handle empty prefix', async () => {
      const resource = await database.createResource({
        name: 'empty_prefix_test',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', prefix: '', padding: 5 }
      });

      const record1 = await resource.insert({ name: 'First' });
      expect(record1.id).toBe('00001');
    });

    it('should handle prefix without padding', async () => {
      const resource = await database.createResource({
        name: 'prefix_no_padding_test',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', prefix: 'ID-', padding: 0 }
      });

      const record1 = await resource.insert({ name: 'First' });
      const record2 = await resource.insert({ name: 'Second' });

      expect(record1.id).toBe('ID-1');
      expect(record2.id).toBe('ID-2');
    });

    it('should handle parseIncrementalConfig with unknown format', () => {
      // Should return defaults for unknown formats
      const config = parseIncrementalConfig('incremental:unknown-format');
      expect(config.type).toBe('incremental');
      expect(config.start).toBe(1);
    });

    it('should handle fast mode with custom start value via object', async () => {
      const resource = await database.createResource({
        name: 'fast_custom_start_test',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', mode: 'fast', start: 5000, batchSize: 10 }
      });

      const record1 = await resource.insert({ name: 'First' });
      expect(record1.id).toBe('5000');

      const status = resource.getBatchStatus();
      expect(status.start).toBe(5000);
      expect(status.end).toBe(5010); // 5000 + batchSize(10)
    });

    it('should release batch correctly', async () => {
      const resource = await database.createResource({
        name: 'release_batch_test',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', mode: 'fast', batchSize: 50 }
      });

      await resource.insert({ name: 'First' });

      const beforeRelease = resource.getBatchStatus();
      expect(beforeRelease).not.toBeNull();

      resource.releaseBatch();

      const afterRelease = resource.getBatchStatus();
      expect(afterRelease).toBeNull();
    });
  });

  describe('High Concurrency Scenarios', () => {
    it('should handle 50 concurrent inserts without duplicates', async () => {
      const resource = await database.createResource({
        name: 'high_concurrency_test',
        attributes: { index: 'number' },
        idGenerator: 'incremental'
      });

      // Insert 50 records concurrently
      const promises = Array.from({ length: 50 }, (_, i) =>
        resource.insert({ index: i })
      );

      const results = await Promise.all(promises);
      const ids = results.map(r => r.id);

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(50);

      // All IDs should be valid numbers 1-50
      ids.forEach(id => {
        const numId = parseInt(id, 10);
        expect(numId).toBeGreaterThanOrEqual(1);
        expect(numId).toBeLessThanOrEqual(50);
      });
    });

    it('should handle fast mode with multiple batch exhaustions', async () => {
      const resource = await database.createResource({
        name: 'batch_exhaustion_test',
        attributes: { name: 'string' },
        idGenerator: { type: 'incremental', mode: 'fast', batchSize: 5 }
      });

      // Insert 12 records to force batch renewal (5 + 5 + 2)
      const records = [];
      for (let i = 0; i < 12; i++) {
        records.push(await resource.insert({ name: `Record ${i}` }));
      }

      const ids = records.map(r => parseInt(r.id, 10));

      // All IDs should be unique and sequential
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(12);

      // IDs should span multiple batches: 1-5, 6-10, 11-12
      expect(Math.min(...ids)).toBe(1);
      expect(Math.max(...ids)).toBe(12);
    });

    it('should handle concurrent inserts in fast mode efficiently', async () => {
      const resource = await database.createResource({
        name: 'fast_concurrent_test',
        attributes: { index: 'number' },
        idGenerator: { type: 'incremental', mode: 'fast', batchSize: 100 }
      });

      // Insert 30 records concurrently
      // Note: With high concurrency, multiple batches may be reserved
      // because the reservation happens before the local cache is populated
      const promises = Array.from({ length: 30 }, (_, i) =>
        resource.insert({ index: i })
      );

      const results = await Promise.all(promises);
      const ids = results.map(r => parseInt(r.id, 10));

      // All IDs should be unique (main guarantee)
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(30);

      // All IDs should be positive
      ids.forEach(id => {
        expect(id).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Persistence and Recovery', () => {
    it('should persist sequence value across resource recreations', async () => {
      const resourceName = 'persistence_test';

      // Create resource and insert some records
      const resource1 = await database.createResource({
        name: resourceName,
        attributes: { name: 'string' },
        idGenerator: 'incremental'
      });

      await resource1.insert({ name: 'First' });
      await resource1.insert({ name: 'Second' });
      await resource1.insert({ name: 'Third' });

      // Get sequence value
      const seqValue = await resource1.getSequenceValue();
      expect(seqValue).toBe(4); // Next ID will be 4

      // Get resource again (simulating app restart)
      const resource2 = await database.getResource(resourceName);

      // Insert new record - should continue from 4
      const record = await resource2.insert({ name: 'Fourth' });
      expect(record.id).toBe('4');
    });

    it('should correctly reset and continue sequence', async () => {
      const resource = await database.createResource({
        name: 'reset_continue_test',
        attributes: { name: 'string' },
        idGenerator: 'incremental'
      });

      // Insert some records
      await resource.insert({ name: 'First' }); // 1
      await resource.insert({ name: 'Second' }); // 2

      // Reset to 1000
      await resource.resetSequence('id', 1000);

      // Insert more
      const r1 = await resource.insert({ name: 'After Reset 1' });
      const r2 = await resource.insert({ name: 'After Reset 2' });

      expect(r1.id).toBe('1000');
      expect(r2.id).toBe('1001');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle non-incremental resource methods gracefully', async () => {
      const resource = await database.createResource({
        name: 'non_incremental_methods',
        attributes: { name: 'string' }
        // No idGenerator = default nanoid
      });

      // All these should return null without errors
      expect(await resource.getSequenceValue()).toBeNull();
      expect(await resource.listSequences()).toBeNull();
      expect(resource.getBatchStatus()).toBeNull();
      expect(resource.releaseBatch()).toBeUndefined();
      expect(await resource.reserveIdBatch()).toBeNull();
    });

    it('should not interfere with manual ID assignment', async () => {
      const resource = await database.createResource({
        name: 'manual_interference_test',
        attributes: { name: 'string' },
        idGenerator: 'incremental'
      });

      // Mix automatic and manual IDs
      const auto1 = await resource.insert({ name: 'Auto 1' }); // 1
      const manual1 = await resource.insert({ id: 'MANUAL-A', name: 'Manual' });
      const auto2 = await resource.insert({ name: 'Auto 2' }); // 2
      const manual2 = await resource.insert({ id: 'MANUAL-B', name: 'Manual 2' });
      const auto3 = await resource.insert({ name: 'Auto 3' }); // 3

      expect(auto1.id).toBe('1');
      expect(auto2.id).toBe('2');
      expect(auto3.id).toBe('3');
      expect(manual1.id).toBe('MANUAL-A');
      expect(manual2.id).toBe('MANUAL-B');

      // Verify sequence wasn't affected by manual IDs
      const seqValue = await resource.getSequenceValue();
      expect(seqValue).toBe(4); // Should be 4, not affected by manuals
    });
  });

  describe('Object Config Variations', () => {
    it('should handle object config with all options', async () => {
      const resource = await database.createResource({
        name: 'full_object_config_test',
        attributes: { name: 'string' },
        idGenerator: {
          type: 'incremental',
          start: 100,
          increment: 5,
          mode: 'standard',
          prefix: 'TEST-',
          padding: 6
        }
      });

      const r1 = await resource.insert({ name: 'First' });
      const r2 = await resource.insert({ name: 'Second' });

      expect(r1.id).toBe('TEST-000100');
      expect(r2.id).toBe('TEST-000105');
    });

    it('should handle fast mode with prefix and padding', async () => {
      const resource = await database.createResource({
        name: 'fast_prefix_test',
        attributes: { name: 'string' },
        idGenerator: {
          type: 'incremental',
          mode: 'fast',
          batchSize: 10,
          prefix: 'F-',
          padding: 4
        }
      });

      const r1 = await resource.insert({ name: 'First' });
      const r2 = await resource.insert({ name: 'Second' });

      expect(r1.id).toBe('F-0001');
      expect(r2.id).toBe('F-0002');
    });
  });
});
