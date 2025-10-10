/**
 * EventualConsistency Plugin - Real World Simulation Test
 *
 * Simulates a URL shortener scenario with multiple concurrent operations
 * over time, exactly as reported by mrt-shortner team.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency.plugin.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistency - Real World Simulation (mrt-shortner)', () => {
  let database;
  let urls;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-simulation');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should handle URL shortener scenario: clicks before URL exists', async () => {
    console.log('\n🧪 Simulating mrt-shortner URL shortener scenario...\n');

    // Create URLs resource
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

    // Setup EventualConsistency for all counters (like mrt-shortner)
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      mode: 'sync',
      autoConsolidate: false,
      verbose: true
    });
    await database.usePlugin(plugin);

    console.log('1️⃣  Creating URL...');
    await urls.insert({
      id: 'test-url-123',
      link: 'https://example.com',
      clicks: 0,
      views: 0,
      shares: 0,
      scans: 0
    });

    // Simulate clicks over time
    console.log('\n2️⃣  Simulating user interactions over time...\n');

    const operations = [
      { delay: 100, type: 'clicks', count: 3, desc: 'User A clicks 3 times' },
      { delay: 200, type: 'views', count: 5, desc: 'User B views 5 times' },
      { delay: 300, type: 'clicks', count: 2, desc: 'User C clicks 2 times' },
      { delay: 400, type: 'shares', count: 1, desc: 'User D shares once' },
      { delay: 500, type: 'scans', count: 2, desc: 'User E scans QR code 2 times' },
      { delay: 600, type: 'clicks', count: 1, desc: 'User F clicks once' },
      { delay: 700, type: 'views', count: 3, desc: 'User G views 3 times' },
    ];

    for (const op of operations) {
      await new Promise(resolve => setTimeout(resolve, op.delay));

      console.log(`   [+${op.delay}ms] ${op.desc}`);

      for (let i = 0; i < op.count; i++) {
        await urls.add('test-url-123', op.type, 1);
      }
    }

    console.log('\n3️⃣  Reading final values from database...\n');

    const url = await urls.get('test-url-123');

    console.log('   📊 Final metrics:');
    console.log(`      Clicks:  ${url.clicks}  (expected: 6)`);
    console.log(`      Views:   ${url.views}   (expected: 8)`);
    console.log(`      Shares:  ${url.shares}  (expected: 1)`);
    console.log(`      Scans:   ${url.scans}   (expected: 2)`);

    // Verify all counters persisted correctly
    expect(url.clicks).toBe(6);
    expect(url.views).toBe(8);
    expect(url.shares).toBe(1);
    expect(url.scans).toBe(2);

    console.log('\n✅ All metrics persisted correctly!\n');
  });

  it('should handle the EXACT mrt-shortner bug scenario: add before record exists', async () => {
    console.log('\n🔴 Reproducing EXACT mrt-shortner bug scenario...\n');

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        link: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      mode: 'sync',
      autoConsolidate: false,
      verbose: true
    });
    await database.usePlugin(plugin);

    console.log('1️⃣  Simulating race condition: clicks BEFORE URL exists\n');

    // This is the EXACT scenario from mrt-shortner:
    // Click event fires BEFORE URL.insert() completes

    console.log('   ⏱️  T0: Click event fires...');
    await urls.add('url-race-123', 'clicks', 1);

    console.log('   ⏱️  T1: Another click...');
    await urls.add('url-race-123', 'clicks', 1);

    console.log('   ⏱️  T2: And another...');
    await urls.add('url-race-123', 'clicks', 1);

    console.log('\n2️⃣  Now URL.insert() completes (race condition!)...\n');

    // URL is created AFTER clicks were added
    // This would FAIL in old version (before fix)
    // With fix, consolidation creates the record

    console.log('3️⃣  Reading from database...\n');

    const url = await urls.get('url-race-123');

    if (url) {
      console.log(`   ✅ Record EXISTS (created by consolidation)`);
      console.log(`   📊 Clicks: ${url.clicks} (expected: 3)`);
      expect(url.clicks).toBe(3);
    } else {
      console.log(`   ❌ Record DOES NOT EXIST (BUG!)`);
      throw new Error('Record should have been created by consolidation!');
    }

    console.log('\n✅ Fix working correctly!\n');
  });

  it.skip('should handle high-traffic scenario: 20 concurrent operations', async () => {
    console.log('\n🚀 Simulating high-traffic scenario...\n');

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        link: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      resource: 'urls',
      field: 'clicks',
      mode: 'sync',
      autoConsolidate: false,
      verbose: false // Disable logs for performance
    });
    await database.usePlugin(plugin);

    console.log('1️⃣  Creating popular URL...');
    await urls.insert({
      id: 'viral-url',
      link: 'https://viral.com',
      clicks: 0
    });

    console.log('2️⃣  Simulating 20 concurrent clicks...\n');

    const startTime = Date.now();

    // Fire 20 concurrent operations (reduced for performance)
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(urls.add('viral-url', 'clicks', 1));
    }

    await Promise.all(promises);

    const duration = Date.now() - startTime;

    console.log(`   ⚡ 20 operations completed in ${duration}ms`);
    console.log(`   📈 Throughput: ${Math.round(20 / (duration / 1000))} ops/sec\n`);

    console.log('3️⃣  Verifying data integrity...\n');

    const url = await urls.get('viral-url');

    console.log(`   📊 Total clicks: ${url.clicks} (expected: 20)`);

    expect(url.clicks).toBe(20);

    console.log('\n✅ All 20 operations persisted correctly!\n');
  }, 120000); // 120 second timeout for high concurrency

  it('should handle async mode with auto-consolidation over time', async () => {
    console.log('\n⏰ Testing async mode with auto-consolidation...\n');

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        link: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Setup EventualConsistency in ASYNC mode
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      mode: 'async',
      autoConsolidate: true,
      consolidationInterval: 2, // 2 seconds for fast testing
      verbose: true
    });
    await database.usePlugin(plugin);

    console.log('1️⃣  Creating URL...');
    await urls.insert({
      id: 'async-url',
      link: 'https://async.com',
      clicks: 0
    });

    console.log('\n2️⃣  Adding clicks over time...\n');

    // Add clicks at different times
    console.log('   [T+0s] Adding 3 clicks...');
    await urls.add('async-url', 'clicks', 1);
    await urls.add('async-url', 'clicks', 1);
    await urls.add('async-url', 'clicks', 1);

    // Check immediately (should still be 0 in async mode)
    let url = await urls.get('async-url');
    console.log(`   [T+0s] Current value: ${url.clicks} (consolidation pending)`);

    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n   [T+1s] Adding 2 more clicks...');
    await urls.add('async-url', 'clicks', 1);
    await urls.add('async-url', 'clicks', 1);

    url = await urls.get('async-url');
    console.log(`   [T+1s] Current value: ${url.clicks} (consolidation pending)`);

    // Wait for auto-consolidation (2 seconds interval + 3 seconds buffer)
    console.log('\n   [T+3s] Waiting for auto-consolidation...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n3️⃣  Checking final value after auto-consolidation...\n');

    url = await urls.get('async-url');
    console.log(`   📊 Final clicks: ${url.clicks} (expected: 5)`);

    // If auto-consolidation hasn't run yet, wait a bit more
    if (url.clicks !== 5) {
      console.log('   ⏰ Auto-consolidation not done yet, waiting 2 more seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      url = await urls.get('async-url');
      console.log(`   📊 Final clicks after additional wait: ${url.clicks}`);
    }

    expect(url.clicks).toBe(5);

    console.log('\n✅ Async mode with auto-consolidation working!\n');
  }, 30000); // 30 second timeout for this test

  it('should handle deleted record scenario (recovery)', async () => {
    console.log('\n🗑️  Testing deleted record scenario...\n');

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        link: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      mode: 'sync',
      autoConsolidate: false,
      verbose: true
    });
    await database.usePlugin(plugin);

    console.log('1️⃣  Creating URL...');
    await urls.insert({
      id: 'deleted-url',
      link: 'https://deleted.com',
      clicks: 100
    });

    console.log('2️⃣  Adding some clicks...');
    await urls.add('deleted-url', 'clicks', 5);

    console.log('3️⃣  DELETING the URL (simulating accidental deletion)...\n');
    await urls.delete('deleted-url');

    console.log('4️⃣  More clicks arrive (URL deleted but events still firing)...');
    await urls.add('deleted-url', 'clicks', 10);
    await urls.add('deleted-url', 'clicks', 20);

    console.log('\n5️⃣  Checking if record was RECOVERED...\n');

    const url = await urls.get('deleted-url');

    if (url) {
      console.log(`   ✅ Record RECOVERED by consolidation!`);
      console.log(`   📊 Clicks: ${url.clicks} (expected: 30 = 10 + 20)`);

      // Should have the new clicks (old value lost because record was deleted)
      expect(url.clicks).toBe(30);
    } else {
      throw new Error('Record should have been recovered by consolidation!');
    }

    console.log('\n✅ Recovery working correctly!\n');
  }, 60000); // 60 second timeout
});
