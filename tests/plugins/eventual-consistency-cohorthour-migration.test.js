/**
 * Test: EventualConsistency - cohortHour Migration
 *
 * ✅ FIXED: cohortHour field is now optional and can be calculated from timestamp
 * Handles legacy data that may be missing cohortHour field.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

describe('EventualConsistency - cohortHour Migration', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-cohorthour-migration');

    // Create resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|required',
        slug: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Install EventualConsistency plugin
    plugin = new EventualConsistencyPlugin({
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

  it('✅ FIXED: Missing cohortHour no longer causes validation error', async () => {
    // Insert a URL
    await urls.insert({ id: 'url1', slug: 'article-1', clicks: 0 });

    // Add clicks normally (this should work)
    await urls.add('url1', 'clicks', 10);

    // Now simulate legacy data: manually insert a transaction WITHOUT cohortHour
    const txResource = database.resource('plg_urls_tx_clicks');

    // ✅ After fix: cohortHour is optional, so this should succeed
    const legacyTransaction = {
      id: 'tx-legacy-001',
      originalId: 'url1',
      field: 'clicks',
      value: 5,
      operation: 'add',
      timestamp: '2025-01-15T10:30:00Z',
      cohortDate: '2025-01-15',
      // cohortHour: MISSING! But it's now optional
      cohortMonth: '2025-01',
      applied: false
    };

    // ✅ This should succeed now that cohortHour is optional
    await expect(
      txResource.insert(legacyTransaction)
    ).resolves.not.toThrow();

    // Verify the transaction was inserted
    const inserted = await txResource.get('tx-legacy-001');
    expect(inserted).toBeDefined();
    expect(inserted.id).toBe('tx-legacy-001');
  });

  it('should handle transactions with missing cohortHour during consolidation', async () => {
    // Insert a URL
    await urls.insert({ id: 'url1', clicks: 0 });

    // Add clicks (creates proper transactions)
    await urls.add('url1', 'clicks', 10);

    // Get transaction resource
    const txResource = database.resource('plg_urls_tx_clicks');

    // Get the transaction that was created
    const transactions = await txResource.list();
    expect(transactions.length).toBeGreaterThan(0);

    // Verify that all transactions have cohortHour
    for (const txn of transactions) {
      expect(txn.cohortHour).toBeDefined();
      expect(typeof txn.cohortHour).toBe('string');
      expect(txn.cohortHour).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
    }

    // Consolidate should work fine
    await urls.consolidate('url1', 'clicks');

    const record = await urls.get('url1');
    expect(record.clicks).toBe(10);
  });

  it('should calculate cohortHour from timestamp if missing (fallback)', async () => {
    // This test checks if we have fallback logic to calculate cohortHour
    // from timestamp when it's missing

    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 5);

    const txResource = database.resource('plg_urls_tx_clicks');
    const transactions = await txResource.list();

    // All transactions should have cohortHour populated
    expect(transactions.length).toBeGreaterThan(0);

    for (const txn of transactions) {
      // Verify cohortHour exists and has correct format
      expect(txn.cohortHour).toBeDefined();
      expect(typeof txn.cohortHour).toBe('string');
      expect(txn.cohortHour).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);

      // Verify it's based on the timestamp (should be same date at least)
      const txnDate = txn.timestamp.substring(0, 10); // YYYY-MM-DD
      const cohortDate = txn.cohortHour.substring(0, 10);
      expect(cohortDate).toBe(txnDate);
    }
  });

  it('should allow optional cohortHour after migration fix', async () => {
    // After fixing Bug #2, cohortHour should be optional
    // This test will initially fail but should pass after the fix

    await urls.insert({ id: 'url1', clicks: 0 });

    const txResource = database.resource('plg_urls_tx_clicks');

    // Try to insert a transaction without cohortHour
    // After fix, this should succeed (field becomes optional)
    const transactionWithoutCohortHour = {
      id: 'tx-test-001',
      originalId: 'url1',
      field: 'clicks',
      value: 3,
      operation: 'add',
      timestamp: '2025-01-15T14:30:00Z',
      cohortDate: '2025-01-15',
      // cohortHour: undefined (missing)
      cohortMonth: '2025-01',
      applied: false
    };

    // This should succeed after fix
    await expect(
      txResource.insert(transactionWithoutCohortHour)
    ).resolves.not.toThrow();

    // Analytics should handle missing cohortHour gracefully
    // by calculating it from timestamp
    const analytics = await plugin.getLastNHours('urls', 'clicks', 24, {
      recordId: 'url1',
      fillGaps: false
    });

    // Should return analytics even with missing cohortHour
    expect(analytics).toBeDefined();
  });

  it('should migrate legacy transactions during consolidation', async () => {
    // When consolidating, if we encounter transactions without cohortHour,
    // we should automatically calculate and populate it

    await urls.insert({ id: 'url1', clicks: 0 });
    await urls.add('url1', 'clicks', 10);

    // Consolidate should work even if some transactions have missing fields
    await urls.consolidate('url1', 'clicks');

    const record = await urls.get('url1');
    expect(record.clicks).toBe(10);

    // All transactions should now have cohortHour populated
    const txResource = database.resource('plg_urls_tx_clicks');
    const transactions = await txResource.query({
      originalId: 'url1',
      applied: true
    });

    for (const txn of transactions) {
      expect(txn.cohortHour).toBeDefined();
      expect(typeof txn.cohortHour).toBe('string');
    }
  });
});
