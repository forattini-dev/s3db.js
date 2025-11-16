/**
 * EventualConsistency Plugin - Update Persistence Test
 *
 * Tests that verify the update() is persisting correctly to S3
 * and investigate potential S3 eventual consistency issues
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Update Persistence', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-update-persistence');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should persist consolidated value immediately after consolidation', async () => {

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        shortUrl: 'string|required',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      logLevel: 'silent' // Enable verbose logging
    });
    await database.usePlugin(ecPlugin);

    // Insert URL
    await urls.insert({
      id: 'url-001',
      shortUrl: 'abc123',
      clicks: 0
    });


    // Make 3 click operations
    await urls.add('url-001', 'clicks', 1);
    await urls.add('url-001', 'clicks', 1);
    await urls.add('url-001', 'clicks', 1);

    // Get BEFORE consolidation
    const beforeConsolidate = await urls.get('url-001');
    expect(beforeConsolidate.clicks).toBe(0);

    // Consolidate
    const consolidatedValue = await urls.consolidate('url-001', 'clicks');
    expect(consolidatedValue).toBe(3);

    // Get IMMEDIATELY after consolidation
    const afterConsolidate = await urls.get('url-001');

    // Check if it's correct
    if (afterConsolidate.clicks === 3) {
    } else {

      // Wait 3 seconds and try again
      await new Promise(resolve => setTimeout(resolve, 3000));

      const afterWait = await urls.get('url-001');

      if (afterWait.clicks === 3) {
      } else {
      }
    }

    expect(afterConsolidate.clicks).toBe(3);
  }, 30000);

  it('should accumulate correctly across multiple consolidations', async () => {

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(ecPlugin);

    // Insert URL
    await urls.insert({
      id: 'url-002',
      clicks: 0
    });

    // Click 1: Add 1, consolidate
    await urls.add('url-002', 'clicks', 1);
    await urls.consolidate('url-002', 'clicks');
    const after1 = await urls.get('url-002');
    expect(after1.clicks).toBe(1);

    // Click 2: Add 1, consolidate
    await urls.add('url-002', 'clicks', 1);
    await urls.consolidate('url-002', 'clicks');
    const after2 = await urls.get('url-002');
    expect(after2.clicks).toBe(2);

    // Click 3: Add 1, consolidate
    await urls.add('url-002', 'clicks', 1);
    await urls.consolidate('url-002', 'clicks');
    const after3 = await urls.get('url-002');
    expect(after3.clicks).toBe(3);

  }, 30000);

  it('should show applied transactions are being tracked correctly', async () => {

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(ecPlugin);

    // Insert URL
    await urls.insert({
      id: 'url-003',
      clicks: 0
    });

    // Add 5 clicks
    for (let i = 0; i < 5; i++) {
      await urls.add('url-003', 'clicks', 1);
    }

    // Check pending transactions
    const pendingBefore = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url-003',
      applied: false
    });
    expect(pendingBefore.length).toBe(5);

    // Consolidate
    await urls.consolidate('url-003', 'clicks');

    // Check applied transactions
    const appliedAfter = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url-003',
      applied: true
    });
    expect(appliedAfter.length).toBe(5);

    // Check pending transactions
    const pendingAfter = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url-003',
      applied: false
    });
    expect(pendingAfter.length).toBe(0);

    // Verify URL was updated
    const url = await urls.get('url-003');
    expect(url.clicks).toBe(5);

  }, 30000);

  it('should handle the exact scenario from user logs', async () => {

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      logLevel: 'silent'
    });
    await database.usePlugin(ecPlugin);

    // Insert URL
    await urls.insert({
      id: 'url-004',
      clicks: 0
    });

    // Simulate user scenario:
    // Click 1 → Consolidate → Click 2 → Consolidate → Click 3 → Consolidate

    await urls.add('url-004', 'clicks', 1);
    await urls.consolidate('url-004', 'clicks');
    const after1 = await urls.get('url-004');
    expect(after1.clicks).toBe(1);

    await urls.add('url-004', 'clicks', 1);
    await urls.consolidate('url-004', 'clicks');
    const after2 = await urls.get('url-004');
    expect(after2.clicks).toBe(2);

    await urls.add('url-004', 'clicks', 1);
    await urls.consolidate('url-004', 'clicks');
    const after3 = await urls.get('url-004');
    expect(after3.clicks).toBe(3);

    await urls.add('url-004', 'clicks', 1);
    await urls.consolidate('url-004', 'clicks');
    const after4 = await urls.get('url-004');
    expect(after4.clicks).toBe(4);

  }, 30000);
});
