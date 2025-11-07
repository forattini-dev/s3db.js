/**
 * EventualConsistency Plugin - Real World Simulation Test
 *
 * Simulates a URL shortener scenario with multiple concurrent operations
 * over time, exactly as reported by mrt-shortner team.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistency - Real World Simulation (mrt-shortner)', () => {
  let database;
  let urls;
  let testId = 0;

  beforeEach(async () => {
    // Add unique test ID to prevent S3 prefix collisions
    database = await createDatabaseForTest(`eventual-consistency-simulation-${++testId}`);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should handle URL shortener scenario: clicks before URL exists', async () => {

    // Create URLs resource
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

    // Setup EventualConsistency for all counters (like mrt-shortner)
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks', 'views', 'shares', 'scans']
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);

    await urls.insert({
      id: 'test-url-123',
      link: 'https://example.com',
      clicks: 0,
      views: 0,
      shares: 0,
      scans: 0
    });

    // Simulate clicks over time

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


      for (let i = 0; i < op.count; i++) {
        await urls.add('test-url-123', op.type, 1);
      }
    }


    const url = await urls.get('test-url-123');


    // Verify all counters persisted correctly
    expect(url.clicks).toBe(6);
    expect(url.views).toBe(8);
    expect(url.shares).toBe(1);
    expect(url.scans).toBe(2);

  }, 30000);

  it('should handle the EXACT mrt-shortner bug scenario: add before record exists', async () => {

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);


    // This is the EXACT scenario from mrt-shortner:
    // Click event fires BEFORE URL.insert() completes

    await urls.add('url-race-123', 'clicks', 1);

    await urls.add('url-race-123', 'clicks', 1);

    await urls.add('url-race-123', 'clicks', 1);


    // v10.0.16: Plugin does NOT create the record
    // Transactions remain pending until app creates record

    // First create the record manually
    await urls.insert({
      id: 'url-race-123',
      link: 'https://example.com/race',
      clicks: 0
    });

    // Then consolidate to apply pending transactions
    await urls.consolidate('url-race-123', 'clicks');


    const url = await urls.get('url-race-123');

    expect(url.clicks).toBe(3);

  }, 30000);

  it.skip('should handle high-traffic scenario: 20 concurrent operations', async () => {

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      resource: 'urls',
      field: 'clicks',
      consolidation: { mode: 'sync', auto: false },
      verbose: false // Disable logs for performance
    });
    await database.usePlugin(plugin);

    await urls.insert({
      id: 'viral-url',
      link: 'https://viral.com',
      clicks: 0
    });


    const startTime = Date.now();

    // Fire 20 concurrent operations (reduced for performance)
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(urls.add('viral-url', 'clicks', 1));
    }

    await Promise.all(promises);

    const duration = Date.now() - startTime;



    const url = await urls.get('viral-url');


    expect(url.clicks).toBe(20);

  }, 120000); // 120 second timeout for high concurrency

  it.skip('should handle async mode with auto-consolidation over time', async () => {

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Setup EventualConsistency in ASYNC mode with short interval
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: true, interval: 1 }, // 1 second interval for fast testing
      verbose: false
    });
    await database.usePlugin(plugin);
    await plugin.start();

    await urls.insert({
      id: 'async-url',
      link: 'https://async.com',
      clicks: 0
    });


    // Add clicks at different times
    await urls.add('async-url', 'clicks', 1);
    await urls.add('async-url', 'clicks', 1);
    await urls.add('async-url', 'clicks', 1);

    // Check immediately (should still be 0 in async mode)
    let url = await urls.get('async-url');

    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));

    await urls.add('async-url', 'clicks', 1);
    await urls.add('async-url', 'clicks', 1);

    url = await urls.get('async-url');

    // Wait for auto-consolidation (2 seconds interval + 3 seconds buffer)
    await new Promise(resolve => setTimeout(resolve, 3000));


    url = await urls.get('async-url');

    // If auto-consolidation hasn't run yet, wait a bit more
    if (url.clicks !== 5) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      url = await urls.get('async-url');
    }

    expect(url.clicks).toBe(5);

    await plugin.stop();

  }, 30000); // 30 second timeout for this test

  it('should handle deleted record scenario (recovery)', async () => {

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Setup EventualConsistency
    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: false
    });
    await database.usePlugin(plugin);

    await urls.insert({
      id: 'deleted-url',
      link: 'https://deleted.com',
      clicks: 100
    });

    await urls.add('deleted-url', 'clicks', 5);

    await urls.delete('deleted-url');

    await urls.add('deleted-url', 'clicks', 10);
    await urls.add('deleted-url', 'clicks', 20);


    // v10.0.16: App must recreate the record
    await urls.insert({
      id: 'deleted-url',
      link: 'https://deleted.com',
      clicks: 0
    });

    // Then consolidate to apply pending transactions
    await urls.consolidate('deleted-url', 'clicks');

    const url = await urls.get('deleted-url');


    // Should have the new clicks (old value lost because record was deleted)
    expect(url.clicks).toBe(30);

  }, 60000); // 60 second timeout
});
