/**
 * Test: Verticalizado Configuration Architecture
 *
 * Tests the new configuration structure that separates:
 * - databaseOptions (Database class concerns)
 * - clientOptions (Client class concerns)
 *
 * Also tests querystring parameter support for clientOptions
 */

import { rm } from 'fs/promises';
import { createDatabaseForTest } from './config.js';

describe('Verticalizado Configuration Architecture', () => {
  // Use unique path for each test to avoid storage registry collisions
  let testCounter = 0;
  const getTestPath = () => `/tmp/s3db-config-test-${++testCounter}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  afterEach(async () => {
    try {
      // Cleanup FileSystemClient global storage registry
      const FileSystemClient = (await import('../src/clients/filesystem-client.class.js')).default;
      FileSystemClient.clearAllStorage();

      // Cleanup all test paths
      await rm('/tmp/s3db-config-test-*', { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('Database Options vs Client Options', () => {
    it('should accept verticalizado config (v16+ clean structure)', async () => {
      const db = await createDatabaseForTest('verticalizado-clean-structure', {
        connectionString: `file://${getTestPath()}`,
        // Database options (root level)
        logLevel: 'silent',
        parallelism: 5,
        strictValidation: true,
        // Client options (wrapper)
        clientOptions: {
          compression: {
            enabled: true,
            threshold: 100
          },
          stats: { enabled: true }
        }
      });

      expect(db.verbose).toBe(false);
      expect(db.taskExecutor.concurrency).toBe(5);
      expect(db.strictValidation).toBe(true);

      await db.connect();

      await db.createResource({
        name: 'test',
        attributes: { value: 'string' }
      });

      await db.resources.test.insert({ value: 'hello' });

      const stats = db.client.getStats();
      expect(stats).toBeTruthy();

      await db.disconnect();
    });

    it('should merge options correctly (precedence: querystring > clientOptions)', async () => {
      // QueryString has compression.threshold=50
      // clientOptions has compression.threshold=100
      // Querystring should win
      const db = await createDatabaseForTest('verticalizado-merge-options', {
        connectionString: `file://${getTestPath()}?compression.enabled=true&compression.threshold=50&stats.enabled=true`,
        clientOptions: {
          compression: {
            enabled: false, // Should be overridden by querystring
            threshold: 100  // Should be overridden by querystring
          }
        }
      });

      await db.connect();

      await db.createResource({
        name: 'test',
        attributes: { value: 'string' }
      });

      // Insert large data to trigger compression
      await db.resources.test.insert({
        value: 'x'.repeat(200) // Large enough to exceed threshold
      });

      const stats = db.client.getStats();
      expect(stats).toBeTruthy();
      expect(stats.features.compression).toBe(true);

      await db.disconnect();
    });
  });

  describe('Querystring Parameters', () => {
    it('should parse nested querystring params (compression.enabled=true)', async () => {
      const db = await createDatabaseForTest('verticalizado-query-nested', {
        connectionString: `file://${getTestPath()}?compression.enabled=true&compression.threshold=100&compression.level=9&stats.enabled=true`,
        logLevel: 'silent'
      });

      await db.connect();

      await db.createResource({
        name: 'test',
        attributes: { value: 'string' }
      });

      await db.resources.test.insert({ value: 'x'.repeat(200) });

      const stats = db.client.getStats();
      expect(stats).toBeTruthy();
      expect(stats.features.compression).toBe(true);

      await db.disconnect();
    });

    it('should parse boolean querystring params correctly', async () => {
      const db = await createDatabaseForTest('verticalizado-query-boolean', {
        connectionString: `file://${getTestPath()}?stats.enabled=true&locking.enabled=false`,
        logLevel: 'silent'
      });

      await db.connect();

      await db.createResource({
        name: 'test',
        attributes: { value: 'string' }
      });

      await db.resources.test.insert({ value: 'test' });

      const stats = db.client.getStats();
      expect(stats).toBeTruthy();
      expect(stats.features.stats).toBe(true);
      expect(stats.features.locking).toBe(false);

      await db.disconnect();
    });

    it('should parse number querystring params correctly', async () => {
      const db = await createDatabaseForTest('verticalizado-query-number', {
        connectionString: `file://${getTestPath()}?compression.threshold=50&ttl.defaultTTL=3600000&stats.enabled=true`,
        logLevel: 'silent'
      });

      await db.connect();

      // Verify types are correct
      expect(typeof db.client.storage.compressionThreshold).toBe('number');
      expect(db.client.storage.compressionThreshold).toBe(50);

      const stats = db.client.getStats();
      expect(stats).toBeTruthy();

      await db.disconnect();
    });

    it('should support flat querystring params for database options', async () => {
      const db = await createDatabaseForTest('verticalizado-query-flat', {
        connectionString: `file://${getTestPath()}?verbose=false`,
      });

      expect(db.verbose).toBe(false);
      expect(db.taskExecutor.concurrency).toBe(10);

      await db.connect();
      await db.disconnect();
    });
  });

  describe('Config Priority', () => {
    it('should use clientOptions for client configuration', async () => {
      const db = await createDatabaseForTest('verticalizado-config-priority-client-options', {
        connectionString: `file://${getTestPath()}`,
        clientOptions: {
          compression: {
            enabled: true,
            threshold: 100
          },
          stats: {
            enabled: true
          }
        }
      });

      await db.connect();

      await db.createResource({
        name: 'test',
        attributes: { value: 'string' }
      });

      await db.resources.test.insert({ value: 'x'.repeat(200) });

      const stats = db.client.getStats();
      expect(stats).toBeTruthy();
      expect(stats.features.compression).toBe(true);

      await db.disconnect();
    });

    it('should prefer querystring over clientOptions', async () => {
      const db = await createDatabaseForTest('verticalizado-config-priority-querystring', {
        connectionString: `file://${getTestPath()}?compression.enabled=true&compression.threshold=50`,
        clientOptions: {
          compression: {
            enabled: false,  // Should be overridden
            threshold: 200   // Should be overridden
          }
        }
      });

      await db.connect();

      await db.createResource({
        name: 'test',
        attributes: { value: 'string' }
      });

      // Verify querystring won (threshold=50)
      expect(db.client.storage.compressionThreshold).toBe(50);

      await db.disconnect();
    });
  });
});
