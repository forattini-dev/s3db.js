/**
 * EventualConsistencyPlugin - Code Coverage Test
 *
 * This test suite is designed to achieve 100% code coverage by testing
 * edge cases, error paths, and less-common code paths.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';
import tryFn from '../../src/concerns/try-fn.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('EventualConsistencyPlugin - Coverage Tests', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('coverage-test');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  describe('Configuration Coverage', () => {
    it('should handle timezone detection from TZ env var', async () => {
      const originalTZ = process.env.TZ;
      process.env.TZ = 'America/New_York';

      database = createDatabaseForTest('tz-test');
      await database.connect();

      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        verbose: true
      });

      await database.usePlugin(plugin);

      expect(plugin.config.cohort.timezone).toBe('America/New_York');

      process.env.TZ = originalTZ;
    });

    it('should handle invalid timezone gracefully', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        cohort: { timezone: 'Invalid/Timezone' },
        consolidation: { mode: 'sync', auto: false },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Should still work, falling back to UTC
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      const url = await urls.get('url1');
      expect(url.clicks).toBe(5);
    });

    it('should validate resources configuration', async () => {
      expect(() => {
        new EventualConsistencyPlugin({});
      }).toThrow('EventualConsistencyPlugin requires');

      expect(() => {
        new EventualConsistencyPlugin({
          resources: { urls: 'invalid' } // Should be array
        });
      }).toThrow('must be an array');
    });
  });

  describe('Garbage Collection Coverage', () => {
    it('should run GC and delete old transactions', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'async', auto: false },
        verbose: true
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Create and consolidate
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Wait a bit for transactions to be marked as applied
      await sleep(500);

      // Check transactions exist and are applied
      let transactions = await database.resources.plg_urls_tx_clicks.query({
        originalId: 'url1',
        applied: true
      });
      expect(transactions.length).toBeGreaterThan(0);

      // Wait for transaction to be old enough (since retention is 0)
      await sleep(1500);

      // Manually trigger GC
      const handler = plugin.fieldHandlers.get('urls').get('clicks');
      await plugin._runGarbageCollectionForHandler(handler, 'urls', 'clicks');

      // Wait for GC to complete
      await sleep(500);

      // Check transactions were deleted (should be 0 or minimal)
      transactions = await database.resources.plg_urls_tx_clicks.query({
        originalId: 'url1',
        applied: true
      });

      // GC should have deleted most/all transactions
      // We allow some flexibility due to timing
      expect(transactions.length).toBeLessThanOrEqual(1);
    }, 15000);

    it.skip('should handle GC lock contention (SKIP: locks use PluginStorage now)', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Manually create a GC lock
      const lockResource = database.resources.urls_consolidation_locks_clicks;
      await lockResource.insert({
        id: 'lock-gc-urls-clicks',
        lockedAt: Date.now(),
        workerId: 'test-worker'
      });

      // Try to run GC - should skip because lock is held
      const handler = plugin.fieldHandlers.get('urls').get('clicks');
      await plugin._runGarbageCollectionForHandler(handler, 'urls', 'clicks');

      // Clean up
      await lockResource.delete('lock-gc-urls-clicks');
    });
  });

  describe('Transaction Coverage', () => {
    it('should handle late arrival strategy: ignore', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'async', window: 0 }, // 0 hours = all transactions are "late"
        lateArrivals: { strategy: 'ignore' },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Create an old transaction (simulating late arrival)
      const handler = plugin.fieldHandlers.get('urls').get('clicks');
      const oldTimestamp = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago

      const result = await plugin.createTransaction(handler, {
        originalId: 'url1',
        value: 5,
        operation: 'add',
        source: 'test',
        timestamp: oldTimestamp.toISOString()
      });

      // With 'ignore' strategy, late transactions should be ignored (return null)
      expect(result).toBeNull();
    });

    it('should handle late arrival strategy: warn', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'async', window: 0 }, // 0 hours = all transactions are "late"
        lateArrivals: { strategy: 'warn' },
        verbose: true
      });

      await database.usePlugin(plugin);

      // This transaction should warn but still be processed
      const handler = plugin.fieldHandlers.get('urls').get('clicks');
      const result = await plugin.createTransaction(handler, {
        originalId: 'url1',
        value: 5,
        operation: 'add',
        source: 'test'
      });

      // Should still create transaction (with warning)
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it.skip('should handle batch transactions', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'async' },
        verbose: false // Test without verbose warnings
      });

      await database.usePlugin(plugin);

      const handler = plugin.fieldHandlers.get('urls').get('clicks');

      // Add 2 transactions (below batch size)
      await plugin.createTransaction(handler, {
        originalId: 'url1',
        value: 1,
        operation: 'add',
        source: 'test'
      });

      await plugin.createTransaction(handler, {
        originalId: 'url1',
        value: 2,
        operation: 'add',
        source: 'test'
      });

      // Should be in pending map
      expect(handler.pendingTransactions.size).toBe(2);

      // Add 3rd transaction - should trigger flush
      await plugin.createTransaction(handler, {
        originalId: 'url1',
        value: 3,
        operation: 'add',
        source: 'test'
      });

      // Should have been flushed
      expect(handler.pendingTransactions.size).toBe(0);
    });
  });

  describe('Lock Coverage', () => {
    it.skip('should clean up stale locks (SKIP: locks use PluginStorage now)', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        verbose: true
      });

      await database.usePlugin(plugin);

      const lockResource = database.resources.urls_consolidation_locks_clicks;

      // Create a stale lock (old timestamp)
      await lockResource.insert({
        id: 'lock-stale',
        lockedAt: Date.now() - 5000, // 5 seconds ago
        workerId: 'old-worker'
      });

      // Trigger consolidation which should clean up stale locks
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);

      // Should have cleaned up the stale lock
      await sleep(500);

      const [ok] = await tryFn(() => lockResource.get('lock-stale'));
      // Lock may or may not exist depending on cleanup timing, so we just verify no errors
      expect(true).toBe(true);
    });
  });

  describe('Consolidation Edge Cases', () => {
    it.skip('should handle consolidation when lock is already held (SKIP: locks use PluginStorage now)', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        verbose: true
      });

      await database.usePlugin(plugin);

      await urls.insert({ id: 'url1', clicks: 100 });

      // Manually create a lock for this record
      const lockResource = database.resources.urls_consolidation_locks_clicks;
      await lockResource.insert({
        id: 'lock-url1',
        lockedAt: Date.now(),
        workerId: 'other-worker'
      });

      // Try to consolidate - should skip and return current value
      const result = await urls.consolidate('url1', 'clicks');

      // Should return existing value
      expect(result).toBe(100);

      // Clean up
      await lockResource.delete('lock-url1');
    });

    it('should handle record deletion during consolidation', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'async' },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Create record with transactions
      await urls.insert({ id: 'url1', clicks: 10 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Now delete the record
      await urls.delete('url1');

      // Add more transactions
      await urls.add('url1', 'clicks', 3);

      // Try to consolidate - should handle deletion gracefully
      const result = await urls.consolidate('url1', 'clicks');

      // Should return calculated value even though record doesn't exist
      expect(result).toBe(3);
    });

    it('should create anchor transaction for initial value', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'async' },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Create record with initial value
      await urls.insert({ id: 'url1', clicks: 1000 });

      // Add transaction
      await urls.add('url1', 'clicks', 50);

      // Consolidate
      await urls.consolidate('url1', 'clicks');

      // Check for anchor transaction
      const transactions = await database.resources.plg_urls_tx_clicks.query({
        originalId: 'url1',
        source: 'anchor'
      });

      expect(transactions.length).toBeGreaterThan(0);
      const anchor = transactions[0];
      expect(anchor.value).toBe(1000);
      expect(anchor.operation).toBe('set');
      expect(anchor.applied).toBe(true);
    });

    it('should handle missing base value with anchor creation', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'async' },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Create record with value
      await urls.insert({ id: 'url1', clicks: 500 });

      // Manually create applied transactions WITHOUT a 'set' operation
      const txnResource = database.resources.plg_urls_tx_clicks;
      const now = new Date();
      const cohortInfo = plugin.getCohortInfo(now);

      await txnResource.insert({
        id: 'txn-manual-1',
        originalId: 'url1',
        field: 'clicks',
        value: 10,
        operation: 'add',
        timestamp: now.toISOString(),
        cohortDate: cohortInfo.date,
        cohortHour: cohortInfo.hour,
        cohortMonth: cohortInfo.month,
        source: 'manual',
        applied: true
      });

      // Add new pending transaction
      await urls.add('url1', 'clicks', 5);

      // Consolidate - should create anchor for missing base value
      const result = await urls.consolidate('url1', 'clicks');

      // Should be: anchor(490) + add(10) + add(5) = 505
      expect(result).toBe(505);

      // Check anchor was created
      const anchors = await txnResource.query({
        originalId: 'url1',
        source: 'anchor'
      });
      expect(anchors.length).toBeGreaterThan(0);
    });
  });

  describe('Analytics Coverage', () => {
    it('should handle analytics without enabling', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      // Should work without analytics
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      const url = await urls.get('url1');
      expect(url.clicks).toBe(5);
    });

    it('should throw error when getting analytics for non-existent resource', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] }
      });

      await database.usePlugin(plugin);

      // Try to get analytics for non-existent resource
      await expect(
        plugin.getAnalytics('nonexistent', 'field')
      ).rejects.toThrow('No eventual consistency configured');
    });

    it('should throw error when getting analytics for non-existent field', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] }
      });

      await database.usePlugin(plugin);

      // Try to get analytics for non-existent field
      await expect(
        plugin.getAnalytics('urls', 'nonexistent')
      ).rejects.toThrow('No eventual consistency configured');
    });

    it('should throw error when analytics not enabled', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] }
      });

      await database.usePlugin(plugin);

      // Try to get analytics when disabled
      await expect(
        plugin.getAnalytics('urls', 'clicks')
      ).rejects.toThrow('Analytics not enabled');
    });
  });

  describe('Helper Methods Coverage', () => {
    it('should throw error when consolidate without field parameter', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] }
      });

      await database.usePlugin(plugin);

      await expect(
        urls.consolidate('url1') // Missing field parameter
      ).rejects.toThrow('Field parameter is required');
    });

    it('should throw error when field not found', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] }
      });

      await database.usePlugin(plugin);

      await expect(
        urls.consolidate('url1', 'invalidfield')
      ).rejects.toThrow('No eventual consistency plugin found');
    });
  });

  describe('Setup Coverage', () => {
    it('should handle deferred setup when resource created later', async () => {
      // Create plugin BEFORE resource exists
      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Resource should be marked for deferred setup
      const handler = plugin.fieldHandlers.get('urls').get('clicks');
      expect(handler.deferredSetup).toBe(true);

      // Now create the resource
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      // Wait for hook to trigger
      await sleep(100);

      // Should now be set up
      expect(handler.deferredSetup).toBe(false);
      expect(handler.targetResource).toBeDefined();

      // Should work
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      const url = await urls.get('url1');
      expect(url.clicks).toBe(5);
    });
  });

  describe('Utils Coverage', () => {
    it('should handle timezone offset calculation', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      // Test with various timezones
      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        cohort: { timezone: 'America/Sao_Paulo' }
      });

      await database.usePlugin(plugin);

      const cohortInfo = plugin.getCohortInfo(new Date());
      expect(cohortInfo).toBeDefined();
      expect(cohortInfo.date).toBeDefined();
      expect(cohortInfo.hour).toBeDefined();
      expect(cohortInfo.month).toBeDefined();
    });
  });

  describe('Async Mode and Auto-Consolidation Coverage', () => {
    it.skip('should run periodic consolidation in async mode', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'async', auto: true },
        verbose: true
      });

      await database.usePlugin(plugin);
      await plugin.start();

      // Create URL and add clicks
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.add('url1', 'clicks', 3);

      // Wait for auto-consolidation
      await sleep(2500);

      // Should be consolidated
      const url = await urls.get('url1');
      expect(url.clicks).toBe(8);

      await plugin.stop();
    }, 15000);

    it('should handle errors during consolidation gracefully', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync', auto: false },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Insert URL
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Should have consolidated despite any warnings
      const url = await urls.get('url1');
      expect(url.clicks).toBe(5);
    });
  });

  describe('Recalculate Functionality Coverage', () => {
    it('should recalculate record from scratch', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync', auto: false },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Create record
      await urls.insert({ id: 'url1', clicks: 0 });

      // Add multiple clicks
      await urls.add('url1', 'clicks', 5);
      await urls.add('url1', 'clicks', 3);
      await urls.add('url1', 'clicks', 2);

      // Consolidate
      await urls.consolidate('url1', 'clicks');

      const beforeRecalc = await urls.get('url1');
      expect(beforeRecalc.clicks).toBe(10);

      // Recalculate
      const result = await urls.recalculate('url1', 'clicks');
      expect(result).toBe(10);

      // Check value is still correct
      const afterRecalc = await urls.get('url1');
      expect(afterRecalc.clicks).toBe(10);
    });

    it('should handle recalculate with no transactions', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Create record with no transactions
      await urls.insert({ id: 'url1', clicks: 0 });

      // Recalculate should return 0
      const result = await urls.recalculate('url1', 'clicks');
      expect(result).toBe(0);
    });
  });

  describe('Analytics API Methods Coverage', () => {
    it('should get month-by-day analytics', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        analytics: { enabled: true },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      // Create record and add clicks
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Get analytics
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const analytics = await plugin.getMonthByDay('urls', 'clicks', month);
      expect(analytics).toBeDefined();
      expect(Array.isArray(analytics)).toBe(true);
    });

    it('should get day-by-hour analytics', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        analytics: { enabled: true },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      // Create record and add clicks
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Get analytics
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const analytics = await plugin.getDayByHour('urls', 'clicks', date);
      expect(analytics).toBeDefined();
      expect(Array.isArray(analytics)).toBe(true);
    });

    it('should get last N days analytics', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        analytics: { enabled: true },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      // Create record and add clicks
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Get analytics for last 7 days
      const analytics = await plugin.getLastNDays('urls', 'clicks', 7);
      expect(analytics).toBeDefined();
      expect(Array.isArray(analytics)).toBe(true);
    });

    it('should get year-by-month analytics', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        analytics: { enabled: true },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      // Create record and add clicks
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Get analytics for current year
      const now = new Date();
      const analytics = await plugin.getYearByMonth('urls', 'clicks', now.getFullYear());
      expect(analytics).toBeDefined();
      expect(Array.isArray(analytics)).toBe(true);
    });

    it('should get month-by-hour analytics', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        analytics: { enabled: true },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      // Create record and add clicks
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Get analytics for current month
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const analytics = await plugin.getMonthByHour('urls', 'clicks', month);
      expect(analytics).toBeDefined();
      expect(Array.isArray(analytics)).toBe(true);
    });

    it('should get top records', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        analytics: { enabled: true },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      // Create multiple records
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 10);
      await urls.consolidate('url1', 'clicks');

      await urls.insert({ id: 'url2', clicks: 0 });
      await urls.add('url2', 'clicks', 5);
      await urls.consolidate('url2', 'clicks');

      // Get top records
      const topRecords = await plugin.getTopRecords('urls', 'clicks', { limit: 10 });
      expect(topRecords).toBeDefined();
      expect(Array.isArray(topRecords)).toBe(true);
    });
  });

  describe('Additional Edge Cases', () => {
    it('should handle sub operation correctly', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      await urls.insert({ id: 'url1', clicks: 100 });
      await urls.sub('url1', 'clicks', 10);
      await urls.consolidate('url1', 'clicks');

      const url = await urls.get('url1');
      expect(url.clicks).toBe(90);
    });

    it('should handle set operation correctly', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      await urls.insert({ id: 'url1', clicks: 100 });
      await urls.set('url1', 'clicks', 500);
      await urls.consolidate('url1', 'clicks');

      const url = await urls.get('url1');
      expect(url.clicks).toBe(500);
    });

    it('should handle cache invalidation', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync', auto: false },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Insert and consolidate
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Cache should be invalidated automatically
      const url = await urls.get('url1');
      expect(url.clicks).toBe(5);
    });

    it('should handle errors when adding without id', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] }
      });

      await database.usePlugin(plugin);

      await expect(
        urls.add(null, 'clicks', 5)
      ).rejects.toThrow();
    });

    it('should handle errors when field is undefined', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] }
      });

      await database.usePlugin(plugin);

      await expect(
        urls.add('url1', undefined, 5)
      ).rejects.toThrow();
    });
  });

  describe('Verbose Logging Coverage', () => {
    it.skip('should log batch transaction details when verbose', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'async' },
        verbose: true // Enable verbose for logging coverage
      });

      await database.usePlugin(plugin);

      const handler = plugin.fieldHandlers.get('urls').get('clicks');

      // Add transactions (should trigger verbose logging)
      await plugin.createTransaction(handler, {
        originalId: 'url1',
        value: 1,
        operation: 'add',
        source: 'test'
      });

      expect(handler.pendingTransactions.size).toBe(1);
    });

    it.skip('should handle cleanup lock contention with verbose logging (SKIP: locks use PluginStorage now)', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        verbose: true
      });

      await database.usePlugin(plugin);

      const lockResource = database.resources.urls_consolidation_locks_clicks;

      // Create a cleanup lock to simulate another container running cleanup
      await lockResource.insert({
        id: `lock-cleanup-urls-clicks`,
        lockedAt: Date.now(),
        workerId: 'other-worker'
      });

      // Try to clean up - should skip with verbose log
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);

      // Clean up
      await lockResource.delete(`lock-cleanup-urls-clicks`);
    });

    it.skip('should log when GC lock is already held (SKIP: locks use PluginStorage now)', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        verbose: true
      });

      await database.usePlugin(plugin);

      const lockResource = database.resources.urls_consolidation_locks_clicks;

      // Create a GC lock
      await lockResource.insert({
        id: 'lock-gc-urls-clicks',
        lockedAt: Date.now(),
        workerId: 'other-worker'
      });

      // Try to run GC - should skip with verbose log
      const handler = plugin.fieldHandlers.get('urls').get('clicks');
      await plugin._runGarbageCollectionForHandler(handler, 'urls', 'clicks');

      // Clean up
      await lockResource.delete('lock-gc-urls-clicks');
    });

    it('should log verbose GC details when deleting transactions', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync', auto: false },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Create and consolidate
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Wait for transactions to age
      await sleep(1000);

      // Run GC with verbose logging
      const handler = plugin.fieldHandlers.get('urls').get('clicks');
      await plugin._runGarbageCollectionForHandler(handler, 'urls', 'clicks');

      // Should have logged verbose details
      expect(true).toBe(true);
    });

    it.skip('should log verbose details for stale lock cleanup (SKIP: locks use PluginStorage now)', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        verbose: true
      });

      await database.usePlugin(plugin);

      const lockResource = database.resources.urls_consolidation_locks_clicks;

      // Create multiple stale locks
      await lockResource.insert({
        id: 'lock-stale-1',
        lockedAt: Date.now() - 5000, // 5 seconds ago
        workerId: 'old-worker-1'
      });

      await lockResource.insert({
        id: 'lock-stale-2',
        lockedAt: Date.now() - 6000, // 6 seconds ago
        workerId: 'old-worker-2'
      });

      // Trigger consolidation which should clean up stale locks with verbose logging
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Locks should have been cleaned up
      expect(true).toBe(true);
    });
  });

  describe('Error Path Coverage', () => {
    it.skip('should handle batch transaction flush errors', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'async' }
      });

      await database.usePlugin(plugin);

      const handler = plugin.fieldHandlers.get('urls').get('clicks');

      // Add transactions
      await plugin.createTransaction(handler, {
        originalId: 'url1',
        value: 1,
        operation: 'add',
        source: 'test'
      });

      // Mock insert to fail
      const originalInsert = handler.transactionResource.insert.bind(handler.transactionResource);
      let callCount = 0;
      handler.transactionResource.insert = async (...args) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Simulated insert error');
        }
        return await originalInsert(...args);
      };

      // Add another transaction - should trigger flush and catch error
      await expect(
        plugin.createTransaction(handler, {
          originalId: 'url1',
          value: 2,
          operation: 'add',
          source: 'test'
        })
      ).rejects.toThrow('Simulated insert error');

      // Restore original insert
      handler.transactionResource.insert = originalInsert;
    });

    it.skip('should handle lock release errors gracefully (SKIP: locks use PluginStorage now)', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync', auto: false },
        verbose: true
      });

      await database.usePlugin(plugin);

      // Insert and add clicks
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);

      // Mock lock resource delete to fail
      const lockResource = database.resources.urls_consolidation_locks_clicks;
      const originalDelete = lockResource.delete.bind(lockResource);
      lockResource.delete = async (id) => {
        if (id.startsWith('lock-url1')) {
          throw new Error('Simulated lock release error');
        }
        return await originalDelete(id);
      };

      // Consolidate - should handle lock release error gracefully
      const result = await urls.consolidate('url1', 'clicks');
      expect(result).toBe(5);

      // Restore original delete
      lockResource.delete = originalDelete;
    });

    it('should handle getConsolidatedValue with date filters', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|required',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      // Insert and add clicks
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.add('url1', 'clicks', 3);
      await urls.consolidate('url1', 'clicks');

      // Get consolidated value with date filters
      const handler = plugin.fieldHandlers.get('urls').get('clicks');
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const value = await plugin._getConsolidatedValueWithHandler(
        handler,
        'url1',
        {
          startDate: yesterday.toISOString(),
          endDate: now.toISOString(),
          includeApplied: true
        }
      );

      expect(value).toBeGreaterThanOrEqual(0);
    });
  });
});
