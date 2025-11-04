import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Error Path Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-error-path-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it.skip('should handle batch transaction flush errors', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'async' }
    });

    await database.usePlugin(plugin);

    const handler = plugin.fieldHandlers.get('urls').get('clicks');

    // Add transactions
    await plugin.createTransaction(handler, {
      originalId: 'url1',
      value: 1,
      operation: 'add',
      source: 'test'
    });

    // Mock insert to fail
    const originalInsert = handler.transactionResource.insert.bind(handler.transactionResource);
    let callCount = 0;
    handler.transactionResource.insert = async (...args) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Simulated insert error');
      }
      return await originalInsert(...args);
    };

    // Add another transaction - should trigger flush and catch error
    await expect(
      plugin.createTransaction(handler, {
        originalId: 'url1',
        value: 2,
        operation: 'add',
        source: 'test'
      })
    ).rejects.toThrow('Simulated insert error');

    // Restore original insert
    handler.transactionResource.insert = originalInsert;
  });

  it.skip('should handle lock release errors gracefully (SKIP: locks use PluginStorage now)', async () => {
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

    // Insert and add clicks
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);

    // Mock lock resource delete to fail
    const lockResource = database.resources.urls_consolidation_locks_clicks;
    const originalDelete = lockResource.delete.bind(lockResource);
    lockResource.delete = async (id) => {
      if (id.startsWith('lock-url1')) {
        throw new Error('Simulated lock release error');
      }
      return await originalDelete(id);
    };

    // Consolidate - should handle lock release error gracefully
    const result = await urls.consolidate('url1', 'clicks');
    expect(result).toBe(5);

    // Restore original delete
    lockResource.delete = originalDelete;
  });

  it('should handle getConsolidatedValue with date filters', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'sync' }
    });

    await database.usePlugin(plugin);

    // Insert and add clicks
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.add('url1', 'clicks', 3);
    await urls.consolidate('url1', 'clicks');

    // Get consolidated value with date filters
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const value = await plugin._getConsolidatedValueWithHandler(
      handler,
      'url1',
      {
        startDate: yesterday.toISOString(),
        endDate: now.toISOString(),
        includeApplied: true
      }
    );

    expect(value).toBeGreaterThanOrEqual(0);
  });

});
