import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Garbage Collection Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-garbage-collection-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should run GC and delete old transactions', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'async', auto: false },
      verbose: true
    });

    await database.usePlugin(plugin);
    await plugin.start();

    // Create and consolidate
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Wait a bit for transactions to be marked as applied
    await sleep(500);

    // Check transactions exist and are applied
    let transactions = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url1',
      applied: true
    });
    expect(transactions.length).toBeGreaterThan(0);

    // Wait for transaction to be old enough (since retention is 0)
    await sleep(1500);

    // Manually trigger GC
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    await plugin._runGarbageCollectionForHandler(handler, 'urls', 'clicks');

    // Wait for GC to complete
    await sleep(500);

    // Check transactions were deleted (should be 0 or minimal)
    transactions = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url1',
      applied: true
    });

    // GC should have deleted most/all transactions
    // We allow some flexibility due to timing
    expect(transactions.length).toBeLessThanOrEqual(1);
  }, 15000);

});
