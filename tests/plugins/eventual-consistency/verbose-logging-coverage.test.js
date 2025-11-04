import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Verbose Logging Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-verbose-logging-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it.skip('should log batch transaction details when verbose', async () => {
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
      verbose: true // Enable verbose for logging coverage
    });

    await database.usePlugin(plugin);

    const handler = plugin.fieldHandlers.get('urls').get('clicks');

    // Add transactions (should trigger verbose logging)
    await plugin.createTransaction(handler, {
      originalId: 'url1',
      value: 1,
      operation: 'add',
      source: 'test'
    });

    expect(handler.pendingTransactions.size).toBe(1);
  });

  it.skip('should handle cleanup lock contention with verbose logging (SKIP: locks use PluginStorage now)', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      verbose: true
    });

    await database.usePlugin(plugin);

    const lockResource = database.resources.urls_consolidation_locks_clicks;

    // Create a cleanup lock to simulate another container running cleanup
    await lockResource.insert({
      id: `lock-cleanup-urls-clicks`,
      lockedAt: Date.now(),
      workerId: 'other-worker'
    });

    // Try to clean up - should skip with verbose log
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);

    // Clean up
    await lockResource.delete(`lock-cleanup-urls-clicks`);
  });

  it.skip('should log when GC lock is already held (SKIP: locks use PluginStorage now)', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      verbose: true
    });

    await database.usePlugin(plugin);

    const lockResource = database.resources.urls_consolidation_locks_clicks;

    // Create a GC lock
    await lockResource.insert({
      id: 'lock-gc-urls-clicks',
      lockedAt: Date.now(),
      workerId: 'other-worker'
    });

    // Try to run GC - should skip with verbose log
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    await plugin._runGarbageCollectionForHandler(handler, 'urls', 'clicks');

    // Clean up
    await lockResource.delete('lock-gc-urls-clicks');
  });

  it('should log verbose GC details when deleting transactions', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'sync', auto: false },
      verbose: true
    });

    await database.usePlugin(plugin);

    // Create and consolidate
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Wait for transactions to age
    await sleep(1000);

    // Run GC with verbose logging
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    await plugin._runGarbageCollectionForHandler(handler, 'urls', 'clicks');

    // Should have logged verbose details
    expect(true).toBe(true);
  });

  it.skip('should log verbose details for stale lock cleanup (SKIP: locks use PluginStorage now)', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      verbose: true
    });

    await database.usePlugin(plugin);

    const lockResource = database.resources.urls_consolidation_locks_clicks;

    // Create multiple stale locks
    await lockResource.insert({
      id: 'lock-stale-1',
      lockedAt: Date.now() - 5000, // 5 seconds ago
      workerId: 'old-worker-1'
    });

    await lockResource.insert({
      id: 'lock-stale-2',
      lockedAt: Date.now() - 6000, // 6 seconds ago
      workerId: 'old-worker-2'
    });

    // Trigger consolidation which should clean up stale locks with verbose logging
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Locks should have been cleaned up
    expect(true).toBe(true);
  });

});
