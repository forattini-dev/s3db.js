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
    console.log('\n🧪 Testing consolidation for non-existent record...\n');

    // Create resource with required fields
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
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

    console.log('✅ Resource and plugin configured\n');

    // Add 3 clicks for a non-existent URL
    const urlId = 'url-nonexistent';
    console.log('1️⃣  Adding 3 clicks for NON-EXISTENT URL:', urlId);
    await urls.add(urlId, 'clicks', 1);
    await urls.add(urlId, 'clicks', 1);
    await urls.add(urlId, 'clicks', 1);
    console.log('   ✅ 3 transactions created\n');

    // Check pending transactions BEFORE consolidation
    const pendingBefore = await database.resources.urls_transactions_clicks.query({
      originalId: urlId,
      applied: false
    });
    console.log('2️⃣  Pending transactions BEFORE consolidation:', pendingBefore.length);
    expect(pendingBefore.length).toBe(3);

    // Try to consolidate - should skip because record doesn't exist
    console.log('\n3️⃣  Running consolidation (record does NOT exist)...');
    const consolidatedValue = await urls.consolidate(urlId, 'clicks');
    console.log('   Consolidated value returned:', consolidatedValue);
    console.log('   (This is informational only - record was NOT updated)\n');

    // Check pending transactions AFTER failed consolidation
    const pendingAfter = await database.resources.urls_transactions_clicks.query({
      originalId: urlId,
      applied: false
    });
    console.log('4️⃣  Pending transactions AFTER consolidation:', pendingAfter.length);
    expect(pendingAfter.length).toBe(3); // Should still be 3!

    // Check applied transactions
    const appliedAfter = await database.resources.urls_transactions_clicks.query({
      originalId: urlId,
      applied: true
    });
    console.log('   Applied transactions AFTER consolidation:', appliedAfter.length);
    expect(appliedAfter.length).toBe(0); // Should be 0!

    console.log('   ✅ Transactions correctly remained PENDING\n');

    // NOW create the URL record
    console.log('5️⃣  Creating the URL record with required fields...');
    await urls.insert({
      id: urlId,
      shortUrl: 'abc123',
      clicks: 0
    });
    console.log('   ✅ URL record created\n');

    // Run consolidation again - should now succeed
    console.log('6️⃣  Running consolidation (record NOW exists)...');
    const consolidatedValue2 = await urls.consolidate(urlId, 'clicks');
    console.log('   Consolidated value:', consolidatedValue2, '(expected: 3)');
    expect(consolidatedValue2).toBe(3);

    // Check pending transactions AFTER successful consolidation
    const pendingFinal = await database.resources.urls_transactions_clicks.query({
      originalId: urlId,
      applied: false
    });
    console.log('\n7️⃣  Pending transactions AFTER successful consolidation:', pendingFinal.length);
    expect(pendingFinal.length).toBe(0);

    // Check applied transactions
    const appliedFinal = await database.resources.urls_transactions_clicks.query({
      originalId: urlId,
      applied: true
    });
    console.log('   Applied transactions AFTER successful consolidation:', appliedFinal.length);
    expect(appliedFinal.length).toBe(3);

    // Verify URL was updated
    const url = await urls.get(urlId);
    console.log('\n8️⃣  URL clicks value:', url.clicks, '(expected: 3)');
    expect(url.clicks).toBe(3);

    console.log('\n✅ Test passed! Transactions correctly remained pending until record was created.\n');
  }, 30000);

  it('should handle mixed scenario: some records exist, some dont', async () => {
    console.log('\n🧪 Testing mixed scenario: existing + non-existing records...\n');

    // Create resource
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
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
    console.log('1️⃣  Creating URL 1 (exists):', url1Id);
    await urls.insert({
      id: url1Id,
      shortUrl: 'abc123',
      clicks: 0
    });

    // Add clicks to URL 1
    console.log('   Adding 2 clicks to URL 1...');
    await urls.add(url1Id, 'clicks', 1);
    await urls.add(url1Id, 'clicks', 1);

    // Add clicks to URL 2 (DOES NOT EXIST)
    const url2Id = 'url-002';
    console.log('\n2️⃣  Adding 3 clicks to URL 2 (does NOT exist):', url2Id);
    await urls.add(url2Id, 'clicks', 1);
    await urls.add(url2Id, 'clicks', 1);
    await urls.add(url2Id, 'clicks', 1);

    // Consolidate URL 1 (should succeed)
    console.log('\n3️⃣  Consolidating URL 1 (exists)...');
    const value1 = await urls.consolidate(url1Id, 'clicks');
    console.log('   Value:', value1, '(expected: 2)');
    expect(value1).toBe(2);

    const url1 = await urls.get(url1Id);
    expect(url1.clicks).toBe(2);

    // Consolidate URL 2 (should skip)
    console.log('\n4️⃣  Consolidating URL 2 (does NOT exist)...');
    const value2 = await urls.consolidate(url2Id, 'clicks');
    console.log('   Value:', value2, '(informational only, record not updated)');

    // Check that URL 2 transactions are still pending
    const pending2 = await database.resources.urls_transactions_clicks.query({
      originalId: url2Id,
      applied: false
    });
    console.log('   URL 2 pending transactions:', pending2.length, '(expected: 3)');
    expect(pending2.length).toBe(3);

    // Now create URL 2
    console.log('\n5️⃣  Creating URL 2...');
    await urls.insert({
      id: url2Id,
      shortUrl: 'xyz789',
      clicks: 0
    });

    // Consolidate URL 2 again (should now succeed)
    console.log('\n6️⃣  Consolidating URL 2 (now exists)...');
    const value2Final = await urls.consolidate(url2Id, 'clicks');
    console.log('   Value:', value2Final, '(expected: 3)');
    expect(value2Final).toBe(3);

    const url2 = await urls.get(url2Id);
    expect(url2.clicks).toBe(3);

    console.log('\n✅ Mixed scenario handled correctly!\n');
  }, 30000);

  it('should work correctly with body-overflow behavior', async () => {
    console.log('\n🧪 Testing with body-overflow behavior...\n');

    // Create resource with body-overflow behavior
    const urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
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

    console.log('✅ Resource with body-overflow behavior configured\n');

    // Add clicks to non-existent URL
    const urlId = 'url-bodyoverflow';
    console.log('1️⃣  Adding 5 clicks to NON-EXISTENT URL...');
    for (let i = 0; i < 5; i++) {
      await urls.add(urlId, 'clicks', 1);
    }

    // Try to consolidate
    console.log('\n2️⃣  Running consolidation (record does NOT exist)...');
    await urls.consolidate(urlId, 'clicks');

    // Verify transactions remain pending
    const pending = await database.resources.urls_transactions_clicks.query({
      originalId: urlId,
      applied: false
    });
    console.log('   Pending transactions:', pending.length, '(expected: 5)');
    expect(pending.length).toBe(5);

    // Create the URL
    console.log('\n3️⃣  Creating URL record...');
    await urls.insert({
      id: urlId,
      shortUrl: 'short123',
      longUrl: 'https://example.com/very/long/url/path',
      clicks: 0
    });

    // Consolidate again
    console.log('\n4️⃣  Running consolidation (record NOW exists)...');
    const value = await urls.consolidate(urlId, 'clicks');
    console.log('   Value:', value, '(expected: 5)');
    expect(value).toBe(5);

    // Verify
    const url = await urls.get(urlId);
    expect(url.clicks).toBe(5);

    console.log('\n✅ Works correctly with body-overflow behavior!\n');
  }, 30000);
});
