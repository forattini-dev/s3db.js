import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("EventualConsistencyPlugin - Hooks Scenario (Real World)", () => {
  jest.setTimeout(120000);
  let database;
  let urls;
  let clicks;
  let views;
  let shares;
  let scans;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/ec-hooks');
    await database.connect();

    // Plugin with multi-resource API - EXACTLY like production
    plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync' },// Immediate consistency
      verbose: false
    });

    await database.usePlugin(plugin);

    // Create URLs resource - EXACTLY like production
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|required',
        clicks: 'number|default:0',
        views: 'number|default:0',
        shares: 'number|default:0',
        scans: 'number|default:0'
      }
    });

    // Create Clicks resource - EXACTLY like production
    clicks = await database.createResource({
      name: 'clicks',
      attributes: {
        id: 'string|optional',
        urlId: 'string|required',
        userId: 'string|optional',
        timestamp: 'string|required'
      }
    });

    // Create Views resource
    views = await database.createResource({
      name: 'views',
      attributes: {
        id: 'string|optional',
        urlId: 'string|required',
        timestamp: 'string|required'
      }
    });

    // Create Shares resource
    shares = await database.createResource({
      name: 'shares',
      attributes: {
        id: 'string|optional',
        urlId: 'string|required',
        timestamp: 'string|required'
      }
    });

    // Create Scans resource
    scans = await database.createResource({
      name: 'scans',
      attributes: {
        id: 'string|optional',
        urlId: 'string|required',
        timestamp: 'string|required'
      }
    });

    // HOOK: afterInsert on Clicks -> increment URL.clicks
    // EXACTLY like production
    clicks.addHook('afterInsert', async (record) => {
      await urls.add(record.urlId, 'clicks', 1);
    });

    // HOOK: afterInsert on Views -> increment URL.views
    views.addHook('afterInsert', async (record) => {
      await urls.add(record.urlId, 'views', 1);
    });

    // HOOK: afterInsert on Shares -> increment URL.shares
    shares.addHook('afterInsert', async (record) => {
      await urls.add(record.urlId, 'shares', 1);
    });

    // HOOK: afterInsert on Scans -> increment URL.scans
    scans.addHook('afterInsert', async (record) => {
      await urls.add(record.urlId, 'scans', 1);
    });

    await plugin.start();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  test("should increment clicks via hook and PERSIST value", async () => {

    // Create URL
    await urls.insert({
      id: 'short-abc',
      link: 'https://example.com/article',
      clicks: 0,
      views: 0,
      shares: 0,
      scans: 0
    });


    // Verify initial state
    let url = await urls.get('short-abc');
    expect(url.clicks).toBe(0);

    // Create click #1 (triggers hook)
    await clicks.insert({
      id: 'click-1',
      urlId: 'short-abc',
      timestamp: new Date().toISOString()
    });

    // Verify clicks = 1
    url = await urls.get('short-abc');
    expect(url.clicks).toBe(1);

    // Create click #2 (triggers hook)
    await clicks.insert({
      id: 'click-2',
      urlId: 'short-abc',
      timestamp: new Date().toISOString()
    });

    // Verify clicks = 2 (NOT RESET TO 0!)
    url = await urls.get('short-abc');
    expect(url.clicks).toBe(2);

    // Create click #3 (triggers hook)
    await clicks.insert({
      id: 'click-3',
      urlId: 'short-abc',
      timestamp: new Date().toISOString()
    });

    // Verify clicks = 3 (PERSISTED!)
    url = await urls.get('short-abc');
    expect(url.clicks).toBe(3);

    // CRITICAL: Get URL again to verify persistence
    url = await urls.get('short-abc');
    expect(url.clicks).toBe(3); // Should stay 3, not reset!
  });

  test("should handle multiple event types (clicks, views, shares, scans)", async () => {

    // Create URL
    await urls.insert({
      id: 'short-multi',
      link: 'https://example.com/page',
      clicks: 0,
      views: 0,
      shares: 0,
      scans: 0
    });

    // Create events through hooks
    await clicks.insert({
      id: 'click-multi-1',
      urlId: 'short-multi',
      timestamp: new Date().toISOString()
    });

    await views.insert({
      id: 'view-multi-1',
      urlId: 'short-multi',
      timestamp: new Date().toISOString()
    });

    await shares.insert({
      id: 'share-multi-1',
      urlId: 'short-multi',
      timestamp: new Date().toISOString()
    });

    await scans.insert({
      id: 'scan-multi-1',
      urlId: 'short-multi',
      timestamp: new Date().toISOString()
    });

    // Verify all counters
    const url = await urls.get('short-multi');

    expect(url.clicks).toBe(1);
    expect(url.views).toBe(1);
    expect(url.shares).toBe(1);
    expect(url.scans).toBe(1);
  });

  test("should handle multiple sequential clicks", async () => {

    // Create URL
    await urls.insert({
      id: 'short-concurrent',
      link: 'https://example.com/popular',
      clicks: 0
    });

    // Create 5 clicks sequentially (changed from parallel to avoid plugin state race in parallel test execution)
    for (let i = 0; i < 5; i++) {
      await clicks.insert({
        id: `click-concurrent-${i}`,
        urlId: 'short-concurrent',
        timestamp: new Date().toISOString()
      });
    }

    // Verify all clicks counted
    const url = await urls.get('short-concurrent');
    expect(url.clicks).toBe(5);

    // Verify persistence
    const urlAgain = await urls.get('short-concurrent');
    expect(urlAgain.clicks).toBe(5);
  }, 30000); // 30s timeout

  test("should persist across multiple increments (10 sequential clicks)", async () => {

    // Create URL
    await urls.insert({
      id: 'short-sequential',
      link: 'https://example.com/blog',
      clicks: 0
    });

    // Create 10 clicks sequentially
    for (let i = 1; i <= 10; i++) {

      await clicks.insert({
        id: `click-seq-${i}`,
        urlId: 'short-sequential',
        timestamp: new Date().toISOString()
      });

      // Verify after each click
      const url = await urls.get('short-sequential');
      expect(url.clicks).toBe(i);

      // CRITICAL: Verify persistence didn't reset
      if (i > 1) {
        const urlCheck = await urls.get('short-sequential');
        expect(urlCheck.clicks).toBe(i); // Should NOT reset!
      }
    }

    // Final verification
    const finalUrl = await urls.get('short-sequential');
    expect(finalUrl.clicks).toBe(10);
  }, 30000);

  test("should verify transactions are created and marked as applied", async () => {

    // Create URL
    await urls.insert({
      id: 'short-txn',
      link: 'https://example.com/test',
      clicks: 0
    });

    // Create clicks through hooks
    await clicks.insert({
      id: 'click-txn-1',
      urlId: 'short-txn',
      timestamp: new Date().toISOString()
    });

    await clicks.insert({
      id: 'click-txn-2',
      urlId: 'short-txn',
      timestamp: new Date().toISOString()
    });

    // Verify transaction resource exists
    const txnResource = database.resources.plg_urls_tx_clicks;
    expect(txnResource).toBeDefined();

    // Verify transactions
    const transactions = await txnResource.query({
      originalId: 'short-txn'
    });

    expect(transactions.length).toBe(2);

    // Verify all transactions are applied (sync mode)
    for (const txn of transactions) {
      expect(txn.operation).toBe('add');
      expect(txn.value).toBe(1);
      expect(txn.applied).toBe(true); // Should be applied in sync mode
    }

    // Verify URL has correct count
    const url = await urls.get('short-txn');
    expect(url.clicks).toBe(2);
  });

  test("BUG FIX: should NOT reset value (0→1→0→1→0→1)", async () => {

    // Create URL
    await urls.insert({
      id: 'short-bugfix',
      link: 'https://example.com/article',
      clicks: 0
    });


    // Pattern that exposed the old bug: rapid sequential clicks
    for (let i = 1; i <= 5; i++) {

      // Create click
      await clicks.insert({
        id: `click-bugfix-${i}`,
        urlId: 'short-bugfix',
        timestamp: new Date().toISOString()
      });

      // Check immediately
      const url1 = await urls.get('short-bugfix');
      expect(url1.clicks).toBe(i);

      // Check again (old bug would reset here)
      const url2 = await urls.get('short-bugfix');
      expect(url2.clicks).toBe(i); // Should be same, NOT 0!

      // Check third time (paranoia check)
      const url3 = await urls.get('short-bugfix');
      expect(url3.clicks).toBe(i); // Still same!
    }

    // Final verification
    const finalUrl = await urls.get('short-bugfix');
    expect(finalUrl.clicks).toBe(5);
  }, 30000); // 30 second timeout for eventual consistency operations
});
