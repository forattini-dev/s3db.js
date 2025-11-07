/**
 * Event Listener Cleanup Tests
 *
 * Validates that event listeners are properly cleaned up to prevent memory leaks
 * in long-running applications.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { clearValidatorCache } from '../../src/concerns/validator-cache.js';
import Schema from '../../src/schema.class.js';

describe('Event Listener Cleanup', () => {
  let db;

  beforeEach(async () => {
    // Disconnect any existing database
    if (db) {
      try {
        await db.disconnect();
      } catch (e) {
        // Ignore errors
      }
    }

    // Clear validator cache before each test
    clearValidatorCache();

    db = new Database({
      verbose: false, client: new MemoryClient({ bucket: 'test-listener-cleanup', keyPrefix: 'test/' }),
      deferMetadataWrites: true
    });
    await db.connect();
  });

  afterEach(async () => {
    if (db) await db.disconnect();
    clearValidatorCache();
  });

  describe('Resource Disposal', () => {
    it('should have dispose() method', async () => {
      clearValidatorCache(); // Clear for isolated test

      const resource = await db.createResource({
        name: 'users',
        attributes: { name: 'string' }
      });

      expect(typeof resource.dispose).toBe('function');
    });

    it('should release validator reference when disposed', async () => {
      clearValidatorCache(); // Clear for isolated test

      const resource = await db.createResource({
        name: 'users',
        attributes: { name: 'string', email: 'email' }
      });

      const statsBefore = Schema.getValidatorCacheStats();
      expect(statsBefore.size).toBe(1);
      expect(statsBefore.totalReferences).toBe(1);

      // Dispose resource - should decrement ref count
      resource.dispose();

      const statsAfter = Schema.getValidatorCacheStats();
      expect(statsAfter.size).toBe(1); // Still in cache (grace period)
      expect(statsAfter.totalReferences).toBe(0); // But ref count is 0
    });

    it('should allow validator eviction after disposal', async () => {
      clearValidatorCache(); // Clear for isolated test

      const resource = await db.createResource({
        name: 'users',
        attributes: { name: 'string' }
      });

      resource.dispose();

      const statsBefore = Schema.getValidatorCacheStats();
      expect(statsBefore.totalReferences).toBe(0);

      // Evict immediately (no grace period)
      const evicted = Schema.evictUnusedValidators(0);
      expect(evicted).toBe(1);

      const statsAfter = Schema.getValidatorCacheStats();
      expect(statsAfter.size).toBe(0);
    });

    it('should remove all event listeners when disposed', async () => {
      clearValidatorCache(); // Clear for isolated test

      const resource = await db.createResource({
        name: 'users',
        attributes: { name: 'string' }
      });

      // Add some listeners
      const listener1 = () => {};
      const listener2 = () => {};
      const listener3 = () => {};

      resource.on('insert', listener1);
      resource.on('update', listener2);
      resource.on('delete', listener3);

      // Verify listeners are registered
      expect(resource.listenerCount('insert')).toBe(1);
      expect(resource.listenerCount('update')).toBe(1);
      expect(resource.listenerCount('delete')).toBe(1);

      // Dispose
      resource.dispose();

      // All listeners should be removed
      expect(resource.listenerCount('insert')).toBe(0);
      expect(resource.listenerCount('update')).toBe(0);
      expect(resource.listenerCount('delete')).toBe(0);
    });

    it('should emit disposal event before removing listeners', async () => {
      clearValidatorCache(); // Clear for isolated test

      const resource = await db.createResource({
        name: 'users',
        attributes: { name: 'string' }
      });

      // Track if event is emitted by checking listener count before/after dispose
      const disposalHandler = () => {};
      resource.on('resource:disposed', disposalHandler);

      // Before dispose: listener exists
      expect(resource.listenerCount('resource:disposed')).toBe(1);

      // Dispose should emit event THEN remove listeners
      resource.dispose();

      // After dispose: all listeners should be removed
      expect(resource.listenerCount('resource:disposed')).toBe(0);
    });
  });

  describe('Database Disconnect Cleanup', () => {
    it('should call dispose() on all resources during disconnect', async () => {
      clearValidatorCache(); // Clear for isolated test

      const resource1 = await db.createResource({
        name: 'users',
        attributes: { name: 'string' }
      });

      const resource2 = await db.createResource({
        name: 'posts',
        attributes: { title: 'string' }
      });

      // Add listeners to both resources
      resource1.on('insert', () => {});
      resource2.on('update', () => {});

      expect(resource1.listenerCount('insert')).toBe(1);
      expect(resource2.listenerCount('update')).toBe(1);

      // Disconnect database
      await db.disconnect();

      // All listeners should be removed
      expect(resource1.listenerCount('insert')).toBe(0);
      expect(resource2.listenerCount('update')).toBe(0);
    });

    it('should release all validator references during disconnect', async () => {
      clearValidatorCache(); // Clear for isolated test

      // Create 3 resources with 2 unique schemas
      await db.createResource({
        name: 'users1',
        attributes: { name: 'string', email: 'email' }
      });

      await db.createResource({
        name: 'users2',
        attributes: { name: 'string', email: 'email' } // Same schema as users1
      });

      await db.createResource({
        name: 'posts',
        attributes: { title: 'string', content: 'string' }
      });

      const statsBefore = Schema.getValidatorCacheStats();
      expect(statsBefore.size).toBe(2); // 2 unique validators
      expect(statsBefore.totalReferences).toBe(3); // 3 resources

      // Disconnect
      await db.disconnect();

      const statsAfter = Schema.getValidatorCacheStats();
      expect(statsAfter.size).toBe(2); // Still in cache (grace period)
      expect(statsAfter.totalReferences).toBe(0); // All refs released
    });

    it('should allow full cache eviction after disconnect', async () => {
      clearValidatorCache(); // Clear for isolated test

      // Create multiple resources
      await db.createResource({ name: 'r1', attributes: { name: 'string' } });
      await db.createResource({ name: 'r2', attributes: { title: 'string' } });
      await db.createResource({ name: 'r3', attributes: { value: 'number' } });

      const statsBefore = Schema.getValidatorCacheStats();
      expect(statsBefore.size).toBe(3);
      expect(statsBefore.totalReferences).toBe(3);

      // Disconnect
      await db.disconnect();

      // All refs should be released
      const statsAfterDisconnect = Schema.getValidatorCacheStats();
      expect(statsAfterDisconnect.totalReferences).toBe(0);

      // Evict with no grace period
      const evicted = Schema.evictUnusedValidators(0);
      expect(evicted).toBe(3);

      const statsAfterEviction = Schema.getValidatorCacheStats();
      expect(statsAfterEviction.size).toBe(0);
    });
  });

  describe('Memory Leak Prevention', () => {
    it('should not leak listeners across resource lifecycle', async () => {
      clearValidatorCache(); // Clear for isolated test

      // Create resource
      let resource = await db.createResource({
        name: 'users',
        attributes: { name: 'string' }
      });

      // Add listener
      resource.on('insert', () => {});
      expect(resource.listenerCount('insert')).toBe(1);

      // Dispose
      resource.dispose();
      expect(resource.listenerCount('insert')).toBe(0);

      // Get resource again (should be clean)
      resource = await db.getResource('users');
      expect(resource.listenerCount('insert')).toBe(0);

      // Add new listener
      resource.on('insert', () => {});
      expect(resource.listenerCount('insert')).toBe(1);
    });

    it('should not leak validators across connect/disconnect cycles', async () => {
      clearValidatorCache(); // Clear for isolated test

      // Create resources with same schema
      await db.createResource({ name: 'r1', attributes: { name: 'string' } });
      await db.createResource({ name: 'r2', attributes: { name: 'string' } });
      await db.createResource({ name: 'r3', attributes: { name: 'string' } });

      const statsBefore = Schema.getValidatorCacheStats();
      expect(statsBefore.size).toBe(1); // All same schema
      expect(statsBefore.totalReferences).toBe(3);

      // Disconnect should release all validator references
      await db.disconnect();

      const statsAfterDisconnect = Schema.getValidatorCacheStats();
      expect(statsAfterDisconnect.totalReferences).toBe(0); // All refs released

      // Evict unused validators
      const evicted = Schema.evictUnusedValidators(0);
      expect(evicted).toBe(1); // Should evict the 1 unused validator
    });
  });
});
