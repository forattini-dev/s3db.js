/**
 * Test counter pattern for persistent global IDs
 *
 * This tests the basic counter functionality needed for
 * the fingerprint persistent ID system.
 */

import { createDatabaseForTest } from '../config.js';

describe('Resource Counter Pattern', () => {
  let database;
  let counters;

  beforeAll(async () => {
    database = createDatabaseForTest('counter-pattern');
    await database.connect();

    // Create a simple counters resource
    await database.createResource({
      name: 'counters',
      behavior: 'enforce-limits',
      timestamps: true,
      attributes: {
        id: 'string',
        value: 'number',
        description: 'string|optional',
      }
    });

    counters = database.resources.counters;
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('Basic counter operations', () => {
    it('should create a counter with initial value', async () => {
      const counter = await counters.insert({
        id: 'test-counter',
        value: 1,
        description: 'Test counter'
      });

      expect(counter.id).toBe('test-counter');
      expect(counter.value).toBe(1);
      expect(counter.description).toBe('Test counter');
    });

    it('should get counter value', async () => {
      const counter = await counters.get('test-counter');

      expect(counter.value).toBe(1);
    });

    it('should increment counter using update', async () => {
      // Get current value
      const current = await counters.get('test-counter');
      const newValue = current.value + 1;

      // Update with incremented value
      const updated = await counters.update('test-counter', {
        value: newValue
      });

      expect(updated.value).toBe(2);
    });

    it('should increment multiple times', async () => {
      // Increment 10 times
      for (let i = 0; i < 10; i++) {
        const current = await counters.get('test-counter');
        await counters.update('test-counter', {
          value: current.value + 1
        });
      }

      const final = await counters.get('test-counter');
      expect(final.value).toBe(12); // 2 + 10 = 12
    });
  });

  describe('Atomic increment pattern', () => {
    it('should handle concurrent-safe increment with retry', async () => {
      // Create a fresh counter for this test
      await counters.insert({
        id: 'concurrent-counter',
        value: 0,
      });

      /**
       * Increment with optimistic concurrency control
       * Retries if update fails due to concurrent modification
       */
      async function incrementWithRetry(counterId, maxRetries = 3) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const current = await counters.get(counterId);
            const newValue = current.value + 1;
            const updated = await counters.update(counterId, { value: newValue });
            return updated.value;
          } catch (err) {
            if (attempt === maxRetries - 1) throw err;
            // Small delay before retry
            await new Promise(r => setTimeout(r, 10));
          }
        }
      }

      // Run 5 sequential increments
      const results = [];
      for (let i = 0; i < 5; i++) {
        const value = await incrementWithRetry('concurrent-counter');
        results.push(value);
      }

      expect(results).toEqual([1, 2, 3, 4, 5]);

      const final = await counters.get('concurrent-counter');
      expect(final.value).toBe(5);
    });
  });

  describe('Counter initialization pattern', () => {
    it('should handle get-or-create pattern', async () => {
      const COUNTER_KEY = 'fingerprint-index';

      /**
       * Get or create counter (the pattern used in fingerprint routes)
       */
      async function getOrCreateCounter(key, initialValue = 1) {
        try {
          const counter = await counters.get(key);
          return counter.value;
        } catch (err) {
          const errorMessage = err.message?.toLowerCase() || '';
          const isNotFound = errorMessage.includes('not found') ||
                             errorMessage.includes('no such key') ||
                             errorMessage.includes('nosuchkey');

          if (isNotFound) {
            await counters.insert({
              id: key,
              value: initialValue,
              description: 'Auto-created counter'
            });
            return initialValue;
          }
          throw err;
        }
      }

      // First call should create the counter
      const value1 = await getOrCreateCounter(COUNTER_KEY);
      expect(value1).toBe(1);

      // Second call should get existing counter
      const value2 = await getOrCreateCounter(COUNTER_KEY);
      expect(value2).toBe(1);

      // Update and verify
      await counters.update(COUNTER_KEY, { value: 42 });
      const value3 = await getOrCreateCounter(COUNTER_KEY);
      expect(value3).toBe(42);
    });

    it('should handle increment-and-return pattern', async () => {
      const COUNTER_KEY = 'increment-test';

      // Create counter starting at 1
      await counters.insert({
        id: COUNTER_KEY,
        value: 1
      });

      /**
       * Increment counter and return the value BEFORE increment
       * (the ID to use for new fingerprints)
       */
      async function getNextId(key) {
        const current = await counters.get(key);
        const currentValue = current.value;
        await counters.update(key, { value: currentValue + 1 });
        return currentValue;
      }

      // First call returns 1, counter becomes 2
      const id1 = await getNextId(COUNTER_KEY);
      expect(id1).toBe(1);

      // Second call returns 2, counter becomes 3
      const id2 = await getNextId(COUNTER_KEY);
      expect(id2).toBe(2);

      // Third call returns 3, counter becomes 4
      const id3 = await getNextId(COUNTER_KEY);
      expect(id3).toBe(3);

      // Verify final counter value
      const final = await counters.get(COUNTER_KEY);
      expect(final.value).toBe(4);
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-existent counter', async () => {
      await expect(counters.get('non-existent-counter')).rejects.toThrow();
    });

    it('should throw error when creating duplicate counter', async () => {
      await counters.insert({ id: 'duplicate-test', value: 1 });
      await expect(counters.insert({ id: 'duplicate-test', value: 1 })).rejects.toThrow();
    });
  });
});
