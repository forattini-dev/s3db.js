import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import { FilesystemCache } from '../src/plugins/cache/filesystem-cache.class.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const rmdir = promisify(fs.rmdir);
const unlink = promisify(fs.unlink);
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

describe('FilesystemCache', () => {
  let testDir;
  let cache;

  beforeAll(async () => {
    testDir = path.join(__dirname, 'test-cache');
  });

  beforeEach(async () => {
    // Clean up test directory before each test
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, ignore error
    }
  });

  afterEach(async () => {
    // Clean up cache and directory after each test
    if (cache) {
      cache.destroy();
      cache = null;
    }
    
    try {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor and Initialization', () => {
    it('should create cache with default configuration', async () => {
      cache = new FilesystemCache({ directory: testDir });
      
      expect(cache.directory).toBe(path.resolve(testDir));
      expect(cache.prefix).toBe('cache');
      expect(cache.ttl).toBe(3600000);
      expect(cache.enableCompression).toBe(true);
      expect(cache.compressionThreshold).toBe(1024);
      expect(cache.createDirectory).toBe(true);
      expect(cache.fileExtension).toBe('.cache');
      expect(cache.enableMetadata).toBe(true);
      expect(cache.maxFileSize).toBe(10485760);
      expect(cache.enableStats).toBe(false);
      expect(cache.enableCleanup).toBe(true);
      expect(cache.cleanupInterval).toBe(300000);
      expect(cache.encoding).toBe('utf8');
      expect(cache.fileMode).toBe(0o644);
      
      // Wait for directory creation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const dirExists = await fs.promises.access(testDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should create cache with custom configuration', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        prefix: 'test-cache',
        ttl: 600000,
        enableCompression: false,
        compressionThreshold: 2048,
        createDirectory: false,
        fileExtension: '.data',
        enableMetadata: false,
        maxFileSize: 5242880,
        enableStats: true,
        enableCleanup: false,
        cleanupInterval: 60000,
        encoding: 'utf8',
        fileMode: 0o755,
        enableBackup: true,
        backupSuffix: '.backup',
        enableLocking: true,
        lockTimeout: 3000,
        enableJournal: true,
        journalFile: 'test.journal'
      });
      
      expect(cache.prefix).toBe('test-cache');
      expect(cache.ttl).toBe(600000);
      expect(cache.enableCompression).toBe(false);
      expect(cache.compressionThreshold).toBe(2048);
      expect(cache.createDirectory).toBe(false);
      expect(cache.fileExtension).toBe('.data');
      expect(cache.enableMetadata).toBe(false);
      expect(cache.maxFileSize).toBe(5242880);
      expect(cache.enableStats).toBe(true);
      expect(cache.enableCleanup).toBe(false);
      expect(cache.cleanupInterval).toBe(60000);
      expect(cache.fileMode).toBe(0o755);
      expect(cache.enableBackup).toBe(true);
      expect(cache.backupSuffix).toBe('.backup');
      expect(cache.enableLocking).toBe(true);
      expect(cache.lockTimeout).toBe(3000);
      expect(cache.enableJournal).toBe(true);
    });

    it('should throw error when directory is not provided', () => {
      expect(() => {
        new FilesystemCache({});
      }).toThrow('FilesystemCache: directory parameter is required');
    });

    it('should create cleanup timer when enabled', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableCleanup: true,
        cleanupInterval: 100
      });
      
      expect(cache.cleanupTimer).toBeTruthy();
    });

    it('should not create cleanup timer when disabled', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableCleanup: false
      });
      
      expect(cache.cleanupTimer).toBeNull();
    });
  });

  describe('Basic Cache Operations', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      cache = new FilesystemCache({
        directory: testDir,
        enableStats: true
      });
    });

    it('should set and get cache data', async () => {
      const testData = { id: 123, name: 'John Doe', email: 'john@example.com' };
      
      await cache.set('user:123', testData);
      const result = await cache.get('user:123');
      
      expect(result).toEqual(testData);
      expect(cache.stats.sets).toBe(1);
      expect(cache.stats.hits).toBe(1);
    });

    it('should return null for non-existent key', async () => {
      const result = await cache.get('non-existent');
      
      expect(result).toBeNull();
      expect(cache.stats.misses).toBe(1);
    });

    it('should delete cache entry', async () => {
      const testData = { id: 123, name: 'John Doe' };
      
      await cache.set('user:123', testData);
      const deleteResult = await cache.del('user:123');
      const getResult = await cache.get('user:123');
      
      expect(deleteResult).toBe(true);
      expect(getResult).toBeNull();
      expect(cache.stats.deletes).toBe(1);
    });

    it('should clear all cache entries', async () => {
      await cache.set('user:1', { id: 1 });
      await cache.set('user:2', { id: 2 });
      await cache.set('user:3', { id: 3 });
      
      await cache.clear();
      
      const size = await cache.size();
      expect(size).toBe(0);
      expect(cache.stats.clears).toBe(1);
    });

    it('should clear cache entries with prefix', async () => {
      await cache.set('user:1', { id: 1 });
      await cache.set('user:2', { id: 2 });
      await cache.set('post:1', { id: 1 });
      
      await cache.clear('user');
      
      const keys = await cache.keys();
      expect(keys).toContain('post:1');
      expect(keys).not.toContain('user:1');
      expect(keys).not.toContain('user:2');
    });

    it('should get cache size and keys', async () => {
      await cache.set('key1', { data: 'value1' });
      await cache.set('key2', { data: 'value2' });
      await cache.set('key3', { data: 'value3' });
      
      const size = await cache.size();
      const keys = await cache.keys();
      
      expect(size).toBe(3);
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });

  describe('Compression', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      cache = new FilesystemCache({
        directory: testDir,
        enableCompression: true,
        compressionThreshold: 100,
        enableMetadata: true,
        enableStats: true
      });
    });

    it('should compress large data', async () => {
      const largeData = { message: 'x'.repeat(200), timestamp: Date.now() };
      
      await cache.set('large-data', largeData);
      const result = await cache.get('large-data');
      
      expect(result).toEqual(largeData);
      
      // Check metadata for compression info
      const metadataPath = cache._getMetadataPath(cache._getFilePath('large-data'));
      const metadataContent = await readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      expect(metadata.compressed).toBe(true);
      expect(metadata.compressionRatio).toBeLessThan(1.0);
    });

    it('should not compress small data', async () => {
      const smallData = { id: 1 };
      
      await cache.set('small-data', smallData);
      const result = await cache.get('small-data');
      
      expect(result).toEqual(smallData);
      
      // Check metadata for compression info
      const metadataPath = cache._getMetadataPath(cache._getFilePath('small-data'));
      const metadataContent = await readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      expect(metadata.compressed).toBe(false);
    });

    it('should handle compression disabled', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableCompression: false,
        enableMetadata: true
      });
      
      const largeData = { message: 'x'.repeat(200) };
      
      await cache.set('no-compression', largeData);
      const result = await cache.get('no-compression');
      
      expect(result).toEqual(largeData);
      
      const metadataPath = cache._getMetadataPath(cache._getFilePath('no-compression'));
      const metadataContent = await readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      expect(metadata.compressed).toBe(false);
    });
  });

  describe('TTL and Expiration', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
    });

    it('should expire data based on TTL with metadata', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        ttl: 100, // 100ms
        enableMetadata: true,
        enableStats: true
      });
      
      await cache.set('expire-test', { data: 'test' });
      
      // Data should be available immediately
      let result = await cache.get('expire-test');
      expect(result).toEqual({ data: 'test' });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Data should be expired and return null
      result = await cache.get('expire-test');
      expect(result).toBeNull();
      expect(cache.stats.misses).toBe(1);
    });

    it('should expire data based on file mtime when metadata disabled', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        ttl: 100, // 100ms
        enableMetadata: false,
        enableStats: true
      });
      
      await cache.set('expire-test-mtime', { data: 'test' });
      
      // Data should be available immediately
      let result = await cache.get('expire-test-mtime');
      expect(result).toEqual({ data: 'test' });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Data should be expired
      result = await cache.get('expire-test-mtime');
      expect(result).toBeNull();
    });

    it('should not expire data when TTL is 0', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        ttl: 0, // No expiration
        enableMetadata: true
      });
      
      await cache.set('no-expire', { data: 'persistent' });
      
      // Wait longer than normal TTL would be
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await cache.get('no-expire');
      expect(result).toEqual({ data: 'persistent' });
    });
  });

  describe('File Operations and Error Handling', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      cache = new FilesystemCache({
        directory: testDir,
        enableStats: true,
        maxFileSize: 1000
      });
    });

    it('should handle file size limit', async () => {
      const largeData = { message: 'x'.repeat(2000) }; // Exceeds 1000 byte limit
      
      await expect(cache.set('large-file', largeData)).rejects.toThrow('Cache data exceeds maximum file size');
      expect(cache.stats.errors).toBe(1);
    });

    it('should sanitize keys for filesystem', async () => {
      const invalidKey = 'user<>:"/\\|?*123';
      const testData = { id: 123 };
      
      await cache.set(invalidKey, testData);
      const result = await cache.get(invalidKey);
      
      expect(result).toEqual(testData);
    });

    it('should handle corrupted cache files', async () => {
      const testKey = 'corrupted-test';
      const filePath = cache._getFilePath(testKey);
      
      // Create corrupted file
      await writeFile(filePath, 'invalid json content');
      
      // Should return null and delete corrupted file
      const result = await cache.get(testKey);
      expect(result).toBeNull();
      
      // File should be deleted
      const fileExists = await fs.promises.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(false);
    });

    it('should handle missing metadata file gracefully', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableMetadata: true,
        ttl: 1000
      });
      
      const testData = { data: 'test' };
      await cache.set('test-key', testData);
      
      // Delete metadata file
      const metadataPath = cache._getMetadataPath(cache._getFilePath('test-key'));
      await unlink(metadataPath);
      
      // Should still be able to get data (falls back to file mtime)
      const result = await cache.get('test-key');
      expect(result).toEqual(testData);
    });
  });

  describe('Backup Functionality', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      cache = new FilesystemCache({
        directory: testDir,
        enableBackup: true,
        backupSuffix: '.backup'
      });
    });

    it('should create backup when overwriting existing file', async () => {
      const originalData = { version: 1 };
      const updatedData = { version: 2 };
      
      await cache.set('backup-test', originalData);
      await cache.set('backup-test', updatedData);
      
      // Check that backup file exists
      const filePath = cache._getFilePath('backup-test');
      const backupPath = filePath + '.backup';
      const backupExists = await fs.promises.access(backupPath).then(() => true).catch(() => false);
      
      expect(backupExists).toBe(true);
      
      // Verify current data is updated
      const result = await cache.get('backup-test');
      expect(result).toEqual(updatedData);
    });
  });

  describe('File Locking', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      cache = new FilesystemCache({
        directory: testDir,
        enableLocking: true,
        lockTimeout: 1000
      });
    });

    it('should handle concurrent access with locking', async () => {
      const testData1 = { data: 'first' };
      const testData2 = { data: 'second' };
      
      // Start two concurrent operations
      const promise1 = cache.set('concurrent-test', testData1);
      const promise2 = cache.set('concurrent-test', testData2);
      
      await Promise.all([promise1, promise2]);
      
      // One of them should succeed
      const result = await cache.get('concurrent-test');
      expect(result).toBeTruthy();
    });

    it('should timeout on lock acquisition', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableLocking: true,
        lockTimeout: 100 // Very short timeout for testing
      });
      
      // Manually acquire lock
      const filePath = cache._getFilePath('timeout-test');
      cache.locks.set(filePath, Date.now());
      
      // Should timeout
      await expect(cache.set('timeout-test', { data: 'test' })).rejects.toThrow('Lock timeout');
    });
  });

  describe('Journal Functionality', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      cache = new FilesystemCache({
        directory: testDir,
        enableJournal: true,
        journalFile: 'test.journal'
      });
    });

    it('should log operations to journal', async () => {
      await cache.set('journal-test', { data: 'test' });
      await cache.get('journal-test');
      await cache.del('journal-test');
      
      const journalPath = path.join(testDir, 'test.journal');
      const journalExists = await fs.promises.access(journalPath).then(() => true).catch(() => false);
      
      expect(journalExists).toBe(true);
      
      const journalContent = await readFile(journalPath, 'utf8');
      const lines = journalContent.trim().split('\n');
      
      expect(lines.length).toBeGreaterThanOrEqual(2); // set and delete operations
      
      const setEntry = JSON.parse(lines[0]);
      expect(setEntry.operation).toBe('set');
      expect(setEntry.key).toBe('journal-test');
    });
  });

  describe('Cleanup Functionality', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      cache = new FilesystemCache({
        directory: testDir,
        ttl: 100,
        enableCleanup: true,
        cleanupInterval: 50, // Fast cleanup for testing
        enableMetadata: true
      });
    });

    it('should automatically clean up expired files', async () => {
      await cache.set('cleanup-test-1', { data: 'test1' });
      await cache.set('cleanup-test-2', { data: 'test2' });
      
      // Wait for expiration and cleanup
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const size = await cache.size();
      expect(size).toBe(0);
    });

    it('should clean up on manual cleanup call', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        ttl: 50,
        enableCleanup: false, // Disable automatic cleanup
        enableMetadata: true
      });
      
      await cache.set('manual-cleanup-test', { data: 'test' });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Manual cleanup
      await cache._cleanup();
      
      const size = await cache.size();
      expect(size).toBe(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      cache = new FilesystemCache({
        directory: testDir,
        enableStats: true
      });
    });

    it('should track cache statistics', async () => {
      await cache.set('stats-test-1', { data: 'test1' });
      await cache.set('stats-test-2', { data: 'test2' });
      await cache.get('stats-test-1');
      await cache.get('non-existent');
      await cache.del('stats-test-2');
      await cache.clear();
      
      const stats = cache.getStats();
      
      expect(stats.sets).toBe(2);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.deletes).toBe(1);
      expect(stats.clears).toBe(1);
      expect(stats.directory).toBe(cache.directory);
      expect(stats.ttl).toBe(cache.ttl);
      expect(stats.compression).toBe(cache.enableCompression);
    });
  });

  describe('Helper Methods', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
      cache = new FilesystemCache({ directory: testDir });
    });

    it('should check file existence correctly', async () => {
      const testFile = path.join(testDir, 'test-file.txt');
      
      // File doesn't exist
      let exists = await cache._fileExists(testFile);
      expect(exists).toBe(false);
      
      // Create file
      await writeFile(testFile, 'test content');
      
      // File exists
      exists = await cache._fileExists(testFile);
      expect(exists).toBe(true);
    });

    it('should copy files for backup', async () => {
      const sourceFile = path.join(testDir, 'source.txt');
      const destFile = path.join(testDir, 'dest.txt');
      
      await writeFile(sourceFile, 'test content');
      
      await cache._copyFile(sourceFile, destFile);
      
      const destExists = await fs.promises.access(destFile).then(() => true).catch(() => false);
      expect(destExists).toBe(true);
      
      const destContent = await readFile(destFile, 'utf8');
      expect(destContent).toBe('test content');
    });

    it('should handle copy file errors gracefully', async () => {
      const nonExistentSource = path.join(testDir, 'non-existent.txt');
      const destFile = path.join(testDir, 'dest.txt');
      
      // Should not throw, just warn
      await cache._copyFile(nonExistentSource, destFile);
      
      const destExists = await fs.promises.access(destFile).then(() => true).catch(() => false);
      expect(destExists).toBe(false);
    });
  });

  describe('Destroy and Cleanup', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
    });

    it('should clean up timer on destroy', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableCleanup: true,
        cleanupInterval: 1000
      });
      
      expect(cache.cleanupTimer).toBeTruthy();
      
      cache.destroy();
      
      expect(cache.cleanupTimer).toBeNull();
    });

    it('should handle destroy when no timer exists', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableCleanup: false
      });
      
      expect(cache.cleanupTimer).toBeNull();
      
      // Should not throw
      cache.destroy();
      
      expect(cache.cleanupTimer).toBeNull();
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
    });

    it('should handle directory creation errors', async () => {
      // Try to create cache in a non-existent parent directory with createDirectory false
      const invalidDir = path.join(testDir, 'non-existent', 'cache');
      
      expect(() => {
        cache = new FilesystemCache({
          directory: invalidDir,
          createDirectory: false
        });
      }).not.toThrow(); // Constructor should not throw immediately
    });

    it('should handle keys() error gracefully', async () => {
      cache = new FilesystemCache({ directory: testDir });
      
      // Remove directory to cause error
      await fs.promises.rm(testDir, { recursive: true });
      
      const keys = await cache.keys();
      expect(keys).toEqual([]);
    });

    it('should handle decompression errors gracefully', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableCompression: true,
        enableMetadata: false
      });
      
      const filePath = cache._getFilePath('decompress-error');
      
      // Create a file that looks like base64 but isn't valid gzip
      await writeFile(filePath, 'SGVsbG8gV29ybGQ='); // "Hello World" in base64, not gzip
      
      // Should return null instead of throwing
      const result = await cache.get('decompress-error');
      expect(result).toBeNull();
    });

    it('should handle journal write errors gracefully', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableJournal: true,
        journalFile: 'test.journal'
      });
      
      // Create journal as directory to cause write error
      const journalPath = path.join(testDir, 'test.journal');
      await mkdir(journalPath);
      
      // Should not throw, just warn
      await cache.set('journal-error-test', { data: 'test' });
      
      const result = await cache.get('journal-error-test');
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle metadata write/read errors gracefully', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableMetadata: true,
        ttl: 1000
      });
      
      await cache.set('metadata-test', { data: 'test' });
      
      // Corrupt metadata file
      const metadataPath = cache._getMetadataPath(cache._getFilePath('metadata-test'));
      await writeFile(metadataPath, 'invalid json');
      
      // Should fall back to file mtime for TTL check
      const result = await cache.get('metadata-test');
      expect(result).toEqual({ data: 'test' });
    });

    it('should handle invalid metadata during cleanup', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        ttl: 50,
        enableCleanup: false,
        enableMetadata: true
      });
      
      await cache.set('cleanup-meta-error', { data: 'test' });
      
      // Corrupt metadata
      const metadataPath = cache._getMetadataPath(cache._getFilePath('cleanup-meta-error'));
      await writeFile(metadataPath, 'invalid json');
      
      // Should not throw during cleanup
      await cache._cleanup();
    });
  });

  describe('Complex Scenarios', () => {
    beforeEach(async () => {
      await mkdir(testDir, { recursive: true });
    });

    it('should handle mixed operations with all features enabled', async () => {
      cache = new FilesystemCache({
        directory: testDir,
        enableCompression: true,
        enableMetadata: true,
        enableBackup: true,
        enableLocking: true,
        enableJournal: true,
        enableStats: true,
        ttl: 500,
        compressionThreshold: 50
      });
      
      // Large data that will be compressed
      const largeData = { message: 'x'.repeat(100), id: 1 };
      // Small data that won't be compressed
      const smallData = { id: 2 };
      
      await cache.set('large-item', largeData);
      await cache.set('small-item', smallData);
      
      // Update large item (should create backup)
      const updatedLargeData = { message: 'y'.repeat(100), id: 1, updated: true };
      await cache.set('large-item', updatedLargeData);
      
      // Verify data
      const result1 = await cache.get('large-item');
      const result2 = await cache.get('small-item');
      
      expect(result1).toEqual(updatedLargeData);
      expect(result2).toEqual(smallData);
      
      // Check backup exists
      const backupPath = cache._getFilePath('large-item') + cache.backupSuffix;
      const backupExists = await fs.promises.access(backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
      
      // Check journal
      const journalPath = cache.journalFile;
      const journalExists = await fs.promises.access(journalPath).then(() => true).catch(() => false);
      expect(journalExists).toBe(true);
      
      // Check stats
      const stats = cache.getStats();
      expect(stats.sets).toBe(3); // 2 initial + 1 update
      expect(stats.hits).toBe(2);
    });
  });
});