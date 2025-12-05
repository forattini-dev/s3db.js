import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Consolidation Edge Cases', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-consolidation-edge-cases');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should handle record deletion during consolidation', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'async' },
      logLevel: 'silent'
    });

    await database.usePlugin(plugin);

    // Create record with transactions
    await urls.insert({ id: 'url1', clicks: 10 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Now delete the record
    await urls.delete('url1');

    // Add more transactions
    await urls.add('url1', 'clicks', 3);

    // Try to consolidate - should handle deletion gracefully
    const result = await urls.consolidate('url1', 'clicks');

    // Should return calculated value even though record doesn't exist
    expect(result).toBe(3);
  });

  it('should create anchor transaction for initial value', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'async' },
      logLevel: 'silent'
    });

    await database.usePlugin(plugin);

    // Create record with initial value
    await urls.insert({ id: 'url1', clicks: 1000 });

    // Add transaction
    await urls.add('url1', 'clicks', 50);

    // Consolidate
    await urls.consolidate('url1', 'clicks');

    // Check for anchor transaction
    const transactions = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url1',
      source: 'anchor'
    });

    expect(transactions.length).toBeGreaterThan(0);
    const anchor = transactions[0];
    expect(anchor.value).toBe(1000);
    expect(anchor.operation).toBe('set');
    expect(anchor.applied).toBe(true);
  });

  it('should handle missing base value with anchor creation', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'async' },
      logLevel: 'silent'
    });

    await database.usePlugin(plugin);

    // Create record with value
    await urls.insert({ id: 'url1', clicks: 500 });

    // Manually create applied transactions WITHOUT a 'set' operation
    const txnResource = database.resources.plg_urls_tx_clicks;
    const now = new Date();
    const cohortInfo = plugin.getCohortInfo(now);

    await txnResource.insert({
      id: 'txn-manual-1',
      originalId: 'url1',
      field: 'clicks',
      value: 10,
      operation: 'add',
      timestamp: now.toISOString(),
      cohortDate: cohortInfo.date,
      cohortHour: cohortInfo.hour,
      cohortMonth: cohortInfo.month,
      source: 'manual',
      applied: true
    });

    // Add new pending transaction
    await urls.add('url1', 'clicks', 5);

    // Consolidate - should create anchor for missing base value
    const result = await urls.consolidate('url1', 'clicks');

    // Should be: anchor(490) + add(10) + add(5) = 505
    expect(result).toBe(505);

    // Check anchor was created
    const anchors = await txnResource.query({
      originalId: 'url1',
      source: 'anchor'
    });
    expect(anchors.length).toBeGreaterThan(0);
  });

});
