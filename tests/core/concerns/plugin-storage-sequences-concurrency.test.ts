import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '#src/concerns/plugin-storage.js';

describe('PluginStorage - Sequence Concurrency', () => {
  let database;
  const PLUGIN_SLUG = 'concurrency-test';

  beforeAll(async () => {
    database = createDatabaseForTest('plugin-storage-seq-concurrency');
    await database.connect();
  });

  afterAll(async () => {
    // Cleanup all plugin data
    const storage = new PluginStorage(database.client, PLUGIN_SLUG);
    await storage.deleteAll();
    await database.disconnect();
  });

  afterEach(async () => {
    // Cleanup sequences between tests
    const storage = new PluginStorage(database.client, PLUGIN_SLUG);
    const sequences = await storage.listSequences();
    for (const seq of sequences) {
      await storage.deleteSequence(seq.name);
    }
  });

  describe('Multiple clients - same sequence', () => {
    test('should return unique IDs with 3 concurrent clients', async () => {
      // Create 3 independent PluginStorage instances (simulating 3 workers)
      const client1 = new PluginStorage(database.client, PLUGIN_SLUG);
      const client2 = new PluginStorage(database.client, PLUGIN_SLUG);
      const client3 = new PluginStorage(database.client, PLUGIN_SLUG);

      const SEQUENCE_NAME = 'concurrent-3-clients';
      const IDS_PER_CLIENT = 5;

      // Each client requests IDs concurrently
      const [results1, results2, results3] = await Promise.all([
        getMultipleIds(client1, SEQUENCE_NAME, IDS_PER_CLIENT),
        getMultipleIds(client2, SEQUENCE_NAME, IDS_PER_CLIENT),
        getMultipleIds(client3, SEQUENCE_NAME, IDS_PER_CLIENT),
      ]);

      // Combine all results
      const allIds = [...results1, ...results2, ...results3];

      // All IDs should be unique
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
      expect(allIds.length).toBe(IDS_PER_CLIENT * 3);

      // All IDs should be in valid range [1, 15]
      for (const id of allIds) {
        expect(id).toBeGreaterThanOrEqual(1);
        expect(id).toBeLessThanOrEqual(15);
      }

      // Should have all numbers from 1 to 15
      const sortedIds = [...uniqueIds].sort((a, b) => a - b);
      expect(sortedIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    });

    test('should return unique IDs with 5 concurrent clients', async () => {
      const clients = Array.from({ length: 5 }, () =>
        new PluginStorage(database.client, PLUGIN_SLUG)
      );

      const SEQUENCE_NAME = 'concurrent-5-clients';
      const IDS_PER_CLIENT = 4;

      // All clients request IDs concurrently
      const results = await Promise.all(
        clients.map(client => getMultipleIds(client, SEQUENCE_NAME, IDS_PER_CLIENT))
      );

      const allIds = results.flat();

      // All IDs should be unique
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
      expect(allIds.length).toBe(IDS_PER_CLIENT * 5);

      // Should have all numbers from 1 to 20
      const sortedIds = [...uniqueIds].sort((a, b) => a - b);
      expect(sortedIds).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });

    test('should handle burst of concurrent requests from 10 clients', async () => {
      const NUM_CLIENTS = 10;
      const IDS_PER_CLIENT = 3;

      const clients = Array.from({ length: NUM_CLIENTS }, () =>
        new PluginStorage(database.client, PLUGIN_SLUG)
      );

      const SEQUENCE_NAME = 'burst-test';

      // Burst: all clients request IDs at the same time
      const results = await Promise.all(
        clients.map(client => getMultipleIds(client, SEQUENCE_NAME, IDS_PER_CLIENT))
      );

      const allIds = results.flat();

      // All IDs must be unique
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(NUM_CLIENTS * IDS_PER_CLIENT);

      // No gaps in sequence
      const sortedIds = [...uniqueIds].sort((a, b) => a - b);
      const expectedIds = Array.from({ length: NUM_CLIENTS * IDS_PER_CLIENT }, (_, i) => i + 1);
      expect(sortedIds).toEqual(expectedIds);
    });
  });

  describe('Interleaved concurrent access', () => {
    test('should handle interleaved requests from multiple clients', async () => {
      const client1 = new PluginStorage(database.client, PLUGIN_SLUG);
      const client2 = new PluginStorage(database.client, PLUGIN_SLUG);

      const SEQUENCE_NAME = 'interleaved-test';
      const allIds = [];

      // Interleave requests: client1, client2, client1, client2, ...
      for (let i = 0; i < 5; i++) {
        const [id1, id2] = await Promise.all([
          client1.nextSequence(SEQUENCE_NAME),
          client2.nextSequence(SEQUENCE_NAME),
        ]);
        allIds.push(id1, id2);
      }

      // All IDs should be unique
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(10);

      // All numbers 1-10 should be present
      const sortedIds = [...uniqueIds].sort((a, b) => a - b);
      expect(sortedIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test('should handle wave pattern of concurrent requests', async () => {
      const clients = Array.from({ length: 4 }, () =>
        new PluginStorage(database.client, PLUGIN_SLUG)
      );

      const SEQUENCE_NAME = 'wave-test';
      const allIds = [];

      // Wave 1: clients 0,1 request
      const wave1 = await Promise.all([
        clients[0].nextSequence(SEQUENCE_NAME),
        clients[1].nextSequence(SEQUENCE_NAME),
      ]);
      allIds.push(...wave1);

      // Wave 2: clients 2,3 request
      const wave2 = await Promise.all([
        clients[2].nextSequence(SEQUENCE_NAME),
        clients[3].nextSequence(SEQUENCE_NAME),
      ]);
      allIds.push(...wave2);

      // Wave 3: all clients request
      const wave3 = await Promise.all(
        clients.map(c => c.nextSequence(SEQUENCE_NAME))
      );
      allIds.push(...wave3);

      // All IDs should be unique
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(8);

      // All numbers 1-8 should be present
      const sortedIds = [...uniqueIds].sort((a, b) => a - b);
      expect(sortedIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
  });

  describe('Multiple sequences - concurrent access', () => {
    test('should isolate sequences under concurrent access', async () => {
      const client1 = new PluginStorage(database.client, PLUGIN_SLUG);
      const client2 = new PluginStorage(database.client, PLUGIN_SLUG);

      // Both clients access two different sequences concurrently
      const [
        userIds1, userIds2,
        orderIds1, orderIds2
      ] = await Promise.all([
        getMultipleIds(client1, 'users-seq', 5),
        getMultipleIds(client2, 'users-seq', 5),
        getMultipleIds(client1, 'orders-seq', 5),
        getMultipleIds(client2, 'orders-seq', 5),
      ]);

      // User IDs should be unique within their sequence
      const allUserIds = [...userIds1, ...userIds2];
      const uniqueUserIds = new Set(allUserIds);
      expect(uniqueUserIds.size).toBe(10);

      // Order IDs should be unique within their sequence
      const allOrderIds = [...orderIds1, ...orderIds2];
      const uniqueOrderIds = new Set(allOrderIds);
      expect(uniqueOrderIds.size).toBe(10);

      // Both sequences should have 1-10
      expect([...uniqueUserIds].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect([...uniqueOrderIds].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    test('should handle cross-sequence concurrent access', async () => {
      const NUM_CLIENTS = 3;
      const NUM_SEQUENCES = 3;
      const IDS_PER_COMBO = 2;

      const clients = Array.from({ length: NUM_CLIENTS }, () =>
        new PluginStorage(database.client, PLUGIN_SLUG)
      );

      const sequenceNames = ['seq-alpha', 'seq-beta', 'seq-gamma'];

      // Each client accesses all sequences concurrently
      const allPromises = [];
      for (const client of clients) {
        for (const seqName of sequenceNames) {
          allPromises.push(
            getMultipleIds(client, seqName, IDS_PER_COMBO).then(ids => ({
              sequence: seqName,
              ids
            }))
          );
        }
      }

      const results = await Promise.all(allPromises);

      // Group by sequence
      const bySequence = {};
      for (const result of results) {
        if (!bySequence[result.sequence]) {
          bySequence[result.sequence] = [];
        }
        bySequence[result.sequence].push(...result.ids);
      }

      // Each sequence should have unique IDs
      for (const seqName of sequenceNames) {
        const ids = bySequence[seqName];
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(NUM_CLIENTS * IDS_PER_COMBO);

        // Should have consecutive IDs
        const sortedIds = [...uniqueIds].sort((a, b) => a - b);
        const expected = Array.from({ length: NUM_CLIENTS * IDS_PER_COMBO }, (_, i) => i + 1);
        expect(sortedIds).toEqual(expected);
      }
    });
  });

  describe('Stress tests', () => {
    test('should handle high concurrency stress test', async () => {
      const NUM_CLIENTS = 5;
      const IDS_PER_CLIENT = 10;
      const TOTAL_IDS = NUM_CLIENTS * IDS_PER_CLIENT;

      const clients = Array.from({ length: NUM_CLIENTS }, () =>
        new PluginStorage(database.client, PLUGIN_SLUG)
      );

      const SEQUENCE_NAME = 'stress-test';

      // All clients hammer the sequence simultaneously
      const startTime = Date.now();
      const results = await Promise.all(
        clients.map(client => getMultipleIds(client, SEQUENCE_NAME, IDS_PER_CLIENT))
      );
      const duration = Date.now() - startTime;

      const allIds = results.flat();

      // All IDs must be unique
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(TOTAL_IDS);

      // No gaps
      const sortedIds = [...uniqueIds].sort((a, b) => a - b);
      const expected = Array.from({ length: TOTAL_IDS }, (_, i) => i + 1);
      expect(sortedIds).toEqual(expected);

      // Log performance
      console.log(`Stress test: ${TOTAL_IDS} IDs generated in ${duration}ms (${(TOTAL_IDS / duration * 1000).toFixed(1)} IDs/sec)`);
    }, 30000);

    test('should handle rapid-fire requests from single client', async () => {
      const client = new PluginStorage(database.client, PLUGIN_SLUG);
      const SEQUENCE_NAME = 'rapid-fire';
      const NUM_IDS = 20;

      // Fire all requests at once (no await between)
      const promises = Array.from({ length: NUM_IDS }, () =>
        client.nextSequence(SEQUENCE_NAME)
      );

      const ids = await Promise.all(promises);

      // All IDs must be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(NUM_IDS);

      // Should be consecutive
      const sortedIds = [...uniqueIds].sort((a, b) => a - b);
      expect(sortedIds).toEqual(Array.from({ length: NUM_IDS }, (_, i) => i + 1));
    });
  });

  describe('Edge cases with concurrency', () => {
    test('should handle concurrent reset and nextSequence', async () => {
      const client1 = new PluginStorage(database.client, PLUGIN_SLUG);
      const client2 = new PluginStorage(database.client, PLUGIN_SLUG);

      const SEQUENCE_NAME = 'reset-concurrent';

      // Initialize sequence
      await client1.nextSequence(SEQUENCE_NAME);
      await client1.nextSequence(SEQUENCE_NAME);
      await client1.nextSequence(SEQUENCE_NAME);

      // Current value should be 4
      expect(await client1.getSequence(SEQUENCE_NAME)).toBe(4);

      // Concurrent reset from client2 while client1 gets next ID
      const [resetResult, nextId] = await Promise.all([
        client2.resetSequence(SEQUENCE_NAME, 1000),
        client1.nextSequence(SEQUENCE_NAME),
      ]);

      expect(resetResult).toBe(true);

      // nextId should be either 4 (before reset) or 1000 (after reset)
      expect([4, 1000]).toContain(nextId);

      // After both operations, sequence should be consistent
      const finalValue = await client1.getSequence(SEQUENCE_NAME);
      // If nextId was 4, final should be 1000 (reset happened after)
      // If nextId was 1000, final should be 1001 (nextSequence happened after reset)
      expect([1000, 1001]).toContain(finalValue);
    });

    test('should handle concurrent delete and nextSequence', async () => {
      const client1 = new PluginStorage(database.client, PLUGIN_SLUG);
      const client2 = new PluginStorage(database.client, PLUGIN_SLUG);

      const SEQUENCE_NAME = 'delete-concurrent';

      // Initialize sequence
      await client1.nextSequence(SEQUENCE_NAME);
      await client1.nextSequence(SEQUENCE_NAME);

      // Try concurrent operations - one might fail or reinitialize
      const results = await Promise.allSettled([
        client2.deleteSequence(SEQUENCE_NAME),
        client1.nextSequence(SEQUENCE_NAME),
      ]);

      // Delete should always succeed
      expect(results[0].status).toBe('fulfilled');

      // nextSequence might succeed with 3 (before delete) or 1 (after delete reinitializes)
      if (results[1].status === 'fulfilled') {
        expect([1, 3]).toContain(results[1].value);
      }
    });

    test('should handle sequence initialization race', async () => {
      const NUM_CLIENTS = 5;
      const clients = Array.from({ length: NUM_CLIENTS }, () =>
        new PluginStorage(database.client, PLUGIN_SLUG)
      );

      const SEQUENCE_NAME = 'init-race';

      // All clients try to get first ID simultaneously
      // This tests the initialization race condition
      const ids = await Promise.all(
        clients.map(c => c.nextSequence(SEQUENCE_NAME))
      );

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(NUM_CLIENTS);

      // Should have 1-5
      const sortedIds = [...uniqueIds].sort((a, b) => a - b);
      expect(sortedIds).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

/**
 * Helper: Get multiple sequential IDs
 */
async function getMultipleIds(storage, sequenceName, count) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const id = await storage.nextSequence(sequenceName);
    ids.push(id);
  }
  return ids;
}
