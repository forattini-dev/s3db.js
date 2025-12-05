import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Setup Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-setup-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should handle deferred setup when resource created later', async () => {
    // Create plugin BEFORE resource exists
    plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: { urls: ['clicks'] },
      logLevel: 'silent'
    });

    await database.usePlugin(plugin);

    // Resource should be marked for deferred setup
    const handler = plugin.fieldHandlers.get('urls').get('clicks');
    expect(handler.deferredSetup).toBe(true);

    // Now create the resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Wait for hook to trigger
    await sleep(100);

    // Should now be set up
    expect(handler.deferredSetup).toBe(false);
    expect(handler.targetResource).toBeDefined();

    // Should work
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    const url = await urls.get('url1');
    expect(url.clicks).toBe(5);
  });

});
