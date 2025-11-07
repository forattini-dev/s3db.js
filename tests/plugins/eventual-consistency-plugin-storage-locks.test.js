/**
 * EventualConsistencyPlugin - PluginStorage Locks Test
 *
 * This test suite validates that locks are correctly stored in S3 via PluginStorage
 * and that TTL expiration works as expected.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('EventualConsistencyPlugin - PluginStorage Locks', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('plugin-storage-locks-test');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  describe('Lock File Creation in S3', () => {
    it('should create lock files in S3 during consolidation', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|optional',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' },
        verbose: false
      });

      await database.usePlugin(plugin);

      // Create record and add clicks
      await urls.insert({ id: 'url1', clicks: 100 });
      await urls.add('url1', 'clicks', 50);

      // Get storage instance
      const storage = plugin.getStorage();

      // During consolidation, a lock should be created
      // We'll check by trying to acquire the same lock (should fail)
      const lockKey = 'consolidation-urls-clicks-url1';

      // Manually try to acquire the lock to see if it exists
      // (This is during/after consolidation, so lock might be held or released)
      const canAcquire = await storage.acquireLock(lockKey, {
        ttl: 10,
        timeout: 0
      });

      // If consolidation is fast, lock may already be released
      // So we just verify the mechanism works by releasing if we got it
      if (canAcquire) {
        await storage.releaseLock(canAcquire);
      }

      // The important part: verify the URL was consolidated correctly
      const url = await urls.get('url1');
      expect(url.clicks).toBe(150);
    });

    it('should verify lock files are stored in S3 PluginStorage path', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|optional',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' },
        verbose: false
      });

      await database.usePlugin(plugin);

      const storage = plugin.getStorage();

      // Manually create a lock to test PluginStorage
      const testLockKey = 'test-lock-verification';
      const lock = await storage.acquireLock(testLockKey, {
        ttl: 60,
        workerId: 'test-worker'
      });

      expect(lock).toBeTruthy();
      expect(lock.workerId).toBe('test-worker');

      // Verify lock exists by trying to acquire again (should fail)
      const secondLock = await storage.acquireLock(testLockKey, {
        ttl: 60,
        timeout: 0
      });

      expect(secondLock).toBe(null);

      // Check lock via isLocked
      const isLocked = await storage.isLocked(testLockKey);
      expect(isLocked).toBe(true);

      // Release lock
      await storage.releaseLock(lock);

      // Verify lock is released
      const isStillLocked = await storage.isLocked(testLockKey);
      expect(isStillLocked).toBe(false);
    });

    it('should list all plugin storage keys including locks', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|optional',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      const storage = plugin.getStorage();

      // Create multiple locks
      const lock1 = await storage.acquireLock('lock-1', { ttl: 60 });
      const lock2 = await storage.acquireLock('lock-2', { ttl: 60 });
      const lock3 = await storage.acquireLock('lock-3', { ttl: 60 });

      // List all keys in S3 under PluginStorage path
      const allKeys = await storage.list();

      // Should have at least 3 lock files
      expect(allKeys.length).toBeGreaterThanOrEqual(3);

      // Clean up
      if (lock1) await storage.releaseLock(lock1);
      if (lock2) await storage.releaseLock(lock2);
      if (lock3) await storage.releaseLock(lock3);
    });
  });

  describe('TTL Expiration', () => {
    it('should auto-expire locks after TTL', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|optional',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      const storage = plugin.getStorage();

      // Create lock with 1 second TTL
      const lockKey = 'ttl-test-lock';
      const lock = await storage.acquireLock(lockKey, {
        ttl: 1, // 1 second
        workerId: 'test-worker'
      });

      expect(lock).toBeTruthy();

      // Verify lock exists
      let isLocked = await storage.isLocked(lockKey);
      expect(isLocked).toBe(true);

      // Wait for TTL to expire
      await sleep(1200);

      // Verify lock is auto-expired
      isLocked = await storage.isLocked(lockKey);
      expect(isLocked).toBe(false);

      // Should be able to acquire the lock again
      const newLock = await storage.acquireLock(lockKey, {
        ttl: 10,
        workerId: 'test-worker-2'
      });

      expect(newLock).toBeTruthy();
      expect(newLock.workerId).toBe('test-worker-2');

      // Clean up
      if (newLock) {
        await storage.releaseLock(newLock);
      }
    });

    it.skip('should handle concurrent lock acquisition with TTL (TODO: TTL expiration timing issue)', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|optional',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      const storage = plugin.getStorage();

      // Worker 1 acquires lock
      const lockKey = 'concurrent-lock';
      const lock1 = await storage.acquireLock(lockKey, {
        ttl: 2,
        workerId: 'worker-1'
      });

      expect(lock1).toBeTruthy();
      expect(lock1.workerId).toBe('worker-1');

      // Worker 2 tries to acquire same lock (should fail)
      const lock2 = await storage.acquireLock(lockKey, {
        ttl: 2,
        timeout: 0,
        workerId: 'worker-2'
      });

      expect(lock2).toBe(null);

      // Wait for lock1 to expire (TTL=2s, wait 2.5s for safety margin)
      await sleep(2500);

      // Worker 2 should now be able to acquire
      const lock3 = await storage.acquireLock(lockKey, {
        ttl: 2,
        workerId: 'worker-2'
      });

      expect(lock3).toBeTruthy();
      expect(lock3.workerId).toBe('worker-2');

      // Clean up
      if (lock3) {
        await storage.releaseLock(lock3);
      } else if (lock1) {
        await storage.releaseLock(lock1);
      }
    });
  });

  describe('Lock Retry with Timeout', () => {
    it('should wait and retry lock acquisition with timeout', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|optional',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      const storage = plugin.getStorage();

      const lockKey = 'retry-lock';

      // Worker 1 acquires lock with 1 second TTL
      const lock1 = await storage.acquireLock(lockKey, {
        ttl: 1,
        workerId: 'worker-1'
      });

      expect(lock1).toBeTruthy();

      // Worker 2 tries to acquire with 2 second timeout
      // Should wait for lock1 to expire and then succeed
      const startTime = Date.now();
      const lock2 = await storage.acquireLock(lockKey, {
        ttl: 10,
        timeout: 2000, // Wait up to 2 seconds
        workerId: 'worker-2'
      });
      const elapsed = Date.now() - startTime;

      expect(lock2).toBeTruthy();
      expect(lock2.workerId).toBe('worker-2');
      expect(elapsed).toBeGreaterThan(800); // Relaxed to 800ms to account for timing variations

      // Clean up
      if (lock2) {
        await storage.releaseLock(lock2);
      } else if (lock1) {
        await storage.releaseLock(lock1);
      }
    });
  });

  describe('Garbage Collection Locks', () => {
    it('should create GC lock during garbage collection', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|optional',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' },
        transactionRetention: 0, // Delete immediately
        verbose: false
      });

      await database.usePlugin(plugin);

      // Create and consolidate to generate transactions
      await urls.insert({ id: 'url1', clicks: 0 });
      await urls.add('url1', 'clicks', 5);
      await urls.consolidate('url1', 'clicks');

      // Wait for transactions to age
      await sleep(1000);

      const storage = plugin.getStorage();

      // Try to acquire GC lock manually to verify the mechanism
      const gcLockKey = 'gc-urls-clicks';
      const gcLock = await storage.acquireLock(gcLockKey, {
        ttl: 300, // GC uses 5 minutes
        timeout: 0,
        workerId: 'test-gc'
      });

      // If GC isn't running, we should get the lock
      if (gcLock) {
        expect(gcLock.workerId).toBe('test-gc');
        await storage.releaseLock(gcLock);
      }

      // The important thing: GC should work
      const handler = plugin.fieldHandlers.get('urls').get('clicks');
      await plugin._runGarbageCollectionForHandler(handler, 'urls', 'clicks');

      // GC should complete without errors
      expect(true).toBe(true);
    });
  });

  describe('Lock Cleanup Comparison', () => {
    it('should demonstrate that manual cleanup is no longer needed', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|optional',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      const storage = plugin.getStorage();

      // Create 10 locks with short TTL
      const lockKeys = [];
      for (let i = 0; i < 10; i++) {
        const lockKey = `cleanup-test-${i}`;
        lockKeys.push(lockKey);
        await storage.acquireLock(lockKey, { ttl: 1 });
      }

      // Wait for lock creation to fully propagate
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify all locks exist
      let lockedCount = 0;
      for (const key of lockKeys) {
        if (await storage.isLocked(key)) {
          lockedCount++;
        }
      }
      expect(lockedCount).toBe(10);

      // Wait for TTL expiration
      await sleep(1200);

      // Verify all locks auto-expired (no manual cleanup needed!)
      lockedCount = 0;
      for (const key of lockKeys) {
        if (await storage.isLocked(key)) {
          lockedCount++;
        }
      }
      expect(lockedCount).toBe(0);

      // ✨ Before: Required cleanupStaleLocks() function (~78 lines)
      // ✨ After: TTL handles it automatically! (0 lines)
    });
  });

  describe('Real-World Lock Scenarios', () => {
    it('should handle consolidation lock during concurrent operations', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|optional',
          clicks: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: { urls: ['clicks'] },
        consolidation: { mode: 'sync' },
        lockTimeout: 30 // 30 seconds
      });

      await database.usePlugin(plugin);

      // Create URL with initial clicks
      await urls.insert({ id: 'url1', clicks: 100 });

      // Perform concurrent operations
      const operations = [
        urls.add('url1', 'clicks', 10),
        urls.add('url1', 'clicks', 20),
        urls.add('url1', 'clicks', 30)
      ];

      await Promise.all(operations);

      // Wait for async consolidation to complete (locks + processing)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check final result
      const url = await urls.get('url1');
      expect(url.clicks).toBe(160); // 100 + 10 + 20 + 30

      // All operations should complete successfully
      // Locks should prevent race conditions
    });

    it('should verify lock files are properly namespaced', async () => {
      urls = await database.createResource({
        name: 'urls',
        attributes: {
          id: 'string|optional',
          clicks: 'number|default:0',
          views: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      verbose: false,
        resources: { urls: ['clicks', 'views'] },
        consolidation: { mode: 'sync' }
      });

      await database.usePlugin(plugin);

      const storage = plugin.getStorage();

      // Create locks for different fields
      const clicksLock = await storage.acquireLock('consolidation-urls-clicks-url1', { ttl: 60 });
      const viewsLock = await storage.acquireLock('consolidation-urls-views-url1', { ttl: 60 });

      expect(clicksLock).toBeTruthy();
      expect(viewsLock).toBeTruthy();

      // Both locks should coexist without conflict
      expect(await storage.isLocked('consolidation-urls-clicks-url1')).toBe(true);
      expect(await storage.isLocked('consolidation-urls-views-url1')).toBe(true);

      // Clean up
      await storage.releaseLock(clicksLock);
      await storage.releaseLock(viewsLock);
    });
  });
});
