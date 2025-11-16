import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Analytics API Methods Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-analytics-api-methods-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should get month-by-day analytics', async () => {
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
      analytics: { enabled: true },
      consolidation: { mode: 'sync' }
    });

    await database.usePlugin(plugin);

    // Create record and add clicks
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Get analytics
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const analytics = await plugin.getMonthByDay('urls', 'clicks', month);
    expect(analytics).toBeDefined();
    expect(Array.isArray(analytics)).toBe(true);
  });

  it('should get day-by-hour analytics', async () => {
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
      analytics: { enabled: true },
      consolidation: { mode: 'sync' }
    });

    await database.usePlugin(plugin);

    // Create record and add clicks
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Get analytics
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const analytics = await plugin.getDayByHour('urls', 'clicks', date);
    expect(analytics).toBeDefined();
    expect(Array.isArray(analytics)).toBe(true);
  });

  it('should get last N days analytics', async () => {
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
      analytics: { enabled: true },
      consolidation: { mode: 'sync' }
    });

    await database.usePlugin(plugin);

    // Create record and add clicks
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Get analytics for last 7 days
    const analytics = await plugin.getLastNDays('urls', 'clicks', 7);
    expect(analytics).toBeDefined();
    expect(Array.isArray(analytics)).toBe(true);
  });

  it('should get year-by-month analytics', async () => {
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
      analytics: { enabled: true },
      consolidation: { mode: 'sync' }
    });

    await database.usePlugin(plugin);

    // Create record and add clicks
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Get analytics for current year
    const now = new Date();
    const analytics = await plugin.getYearByMonth('urls', 'clicks', now.getFullYear());
    expect(analytics).toBeDefined();
    expect(Array.isArray(analytics)).toBe(true);
  });

  it('should get month-by-hour analytics', async () => {
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
      analytics: { enabled: true },
      consolidation: { mode: 'sync' }
    });

    await database.usePlugin(plugin);

    // Create record and add clicks
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);
    await urls.consolidate('url1', 'clicks');

    // Get analytics for current month
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const analytics = await plugin.getMonthByHour('urls', 'clicks', month);
    expect(analytics).toBeDefined();
    expect(Array.isArray(analytics)).toBe(true);
  });

  it('should get top records', async () => {
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
      analytics: { enabled: true },
      consolidation: { mode: 'sync' }
    });

    await database.usePlugin(plugin);

    // Create multiple records
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 10);
    await urls.consolidate('url1', 'clicks');

    await urls.insert({ id: 'url2', clicks: 0 });
    await urls.add('url2', 'clicks', 5);
    await urls.consolidate('url2', 'clicks');

    // Get top records
    const topRecords = await plugin.getTopRecords('urls', 'clicks', { limit: 10 });
    expect(topRecords).toBeDefined();
    expect(Array.isArray(topRecords)).toBe(true);
  });

});
