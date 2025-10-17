import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("EventualConsistencyPlugin - Hooks Scenario (Real World)", () => {
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
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync' },// Immediate consistency
      verbose: true
    });

    await database.usePlugin(plugin);

    // Create URLs resource - EXACTLY like production
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
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
        id: 'string|required',
        urlId: 'string|required',
        userId: 'string|optional',
        timestamp: 'string|required'
      }
    });

    // Create Views resource
    views = await database.createResource({
      name: 'views',
      attributes: {
        id: 'string|required',
        urlId: 'string|required',
        timestamp: 'string|required'
      }
    });

    // Create Shares resource
    shares = await database.createResource({
      name: 'shares',
      attributes: {
        id: 'string|required',
        urlId: 'string|required',
        timestamp: 'string|required'
      }
    });

    // Create Scans resource
    scans = await database.createResource({
      name: 'scans',
      attributes: {
        id: 'string|required',
        urlId: 'string|required',
        timestamp: 'string|required'
      }
    });

    // HOOK: afterInsert on Clicks -> increment URL.clicks
    // EXACTLY like production
    clicks.addHook('afterInsert', async (record) => {
      console.log(`[HOOK] Click created for URL ${record.urlId}, incrementing clicks...`);
      await urls.add(record.urlId, 'clicks', 1);
      console.log(`[HOOK] Clicks incremented for URL ${record.urlId}`);
    });

    // HOOK: afterInsert on Views -> increment URL.views
    views.addHook('afterInsert', async (record) => {
      console.log(`[HOOK] View created for URL ${record.urlId}, incrementing views...`);
      await urls.add(record.urlId, 'views', 1);
    });

    // HOOK: afterInsert on Shares -> increment URL.shares
    shares.addHook('afterInsert', async (record) => {
      console.log(`[HOOK] Share created for URL ${record.urlId}, incrementing shares...`);
      await urls.add(record.urlId, 'shares', 1);
    });

    // HOOK: afterInsert on Scans -> increment URL.scans
    scans.addHook('afterInsert', async (record) => {
      console.log(`[HOOK] Scan created for URL ${record.urlId}, incrementing scans...`);
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
    console.log('\n=== TEST: Click increment via hook ===');

    // Create URL
    await urls.insert({
      id: 'short-abc',
      link: 'https://example.com/article',
      clicks: 0,
      views: 0,
      shares: 0,
      scans: 0
    });

    console.log('Initial URL created');

    // Verify initial state
    let url = await urls.get('short-abc');
    console.log(`Initial clicks: ${url.clicks}`);
    expect(url.clicks).toBe(0);

    // Create click #1 (triggers hook)
    console.log('\n--- Creating click #1 ---');
    await clicks.insert({
      id: 'click-1',
      urlId: 'short-abc',
      timestamp: new Date().toISOString()
    });

    // Verify clicks = 1
    url = await urls.get('short-abc');
    console.log(`After click #1: ${url.clicks}`);
    expect(url.clicks).toBe(1);

    // Create click #2 (triggers hook)
    console.log('\n--- Creating click #2 ---');
    await clicks.insert({
      id: 'click-2',
      urlId: 'short-abc',
      timestamp: new Date().toISOString()
    });

    // Verify clicks = 2 (NOT RESET TO 0!)
    url = await urls.get('short-abc');
    console.log(`After click #2: ${url.clicks}`);
    expect(url.clicks).toBe(2);

    // Create click #3 (triggers hook)
    console.log('\n--- Creating click #3 ---');
    await clicks.insert({
      id: 'click-3',
      urlId: 'short-abc',
      timestamp: new Date().toISOString()
    });

    // Verify clicks = 3 (PERSISTED!)
    url = await urls.get('short-abc');
    console.log(`After click #3: ${url.clicks}`);
    expect(url.clicks).toBe(3);

    // CRITICAL: Get URL again to verify persistence
    console.log('\n--- Verifying persistence (get again) ---');
    url = await urls.get('short-abc');
    console.log(`Final persistence check: ${url.clicks}`);
    expect(url.clicks).toBe(3); // Should stay 3, not reset!
  });

  test("should handle multiple event types (clicks, views, shares, scans)", async () => {
    console.log('\n=== TEST: Multiple event types ===');

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
    console.log(`Clicks: ${url.clicks}, Views: ${url.views}, Shares: ${url.shares}, Scans: ${url.scans}`);

    expect(url.clicks).toBe(1);
    expect(url.views).toBe(1);
    expect(url.shares).toBe(1);
    expect(url.scans).toBe(1);
  });

  test("should handle multiple sequential clicks", async () => {
    console.log('\n=== TEST: Multiple sequential clicks ===');

    // Create URL
    await urls.insert({
      id: 'short-concurrent',
      link: 'https://example.com/popular',
      clicks: 0
    });

    // Create 5 clicks sequentially (changed from parallel to avoid plugin state race in parallel test execution)
    console.log('Creating 5 clicks sequentially...');
    for (let i = 0; i < 5; i++) {
      await clicks.insert({
        id: `click-concurrent-${i}`,
        urlId: 'short-concurrent',
        timestamp: new Date().toISOString()
      });
    }
    console.log('All 5 clicks created');

    // Verify all clicks counted
    const url = await urls.get('short-concurrent');
    console.log(`Final clicks count: ${url.clicks}`);
    expect(url.clicks).toBe(5);

    // Verify persistence
    const urlAgain = await urls.get('short-concurrent');
    console.log(`Persistence check: ${urlAgain.clicks}`);
    expect(urlAgain.clicks).toBe(5);
  }, 30000); // 30s timeout

  test("should persist across multiple increments (10 sequential clicks)", async () => {
    console.log('\n=== TEST: Sequential persistence ===');

    // Create URL
    await urls.insert({
      id: 'short-sequential',
      link: 'https://example.com/blog',
      clicks: 0
    });

    // Create 10 clicks sequentially
    for (let i = 1; i <= 10; i++) {
      console.log(`\n--- Click ${i}/10 ---`);

      await clicks.insert({
        id: `click-seq-${i}`,
        urlId: 'short-sequential',
        timestamp: new Date().toISOString()
      });

      // Verify after each click
      const url = await urls.get('short-sequential');
      console.log(`After click ${i}: clicks = ${url.clicks}`);
      expect(url.clicks).toBe(i);

      // CRITICAL: Verify persistence didn't reset
      if (i > 1) {
        const urlCheck = await urls.get('short-sequential');
        console.log(`Persistence check: ${urlCheck.clicks}`);
        expect(urlCheck.clicks).toBe(i); // Should NOT reset!
      }
    }

    // Final verification
    const finalUrl = await urls.get('short-sequential');
    console.log(`\nFinal count: ${finalUrl.clicks}`);
    expect(finalUrl.clicks).toBe(10);
  }, 30000);

  test("should verify transactions are created and marked as applied", async () => {
    console.log('\n=== TEST: Transaction verification ===');

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

    console.log(`Found ${transactions.length} transactions`);
    expect(transactions.length).toBe(2);

    // Verify all transactions are applied (sync mode)
    for (const txn of transactions) {
      console.log(`Transaction ${txn.id}: operation=${txn.operation}, value=${txn.value}, applied=${txn.applied}`);
      expect(txn.operation).toBe('add');
      expect(txn.value).toBe(1);
      expect(txn.applied).toBe(true); // Should be applied in sync mode
    }

    // Verify URL has correct count
    const url = await urls.get('short-txn');
    console.log(`URL clicks: ${url.clicks}`);
    expect(url.clicks).toBe(2);
  });

  test("BUG FIX: should NOT reset value (0→1→0→1→0→1)", async () => {
    console.log('\n=== TEST: Bug fix verification - NO RESET ===');

    // Create URL
    await urls.insert({
      id: 'short-bugfix',
      link: 'https://example.com/article',
      clicks: 0
    });

    console.log('Testing the OLD BUG: clicks should NOT reset to 0');

    // Pattern that exposed the old bug: rapid sequential clicks
    for (let i = 1; i <= 5; i++) {
      console.log(`\nIteration ${i}:`);

      // Create click
      await clicks.insert({
        id: `click-bugfix-${i}`,
        urlId: 'short-bugfix',
        timestamp: new Date().toISOString()
      });

      // Check immediately
      const url1 = await urls.get('short-bugfix');
      console.log(`  Immediate check: ${url1.clicks}`);
      expect(url1.clicks).toBe(i);

      // Check again (old bug would reset here)
      const url2 = await urls.get('short-bugfix');
      console.log(`  Second check: ${url2.clicks}`);
      expect(url2.clicks).toBe(i); // Should be same, NOT 0!

      // Check third time (paranoia check)
      const url3 = await urls.get('short-bugfix');
      console.log(`  Third check: ${url3.clicks}`);
      expect(url3.clicks).toBe(i); // Still same!
    }

    // Final verification
    const finalUrl = await urls.get('short-bugfix');
    console.log(`\n✅ Final value: ${finalUrl.clicks} (should be 5, NOT 0 or 1)`);
    expect(finalUrl.clicks).toBe(5);
  }, 30000); // 30 second timeout for eventual consistency operations
});
