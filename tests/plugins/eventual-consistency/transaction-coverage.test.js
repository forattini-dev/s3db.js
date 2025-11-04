import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Transaction Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-transaction-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should handle late arrival strategy: ignore', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'async', window: 0 }, // 0 hours = all transactions are "late"
      lateArrivals: { strategy: 'ignore' },
      verbose: true
    });

    await database.usePlugin(plugin);

    // Create an old transaction (simulating late arrival)
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    const oldTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago

    const result = await plugin.createTransaction(handler, {
      originalId: 'url1',
      value: 5,
      operation: 'add',
      source: 'test',
      timestamp: oldTimestamp.toISOString()
    });

    // With 'ignore' strategy, late transactions should be ignored (return null)
    expect(result).toBeNull();
  });

  it('should handle late arrival strategy: warn', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'async', window: 0 }, // 0 hours = all transactions are "late"
      lateArrivals: { strategy: 'warn' },
      verbose: true
    });

    await database.usePlugin(plugin);

    // This transaction should warn but still be processed
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    const result = await plugin.createTransaction(handler, {
      originalId: 'url1',
      value: 5,
      operation: 'add',
      source: 'test'
    });

    // Should still create transaction (with warning)
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
  });

  it.skip('should handle batch transactions', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'async' },
      verbose: false // Test without verbose warnings
    });

    await database.usePlugin(plugin);

    const handler = plugin.fieldHandlers.get('urls').get('clicks');

    // Add 2 transactions (below batch size)
    await plugin.createTransaction(handler, {
      originalId: 'url1',
      value: 1,
      operation: 'add',
      source: 'test'
    });

    await plugin.createTransaction(handler, {
      originalId: 'url1',
      value: 2,
      operation: 'add',
      source: 'test'
    });

    // Should be in pending map
    expect(handler.pendingTransactions.size).toBe(2);

    // Add 3rd transaction - should trigger flush
    await plugin.createTransaction(handler, {
      originalId: 'url1',
      value: 3,
      operation: 'add',
      source: 'test'
    });

    // Should have been flushed
    expect(handler.pendingTransactions.size).toBe(0);
  });

});
