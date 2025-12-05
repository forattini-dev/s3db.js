import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Configuration Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-configuration-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should handle timezone detection from TZ env var', async () => {
    const originalTZ = process.env.TZ;
    process.env.TZ = 'America/New_York';

    await database.disconnect();
    database = createDatabaseForTest('tz-test');
    await database.connect();

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
      logLevel: 'silent'
    });

    await database.usePlugin(plugin);

    expect(plugin.config.cohort.timezone).toBe('America/New_York');

    process.env.TZ = originalTZ;
  });

  it('should handle invalid timezone gracefully', async () => {
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
      cohort: { timezone: 'Invalid/Timezone' },
      consolidation: { mode: 'sync', auto: false },
      logLevel: 'silent'
    });

    await database.usePlugin(plugin);

    // Should still work, falling back to UTC
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    const url = await urls.get('url1');
    expect(url.clicks).toBe(5);
  });

  it('should validate resources configuration', async () => {
    expect(() => {
      new EventualConsistencyPlugin({});
    }).toThrow('EventualConsistencyPlugin requires');

    expect(() => {
      new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { urls: 'invalid' } // Should be array
      });
    }).toThrow('must be an array');
  });

});
