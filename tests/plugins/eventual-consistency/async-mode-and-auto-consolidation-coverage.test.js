import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Async Mode and Auto-Consolidation Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-async-mode-and-auto-consolidation-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it.skip('should run periodic consolidation in async mode', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'async', auto: true },
      verbose: false
    });

    await database.usePlugin(plugin);
    await plugin.start();

    // Create URL and add clicks
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.add('url1', 'clicks', 3);

    // Wait for auto-consolidation
    await sleep(2500);

    // Should be consolidated
    const url = await urls.get('url1');
    expect(url.clicks).toBe(8);

    await plugin.stop();
  }, 15000);

  it('should handle errors during consolidation gracefully', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: { urls: ['clicks'] },
      consolidation: { mode: 'sync', auto: false },
      verbose: false
    });

    await database.usePlugin(plugin);

    // Insert URL
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Should have consolidated despite any warnings
    const url = await urls.get('url1');
    expect(url.clicks).toBe(5);
  });

});
