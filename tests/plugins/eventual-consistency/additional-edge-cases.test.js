import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Additional Edge Cases', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-additional-edge-cases');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should handle sub operation correctly', async () => {
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

    await urls.insert({ id: 'url1', clicks: 100 });
    await urls.sub('url1', 'clicks', 10);
    await urls.consolidate('url1', 'clicks');

    const url = await urls.get('url1');
    expect(url.clicks).toBe(90);
  });

  it('should handle set operation correctly', async () => {
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

    await urls.insert({ id: 'url1', clicks: 100 });
    await urls.set('url1', 'clicks', 500);
    await urls.consolidate('url1', 'clicks');

    const url = await urls.get('url1');
    expect(url.clicks).toBe(500);
  });

  it('should handle cache invalidation', async () => {
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
      consolidation: { mode: 'sync', auto: false },
      logLevel: 'silent'
    });

    await database.usePlugin(plugin);

    // Insert and consolidate
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Cache should be invalidated automatically
    const url = await urls.get('url1');
    expect(url.clicks).toBe(5);
  });

  it('should handle errors when adding without id', async () => {
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

    await expect(
      urls.add(null, 'clicks', 5)
    ).rejects.toThrow();
  });

  it('should handle errors when field is undefined', async () => {
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

    await expect(
      urls.add('url1', undefined, 5)
    ).rejects.toThrow();
  });

});
