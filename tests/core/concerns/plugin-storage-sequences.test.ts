import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '#src/concerns/plugin-storage.js';

describe('PluginStorage - Sequence Features', () => {
  let database, storage;

  beforeEach(async () => {
    database = createDatabaseForTest('plugin-storage-sequences-test');
    await database.connect();
    storage = new PluginStorage(database.client, 'test-plugin');
  });

  afterEach(async () => {
    await storage.deleteAll();
    await database.disconnect();
  });

  describe('nextSequence', () => {
    test('should initialize sequence with default value 1', async () => {
      const id1 = await storage.nextSequence('user-ids');
      expect(id1).toBe(1);

      const id2 = await storage.nextSequence('user-ids');
      expect(id2).toBe(2);

      const id3 = await storage.nextSequence('user-ids');
      expect(id3).toBe(3);
    });

    test('should initialize sequence with custom initial value', async () => {
      const id1 = await storage.nextSequence('order-ids', { initialValue: 1000 });
      expect(id1).toBe(1000);

      const id2 = await storage.nextSequence('order-ids');
      expect(id2).toBe(1001);
    });

    test('should support custom increment', async () => {
      const id1 = await storage.nextSequence('batch-ids', { initialValue: 100, increment: 10 });
      expect(id1).toBe(100);

      const id2 = await storage.nextSequence('batch-ids', { increment: 10 });
      expect(id2).toBe(110);

      const id3 = await storage.nextSequence('batch-ids', { increment: 10 });
      expect(id3).toBe(120);
    });

    test('should handle multiple independent sequences', async () => {
      const userId1 = await storage.nextSequence('users');
      const orderId1 = await storage.nextSequence('orders', { initialValue: 5000 });
      const userId2 = await storage.nextSequence('users');
      const orderId2 = await storage.nextSequence('orders');

      expect(userId1).toBe(1);
      expect(userId2).toBe(2);
      expect(orderId1).toBe(5000);
      expect(orderId2).toBe(5001);
    });

    test('should be atomic under sequential calls', async () => {
      const results = [];

      // Sequential calls should return unique IDs
      for (let i = 0; i < 10; i++) {
        const id = await storage.nextSequence('atomic-test');
        results.push(id);
      }

      // All IDs should be unique
      const uniqueIds = new Set(results);
      expect(uniqueIds.size).toBe(10);

      // IDs should be sequential
      expect(results).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe('getSequence', () => {
    test('should return null for non-existent sequence', async () => {
      const value = await storage.getSequence('non-existent');
      expect(value).toBe(null);
    });

    test('should return current value without incrementing', async () => {
      // Initialize sequence
      await storage.nextSequence('counter', { initialValue: 42 });

      // getSequence should return the NEXT value (43), not the last returned (42)
      const value1 = await storage.getSequence('counter');
      expect(value1).toBe(43);

      // Calling again should return the same value
      const value2 = await storage.getSequence('counter');
      expect(value2).toBe(43);

      // nextSequence should still work correctly
      const nextId = await storage.nextSequence('counter');
      expect(nextId).toBe(43);
    });
  });

  describe('resetSequence', () => {
    test('should reset existing sequence to new value', async () => {
      // Create and increment sequence
      await storage.nextSequence('resettable');
      await storage.nextSequence('resettable');
      await storage.nextSequence('resettable');

      // Current value should be 4 (next to be returned)
      expect(await storage.getSequence('resettable')).toBe(4);

      // Reset to 100
      await storage.resetSequence('resettable', 100);

      // Next call should return 100
      const id = await storage.nextSequence('resettable');
      expect(id).toBe(100);
    });

    test('should create sequence if it does not exist', async () => {
      await storage.resetSequence('new-sequence', 500);

      const id = await storage.nextSequence('new-sequence');
      expect(id).toBe(500);
    });
  });

  describe('deleteSequence', () => {
    test('should delete existing sequence', async () => {
      // Create sequence
      await storage.nextSequence('deletable');
      expect(await storage.getSequence('deletable')).toBe(2);

      // Delete it
      await storage.deleteSequence('deletable');

      // Should be null now
      expect(await storage.getSequence('deletable')).toBe(null);

      // New sequence should start from 1
      const id = await storage.nextSequence('deletable');
      expect(id).toBe(1);
    });

    test('should not throw for non-existent sequence', async () => {
      await expect(storage.deleteSequence('non-existent')).resolves.not.toThrow();
    });
  });

  describe('listSequences', () => {
    test('should list all sequences', async () => {
      // Create multiple sequences
      await storage.nextSequence('seq-a');
      await storage.nextSequence('seq-b', { initialValue: 100 });
      await storage.nextSequence('seq-c', { initialValue: 1000 });
      await storage.nextSequence('seq-a'); // Increment seq-a again

      const sequences = await storage.listSequences();

      expect(sequences.length).toBe(3);

      // Find each sequence
      const seqA = sequences.find(s => s.name === 'seq-a');
      const seqB = sequences.find(s => s.name === 'seq-b');
      const seqC = sequences.find(s => s.name === 'seq-c');

      expect(seqA.value).toBe(3); // 1, 2, next is 3
      expect(seqB.value).toBe(101); // 100, next is 101
      expect(seqC.value).toBe(1001); // 1000, next is 1001
    });

    test('should return empty array when no sequences exist', async () => {
      const sequences = await storage.listSequences();
      expect(sequences).toEqual([]);
    });
  });

  describe('Lock timeout handling', () => {
    test('should throw on lock timeout', async () => {
      // Manually create the lock key that nextSequence uses
      const lockKey = storage.getSequenceKey(null, 'timeout-test', 'lock');
      
      // Acquire lock manually by setting the key
      await storage.set(lockKey, {
        token: 'manual-lock',
        acquiredAt: Date.now(),
        _expiresAt: Date.now() + 30000
      }, { behavior: 'body-only' });

      // Try to get next sequence with very short timeout - should fail
      await expect(
        storage.nextSequence('timeout-test', { lockTimeout: 100 })
      ).rejects.toThrow(/Failed to acquire lock/);

      // Release lock
      await storage.delete(lockKey);
    });

    test('should succeed after lock is released', async () => {
      // Manually create the lock key
      const lockKey = storage.getSequenceKey(null, 'release-test', 'lock');
      
      // Acquire lock manually
      await storage.set(lockKey, {
        token: 'manual-lock',
        acquiredAt: Date.now(),
        _expiresAt: Date.now() + 30000
      }, { behavior: 'body-only' });

      // Start a promise that will try to get sequence
      const sequencePromise = storage.nextSequence('release-test', { lockTimeout: 5000 });

      // Release lock after short delay
      setTimeout(async () => {
        await storage.delete(lockKey);
      }, 100);

      // Should eventually succeed
      const id = await sequencePromise;
      expect(id).toBe(1);
    });
  });
});
