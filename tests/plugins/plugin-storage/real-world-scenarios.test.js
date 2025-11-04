import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createDatabaseForTest } from '../../config.js';
import { PluginStorage } from '../../../src/concerns/plugin-storage.js';
import { Plugin } from '../../../src/plugins/plugin.class.js';


describe('PluginStorage - Real-world scenarios', () => {
  let db;
  let storage;

  beforeEach(async () => {
    db = createDatabaseForTest('plugin-storage');
    await db.connect();

    storage = new PluginStorage(db.client, 'test-plugin');
  });

  afterEach(async () => {
    try {
      await storage.deleteAll();
    } catch (err) {
      // Ignore cleanup errors
    }

    await db.disconnect();
  });

  test('should handle transaction log pattern', async () => {
    // Simulate EventualConsistency transaction storage
    const resourceName = 'wallets';
    const field = 'balance';

    const transactions = [
      { id: 'txn-1', operation: 'add', value: 100, timestamp: '2025-01-01T00:00:00Z' },
      { id: 'txn-2', operation: 'add', value: 50, timestamp: '2025-01-01T01:00:00Z' },
      { id: 'txn-3', operation: 'sub', value: 30, timestamp: '2025-01-01T02:00:00Z' }
    ];

    for (const txn of transactions) {
      await storage.set(
        storage.getPluginKey(resourceName, field, 'transactions', `id=${txn.id}`),
        txn,
        { behavior: 'body-overflow' }
      );
    }

    // List all transactions
    const keys = await storage.listForResource(resourceName, `${field}/transactions`);
    expect(keys.length).toBe(3);

    // Get specific transaction
    const txn1 = await storage.get(
      storage.getPluginKey(resourceName, field, 'transactions', 'id=txn-1')
    );
    expect(txn1).toEqual(transactions[0]);
  });

  test('should handle cache pattern', async () => {
    // Simulate cache plugin storing cached records
    const resourceName = 'users';

    const cachedRecords = [
      { id: 'user-1', name: 'Alice', email: 'alice@example.com' },
      { id: 'user-2', name: 'Bob', email: 'bob@example.com' }
    ];

    for (const record of cachedRecords) {
      await storage.set(
        storage.getPluginKey(resourceName, 'cache', record.id),
        record,
        { behavior: 'body-only' }
      );
    }

    // List all cached users
    const keys = await storage.listForResource(resourceName, 'cache');
    expect(keys.length).toBe(2);

    // Get specific cached record
    const user1 = await storage.get(
      storage.getPluginKey(resourceName, 'cache', 'user-1')
    );
    expect(user1.name).toBe('Alice');

    // Delete cache for resource
    const deleted = await storage.deleteAll(resourceName);
    expect(deleted).toBe(2);
  });

  test('should handle config/state pattern', async () => {
    // Simulate plugin storing configuration
    const config = {
      mode: 'async',
      interval: 5000,
      enabled: true,
      settings: {
        retries: 3,
        timeout: 30000
      }
    };

    await storage.set(
      storage.getPluginKey(null, 'config'),
      config,
      { behavior: 'body-overflow' }
    );

    // Retrieve config
    const retrieved = await storage.get(
      storage.getPluginKey(null, 'config')
    );
    expect(retrieved).toEqual(config);

    // Update config
    config.interval = 10000;
    await storage.set(
      storage.getPluginKey(null, 'config'),
      config,
      { behavior: 'body-overflow' }
    );

    const updated = await storage.get(
      storage.getPluginKey(null, 'config')
    );
    expect(updated.interval).toBe(10000);
  });

  test('should handle analytics pattern', async () => {
    // Simulate storing analytics data
    const resourceName = 'urls';
    const field = 'clicks';

    const analytics = [
      { cohort: '2025-01-01', count: 100, sum: 100 },
      { cohort: '2025-01-02', count: 150, sum: 250 },
      { cohort: '2025-01-03', count: 200, sum: 450 }
    ];

    for (const data of analytics) {
      await storage.set(
        storage.getPluginKey(resourceName, field, 'analytics', data.cohort),
        data,
        { behavior: 'body-overflow' }
      );
    }

    // List all analytics
    const keys = await storage.listForResource(resourceName, `${field}/analytics`);
    expect(keys.length).toBe(3);

    // Get specific day
    const day1 = await storage.get(
      storage.getPluginKey(resourceName, field, 'analytics', '2025-01-01')
    );
    expect(day1.count).toBe(100);
  });
});
