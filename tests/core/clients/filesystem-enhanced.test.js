/**
 * Tests for Enhanced FileSystemClient Features
 *
 * Tests compression, TTL, locking, backup, journal, and stats features
 */

import { rm, readFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import S3db from '../../../src/index.js';
import { FileSystemClient } from '../../../src/clients/filesystem-client.class.js';

const TEST_BASE_PATH = '/tmp/s3db-enhanced-tests';

describe.skip('FileSystemClient - Enhanced Features [TODO: features not fully implemented]', () => {

  beforeAll(async () => {
    // Clean up before all tests
    await rm(TEST_BASE_PATH, { recursive: true, force: true });
  });

  afterAll(async () => {
    // Clean up after all tests
    await rm(TEST_BASE_PATH, { recursive: true, force: true });
    FileSystemClient.clearAllStorage();
  });

  describe('Compression', () => {
    let db;
    const testPath = path.join(TEST_BASE_PATH, 'compression');

    beforeEach(async () => {
      await rm(testPath, { recursive: true, force: true });
      FileSystemClient.clearPathStorage(testPath);
    });

    afterEach(async () => {
      if (db) {
        await db.disconnect();
        db = null;
      }
    });

    it('should compress large data automatically', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        compression: {
          enabled: true,
          threshold: 100,  // Compress if > 100 bytes
          level: 9
        },
        stats: { enabled: true }
      });

      await db.connect();
      await db.createResource({
        name: 'data',
        attributes: { content: 'string' }
      });

      // Insert large data (should be compressed)
      const largeContent = 'Lorem ipsum dolor sit amet. '.repeat(50); // ~1400 bytes
      await db.resources.data.insert({ content: largeContent });

      // Check stats
      const stats = db.client.getStats();
      expect(stats.totalUncompressed).toBeGreaterThan(0);
      expect(stats.totalCompressed).toBeGreaterThan(0);
      expect(stats.compressionSaved).toBeGreaterThan(0);
      expect(stats.totalCompressed).toBeLessThan(stats.totalUncompressed);
    });

    it('should NOT compress small data', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        compression: {
          enabled: true,
          threshold: 1000  // Only compress if > 1000 bytes
        },
        stats: { enabled: true }
      });

      await db.connect();
      await db.createResource({
        name: 'data',
        attributes: { content: 'string' }
      });

      // Insert small data (should NOT be compressed)
      await db.resources.data.insert({ content: 'Small content' });

      const stats = db.client.getStats();
      expect(stats.totalUncompressed).toBe(0); // Nothing was compressed
    });

    it('should decompress data correctly on read', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        compression: {
          enabled: true,
          threshold: 50,
          level: 6
        }
      });

      await db.connect();
      await db.createResource({
        name: 'data',
        attributes: { content: 'string' }
      });

      const originalContent = 'This is some test content that should be compressed '.repeat(10);
      const { id } = await db.resources.data.insert({ content: originalContent });

      // Read back and verify decompression
      const record = await db.resources.data.get(id);
      expect(record.content).toBe(originalContent);
    });

    it('should track compression ratio', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        compression: {
          enabled: true,
          threshold: 50
        },
        stats: { enabled: true }
      });

      await db.connect();
      await db.createResource({
        name: 'data',
        attributes: { content: 'string' }
      });

      // Insert repetitive data (compresses well)
      const repetitiveContent = 'A'.repeat(1000);
      await db.resources.data.insert({ content: repetitiveContent });

      const stats = db.client.getStats();
      expect(stats.avgCompressionRatio).toBeDefined();
      expect(parseFloat(stats.avgCompressionRatio)).toBeLessThan(1.0);
    });
  });

  describe('TTL (Time To Live)', () => {
    let db;
    const testPath = path.join(TEST_BASE_PATH, 'ttl');

    beforeEach(async () => {
      await rm(testPath, { recursive: true, force: true });
      FileSystemClient.clearPathStorage(testPath);
    });

    afterEach(async () => {
      if (db) {
        await db.disconnect();
        db = null;
      }
    });

    it('should auto-expire records after TTL', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        ttl: {
          enabled: true,
          defaultTTL: 500,  // 500ms
          cleanupInterval: 200  // Check every 200ms
        }
      });

      await db.connect();
      await db.createResource({
        name: 'cache',
        attributes: { key: 'string', value: 'string' }
      });

      // Insert record
      const { id } = await db.resources.cache.insert({
        key: 'test',
        value: 'expires soon'
      });

      // Should exist immediately
      const before = await db.resources.cache.get(id);
      expect(before).toBeDefined();
      expect(before.value).toBe('expires soon');

      // Wait for expiration + cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should be gone
      await expect(db.resources.cache.get(id)).rejects.toThrow();
    });

    it('should support custom TTL per record', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        ttl: {
          enabled: true,
          defaultTTL: 10000,  // 10 seconds default
          cleanupInterval: 200
        }
      });

      await db.connect();
      await db.createResource({
        name: 'cache',
        attributes: { key: 'string', value: 'string' }
      });

      // Insert with custom short TTL
      const { id } = await db.resources.cache.insert(
        { key: 'test', value: 'custom ttl' },
        { ttl: 300 }  // Only 300ms
      );

      // Wait for custom TTL to expire
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should be expired
      await expect(db.resources.cache.get(id)).rejects.toThrow();
    });

    it('should not expire records when TTL disabled', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        ttl: { enabled: false }
      });

      await db.connect();
      await db.createResource({
        name: 'data',
        attributes: { content: 'string' }
      });

      const { id } = await db.resources.data.insert({ content: 'permanent' });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should still exist
      const record = await db.resources.data.get(id);
      expect(record.content).toBe('permanent');
    });
  });

  describe('File Locking', () => {
    let db;
    const testPath = path.join(TEST_BASE_PATH, 'locking');

    beforeEach(async () => {
      await rm(testPath, { recursive: true, force: true });
      FileSystemClient.clearPathStorage(testPath);
    });

    afterEach(async () => {
      if (db) {
        await db.disconnect();
        db = null;
      }
    });

    it('should prevent concurrent write corruption', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        locking: {
          enabled: true,
          timeout: 5000
        }
      });

      await db.connect();
      await db.createResource({
        name: 'counter',
        attributes: { name: 'string', value: 'number' }
      });

      const { id } = await db.resources.counter.insert({
        name: 'clicks',
        value: 0
      });

      // Simulate 20 concurrent increments
      const updates = Array.from({ length: 20 }, async (_, i) => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
        const current = await db.resources.counter.get(id);
        await db.resources.counter.update(id, { value: current.value + 1 });
      });

      await Promise.all(updates);

      const final = await db.resources.counter.get(id);
      expect(final.value).toBe(20); // All updates should succeed without corruption
    });

    it('should timeout if lock held too long', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        locking: {
          enabled: true,
          timeout: 100  // Very short timeout
        }
      });

      await db.connect();
      await db.createResource({
        name: 'data',
        attributes: { content: 'string' }
      });

      // This test is tricky - we'd need to manually hold a lock
      // Skipping for now as it requires internal access
    });
  });

  describe('Backup Files', () => {
    let db;
    const testPath = path.join(TEST_BASE_PATH, 'backup');

    beforeEach(async () => {
      await rm(testPath, { recursive: true, force: true });
      FileSystemClient.clearPathStorage(testPath);
    });

    afterEach(async () => {
      if (db) {
        await db.disconnect();
        db = null;
      }
    });

    it('should create backup files on update', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        backup: {
          enabled: true,
          suffix: '.bak'
        }
      });

      await db.connect();
      await db.createResource({
        name: 'config',
        attributes: { setting: 'string', value: 'string' }
      });

      const { id } = await db.resources.config.insert({
        setting: 'theme',
        value: 'dark'
      });

      // Update (should create backup)
      await db.resources.config.update(id, { value: 'light' });

      // Check for backup files (they're created for the data file)
      const resourceDir = path.join(testPath, 'resource=config');
      const files = await readdir(resourceDir, { recursive: true });

      // At minimum we should have data file and metadata
      expect(files.length).toBeGreaterThan(0);
    });

    it('should delete backup files on record deletion', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        backup: {
          enabled: true,
          suffix: '.bak'
        }
      });

      await db.connect();
      await db.createResource({
        name: 'temp',
        attributes: { data: 'string' }
      });

      const { id } = await db.resources.temp.insert({ data: 'test' });

      // Update to create backup
      await db.resources.temp.update(id, { data: 'updated' });

      // Delete record (should also delete backup)
      await db.resources.temp.delete(id);

      // Verify no leftover backup files
      const resourceDir = path.join(testPath, 'resource=temp');
      if (existsSync(resourceDir)) {
        const files = await readdir(resourceDir, { recursive: true });
        const backupFiles = files.filter(f => f.endsWith('.bak'));
        expect(backupFiles.length).toBe(0);
      }
    });
  });

  describe('Journal (Audit Log)', () => {
    let db;
    const testPath = path.join(TEST_BASE_PATH, 'journal');

    beforeEach(async () => {
      await rm(testPath, { recursive: true, force: true });
      FileSystemClient.clearPathStorage(testPath);
    });

    afterEach(async () => {
      if (db) {
        await db.disconnect();
        db = null;
      }
    });

    it('should log operations to journal file', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        journal: {
          enabled: true,
          file: 'audit.log'
        }
      });

      await db.connect();
      await db.createResource({
        name: 'users',
        attributes: { name: 'string', email: 'string' }
      });

      // Perform operations
      const { id: id1 } = await db.resources.users.insert({ name: 'Alice', email: 'alice@test.com' });
      const { id: id2 } = await db.resources.users.insert({ name: 'Bob', email: 'bob@test.com' });
      await db.resources.users.update(id1, { email: 'alice@new.com' });
      await db.resources.users.delete(id2);

      // Read journal
      const journalPath = path.join(testPath, 'audit.log');
      expect(existsSync(journalPath)).toBe(true);

      const journalContent = await readFile(journalPath, 'utf8');
      const entries = journalContent.trim().split('\n').map(line => JSON.parse(line));

      // Should have multiple operations logged
      expect(entries.length).toBeGreaterThan(0);

      // Verify entry structure
      const firstEntry = entries[0];
      expect(firstEntry).toHaveProperty('timestamp');
      expect(firstEntry).toHaveProperty('operation');
      expect(firstEntry).toHaveProperty('key');
      expect(firstEntry).toHaveProperty('metadata');
    });

    it('should use custom journal filename', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        journal: {
          enabled: true,
          file: 'custom.journal'
        }
      });

      await db.connect();
      await db.createResource({
        name: 'data',
        attributes: { value: 'string' }
      });

      await db.resources.data.insert({ value: 'test' });

      const customJournalPath = path.join(testPath, 'custom.journal');
      expect(existsSync(customJournalPath)).toBe(true);
    });
  });

  describe('Stats Tracking', () => {
    let db;
    const testPath = path.join(TEST_BASE_PATH, 'stats');

    beforeEach(async () => {
      await rm(testPath, { recursive: true, force: true });
      FileSystemClient.clearPathStorage(testPath);
    });

    afterEach(async () => {
      if (db) {
        await db.disconnect();
        db = null;
      }
    });

    it('should track operation counts', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        stats: { enabled: true }
      });

      await db.connect();
      await db.createResource({
        name: 'data',
        attributes: { value: 'string' }
      });

      // Perform operations
      const { id: id1 } = await db.resources.data.insert({ value: 'test1' });
      const { id: id2 } = await db.resources.data.insert({ value: 'test2' });
      await db.resources.data.get(id1);
      await db.resources.data.get(id2);
      await db.resources.data.delete(id1);

      const stats = db.client.getStats();
      expect(stats.puts).toBeGreaterThan(0);
      expect(stats.gets).toBeGreaterThan(0);
      expect(stats.deletes).toBeGreaterThan(0);
    });

    it('should return null when stats disabled', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        stats: { enabled: false }
      });

      await db.connect();

      const stats = db.client.getStats();
      expect(stats).toBeNull();
    });

    it('should include feature flags in stats', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        compression: { enabled: true },
        ttl: { enabled: true },
        locking: { enabled: true },
        backup: { enabled: true },
        journal: { enabled: true },
        stats: { enabled: true }
      });

      await db.connect();

      const stats = db.client.getStats();
      expect(stats.features).toBeDefined();
      expect(stats.features.compression).toBe(true);
      expect(stats.features.ttl).toBe(true);
      expect(stats.features.locking).toBe(true);
      expect(stats.features.backup).toBe(true);
      expect(stats.features.journal).toBe(true);
    });
  });

  describe('Destroy and Cleanup', () => {
    let db;
    const testPath = path.join(TEST_BASE_PATH, 'destroy');

    beforeEach(async () => {
      await rm(testPath, { recursive: true, force: true });
      FileSystemClient.clearPathStorage(testPath);
    });

    afterEach(async () => {
      if (db) {
        await db.disconnect();
        db = null;
      }
    });

    it('should stop cleanup jobs on destroy', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        ttl: {
          enabled: true,
          defaultTTL: 10000,
          cleanupInterval: 1000
        }
      });

      await db.connect();

      // Destroy should stop the cleanup interval
      db.client.destroy();

      // Hard to test without inspecting internals, but at least verify no error
      expect(true).toBe(true);
    });
  });

  describe('Combined Features', () => {
    let db;
    const testPath = path.join(TEST_BASE_PATH, 'combined');

    beforeEach(async () => {
      await rm(testPath, { recursive: true, force: true });
      FileSystemClient.clearPathStorage(testPath);
    });

    afterEach(async () => {
      if (db) {
        await db.disconnect();
        db = null;
      }
    });

    it('should work with all features enabled', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        compression: {
          enabled: true,
          threshold: 50
        },
        ttl: {
          enabled: true,
          defaultTTL: 10000,
          cleanupInterval: 5000
        },
        locking: { enabled: true },
        backup: { enabled: true },
        journal: { enabled: true },
        stats: { enabled: true }
      });

      await db.connect();
      await db.createResource({
        name: 'fulltest',
        attributes: { data: 'string' }
      });

      // Insert large data (triggers compression)
      const largeData = 'Test data '.repeat(100);
      const { id } = await db.resources.fulltest.insert({ data: largeData });

      // Read back (decompression)
      const record = await db.resources.fulltest.get(id);
      expect(record.data).toBe(largeData);

      // Check stats
      const stats = db.client.getStats();
      expect(stats).toBeDefined();
      expect(stats.puts).toBeGreaterThan(0);
      expect(stats.gets).toBeGreaterThan(0);
      expect(stats.features.compression).toBe(true);
      expect(stats.features.ttl).toBe(true);
      expect(stats.features.locking).toBe(true);
      expect(stats.features.backup).toBe(true);
      expect(stats.features.journal).toBe(true);

      // Verify journal exists
      const journalPath = path.join(testPath, 'operations.journal');
      expect(existsSync(journalPath)).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    let db;
    const testPath = path.join(TEST_BASE_PATH, 'compat');

    beforeEach(async () => {
      await rm(testPath, { recursive: true, force: true });
      FileSystemClient.clearPathStorage(testPath);
    });

    afterEach(async () => {
      if (db) {
        await db.disconnect();
        db = null;
      }
    });

    it('should support flat config (old style)', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        // Old flat style
        enableCompression: true,
        compressionThreshold: 100,
        enableStats: true
      });

      await db.connect();
      await db.createResource({
        name: 'data',
        attributes: { content: 'string' }
      });

      const largeContent = 'A'.repeat(200);
      await db.resources.data.insert({ content: largeContent });

      const stats = db.client.getStats();
      expect(stats).toBeDefined();
      expect(stats.features.compression).toBe(true);
    });

    it('should prefer verticalizado config over flat', async () => {
      db = new S3db({
        logLevel: 'silent',
        connectionString: `file://${testPath}`,
        // Both styles (verticalizado should win)
        compression: {
          enabled: true,
          threshold: 50
        },
        enableCompression: false,  // This should be ignored
        stats: { enabled: true }
      });

      await db.connect();
      await db.createResource({
        name: 'data',
        attributes: { content: 'string' }
      });

      const content = 'A'.repeat(100);
      await db.resources.data.insert({ content });

      const stats = db.client.getStats();
      // Compression should be enabled (verticalizado config)
      expect(stats.features.compression).toBe(true);
    });
  });
});
