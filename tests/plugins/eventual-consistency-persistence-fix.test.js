/**
 * EventualConsistency Plugin - Non-Existent Record Handling Test
 *
 * This test verifies the v10.0.16 behavior where the plugin does NOT
 * create records that don't exist, but keeps transactions pending until
 * the application creates the record.
 *
 * v10.0.16 Behavior:
 * - Consolidate skips if record doesn't exist
 * - Transactions remain pending
 * - When record is created, pending transactions are applied
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';
import tryFn from '../../src/concerns/try-fn.js';

describe('EventualConsistencyPlugin - v10.0.16 Non-Existent Record Handling', () => {
  let database;
  let urls;

  beforeEach(async () => {
    database = await createDatabaseForTest('eventual-consistency-v10016-test');

    // Create URLs resource
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|optional',
        clicks: 'number|default:0',
        views: 'number|default:0'
      }
    });

    // Add EventualConsistency plugin for clicks field
    const clicksPlugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'sync', auto: false },
      verbose: false
    });

    await database.usePlugin(clicksPlugin);
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should persist consolidated value when record exists (normal case)', async () => {
    // Create URL first
    await urls.insert({
      id: 'url1',
      link: 'https://example.com',
      clicks: 0
    });

    // Add clicks
    await urls.add('url1', 'clicks', 1);
    await urls.add('url1', 'clicks', 1);
    await urls.add('url1', 'clicks', 1);

    // Read back
    const url = await urls.get('url1');

    // Should be 3 (all clicks persisted)
    expect(url.clicks).toBe(3);
  });

  it('should NOT create record when it does not exist (v10.0.16 behavior)', async () => {
    // DO NOT create the URL record first!

    // Add clicks to non-existent record
    await urls.add('url2', 'clicks', 1);
    await urls.add('url2', 'clicks', 1);
    await urls.add('url2', 'clicks', 1);

    // Manually consolidate (since autoConsolidate is off)
    const consolidatedValue = await urls.consolidate('url2', 'clicks');

    // Consolidation should return correct value (informational)
    expect(consolidatedValue).toBe(3);

    // v10.0.16: Record should NOT be created
    const [ok, err] = await tryFn(() => urls.get('url2'));
    expect(ok).toBe(false);
    // Error message can be either "does not exist" or "No such key"
    expect(err.message).toMatch(/(does not exist|No such key)/);

    // Transactions should remain as pending
    const transactions = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url2',
      applied: false
    });
    expect(transactions.length).toBe(3);
  });

  it('should apply pending transactions when record is created later', async () => {
    // Add clicks to non-existent record
    await urls.add('url3', 'clicks', 5);

    // First consolidation skips (record doesn't exist)
    let value = await urls.consolidate('url3', 'clicks');
    expect(value).toBe(5);

    // Record still doesn't exist
    const [ok1] = await tryFn(() => urls.get('url3'));
    expect(ok1).toBe(false);

    // NOW create the record (application does this)
    await urls.insert({
      id: 'url3',
      link: 'https://example.com/url3',
      clicks: 0
    });

    // Consolidate again - now it should work
    value = await urls.consolidate('url3', 'clicks');
    expect(value).toBe(5);

    // Record should now have the clicks
    const url = await urls.get('url3');
    expect(url.clicks).toBe(5);

    // Transactions should be marked as applied
    const appliedTxns = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url3',
      applied: true
    });
    expect(appliedTxns.length).toBe(1); // The 1 'add' transaction
  });

  it('should handle multiple consolidation attempts gracefully', async () => {
    // Add clicks
    await urls.add('url4', 'clicks', 3);

    // Try to consolidate multiple times (record doesn't exist)
    await urls.consolidate('url4', 'clicks');
    await urls.consolidate('url4', 'clicks');
    await urls.consolidate('url4', 'clicks');

    // Record still doesn't exist
    const [ok] = await tryFn(() => urls.get('url4'));
    expect(ok).toBe(false);

    // All transactions still pending
    const pendingTxns = await database.resources.plg_urls_tx_clicks.query({
      originalId: 'url4',
      applied: false
    });
    expect(pendingTxns.length).toBe(1);

    // Create record
    await urls.insert({
      id: 'url4',
      link: 'https://example.com/url4',
      clicks: 0
    });

    // Consolidate one more time
    const value = await urls.consolidate('url4', 'clicks');
    expect(value).toBe(3);

    const url = await urls.get('url4');
    expect(url.clicks).toBe(3);
  });

  it('should work with async mode and auto-consolidation', async () => {
    // Recreate with async mode
    await database.disconnect();

    database = await createDatabaseForTest('eventual-consistency-v10016-async');

    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        link: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    const plugin = new EventualConsistencyPlugin({
      resources: {
        urls: ['clicks']
      },
      consolidation: { mode: 'async', auto: true },
      verbose: false
    });

    await database.usePlugin(plugin);
    await plugin.start();

    // Add clicks to non-existent record
    await urls.add('url5', 'clicks', 1);
    await urls.add('url5', 'clicks', 1);
    await urls.add('url5', 'clicks', 1);

    // Wait for auto-consolidation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // v10.0.16: Record should NOT be created automatically
    const [ok1] = await tryFn(() => urls.get('url5'));
    expect(ok1).toBe(false);

    // Create the record
    await urls.insert({
      id: 'url5',
      link: 'https://example.com/url5',
      clicks: 0
    });

    // Manually trigger consolidation since record now exists
    await urls.consolidate('url5', 'clicks');

    // Now it should be persisted
    const url = await urls.get('url5');
    expect(url).toBeDefined();
    expect(url.clicks).toBe(3);
  }, 15000);

  it('should log error if update fails for other reasons', async () => {
    // Create URL with required field
    await urls.insert({
      id: 'url6',
      link: 'https://example.com',
      clicks: 0
    });

    // Mock update to fail (simulate S3 error) - do this BEFORE add()
    const originalUpdate = urls.update.bind(urls);
    urls.update = async () => {
      throw new Error('Simulated S3 error');
    };

    // Add clicks - this will fail during consolidation
    await expect(
      urls.add('url6', 'clicks', 5)
    ).rejects.toThrow('Simulated S3 error');

    // Restore original update
    urls.update = originalUpdate;
  });
});
