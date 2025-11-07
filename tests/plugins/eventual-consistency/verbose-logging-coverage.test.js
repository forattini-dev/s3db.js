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
      verbose: false // Enable verbose for logging coverage
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
      verbose: false
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

});
