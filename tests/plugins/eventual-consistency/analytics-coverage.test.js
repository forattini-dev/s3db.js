import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Analytics Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-analytics-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should handle analytics without enabling', async () => {
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
      consolidation: { mode: 'sync' }
    });

    await database.usePlugin(plugin);

    // Should work without analytics
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    const url = await urls.get('url1');
    expect(url.clicks).toBe(5);
  });

  it('should throw error when getting analytics for non-existent resource', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: { urls: ['clicks'] }
    });

    await database.usePlugin(plugin);

    // Try to get analytics for non-existent resource
    await expect(
      plugin.getAnalytics('nonexistent', 'field')
    ).rejects.toThrow('No eventual consistency configured');
  });

  it('should throw error when getting analytics for non-existent field', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: { urls: ['clicks'] }
    });

    await database.usePlugin(plugin);

    // Try to get analytics for non-existent field
    await expect(
      plugin.getAnalytics('urls', 'nonexistent')
    ).rejects.toThrow('No eventual consistency configured');
  });

  it('should throw error when analytics not enabled', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: { urls: ['clicks'] }
    });

    await database.usePlugin(plugin);

    // Try to get analytics when disabled
    await expect(
      plugin.getAnalytics('urls', 'clicks')
    ).rejects.toThrow('Analytics not enabled');
  });

});
