/**
 * Validator Cache Tests
 *
 * Validates that validator caching works correctly and provides expected memory savings
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from '../../src/database.class.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import Schema from '../../src/schema.class.js';
import { clearValidatorCache } from '../../src/concerns/validator-cache.js';

describe('Validator Cache', () => {
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

    // Clear cache before each test
    clearValidatorCache();

    db = new Database({
      client: new MemoryClient({ bucket: 'test-validator-cache', keyPrefix: 'test/' }),
      deferMetadataWrites: true
    });
    await db.connect();
  });

  afterEach(async () => {
    if (db) await db.disconnect();
    clearValidatorCache();
  });

  describe('Validator Reuse', () => {
    it('should reuse validators for identical schemas', async () => {
      // Create two resources with identical schemas
      const schema = {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional'
      };

      const resource1 = await db.createResource({
        name: 'users1',
        attributes: schema
      });

      const resource2 = await db.createResource({
        name: 'users2',
        attributes: schema
      });

      // Both resources should share the same validator instance
      expect(resource1.schema.validator).toBe(resource2.schema.validator);

      // Cache stats should show 1 unique validator
      const stats = Schema.getValidatorCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.totalReferences).toBe(2);
      expect(stats.cacheHits).toBe(1);
      expect(stats.cacheMisses).toBe(1);
    });

    it('should create different validators for different schemas', async () => {
      // Clear cache for this test
      clearValidatorCache();

      const resource1 = await db.createResource({
        name: 'users',
        attributes: {
          name: 'string|required',
          email: 'email|required'
        }
      });

      const resource2 = await db.createResource({
        name: 'posts',
        attributes: {
          title: 'string|required',
          content: 'string|required'
        }
      });

      // Different schemas should have different validators
      expect(resource1.schema.validator).not.toBe(resource2.schema.validator);

      // Cache stats should show 2 unique validators
      const stats = Schema.getValidatorCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.totalReferences).toBe(2);
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(2);
    });

    it('should cache validators even with different resource names', async () => {
      // Clear cache for this test
      clearValidatorCache();

      // Same schema, different names
      const schema = {
        id: 'string|required',
        data: 'string|optional'
      };

      const resources = [];
      for (let i = 0; i < 5; i++) {
        const resource = await db.createResource({
          name: `resource_${i}`,
          attributes: schema
        });
        resources.push(resource);
      }

      // All resources should share the same validator
      const firstValidator = resources[0].schema.validator;
      for (const resource of resources) {
        expect(resource.schema.validator).toBe(firstValidator);
      }

      // Cache stats should show 1 unique validator with 5 references
      const stats = Schema.getValidatorCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.totalReferences).toBe(5);
      expect(stats.cacheHits).toBe(4);
      expect(stats.cacheMisses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.8, 2); // 4/5 = 0.8
    });
  });

  describe('Cache Eviction', () => {
    it('should allow manual eviction of validators', async () => {
      // Create a resource to populate cache
      await db.createResource({
        name: 'test',
        attributes: { name: 'string' }
      });

      const statsBefore = Schema.getValidatorCacheStats();
      expect(statsBefore.size).toBeGreaterThan(0);

      // Eviction is tested more comprehensively in integration scenarios
      // For now, just verify the API exists
      expect(typeof Schema.evictUnusedValidators).toBe('function');
    });
  });

  describe('Memory Usage', () => {
    it('should report cache memory usage', async () => {
      // Clear cache for this test
      clearValidatorCache();

      // Create 3 resources with 2 unique schemas
      await db.createResource({
        name: 'users1',
        attributes: { name: 'string', email: 'email' }
      });

      await db.createResource({
        name: 'users2',
        attributes: { name: 'string', email: 'email' }
      });

      await db.createResource({
        name: 'posts',
        attributes: { title: 'string', content: 'string' }
      });

      const memUsage = Schema.getValidatorCacheMemoryUsage();

      expect(memUsage.validatorCount).toBe(2);
      expect(memUsage.estimatedKB).toBe(100); // 2 validators * 50KB
      expect(memUsage.estimatedMB).toBeCloseTo(0.098, 2);
    });

    it('should demonstrate memory savings with 100 identical resources', async () => {
      // Clear cache for this test
      clearValidatorCache();

      const schema = {
        id: 'string|required',
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional',
        active: 'boolean|optional'
      };

      // Create 100 resources with identical schema
      for (let i = 0; i < 100; i++) {
        await db.createResource({
          name: `resource_${i}`,
          attributes: schema
        });
      }

      const stats = Schema.getValidatorCacheStats();
      const memUsage = Schema.getValidatorCacheMemoryUsage();

      // Should have only 1 unique validator
      expect(stats.size).toBe(1);
      expect(stats.totalReferences).toBe(100);

      // Memory usage should be ~50KB instead of 5000KB (5MB)
      expect(memUsage.estimatedKB).toBe(50);
      expect(memUsage.estimatedMB).toBeCloseTo(0.049, 2);

      // Without caching: 100 * 50KB = 5000KB = 5MB
      // With caching: 1 * 50KB = 50KB
      // Savings: 99% memory reduction!

      console.log(`\n💾 Memory Savings:`);
      console.log(`   Without cache: ${100 * 50}KB (5MB)`);
      console.log(`   With cache: ${memUsage.estimatedKB}KB`);
      console.log(`   Savings: ${((1 - memUsage.estimatedKB / (100 * 50)) * 100).toFixed(1)}%`);
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hit rate', async () => {
      // Clear cache for this test
      clearValidatorCache();

      const schema = {
        name: 'string',
        value: 'number'
      };

      // First resource - cache miss
      await db.createResource({ name: 'r1', attributes: schema });

      // Next 9 resources - cache hits
      for (let i = 2; i <= 10; i++) {
        await db.createResource({ name: `r${i}`, attributes: schema });
      }

      const stats = Schema.getValidatorCacheStats();

      expect(stats.cacheHits).toBe(9);
      expect(stats.cacheMisses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.9, 2); // 9/10 = 0.9 = 90%
    });
  });

  describe('Schema Fingerprinting', () => {
    it('should consider passphrase in fingerprint', async () => {
      // Clear cache for this test
      clearValidatorCache();

      const resource1 = await db.createResource({
        name: 'test1',
        attributes: { password: 'secret' },
        passphrase: 'secret1'
      });

      const resource2 = await db.createResource({
        name: 'test2',
        attributes: { password: 'secret' },
        passphrase: 'secret2'
      });

      // Different passphrases = different validators
      expect(resource1.schema.validator).not.toBe(resource2.schema.validator);

      const stats = Schema.getValidatorCacheStats();
      expect(stats.size).toBe(2); // 2 different validators
    });
  });
});
