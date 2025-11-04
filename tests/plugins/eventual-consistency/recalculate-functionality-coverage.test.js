import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Recalculate Functionality Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-recalculate-functionality-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should recalculate record from scratch', async () => {
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

    // Create record
    await urls.insert({ id: 'url1', clicks: 0 });

    // Add multiple clicks
    await urls.add('url1', 'clicks', 5);
    await urls.add('url1', 'clicks', 3);
    await urls.add('url1', 'clicks', 2);

    // Consolidate
    await urls.consolidate('url1', 'clicks');

    const beforeRecalc = await urls.get('url1');
    expect(beforeRecalc.clicks).toBe(10);

    // Recalculate
    const result = await urls.recalculate('url1', 'clicks');
    expect(result).toBe(10);

    // Check value is still correct
    const afterRecalc = await urls.get('url1');
    expect(afterRecalc.clicks).toBe(10);
  });

  it('should handle recalculate with no transactions', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'sync' },
      verbose: true
    });

    await database.usePlugin(plugin);

    // Create record with no transactions
    await urls.insert({ id: 'url1', clicks: 0 });

    // Recalculate should return 0
    const result = await urls.recalculate('url1', 'clicks');
    expect(result).toBe(0);
  });

});
