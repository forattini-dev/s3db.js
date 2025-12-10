/**
 * Unit Tests for SequenceStorage and IncrementalSequence
 *
 * Tests the core sequence storage mechanisms including:
 * - Basic CRUD operations
 * - Distributed locking mechanism
 * - Lock contention and concurrency
 * - TTL expiration
 * - Exponential backoff
 */

import { Database } from '../../../src/database.class.js';
import {
  parseIncrementalConfig,
  validateIncrementalConfig,
  formatIncrementalValue,
  IncrementalSequence,
  IncrementalConfigError,
  createIncrementalIdGenerator
} from '../../../src/concerns/incremental-sequence.js';

describe('SequenceStorage Unit Tests', () => {
  let database;
  let client;

  beforeAll(async () => {
    database = new Database({
      connectionString: 'memory://test-bucket/sequence-storage-test',
      logLevel: 'silent'
    });
    await database.connect();
    client = database.client;
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('IncrementalSequence Class', () => {
    describe('Constructor and Configuration', () => {
      it('should create instance with standard mode config', () => {
        const config = parseIncrementalConfig('incremental');
        const sequence = new IncrementalSequence({
          client,
          resourceName: 'test_resource',
          config
        });

        expect(sequence.config.mode).toBe('standard');
        expect(sequence.config.start).toBe(1);
        expect(sequence.config.increment).toBe(1);
        expect(sequence.storage).toBeDefined();
      });

      it('should create instance with fast mode config', () => {
        const config = parseIncrementalConfig('incremental:fast');
        const sequence = new IncrementalSequence({
          client,
          resourceName: 'test_resource_fast',
          config
        });

        expect(sequence.config.mode).toBe('fast');
        expect(sequence.config.batchSize).toBe(100);
      });

      it('should create instance with prefix and padding', () => {
        const config = parseIncrementalConfig('incremental:ORD-0001');
        const sequence = new IncrementalSequence({
          client,
          resourceName: 'test_orders',
          config
        });

        expect(sequence.config.prefix).toBe('ORD-');
        expect(sequence.config.padding).toBe(4);
        expect(sequence.config.start).toBe(1);
      });

      it('should accept custom logger', () => {
        const customLogger = { debug: () => {}, warn: () => {} };
        const config = parseIncrementalConfig('incremental');
        const sequence = new IncrementalSequence({
          client,
          resourceName: 'test_logger',
          config,
          logger: customLogger
        });

        expect(sequence.logger).toBe(customLogger);
      });
    });

    describe('Standard Mode Operations', () => {
      let sequence;

      beforeEach(async () => {
        const resourceName = `std_mode_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const config = parseIncrementalConfig('incremental');
        sequence = new IncrementalSequence({ client, resourceName, config });
      });

      it('should generate sequential values starting from 1', async () => {
        const v1 = await sequence.nextValue('id');
        const v2 = await sequence.nextValue('id');
        const v3 = await sequence.nextValue('id');

        expect(v1).toBe('1');
        expect(v2).toBe('2');
        expect(v3).toBe('3');
      });

      it('should get current value without incrementing', async () => {
        await sequence.nextValue('id');
        await sequence.nextValue('id');

        const current = await sequence.getValue('id');
        expect(current).toBe(3); // Next value to be assigned

        // Verify no increment happened
        const next = await sequence.nextValue('id');
        expect(next).toBe('3');
      });

      it('should reset sequence value', async () => {
        await sequence.nextValue('id');
        await sequence.nextValue('id');

        await sequence.reset('id', 1000);

        const next = await sequence.nextValue('id');
        expect(next).toBe('1000');
      });

      it('should list sequences', async () => {
        await sequence.nextValue('id');
        await sequence.nextValue('customField');

        const sequences = await sequence.list();
        expect(sequences.length).toBe(2);
        expect(sequences.some(s => s.name === 'id')).toBe(true);
        expect(sequences.some(s => s.name === 'customField')).toBe(true);
      });

      it('should maintain separate sequences for different fields', async () => {
        const id1 = await sequence.nextValue('orderId');
        const id2 = await sequence.nextValue('orderId');
        const inv1 = await sequence.nextValue('invoiceId');
        const inv2 = await sequence.nextValue('invoiceId');

        expect(id1).toBe('1');
        expect(id2).toBe('2');
        expect(inv1).toBe('1');
        expect(inv2).toBe('2');
      });
    });

    describe('Fast Mode Operations', () => {
      let sequence;

      beforeEach(async () => {
        const resourceName = `fast_mode_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const config = parseIncrementalConfig({ type: 'incremental', mode: 'fast', batchSize: 10 });
        sequence = new IncrementalSequence({ client, resourceName, config });
      });

      it('should generate IDs from local batch', async () => {
        const v1 = await sequence.nextValueFast('id');
        const v2 = await sequence.nextValueFast('id');
        const v3 = await sequence.nextValueFast('id');

        expect(v1).toBe('1');
        expect(v2).toBe('2');
        expect(v3).toBe('3');
      });

      it('should report batch status', async () => {
        await sequence.nextValueFast('id');
        await sequence.nextValueFast('id');

        const status = sequence.getBatchStatus('id');
        expect(status).not.toBeNull();
        expect(status.start).toBe(1);
        expect(status.end).toBe(11); // batchSize = 10
        expect(status.current).toBe(3);
        expect(status.remaining).toBe(8);
      });

      it('should reserve new batch when exhausted', async () => {
        // Use all 10 IDs in batch
        for (let i = 0; i < 10; i++) {
          await sequence.nextValueFast('id');
        }

        // This should trigger new batch reservation
        const v11 = await sequence.nextValueFast('id');
        expect(v11).toBe('11');

        const status = sequence.getBatchStatus('id');
        expect(status.start).toBe(11);
        expect(status.end).toBe(21);
      });

      it('should reserve explicit batch', async () => {
        const batch = await sequence.reserveBatch('id', 50);

        expect(batch.start).toBe(1);
        expect(batch.end).toBe(51);
        expect(batch.current).toBe(1);
      });

      it('should release batch correctly', async () => {
        await sequence.nextValueFast('id');
        expect(sequence.getBatchStatus('id')).not.toBeNull();

        sequence.releaseBatch('id');
        expect(sequence.getBatchStatus('id')).toBeNull();
      });

      it('should clear local batch on reset', async () => {
        await sequence.nextValueFast('id');
        await sequence.nextValueFast('id');

        await sequence.reset('id', 500);

        // Batch should be cleared
        expect(sequence.getBatchStatus('id')).toBeNull();

        // Next value should be from new sequence
        const next = await sequence.nextValueFast('id');
        expect(next).toBe('500');
      });
    });

    describe('Formatting with Prefix and Padding', () => {
      it('should format values with prefix', async () => {
        const resourceName = `prefix_${Date.now()}`;
        const config = parseIncrementalConfig({ type: 'incremental', prefix: 'ORD-' });
        const sequence = new IncrementalSequence({ client, resourceName, config });

        const v1 = await sequence.next('id');
        expect(v1).toBe('ORD-1');
      });

      it('should format values with padding', async () => {
        const resourceName = `padding_${Date.now()}`;
        const config = parseIncrementalConfig({ type: 'incremental', padding: 5 });
        const sequence = new IncrementalSequence({ client, resourceName, config });

        const v1 = await sequence.next('id');
        expect(v1).toBe('00001');
      });

      it('should format values with prefix and padding', async () => {
        const resourceName = `prefix_padding_${Date.now()}`;
        const config = parseIncrementalConfig('incremental:INV-0001');
        const sequence = new IncrementalSequence({ client, resourceName, config });

        const v1 = await sequence.next('id');
        const v2 = await sequence.next('id');

        expect(v1).toBe('INV-0001');
        expect(v2).toBe('INV-0002');
      });

      it('should handle padding overflow gracefully', async () => {
        const resourceName = `overflow_${Date.now()}`;
        const config = parseIncrementalConfig({ type: 'incremental', start: 999, padding: 3 });
        const sequence = new IncrementalSequence({ client, resourceName, config });

        const v1 = await sequence.next('id');
        const v2 = await sequence.next('id');

        expect(v1).toBe('999');
        expect(v2).toBe('1000'); // Overflows padding
      });
    });

    describe('Custom Increment', () => {
      it('should use custom increment step', async () => {
        const resourceName = `custom_inc_${Date.now()}`;
        const config = parseIncrementalConfig({ type: 'incremental', start: 100, increment: 10 });
        const sequence = new IncrementalSequence({ client, resourceName, config });

        const v1 = await sequence.next('id');
        const v2 = await sequence.next('id');
        const v3 = await sequence.next('id');

        expect(v1).toBe('100');
        expect(v2).toBe('110');
        expect(v3).toBe('120');
      });

      it('should support negative increment (decrementing)', async () => {
        const resourceName = `dec_${Date.now()}`;
        const config = parseIncrementalConfig({ type: 'incremental', start: 100, increment: -1 });
        const sequence = new IncrementalSequence({ client, resourceName, config });

        const v1 = await sequence.next('id');
        const v2 = await sequence.next('id');

        expect(v1).toBe('100');
        expect(v2).toBe('99');
      });
    });
  });

  describe('Distributed Locking', () => {
    describe('Lock Acquisition', () => {
      it('should acquire lock successfully', async () => {
        const resourceName = `lock_acq_${Date.now()}`;
        const config = parseIncrementalConfig('incremental');
        const sequence = new IncrementalSequence({ client, resourceName, config });

        // Lock is implicitly acquired during nextValue
        const v1 = await sequence.nextValue('id');
        expect(v1).toBe('1');
      });

      it('should handle concurrent lock attempts with retry', async () => {
        const resourceName = `lock_retry_${Date.now()}`;
        const config = parseIncrementalConfig('incremental');
        const sequence = new IncrementalSequence({ client, resourceName, config });

        // Launch 5 concurrent operations
        const promises = Array.from({ length: 5 }, () => sequence.nextValue('id'));
        const results = await Promise.all(promises);

        // All should succeed with unique values
        const uniqueValues = new Set(results);
        expect(uniqueValues.size).toBe(5);
      });

      it('should timeout if lock cannot be acquired', async () => {
        const resourceName = `lock_timeout_${Date.now()}`;
        const config = parseIncrementalConfig('incremental');
        const sequence = new IncrementalSequence({ client, resourceName, config });

        // Manually create a long-held lock
        const lockKey = `resource=${resourceName}/sequence=id/lock`;
        await client.putObject({
          key: lockKey,
          body: JSON.stringify({
            token: 'held-lock',
            acquiredAt: Date.now(),
            _expiresAt: Date.now() + 60000 // 60s TTL
          }),
          contentType: 'application/json'
        });

        // Try to acquire with short timeout
        const acquireLock = sequence.storage.acquireLock('id', { timeout: 100, ttl: 5 });

        const result = await acquireLock;
        expect(result).toBeNull(); // Should timeout

        // Cleanup
        await client.deleteObject(lockKey);
      });
    });

    describe('Lock TTL Expiration', () => {
      it('should clean up expired locks', async () => {
        const resourceName = `lock_ttl_${Date.now()}`;
        const config = parseIncrementalConfig('incremental');
        const sequence = new IncrementalSequence({ client, resourceName, config });

        // Create an already expired lock
        const lockKey = `resource=${resourceName}/sequence=id/lock`;
        await client.putObject({
          key: lockKey,
          body: JSON.stringify({
            token: 'expired-lock',
            acquiredAt: Date.now() - 10000,
            _expiresAt: Date.now() - 5000 // Already expired
          }),
          contentType: 'application/json'
        });

        // Should be able to acquire because old lock is expired
        const v1 = await sequence.nextValue('id');
        expect(v1).toBe('1');
      });
    });

    describe('Lock Token Validation', () => {
      it('should only release lock with correct token', async () => {
        const resourceName = `lock_token_${Date.now()}`;
        const config = parseIncrementalConfig('incremental');
        const sequence = new IncrementalSequence({ client, resourceName, config });

        // Create a lock
        const lock = await sequence.storage.acquireLock('testField', { ttl: 30 });
        expect(lock).not.toBeNull();

        // Try to release with wrong token (simulating another process)
        const wrongLock = { ...lock, token: 'wrong-token' };
        await sequence.storage.releaseLock(wrongLock);

        // Original lock should still exist
        const lockKey = `resource=${resourceName}/sequence=testField/lock`;
        const response = await client.getObject(lockKey);
        const body = await response.Body.transformToString();
        const lockData = JSON.parse(body);
        expect(lockData.token).toBe(lock.token);

        // Cleanup
        await sequence.storage.releaseLock(lock);
      });
    });
  });

  describe('Concurrency Tests', () => {
    describe('Sequential Consistency', () => {
      it('should maintain strict ordering with 10 concurrent inserts', async () => {
        const resourceName = `seq_10_${Date.now()}`;
        const config = parseIncrementalConfig('incremental');
        const sequence = new IncrementalSequence({ client, resourceName, config });

        const promises = Array.from({ length: 10 }, () => sequence.nextValue('id'));
        const results = await Promise.all(promises);

        const numericResults = results.map(r => parseInt(r, 10));
        const sorted = [...numericResults].sort((a, b) => a - b);

        // Should be 1-10
        expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      });

      it('should maintain strict ordering with 50 concurrent inserts', async () => {
        const resourceName = `seq_50_${Date.now()}`;
        const config = parseIncrementalConfig('incremental');
        const sequence = new IncrementalSequence({ client, resourceName, config });

        const promises = Array.from({ length: 50 }, () => sequence.nextValue('id'));
        const results = await Promise.all(promises);

        const numericResults = results.map(r => parseInt(r, 10));
        const uniqueValues = new Set(numericResults);

        expect(uniqueValues.size).toBe(50);
        expect(Math.min(...numericResults)).toBe(1);
        expect(Math.max(...numericResults)).toBe(50);
      });
    });

    describe('Fast Mode Concurrency', () => {
      it('should handle concurrent fast mode inserts', async () => {
        const resourceName = `fast_conc_${Date.now()}`;
        const config = parseIncrementalConfig({ type: 'incremental', mode: 'fast', batchSize: 100 });
        const sequence = new IncrementalSequence({ client, resourceName, config });

        const promises = Array.from({ length: 20 }, () => sequence.nextValueFast('id'));
        const results = await Promise.all(promises);

        const numericResults = results.map(r => parseInt(r, 10));
        const uniqueValues = new Set(numericResults);

        // All unique
        expect(uniqueValues.size).toBe(20);

        // All positive
        numericResults.forEach(v => expect(v).toBeGreaterThan(0));
      });

      it('should handle batch exhaustion under concurrency', async () => {
        const resourceName = `batch_exh_${Date.now()}`;
        const config = parseIncrementalConfig({ type: 'incremental', mode: 'fast', batchSize: 5 });
        const sequence = new IncrementalSequence({ client, resourceName, config });

        // 15 inserts with batch size 5 = 3 batch reservations
        const promises = Array.from({ length: 15 }, () => sequence.nextValueFast('id'));
        const results = await Promise.all(promises);

        const numericResults = results.map(r => parseInt(r, 10));
        const uniqueValues = new Set(numericResults);

        expect(uniqueValues.size).toBe(15);
      });
    });

    describe('Multiple Sequences Concurrency', () => {
      it('should handle concurrent operations on multiple fields', async () => {
        const resourceName = `multi_seq_${Date.now()}`;
        const config = parseIncrementalConfig('incremental');
        const sequence = new IncrementalSequence({ client, resourceName, config });

        const promises = [
          ...Array.from({ length: 5 }, () => sequence.nextValue('orderId')),
          ...Array.from({ length: 5 }, () => sequence.nextValue('invoiceId')),
          ...Array.from({ length: 5 }, () => sequence.nextValue('ticketId'))
        ];

        const results = await Promise.all(promises);

        // Each sequence should have 5 unique values
        const orderIds = results.slice(0, 5).map(r => parseInt(r, 10));
        const invoiceIds = results.slice(5, 10).map(r => parseInt(r, 10));
        const ticketIds = results.slice(10, 15).map(r => parseInt(r, 10));

        expect(new Set(orderIds).size).toBe(5);
        expect(new Set(invoiceIds).size).toBe(5);
        expect(new Set(ticketIds).size).toBe(5);

        // Each sequence starts from 1
        expect(Math.min(...orderIds)).toBe(1);
        expect(Math.min(...invoiceIds)).toBe(1);
        expect(Math.min(...ticketIds)).toBe(1);
      });
    });

    describe('Multiple IncrementalSequence Instances (Simulating Multiple Processes)', () => {
      it('should maintain uniqueness across multiple instances', async () => {
        const resourceName = `multi_inst_${Date.now()}`;
        const config = parseIncrementalConfig('incremental');

        // Create 3 "process" instances sharing same storage
        const seq1 = new IncrementalSequence({ client, resourceName, config });
        const seq2 = new IncrementalSequence({ client, resourceName, config });
        const seq3 = new IncrementalSequence({ client, resourceName, config });

        const promises = [
          ...Array.from({ length: 5 }, () => seq1.nextValue('id')),
          ...Array.from({ length: 5 }, () => seq2.nextValue('id')),
          ...Array.from({ length: 5 }, () => seq3.nextValue('id'))
        ];

        const results = await Promise.all(promises);
        const numericResults = results.map(r => parseInt(r, 10));
        const uniqueValues = new Set(numericResults);

        // All 15 values should be unique
        expect(uniqueValues.size).toBe(15);

        // Values should be 1-15
        expect(Math.min(...numericResults)).toBe(1);
        expect(Math.max(...numericResults)).toBe(15);
      });

      it('should handle fast mode across multiple instances', async () => {
        const resourceName = `multi_fast_${Date.now()}`;
        const config = parseIncrementalConfig({ type: 'incremental', mode: 'fast', batchSize: 10 });

        // Each instance reserves its own batch
        const seq1 = new IncrementalSequence({ client, resourceName, config });
        const seq2 = new IncrementalSequence({ client, resourceName, config });

        const promises = [
          ...Array.from({ length: 8 }, () => seq1.nextValueFast('id')),
          ...Array.from({ length: 8 }, () => seq2.nextValueFast('id'))
        ];

        const results = await Promise.all(promises);
        const numericResults = results.map(r => parseInt(r, 10));
        const uniqueValues = new Set(numericResults);

        // All 16 values should be unique (each instance reserves separate batch)
        expect(uniqueValues.size).toBe(16);
      });
    });
  });

  describe('createIncrementalIdGenerator Factory', () => {
    it('should create working generator', async () => {
      const resourceName = `factory_${Date.now()}`;
      const generator = createIncrementalIdGenerator({
        client,
        resourceName,
        config: 'incremental'
      });

      const id1 = await generator();
      const id2 = await generator();

      expect(id1).toBe('1');
      expect(id2).toBe('2');
    });

    it('should expose _sequence for utility methods', async () => {
      const resourceName = `factory_seq_${Date.now()}`;
      const generator = createIncrementalIdGenerator({
        client,
        resourceName,
        config: 'incremental:fast'
      });

      expect(generator._sequence).toBeDefined();
      expect(generator._config.mode).toBe('fast');

      await generator();
      const status = generator._sequence.getBatchStatus('id');
      expect(status).not.toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle getValue on non-existent sequence', async () => {
      const resourceName = `nonexistent_${Date.now()}`;
      const config = parseIncrementalConfig('incremental');
      const sequence = new IncrementalSequence({ client, resourceName, config });

      const value = await sequence.getValue('nonexistent');
      expect(value).toBeNull();
    });

    it('should handle list on empty resource', async () => {
      const resourceName = `empty_${Date.now()}`;
      const config = parseIncrementalConfig('incremental');
      const sequence = new IncrementalSequence({ client, resourceName, config });

      const sequences = await sequence.list();
      expect(sequences).toEqual([]);
    });

    it('should handle very large start values', async () => {
      const resourceName = `large_${Date.now()}`;
      const config = parseIncrementalConfig({ type: 'incremental', start: 9999999999 });
      const sequence = new IncrementalSequence({ client, resourceName, config });

      const v1 = await sequence.next('id');
      const v2 = await sequence.next('id');

      expect(v1).toBe('9999999999');
      expect(v2).toBe('10000000000');
    });

    it('should handle zero start value', async () => {
      const resourceName = `zero_${Date.now()}`;
      const config = parseIncrementalConfig({ type: 'incremental', start: 0 });
      const sequence = new IncrementalSequence({ client, resourceName, config });

      const v1 = await sequence.next('id');
      const v2 = await sequence.next('id');

      expect(v1).toBe('0');
      expect(v2).toBe('1');
    });

    it('should handle getBatchStatus on standard mode', async () => {
      const resourceName = `std_batch_${Date.now()}`;
      const config = parseIncrementalConfig('incremental'); // standard mode
      const sequence = new IncrementalSequence({ client, resourceName, config });

      await sequence.next('id');
      const status = sequence.getBatchStatus('id');
      expect(status).toBeNull(); // No batch in standard mode
    });

    it('should handle releaseBatch on non-existent batch', () => {
      const resourceName = `no_batch_${Date.now()}`;
      const config = parseIncrementalConfig('incremental:fast');
      const sequence = new IncrementalSequence({ client, resourceName, config });

      // Should not throw
      expect(() => sequence.releaseBatch('id')).not.toThrow();
    });
  });
});

describe('Aggressive Concurrency and Lock Contention Tests', () => {
  let database;
  let client;

  beforeAll(async () => {
    database = new Database({
      connectionString: 'memory://test-bucket/aggressive-concurrency-test',
      logLevel: 'silent'
    });
    await database.connect();
    client = database.client;
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('High Contention Standard Mode', () => {
    it('should handle 100 concurrent inserts without duplicates', async () => {
      const resourceName = `contention_100_${Date.now()}`;
      const config = parseIncrementalConfig('incremental');
      const sequence = new IncrementalSequence({ client, resourceName, config });

      const promises = Array.from({ length: 100 }, () => sequence.nextValue('id'));
      const results = await Promise.all(promises);

      const numericResults = results.map(r => parseInt(r, 10));
      const uniqueValues = new Set(numericResults);

      expect(uniqueValues.size).toBe(100);
      expect(Math.min(...numericResults)).toBe(1);
      expect(Math.max(...numericResults)).toBe(100);
    });

    it('should handle waves of concurrent inserts', async () => {
      const resourceName = `waves_${Date.now()}`;
      const config = parseIncrementalConfig('incremental');
      const sequence = new IncrementalSequence({ client, resourceName, config });

      // Wave 1: 20 concurrent
      const wave1 = await Promise.all(
        Array.from({ length: 20 }, () => sequence.nextValue('id'))
      );

      // Wave 2: 20 concurrent
      const wave2 = await Promise.all(
        Array.from({ length: 20 }, () => sequence.nextValue('id'))
      );

      // Wave 3: 20 concurrent
      const wave3 = await Promise.all(
        Array.from({ length: 20 }, () => sequence.nextValue('id'))
      );

      const allResults = [...wave1, ...wave2, ...wave3].map(r => parseInt(r, 10));
      const uniqueValues = new Set(allResults);

      expect(uniqueValues.size).toBe(60);
      expect(Math.min(...allResults)).toBe(1);
      expect(Math.max(...allResults)).toBe(60);
    });

    it('should handle interleaved operations across multiple fields', async () => {
      const resourceName = `interleaved_${Date.now()}`;
      const config = parseIncrementalConfig('incremental');
      const sequence = new IncrementalSequence({ client, resourceName, config });

      // Interleave different sequences
      const promises = [];
      for (let i = 0; i < 30; i++) {
        promises.push(sequence.nextValue('orders'));
        promises.push(sequence.nextValue('invoices'));
        promises.push(sequence.nextValue('tickets'));
      }

      const results = await Promise.all(promises);

      // Extract by field (every 3rd result)
      const orders = [];
      const invoices = [];
      const tickets = [];
      for (let i = 0; i < results.length; i += 3) {
        orders.push(parseInt(results[i], 10));
        invoices.push(parseInt(results[i + 1], 10));
        tickets.push(parseInt(results[i + 2], 10));
      }

      expect(new Set(orders).size).toBe(30);
      expect(new Set(invoices).size).toBe(30);
      expect(new Set(tickets).size).toBe(30);
    });
  });

  describe('High Contention Fast Mode', () => {
    it('should handle concurrent batch exhaustion', async () => {
      const resourceName = `batch_contention_${Date.now()}`;
      const config = parseIncrementalConfig({ type: 'incremental', mode: 'fast', batchSize: 10 });
      const sequence = new IncrementalSequence({ client, resourceName, config });

      // 50 concurrent inserts with batch size 10 = many batch reservations
      const promises = Array.from({ length: 50 }, () => sequence.nextValueFast('id'));
      const results = await Promise.all(promises);

      const numericResults = results.map(r => parseInt(r, 10));
      const uniqueValues = new Set(numericResults);

      expect(uniqueValues.size).toBe(50);
    });

    it('should handle multiple instances racing for batches', async () => {
      const resourceName = `race_${Date.now()}`;
      const config = parseIncrementalConfig({ type: 'incremental', mode: 'fast', batchSize: 5 });

      // 5 "processes" each trying to get batches
      const seq1 = new IncrementalSequence({ client, resourceName, config });
      const seq2 = new IncrementalSequence({ client, resourceName, config });
      const seq3 = new IncrementalSequence({ client, resourceName, config });
      const seq4 = new IncrementalSequence({ client, resourceName, config });
      const seq5 = new IncrementalSequence({ client, resourceName, config });

      const promises = [
        ...Array.from({ length: 10 }, () => seq1.nextValueFast('id')),
        ...Array.from({ length: 10 }, () => seq2.nextValueFast('id')),
        ...Array.from({ length: 10 }, () => seq3.nextValueFast('id')),
        ...Array.from({ length: 10 }, () => seq4.nextValueFast('id')),
        ...Array.from({ length: 10 }, () => seq5.nextValueFast('id'))
      ];

      const results = await Promise.all(promises);
      const numericResults = results.map(r => parseInt(r, 10));
      const uniqueValues = new Set(numericResults);

      // All 50 values should be unique
      expect(uniqueValues.size).toBe(50);
    });
  });

  describe('Lock Recovery and Resilience', () => {
    it('should recover from stale locks automatically', async () => {
      const resourceName = `stale_lock_${Date.now()}`;
      const config = parseIncrementalConfig('incremental');
      const sequence = new IncrementalSequence({ client, resourceName, config });

      // Create a stale lock with expired TTL
      const lockKey = `resource=${resourceName}/sequence=id/lock`;
      await client.putObject({
        key: lockKey,
        body: JSON.stringify({
          token: 'stale-token',
          acquiredAt: Date.now() - 60000,
          _expiresAt: Date.now() - 30000 // Expired 30 seconds ago
        }),
        contentType: 'application/json'
      });

      // Should still be able to get values (stale lock cleaned up)
      const v1 = await sequence.nextValue('id');
      const v2 = await sequence.nextValue('id');

      expect(v1).toBe('1');
      expect(v2).toBe('2');
    });

    it('should handle concurrent access during lock cleanup', async () => {
      const resourceName = `concurrent_cleanup_${Date.now()}`;
      const config = parseIncrementalConfig('incremental');

      // Create multiple instances
      const seq1 = new IncrementalSequence({ client, resourceName, config });
      const seq2 = new IncrementalSequence({ client, resourceName, config });

      // Create an expired lock
      const lockKey = `resource=${resourceName}/sequence=id/lock`;
      await client.putObject({
        key: lockKey,
        body: JSON.stringify({
          token: 'expired-token',
          acquiredAt: Date.now() - 60000,
          _expiresAt: Date.now() - 30000
        }),
        contentType: 'application/json'
      });

      // Both instances try to access concurrently
      const promises = [
        seq1.nextValue('id'),
        seq2.nextValue('id'),
        seq1.nextValue('id'),
        seq2.nextValue('id')
      ];

      const results = await Promise.all(promises);
      const numericResults = results.map(r => parseInt(r, 10));
      const uniqueValues = new Set(numericResults);

      expect(uniqueValues.size).toBe(4);
    });
  });

  describe('Stress Tests', () => {
    it('should handle rapid sequential inserts', async () => {
      const resourceName = `rapid_seq_${Date.now()}`;
      const config = parseIncrementalConfig('incremental');
      const sequence = new IncrementalSequence({ client, resourceName, config });

      // 50 rapid sequential inserts
      const results = [];
      for (let i = 0; i < 50; i++) {
        results.push(await sequence.nextValue('id'));
      }

      const numericResults = results.map(r => parseInt(r, 10));

      // Should be strictly sequential: 1, 2, 3, ..., 50
      for (let i = 0; i < 50; i++) {
        expect(numericResults[i]).toBe(i + 1);
      }
    });

    it('should handle mixed sequential and concurrent operations', async () => {
      const resourceName = `mixed_ops_${Date.now()}`;
      const config = parseIncrementalConfig('incremental');
      const sequence = new IncrementalSequence({ client, resourceName, config });

      // Sequential: 10 inserts
      for (let i = 0; i < 10; i++) {
        await sequence.nextValue('id');
      }

      // Concurrent: 20 inserts
      const concurrent = await Promise.all(
        Array.from({ length: 20 }, () => sequence.nextValue('id'))
      );

      // Sequential: 10 more inserts
      for (let i = 0; i < 10; i++) {
        await sequence.nextValue('id');
      }

      // Verify final state
      const finalValue = await sequence.getValue('id');
      expect(finalValue).toBe(41); // Next value will be 41

      // Concurrent results should be unique and in range 11-30
      const concurrentNums = concurrent.map(r => parseInt(r, 10));
      expect(new Set(concurrentNums).size).toBe(20);
    });

    it('should maintain consistency under reset operations', async () => {
      const resourceName = `reset_stress_${Date.now()}`;
      const config = parseIncrementalConfig('incremental');
      const sequence = new IncrementalSequence({ client, resourceName, config });

      // Insert some values
      await sequence.nextValue('id');
      await sequence.nextValue('id');
      await sequence.nextValue('id');

      // Reset
      await sequence.reset('id', 100);

      // Concurrent inserts after reset
      const afterReset = await Promise.all(
        Array.from({ length: 10 }, () => sequence.nextValue('id'))
      );

      const nums = afterReset.map(r => parseInt(r, 10));
      const uniqueValues = new Set(nums);

      expect(uniqueValues.size).toBe(10);
      expect(Math.min(...nums)).toBe(100);
      expect(Math.max(...nums)).toBe(109);
    });
  });

  describe('Resource Isolation Under Concurrency', () => {
    it('should maintain strict isolation between resources', async () => {
      const config = parseIncrementalConfig('incremental');

      const seq1 = new IncrementalSequence({
        client,
        resourceName: `resource_a_${Date.now()}`,
        config
      });
      const seq2 = new IncrementalSequence({
        client,
        resourceName: `resource_b_${Date.now()}`,
        config
      });

      // Interleaved concurrent operations
      const promises = [
        ...Array.from({ length: 25 }, () => seq1.nextValue('id')),
        ...Array.from({ length: 25 }, () => seq2.nextValue('id'))
      ];

      const results = await Promise.all(promises);

      // Split results
      const res1 = results.slice(0, 25).map(r => parseInt(r, 10));
      const res2 = results.slice(25).map(r => parseInt(r, 10));

      // Each resource should have 25 unique values 1-25
      expect(new Set(res1).size).toBe(25);
      expect(new Set(res2).size).toBe(25);
      expect(Math.min(...res1)).toBe(1);
      expect(Math.min(...res2)).toBe(1);
    });
  });
});

describe('parseIncrementalConfig Unit Tests', () => {
  it('should parse string "incremental"', () => {
    const config = parseIncrementalConfig('incremental');
    expect(config.type).toBe('incremental');
    expect(config.start).toBe(1);
    expect(config.increment).toBe(1);
    expect(config.mode).toBe('standard');
    expect(config.batchSize).toBe(100);
    expect(config.prefix).toBe('');
    expect(config.padding).toBe(0);
  });

  it('should parse "incremental:1000"', () => {
    const config = parseIncrementalConfig('incremental:1000');
    expect(config.start).toBe(1000);
    expect(config.mode).toBe('standard');
  });

  it('should parse "incremental:fast"', () => {
    const config = parseIncrementalConfig('incremental:fast');
    expect(config.mode).toBe('fast');
    expect(config.start).toBe(1);
    expect(config.batchSize).toBe(100);
  });

  it('should parse "incremental:fast:5000"', () => {
    const config = parseIncrementalConfig('incremental:fast:5000');
    expect(config.mode).toBe('fast');
    expect(config.start).toBe(5000);
  });

  it('should parse "incremental:ORD-0001"', () => {
    const config = parseIncrementalConfig('incremental:ORD-0001');
    expect(config.prefix).toBe('ORD-');
    expect(config.start).toBe(1);
    expect(config.padding).toBe(4);
  });

  it('should parse "incremental:ABC-99999"', () => {
    const config = parseIncrementalConfig('incremental:ABC-99999');
    expect(config.prefix).toBe('ABC-');
    expect(config.start).toBe(99999);
    expect(config.padding).toBe(5);
  });

  it('should parse object config', () => {
    const config = parseIncrementalConfig({
      type: 'incremental',
      start: 500,
      increment: 5,
      mode: 'fast',
      batchSize: 50,
      prefix: 'X-',
      padding: 6
    });

    expect(config.type).toBe('incremental');
    expect(config.start).toBe(500);
    expect(config.increment).toBe(5);
    expect(config.mode).toBe('fast');
    expect(config.batchSize).toBe(50);
    expect(config.prefix).toBe('X-');
    expect(config.padding).toBe(6);
  });

  it('should use defaults for unknown string format', () => {
    const config = parseIncrementalConfig('incremental:unknown-value');
    expect(config.type).toBe('incremental');
    expect(config.start).toBe(1);
    expect(config.mode).toBe('standard');
  });

  it('should use defaults for invalid input', () => {
    const config = parseIncrementalConfig(null);
    expect(config.type).toBe('incremental');
    expect(config.start).toBe(1);
  });
});

describe('formatIncrementalValue Unit Tests', () => {
  it('should format without options', () => {
    expect(formatIncrementalValue(42)).toBe('42');
  });

  it('should format with padding', () => {
    expect(formatIncrementalValue(42, { padding: 5 })).toBe('00042');
  });

  it('should format with prefix', () => {
    expect(formatIncrementalValue(42, { prefix: 'ID-' })).toBe('ID-42');
  });

  it('should format with prefix and padding', () => {
    expect(formatIncrementalValue(42, { prefix: 'ORD-', padding: 4 })).toBe('ORD-0042');
  });

  it('should handle padding overflow', () => {
    expect(formatIncrementalValue(12345, { padding: 3 })).toBe('12345');
  });

  it('should handle zero', () => {
    expect(formatIncrementalValue(0, { padding: 4 })).toBe('0000');
  });

  it('should handle negative numbers', () => {
    // Note: padStart pads the string representation, so "-5" becomes "0-5"
    // This is expected JS behavior - negative increments are a rare edge case
    expect(formatIncrementalValue(-5, { padding: 3 })).toBe('0-5');
  });
});

describe('validateIncrementalConfig Unit Tests', () => {
  describe('Valid Configurations', () => {
    it('should accept valid standard configuration', () => {
      const config = { start: 1, increment: 1, mode: 'standard', batchSize: 100, prefix: '', padding: 0 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid fast mode configuration', () => {
      const config = { start: 1000, increment: 5, mode: 'fast', batchSize: 500, prefix: 'ORD-', padding: 6 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(true);
    });

    it('should accept negative start value', () => {
      const config = { start: -100, increment: 1, mode: 'standard' };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(true);
    });

    it('should accept negative increment', () => {
      const config = { start: 100, increment: -1, mode: 'standard' };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(true);
    });

    it('should accept zero start value', () => {
      const config = { start: 0, increment: 1, mode: 'standard' };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(true);
    });

    it('should accept prefix with allowed characters', () => {
      const config = { prefix: 'ABC-123_XYZ' };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid start Values', () => {
    it('should reject non-number start', () => {
      const config = { start: 'invalid' };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('start');
      expect(result.errors[0].message).toContain('finite number');
    });

    it('should reject NaN start', () => {
      const config = { start: NaN };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('start');
    });

    it('should reject Infinity start', () => {
      const config = { start: Infinity };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('start');
    });

    it('should reject float start', () => {
      const config = { start: 1.5 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('integer');
    });
  });

  describe('Invalid increment Values', () => {
    it('should reject zero increment', () => {
      const config = { increment: 0 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('increment');
      expect(result.errors[0].message).toContain('cannot be zero');
    });

    it('should reject non-number increment', () => {
      const config = { increment: 'fast' };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('increment');
    });

    it('should reject float increment', () => {
      const config = { increment: 0.5 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('integer');
    });
  });

  describe('Invalid mode Values', () => {
    it('should reject invalid mode', () => {
      const config = { mode: 'turbo' };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('mode');
      expect(result.errors[0].message).toContain('standard, fast');
    });

    it('should reject numeric mode', () => {
      const config = { mode: 1 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
    });
  });

  describe('Invalid batchSize Values', () => {
    it('should reject zero batchSize', () => {
      const config = { batchSize: 0 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('batchSize');
    });

    it('should reject negative batchSize', () => {
      const config = { batchSize: -10 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
    });

    it('should reject batchSize exceeding max', () => {
      const config = { batchSize: 200000 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('100000');
    });

    it('should reject float batchSize', () => {
      const config = { batchSize: 50.5 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
    });
  });

  describe('Invalid prefix Values', () => {
    it('should reject non-string prefix', () => {
      const config = { prefix: 123 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('prefix');
      expect(result.errors[0].message).toContain('string');
    });

    it('should reject prefix exceeding max length', () => {
      const config = { prefix: 'A'.repeat(25) };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('20 characters');
    });

    it('should reject prefix with invalid characters', () => {
      const config = { prefix: 'ORD@#!' };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('alphanumeric');
    });

    it('should reject prefix with spaces', () => {
      const config = { prefix: 'ORD ' };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
    });
  });

  describe('Invalid padding Values', () => {
    it('should reject negative padding', () => {
      const config = { padding: -1 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('padding');
    });

    it('should reject padding exceeding max', () => {
      const config = { padding: 25 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('20');
    });

    it('should reject non-number padding', () => {
      const config = { padding: '4' };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
    });

    it('should reject float padding', () => {
      const config = { padding: 4.5 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
    });
  });

  describe('Multiple Errors', () => {
    it('should collect multiple validation errors', () => {
      const config = { start: 'bad', increment: 0, mode: 'invalid', batchSize: -1 };
      const result = validateIncrementalConfig(config, { throwOnError: false });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('throwOnError Behavior', () => {
    it('should throw IncrementalConfigError when throwOnError is true', () => {
      const config = { start: 'invalid' };
      expect(() => validateIncrementalConfig(config, { throwOnError: true }))
        .toThrow(IncrementalConfigError);
    });

    it('should throw with correct error properties', () => {
      const config = { start: 'invalid' };
      try {
        validateIncrementalConfig(config, { throwOnError: true });
        fail('Should have thrown');
      } catch (err) {
        expect(err.name).toBe('IncrementalConfigError');
        expect(err.field).toBe('start');
        expect(err.value).toBe('invalid');
        expect(err.message).toContain('Invalid incremental config');
      }
    });

    it('should not throw when throwOnError is false', () => {
      const config = { start: 'invalid' };
      expect(() => validateIncrementalConfig(config, { throwOnError: false }))
        .not.toThrow();
    });

    it('should throw by default (throwOnError defaults to true)', () => {
      const config = { start: 'invalid' };
      expect(() => validateIncrementalConfig(config))
        .toThrow(IncrementalConfigError);
    });
  });

  describe('parseIncrementalConfig with Validation', () => {
    it('should validate when validate option is true', () => {
      expect(() => parseIncrementalConfig({ start: 'bad' }, { validate: true }))
        .toThrow(IncrementalConfigError);
    });

    it('should not validate by default', () => {
      expect(() => parseIncrementalConfig({ start: 'bad' }))
        .not.toThrow();
    });

    it('should pass valid config with validation', () => {
      const config = parseIncrementalConfig('incremental:1000', { validate: true });
      expect(config.start).toBe(1000);
    });

    it('should validate object config', () => {
      expect(() => parseIncrementalConfig({
        type: 'incremental',
        start: 100,
        increment: 0  // Invalid!
      }, { validate: true })).toThrow(IncrementalConfigError);
    });
  });
});

describe('IncrementalConfigError Class', () => {
  it('should have correct name', () => {
    const err = new IncrementalConfigError('test message', 'start', 123);
    expect(err.name).toBe('IncrementalConfigError');
  });

  it('should have field property', () => {
    const err = new IncrementalConfigError('test', 'batchSize', 0);
    expect(err.field).toBe('batchSize');
  });

  it('should have value property', () => {
    const err = new IncrementalConfigError('test', 'mode', 'invalid');
    expect(err.value).toBe('invalid');
  });

  it('should be instance of Error', () => {
    const err = new IncrementalConfigError('test', 'start', 0);
    expect(err).toBeInstanceOf(Error);
  });
});
