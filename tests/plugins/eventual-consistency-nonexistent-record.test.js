/**
 * EventualConsistency Plugin - Non-Existent Record Test
 *
 * Tests that consolidation correctly handles transactions for records that don't exist yet.
 * This is the fix for the bug where the plugin tried to insert records with incomplete data.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistencyPlugin - Non-Existent Record Handling', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-nonexistent');
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should keep transactions pending when record does not exist', async () => {

    // Create resource with required fields
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        shortUrl: 'string|required', // Required field!
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: true
    });
    await database.usePlugin(ecPlugin);


    // Add 3 clicks for a non-existent URL
    const urlId = 'url-nonexistent';
    await urls.add(urlId, 'clicks', 1);
    await urls.add(urlId, 'clicks', 1);
    await urls.add(urlId, 'clicks', 1);

    // Check pending transactions BEFORE consolidation
    const pendingBefore = await database.resources.plg_urls_tx_clicks.query({
      originalId: urlId,
      applied: false
    });
    expect(pendingBefore.length).toBe(3);

    // Try to consolidate - should skip because record doesn't exist
    const consolidatedValue = await urls.consolidate(urlId, 'clicks');

    // Check pending transactions AFTER failed consolidation
    const pendingAfter = await database.resources.plg_urls_tx_clicks.query({
      originalId: urlId,
      applied: false
    });
    expect(pendingAfter.length).toBe(3); // Should still be 3!

    // Check applied transactions
    const appliedAfter = await database.resources.plg_urls_tx_clicks.query({
      originalId: urlId,
      applied: true
    });
    expect(appliedAfter.length).toBe(0); // Should be 0!


    // NOW create the URL record
    await urls.insert({
      id: urlId,
      shortUrl: 'abc123',
      clicks: 0
    });

    // Run consolidation again - should now succeed
    const consolidatedValue2 = await urls.consolidate(urlId, 'clicks');
    expect(consolidatedValue2).toBe(3);

    // Check pending transactions AFTER successful consolidation
    const pendingFinal = await database.resources.plg_urls_tx_clicks.query({
      originalId: urlId,
      applied: false
    });
    expect(pendingFinal.length).toBe(0);

    // Check applied transactions
    const appliedFinal = await database.resources.plg_urls_tx_clicks.query({
      originalId: urlId,
      applied: true
    });
    expect(appliedFinal.length).toBe(3);

    // Verify URL was updated
    const url = await urls.get(urlId);
    expect(url.clicks).toBe(3);

  }, 30000);

  it('should handle mixed scenario: some records exist, some dont', async () => {

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
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: true
    });
    await database.usePlugin(ecPlugin);

    // Create URL 1 (EXISTS)
    const url1Id = 'url-001';
    await urls.insert({
      id: url1Id,
      shortUrl: 'abc123',
      clicks: 0
    });

    // Add clicks to URL 1
    await urls.add(url1Id, 'clicks', 1);
    await urls.add(url1Id, 'clicks', 1);

    // Add clicks to URL 2 (DOES NOT EXIST)
    const url2Id = 'url-002';
    await urls.add(url2Id, 'clicks', 1);
    await urls.add(url2Id, 'clicks', 1);
    await urls.add(url2Id, 'clicks', 1);

    // Consolidate URL 1 (should succeed)
    const value1 = await urls.consolidate(url1Id, 'clicks');
    expect(value1).toBe(2);

    const url1 = await urls.get(url1Id);
    expect(url1.clicks).toBe(2);

    // Consolidate URL 2 (should skip)
    const value2 = await urls.consolidate(url2Id, 'clicks');

    // Check that URL 2 transactions are still pending
    const pending2 = await database.resources.plg_urls_tx_clicks.query({
      originalId: url2Id,
      applied: false
    });
    expect(pending2.length).toBe(3);

    // Now create URL 2
    await urls.insert({
      id: url2Id,
      shortUrl: 'xyz789',
      clicks: 0
    });

    // Consolidate URL 2 again (should now succeed)
    const value2Final = await urls.consolidate(url2Id, 'clicks');
    expect(value2Final).toBe(3);

    const url2 = await urls.get(url2Id);
    expect(url2.clicks).toBe(3);

  }, 30000);

  it('should work correctly with body-overflow behavior', async () => {

    // Create resource with body-overflow behavior
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        shortUrl: 'string|required',
        longUrl: 'string|required',
        clicks: 'number|default:0'
      },
      behavior: 'body-overflow' // This is the behavior that was causing issues
    });

    // Install EventualConsistency
    const ecPlugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: false },
      verbose: true
    });
    await database.usePlugin(ecPlugin);


    // Add clicks to non-existent URL
    const urlId = 'url-bodyoverflow';
    for (let i = 0; i < 5; i++) {
      await urls.add(urlId, 'clicks', 1);
    }

    // Try to consolidate
    await urls.consolidate(urlId, 'clicks');

    // Verify transactions remain pending
    const pending = await database.resources.plg_urls_tx_clicks.query({
      originalId: urlId,
      applied: false
    });
    expect(pending.length).toBe(5);

    // Create the URL
    await urls.insert({
      id: urlId,
      shortUrl: 'short123',
      longUrl: 'https://example.com/very/long/url/path',
      clicks: 0
    });

    // Consolidate again
    const value = await urls.consolidate(urlId, 'clicks');
    expect(value).toBe(5);

    // Verify
    const url = await urls.get(urlId);
    expect(url.clicks).toBe(5);

  }, 30000);
});
