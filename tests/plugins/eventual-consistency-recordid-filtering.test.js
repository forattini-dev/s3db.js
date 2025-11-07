/**
 * Test: EventualConsistency Analytics - RecordId Filtering
 *
 * ✅ FIXED: getLastNHours/Days/Months now correctly filter by recordId
 * Previously returned global aggregated data for ALL records.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistency Analytics - RecordId Filtering', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-recordid-filtering');

    // Create resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        slug: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency plugin with analytics enabled
    plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'sync', auto: false },
      analytics: { enabled: true }
    });

    await database.usePlugin(plugin);
    await plugin.start();
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('✅ getLastNHours correctly filters by recordId', async () => {
    // Insert 3 different URLs with different click counts
    await urls.insert({ id: 'url1', slug: 'article-1', clicks: 0 });
    await urls.insert({ id: 'url2', slug: 'article-2', clicks: 0 });
    await urls.insert({ id: 'url3', slug: 'article-3', clicks: 0 });

    // Add clicks to each URL (different amounts)
    await urls.add('url1', 'clicks', 10);  // url1: 10 clicks
    await urls.add('url2', 'clicks', 20);  // url2: 20 clicks
    await urls.add('url3', 'clicks', 30);  // url3: 30 clicks

    // Consolidate all
    await urls.consolidate('url1', 'clicks');
    await urls.consolidate('url2', 'clicks');
    await urls.consolidate('url3', 'clicks');

    // ✅ FIX: Now correctly returns analytics for url1 ONLY (10 clicks)
    const analyticsUrl1 = await plugin.getLastNHours('urls', 'clicks', 24, {
      recordId: 'url1',
      fillGaps: false
    });

    // Calculate total clicks from analytics
    const totalClicksUrl1 = analyticsUrl1.reduce((sum, a) => sum + (a.sum || 0), 0);

    // ✅ TEST PASSES: Analytics correctly filtered by recordId
    // Expected: 10 (only url1's clicks)
    // Actual: 10 (bug fixed!)
    expect(totalClicksUrl1).toBe(10);
  }, 30000); // 30 second timeout for analytics operations

  it('should return analytics for url2 only when recordId=url2', async () => {
    await urls.insert({ id: 'url1', slug: 'article-1', clicks: 0 });
    await urls.insert({ id: 'url2', slug: 'article-2', clicks: 0 });
    await urls.insert({ id: 'url3', slug: 'article-3', clicks: 0 });

    await urls.add('url1', 'clicks', 10);
    await urls.add('url2', 'clicks', 20);
    await urls.add('url3', 'clicks', 30);

    await urls.consolidate('url1', 'clicks');
    await urls.consolidate('url2', 'clicks');
    await urls.consolidate('url3', 'clicks');

    const analyticsUrl2 = await plugin.getLastNHours('urls', 'clicks', 24, {
      recordId: 'url2',
      fillGaps: false
    });

    const totalClicksUrl2 = analyticsUrl2.reduce((sum, a) => sum + (a.sum || 0), 0);

    // Expected: 20 (only url2's clicks)
    expect(totalClicksUrl2).toBe(20);
  });

  it('should return global analytics when no recordId specified', async () => {
    await urls.insert({ id: 'url1', slug: 'article-1', clicks: 0 });
    await urls.insert({ id: 'url2', slug: 'article-2', clicks: 0 });

    await urls.add('url1', 'clicks', 10);
    await urls.add('url2', 'clicks', 20);

    await urls.consolidate('url1', 'clicks');
    await urls.consolidate('url2', 'clicks');

    // Without recordId, should return global data (this works correctly)
    const globalAnalytics = await plugin.getLastNHours('urls', 'clicks', 24, {
      fillGaps: false
    });

    const totalClicksGlobal = globalAnalytics.reduce((sum, a) => sum + (a.sum || 0), 0);

    // Expected: 30 (all URLs combined)
    expect(totalClicksGlobal).toBe(30);
  }, 30000); // 30 second timeout for analytics operations

  it('✅ getLastNDays correctly filters by recordId', async () => {
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.insert({ id: 'url2', clicks: 0 });

    await urls.add('url1', 'clicks', 100);
    await urls.add('url2', 'clicks', 200);

    await urls.consolidate('url1', 'clicks');
    await urls.consolidate('url2', 'clicks');

    const analyticsUrl1 = await plugin.getLastNDays('urls', 'clicks', 7, {
      recordId: 'url1',
      fillGaps: false
    });

    const totalClicks = analyticsUrl1.reduce((sum, a) => sum + (a.sum || 0), 0);

    // Expected: 100 (only url1)
    expect(totalClicks).toBe(100);
  });

  it('✅ getLastNMonths correctly filters by recordId', async () => {
    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.insert({ id: 'url2', clicks: 0 });

    await urls.add('url1', 'clicks', 50);
    await urls.add('url2', 'clicks', 75);

    await urls.consolidate('url1', 'clicks');
    await urls.consolidate('url2', 'clicks');

    const analyticsUrl1 = await plugin.getLastNMonths('urls', 'clicks', 3, {
      recordId: 'url1',
      fillGaps: false
    });

    const totalClicks = analyticsUrl1.reduce((sum, a) => sum + (a.sum || 0), 0);

    // Expected: 50 (only url1)
    expect(totalClicks).toBe(50);
  });
});
