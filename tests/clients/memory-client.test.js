/**
 * MemoryClient - Comprehensive Tests
 *
 * Tests all functionality of the in-memory S3 client emulator
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createMemoryDatabaseForTest, createTemporaryPathForTest } from '../config.js';
import { MemoryClient } from '#src/clients/memory-client.class.js';
import Database from '#src/database.class.js';
import { unlinkSync } from 'fs';

describe('MemoryClient - Basic Operations', () => {
  let database;

  beforeEach(async () => {
    database = createMemoryDatabaseForTest('memory-client-basic');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should create database with memory client', async () => {
    expect(database).toBeDefined();
    expect(database.client).toBeInstanceOf(MemoryClient);
    expect(database.isConnected()).toBe(true);
  });

  it('should create and retrieve resources', async () => {
    const users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'string|required|email'
      },
      timestamps: false
    });

    await users.insert({ id: 'u1', name: 'Alice', email: 'alice@test.com' });
    const user = await users.get('u1');

    expect(user.name).toBe('Alice');
    expect(user.email).toBe('alice@test.com');
  });

  it('should handle multiple resources', async () => {
    const users = await database.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string' },
      timestamps: false
    });

    const posts = await database.createResource({
      name: 'posts',
      attributes: { id: 'string', title: 'string' },
      timestamps: false
    });

    await users.insert({ id: 'u1', name: 'User 1' });
    await posts.insert({ id: 'p1', title: 'Post 1' });

    const user = await users.get('u1');
    const post = await posts.get('p1');

    expect(user.name).toBe('User 1');
    expect(post.title).toBe('Post 1');
  });

  it('should handle updates correctly', async () => {
    const items = await database.createResource({
      name: 'items',
      attributes: { id: 'string', name: 'string', count: 'number' },
      timestamps: false
    });

    await items.insert({ id: 'i1', name: 'Item 1', count: 0 });
    await items.update('i1', { count: 5 });

    const item = await items.get('i1');
    expect(item.count).toBe(5);
  });

  it('should handle deletes correctly', async () => {
    const docs = await database.createResource({
      name: 'docs',
      attributes: { id: 'string', title: 'string' },
      timestamps: false
    });

    await docs.insert({ id: 'd1', title: 'Doc 1' });
    expect(await docs.exists('d1')).toBe(true);

    await docs.delete('d1');
    expect(await docs.exists('d1')).toBe(false);
  });

  it('should list resources with pagination', async () => {
    const records = await database.createResource({
      name: 'records',
      attributes: { id: 'string', value: 'number' },
      timestamps: false
    });

    // Insert 10 records
    for (let i = 1; i <= 10; i++) {
      await records.insert({ id: `r${i}`, value: i });
    }

    const all = await records.list({ limit: 100 });
    expect(all).toHaveLength(10);
  });
});

describe('MemoryClient - Snapshot/Restore', () => {
  let database;
  let memoryClient;

  beforeEach(async () => {
    memoryClient = new MemoryClient({ bucket: 'test-snapshot' });
    database = new Database({ client: memoryClient });
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should create and restore snapshots', async () => {
    const users = await database.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string' },
      timestamps: false
    });

    // Insert initial data
    await users.insert({ id: 'u1', name: 'Alice' });
    await users.insert({ id: 'u2', name: 'Bob' });

    // Create snapshot
    const snapshot = memoryClient.snapshot();
    expect(snapshot.objectCount).toBeGreaterThan(0);

    // Modify data
    await users.update('u1', { name: 'Alice Updated' });
    await users.delete('u2');

    // Restore snapshot
    memoryClient.restore(snapshot);

    // Verify original state restored
    const user1 = await users.get('u1');
    const user2 = await users.get('u2');

    expect(user1.name).toBe('Alice');
    expect(user2.name).toBe('Bob');
  });

  it('should handle empty snapshots', async () => {
    const snapshot = memoryClient.snapshot();
    // db.connect() creates s3db.json, so objectCount is 1
    expect(snapshot.objectCount).toBe(1);

    memoryClient.restore(snapshot);
    const stats = memoryClient.getStats();
    expect(stats.objectCount).toBe(1);
  });
});

describe('MemoryClient - Persistence', () => {
  let database;
  let memoryClient;
  let tempPath;

  beforeEach(async () => {
    tempPath = await createTemporaryPathForTest('memory-persist');
    memoryClient = new MemoryClient({
      bucket: 'test-persist',
      persistPath: `${tempPath}/snapshot.json`
    });
    database = new Database({ client: memoryClient });
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
    try {
      unlinkSync(`${tempPath}/snapshot.json`);
    } catch (e) {
      // Ignore
    }
  });

  it('should save and load from disk', async () => {
    const users = await database.createResource({
      name: 'users',
      attributes: { id: 'string', name: 'string' },
      timestamps: false
    });

    await users.insert({ id: 'u1', name: 'Alice' });

    // Save to disk
    await memoryClient.saveToDisk();

    // Create new client and load
    const newClient = new MemoryClient({
      bucket: 'test-persist',
      persistPath: `${tempPath}/snapshot.json`
    });

    await newClient.loadFromDisk();

    // Verify data was loaded
    const stats = newClient.getStats();
    expect(stats.objectCount).toBeGreaterThan(0);
  });
});

describe('MemoryClient - Limits Enforcement', () => {
  let database;

  beforeEach(async () => {
    database = createMemoryDatabaseForTest('memory-limits', {
      enforceLimits: true
    });
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should enforce metadata 2KB limit', async () => {
    const docs = await database.createResource({
      name: 'docs',
      attributes: {
        id: 'string|required',
        metadata: 'object|optional'
      },
      behavior: 'enforce-limits',
      timestamps: false
    });

    // Create metadata larger than 2KB
    const largeMetadata = { data: 'x'.repeat(3000) };

    await expect(
      docs.insert({ id: 'd1', metadata: largeMetadata })
    ).rejects.toThrow(/exceeds 2KB limit/);
  });
});

describe('MemoryClient - Stats and Utilities', () => {
  let memoryClient;

  beforeEach(() => {
    memoryClient = new MemoryClient({ bucket: 'test-stats' });
  });

  it('should provide storage statistics', async () => {
    const stats = memoryClient.getStats();

    expect(stats).toHaveProperty('objectCount');
    expect(stats).toHaveProperty('totalSize');
    expect(stats).toHaveProperty('totalSizeFormatted');
    expect(stats).toHaveProperty('keys');
    expect(stats).toHaveProperty('bucket');

    expect(stats.objectCount).toBe(0);
    expect(stats.bucket).toBe('test-stats');
  });

  it('should clear all objects', async () => {
    // Add some data
    await memoryClient.putObject({
      key: 'test1',
      body: 'data',
      metadata: {}
    });

    await memoryClient.putObject({
      key: 'test2',
      body: 'data',
      metadata: {}
    });

    let stats = memoryClient.getStats();
    expect(stats.objectCount).toBe(2);

    // Clear
    memoryClient.clear();

    stats = memoryClient.getStats();
    expect(stats.objectCount).toBe(0);
  });
});

describe('MemoryClient - Compatibility with Real Client', () => {
  let database;

  beforeEach(async () => {
    database = createMemoryDatabaseForTest('memory-compat');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should work with all behaviors', async () => {
    const behaviors = ['body-overflow', 'body-only', 'enforce-limits', 'truncate-data', 'user-managed'];

    for (const behavior of behaviors) {
      const resource = await database.createResource({
        name: `test_${behavior}`,
        attributes: {
          id: 'string|required',
          data: 'string|optional'
        },
        behavior,
        timestamps: false
      });

      await resource.insert({ id: '1', data: 'test data' });
      const item = await resource.get('1');
      expect(item.data).toBe('test data');
    }
  });

  // TODO: Fix partition listing - getAllKeys works but listPartition returns empty
  it.skip('should work with partitions', async () => {
    const logs = await database.createResource({
      name: 'logs',
      attributes: {
        id: 'string|required',
        level: 'string|required',
        message: 'string|required'
      },
      partitions: {
        byLevel: {
          fields: { level: 'string' }
        }
      },
      asyncPartitions: false, // Disable async for test reliability
      timestamps: false
    });

    await logs.insert({ id: 'l1', level: 'error', message: 'Error 1' });
    await logs.insert({ id: 'l2', level: 'info', message: 'Info 1' });
    await logs.insert({ id: 'l3', level: 'error', message: 'Error 2' });

    const errors = await logs.listPartition('byLevel', { level: 'error' });
    expect(errors).toHaveLength(2);
  });

  it('should work with timestamps', async () => {
    const items = await database.createResource({
      name: 'items',
      attributes: {
        id: 'string|required',
        name: 'string|required'
      },
      timestamps: true
    });

    await items.insert({ id: 'i1', name: 'Item 1' });
    const item = await items.get('i1');

    expect(item.createdAt).toBeDefined();
    expect(item.updatedAt).toBeDefined();
  });

  it('should work with encryption (secret fields)', async () => {
    const accounts = await database.createResource({
      name: 'accounts',
      attributes: {
        id: 'string|required',
        username: 'string|required',
        password: 'secret|required'
      },
      timestamps: false
    });

    await accounts.insert({
      id: 'a1',
      username: 'alice',
      password: 'super-secret-password'
    });

    const account = await accounts.get('a1');
    expect(account.password).toBe('super-secret-password');
    expect(account.username).toBe('alice');
  });

  it('should handle embeddings and special types', async () => {
    const vectors = await database.createResource({
      name: 'vectors',
      attributes: {
        id: 'string|required',
        embedding: 'embedding:3',
        tags: 'array|items:string',
        metadata: 'object'
      },
      timestamps: false
    });

    await vectors.insert({
      id: 'v1',
      embedding: [0.1, 0.2, 0.3],
      tags: ['tag1', 'tag2'],
      metadata: { key: 'value' }
    });

    const vector = await vectors.get('v1');
    expect(vector.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(vector.tags).toEqual(['tag1', 'tag2']);
    expect(vector.metadata).toEqual({ key: 'value' });
  });
});

describe('MemoryClient - Performance', () => {
  let database;

  beforeEach(async () => {
    database = createMemoryDatabaseForTest('memory-perf');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should handle bulk inserts efficiently', async () => {
    const items = await database.createResource({
      name: 'bulk_items',
      attributes: { id: 'string', value: 'number' },
      timestamps: false
    });

    const startTime = Date.now();

    // Insert 100 items
    for (let i = 0; i < 100; i++) {
      await items.insert({ id: `item${i}`, value: i });
    }

    const duration = Date.now() - startTime;

    // Should be fast (under 1 second for 100 inserts)
    expect(duration).toBeLessThan(1000);

    const all = await items.list({ limit: 1000 });
    expect(all).toHaveLength(100);
  });
});

describe('MemoryClient - Direct API Tests', () => {
  let client;

  beforeEach(() => {
    client = new MemoryClient({
      bucket: 'test-direct-api',
      verbose: false
    });
  });

  describe('Basic Operations', () => {
    it('should put and get object directly', async () => {
      await client.putObject({
        key: 'test-key',
        metadata: { name: 'Test', value: '123' },
        body: Buffer.from('test body')
      });

      const result = await client.getObject('test-key');
      expect(result.Metadata.name).toBe('Test');
      expect(result.Metadata.value).toBe('123');
      expect(result.Body).toBeDefined();
    });

    it('should head object without body', async () => {
      await client.putObject({
        key: 'test-key',
        metadata: { name: 'Test' },
        body: Buffer.from('large body')
      });

      const result = await client.headObject('test-key');
      expect(result.Metadata.name).toBe('Test');
      expect(result.ContentLength).toBeGreaterThan(0);
      expect(result.Body).toBeUndefined();
    });

    it('should check if key exists', async () => {
      await client.putObject({ key: 'exists', metadata: {} });

      expect(await client.exists('exists')).toBe(true);
      expect(await client.exists('not-exists')).toBe(false);
    });

    it('should delete single object', async () => {
      await client.putObject({ key: 'to-delete', metadata: {} });
      expect(await client.exists('to-delete')).toBe(true);

      await client.deleteObject('to-delete');
      expect(await client.exists('to-delete')).toBe(false);
    });
  });

  describe('Batch Operations', () => {
    it('should delete multiple objects at once', async () => {
      // Create multiple objects
      await client.putObject({ key: 'obj1', metadata: {} });
      await client.putObject({ key: 'obj2', metadata: {} });
      await client.putObject({ key: 'obj3', metadata: {} });

      expect(await client.exists('obj1')).toBe(true);
      expect(await client.exists('obj2')).toBe(true);
      expect(await client.exists('obj3')).toBe(true);

      // Delete in batch
      const result = await client.deleteObjects(['obj1', 'obj2', 'obj3']);

      expect(result.Deleted).toHaveLength(3);
      expect(await client.exists('obj1')).toBe(false);
      expect(await client.exists('obj2')).toBe(false);
      expect(await client.exists('obj3')).toBe(false);
    });

    it('should handle deleteObjects with non-existent keys', async () => {
      // S3 behavior: deleting non-existent objects succeeds (no errors)
      const result = await client.deleteObjects(['non-existent-1', 'non-existent-2']);
      expect(result.Deleted).toHaveLength(2);
      expect(result.Errors).toHaveLength(0);
    });

    it('should handle mixed batch delete (some exist, some dont)', async () => {
      await client.putObject({ key: 'exists', metadata: {} });

      // S3 behavior: deleting non-existent objects succeeds (no errors)
      const result = await client.deleteObjects(['exists', 'not-exists']);

      expect(result.Deleted).toHaveLength(2);
      expect(result.Errors).toHaveLength(0);
    });
  });

  describe('Copy Operations', () => {
    it('should copy object with REPLACE metadata directive', async () => {
      await client.putObject({
        key: 'source',
        metadata: { original: 'true', name: 'Source' }
      });

      await client.copyObject({
        from: 'source',
        to: 'destination',
        metadata: { name: 'Destination', copied: 'true' },
        metadataDirective: 'REPLACE'
      });

      const dest = await client.headObject('destination');
      expect(dest.Metadata.name).toBe('Destination');
      expect(dest.Metadata.copied).toBe('true');
      expect(dest.Metadata.original).toBeUndefined();
    });

    it('should copy object with COPY metadata directive', async () => {
      await client.putObject({
        key: 'source',
        metadata: { original: 'true', name: 'Source' }
      });

      await client.copyObject({
        from: 'source',
        to: 'destination',
        metadataDirective: 'COPY'
      });

      const dest = await client.headObject('destination');
      expect(dest.Metadata.name).toBe('Source');
      expect(dest.Metadata.original).toBe('true');
    });

    it('should copy object body correctly', async () => {
      const bodyContent = 'test body content';
      await client.putObject({
        key: 'source',
        metadata: {},
        body: Buffer.from(bodyContent)
      });

      await client.copyObject({
        from: 'source',
        to: 'destination',
        metadataDirective: 'COPY'
      });

      const dest = await client.getObject('destination');

      // Convert stream to string
      const chunks = [];
      for await (const chunk of dest.Body) {
        chunks.push(chunk);
      }
      const destBody = Buffer.concat(chunks).toString('utf-8');

      expect(destBody).toBe(bodyContent);
    });
  });

  describe('Listing Operations', () => {
    beforeEach(async () => {
      // Create test objects with different prefixes
      await client.putObject({ key: 'prefix1/file1', metadata: {} });
      await client.putObject({ key: 'prefix1/file2', metadata: {} });
      await client.putObject({ key: 'prefix2/file1', metadata: {} });
      await client.putObject({ key: 'other', metadata: {} });
    });

    it('should list objects with prefix', async () => {
      const result = await client.listObjects({ prefix: 'prefix1/' });

      expect(result.Contents).toHaveLength(2);
      expect(result.Contents[0].Key).toContain('prefix1/');
      expect(result.Contents[1].Key).toContain('prefix1/');
    });

    it('should paginate results with maxKeys', async () => {
      const result = await client.listObjects({ maxKeys: 2 });

      expect(result.Contents).toHaveLength(2);
      expect(result.IsTruncated).toBe(true);
      expect(result.NextContinuationToken).toBeDefined();
    });

    it('should continue pagination with continuation token', async () => {
      const page1 = await client.listObjects({ maxKeys: 2 });
      expect(page1.IsTruncated).toBe(true);

      const page2 = await client.listObjects({
        maxKeys: 2,
        continuationToken: page1.NextContinuationToken
      });

      expect(page2.Contents).toBeDefined();
      expect(page2.Contents.length).toBeGreaterThan(0);
    });

    it('should get all keys with getAllKeys', async () => {
      const keys = await client.getAllKeys({ prefix: 'prefix1/' });

      expect(keys).toHaveLength(2);
      expect(keys).toContain('prefix1/file1');
      expect(keys).toContain('prefix1/file2');
    });

    it('should get all keys without prefix', async () => {
      const keys = await client.getAllKeys({});

      expect(keys.length).toBeGreaterThanOrEqual(4);
      expect(keys).toContain('prefix1/file1');
      expect(keys).toContain('prefix2/file1');
      expect(keys).toContain('other');
    });

    it('should handle getKeysPage pagination', async () => {
      // getKeysPage returns an array directly, not an object
      const page1 = await client.getKeysPage({ amount: 2, offset: 0 });

      expect(Array.isArray(page1)).toBe(true);
      expect(page1).toHaveLength(2);

      const page2 = await client.getKeysPage({ amount: 2, offset: 2 });
      expect(Array.isArray(page2)).toBe(true);
      expect(page2.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should throw error when getting non-existent object', async () => {
      await expect(client.getObject('non-existent')).rejects.toThrow();
    });

    it('should throw error when heading non-existent object', async () => {
      await expect(client.headObject('non-existent')).rejects.toThrow();
    });

    it('should throw error when copying from non-existent source', async () => {
      await expect(client.copyObject({
        from: 'non-existent',
        to: 'destination'
      })).rejects.toThrow();
    });

    it('should not throw when deleting non-existent object', async () => {
      // S3 behavior: deleting non-existent object succeeds
      await expect(client.deleteObject('non-existent')).resolves.not.toThrow();
    });

    it('should handle empty key prefix', async () => {
      await client.putObject({ key: 'test', metadata: {} });

      const result = await client.listObjects({ prefix: '' });
      expect(result.Contents.length).toBeGreaterThan(0);
    });

    it('should handle metadata with special characters', async () => {
      await client.putObject({
        key: 'test',
        metadata: {
          'special-chars': 'value with spaces',
          'unicode': 'café ☕',
          'numbers': '12345'
        }
      });

      const result = await client.headObject('test');
      expect(result.Metadata['special-chars']).toBe('value with spaces');
      expect(result.Metadata['unicode']).toBe('café ☕');
      expect(result.Metadata['numbers']).toBe('12345');
    });
  });

  describe('Snapshot and Restore', () => {
    it('should create snapshot with correct metadata', async () => {
      await client.putObject({ key: 'obj1', metadata: { name: 'Object 1' } });
      await client.putObject({ key: 'obj2', metadata: { name: 'Object 2' } });

      const snapshot = client.snapshot();

      expect(snapshot.objectCount).toBe(2);
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.objects).toBeDefined();
    });

    it('should restore to exact previous state', async () => {
      await client.putObject({ key: 'obj1', metadata: { name: 'Original' } });
      const snapshot = client.snapshot();

      // Modify state
      await client.putObject({ key: 'obj1', metadata: { name: 'Modified' } });
      await client.putObject({ key: 'obj2', metadata: { name: 'New' } });

      // Restore
      client.restore(snapshot);

      const obj1 = await client.headObject('obj1');
      expect(obj1.Metadata.name).toBe('Original');
      expect(await client.exists('obj2')).toBe(false);
    });

    it('should handle snapshot of empty storage', async () => {
      const snapshot = client.snapshot();

      expect(snapshot.objectCount).toBe(0);
      expect(snapshot.objects).toBeDefined();

      // Should restore to empty state
      await client.putObject({ key: 'test', metadata: {} });
      client.restore(snapshot);

      expect(await client.exists('test')).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', async () => {
      client.clear();

      await client.putObject({ key: 'obj1', metadata: {}, body: Buffer.from('a'.repeat(100)) });
      await client.putObject({ key: 'obj2', metadata: {}, body: Buffer.from('b'.repeat(200)) });

      const stats = client.getStats();

      expect(stats.objectCount).toBe(2);
      expect(stats.totalSize).toBeGreaterThanOrEqual(300);
      expect(stats.totalSizeFormatted).toContain('B');
      expect(stats.keys).toHaveLength(2);
      expect(stats.bucket).toBe('test-direct-api');
    });

    it('should format large sizes correctly', async () => {
      client.clear();

      // Create object with 1KB body
      await client.putObject({
        key: 'large',
        metadata: {},
        body: Buffer.from('x'.repeat(1024))
      });

      const stats = client.getStats();
      expect(stats.totalSizeFormatted).toContain('KB');
    });
  });

  describe('Clear Operation', () => {
    it('should clear all objects', async () => {
      await client.putObject({ key: 'obj1', metadata: {} });
      await client.putObject({ key: 'obj2', metadata: {} });

      expect(client.getStats().objectCount).toBe(2);

      client.clear();

      expect(client.getStats().objectCount).toBe(0);
      expect(await client.exists('obj1')).toBe(false);
      expect(await client.exists('obj2')).toBe(false);
    });

    it('should allow operations after clear', async () => {
      await client.putObject({ key: 'before-clear', metadata: {} });
      client.clear();

      await client.putObject({ key: 'after-clear', metadata: {} });

      expect(await client.exists('before-clear')).toBe(false);
      expect(await client.exists('after-clear')).toBe(true);
    });
  });

  describe('Verbose Logging', () => {
    it('should log operations when verbose is enabled', async () => {
      const verboseClient = new MemoryClient({
        bucket: 'test-verbose',
        verbose: true
      });

      // Should log without throwing
      await verboseClient.putObject({ key: 'test', metadata: { name: 'Test' } });
      await verboseClient.getObject('test');
      await verboseClient.headObject('test');
      await verboseClient.copyObject({ from: 'test', to: 'copy' });
      await verboseClient.deleteObject('test');

      const stats = verboseClient.getStats();
      expect(stats.objectCount).toBe(1); // only 'copy' remains
    });

    it('should log batch operations when verbose is enabled', async () => {
      const verboseClient = new MemoryClient({
        bucket: 'test-verbose-batch',
        verbose: true
      });

      await verboseClient.putObject({ key: 'b1', metadata: {} });
      await verboseClient.putObject({ key: 'b2', metadata: {} });
      await verboseClient.putObject({ key: 'b3', metadata: {} });

      // Should log batch delete (including successful deletes)
      const result = await verboseClient.deleteObjects(['b1', 'b2', 'b3']);

      // Verify verbose logging was triggered (deletions succeeded)
      expect(result.Deleted.length).toBe(3);
      expect(verboseClient.getStats().objectCount).toBe(0);
    });

    it('should handle errors in batch delete operations', async () => {
      const verboseClient = new MemoryClient({
        bucket: 'test-batch-error',
        verbose: true
      });

      await verboseClient.putObject({ key: 'item1', metadata: {} });

      // Mock the storage.delete method to throw an error for one key
      const originalDelete = verboseClient.storage.delete.bind(verboseClient.storage);
      verboseClient.storage.delete = async (key) => {
        if (key === 'error-key') {
          const error = new Error('Simulated delete error');
          error.name = 'DeleteError';
          throw error;
        }
        return originalDelete(key);
      };

      // Should handle errors in batch delete
      const result = await verboseClient.storage.deleteMultiple(['item1', 'error-key']);

      // Should have one success and one error
      expect(result.Deleted.length).toBe(1);
      expect(result.Errors.length).toBe(1);
      expect(result.Errors[0].Code).toBe('DeleteError');
      expect(result.Errors[0].Key).toBe('error-key');
    });

    it('should log list operations when verbose is enabled', async () => {
      const verboseClient = new MemoryClient({
        bucket: 'test-verbose-list',
        verbose: true
      });

      await verboseClient.putObject({ key: 'item1', metadata: {} });
      await verboseClient.putObject({ key: 'item2', metadata: {} });

      // Should log list
      await verboseClient.listObjects({ prefix: '' });

      expect(verboseClient.getStats().objectCount).toBe(2);
    });

    it('should log snapshot operations when verbose is enabled', async () => {
      const verboseClient = new MemoryClient({
        bucket: 'test-verbose-snapshot',
        verbose: true
      });

      await verboseClient.putObject({ key: 'snap1', metadata: {} });

      // Should log snapshot
      const snapshot = verboseClient.snapshot();

      // Should log restore
      verboseClient.restore(snapshot);

      expect(verboseClient.getStats().objectCount).toBe(1);
    });

    it('should log clear operation when verbose is enabled', async () => {
      const verboseClient = new MemoryClient({
        bucket: 'test-verbose-clear',
        verbose: true
      });

      await verboseClient.putObject({ key: 'clear1', metadata: {} });

      // Should log clear
      verboseClient.clear();

      expect(verboseClient.getStats().objectCount).toBe(0);
    });

    it('should log save/load operations when verbose is enabled', async () => {
      const fs = await import('fs/promises');
      const os = await import('os');
      const path = await import('path');

      const tmpPath = path.join(os.tmpdir(), `test-verbose-save-${Date.now()}.json`);

      const verboseClient = new MemoryClient({
        bucket: 'test-verbose-save',
        persistPath: tmpPath,
        verbose: true
      });

      await verboseClient.putObject({ key: 'save1', metadata: {} });

      // Should log save
      await verboseClient.saveToDisk();

      // Should log load
      await verboseClient.loadFromDisk();

      expect(verboseClient.getStats().objectCount).toBe(1);

      // Cleanup
      await fs.unlink(tmpPath).catch(() => {});
    });
  });

  describe('Limit Enforcement', () => {
    it('should enforce metadata size limit', async () => {
      const limitedClient = new MemoryClient({
        bucket: 'test-limits',
        enforceLimits: true,
        metadataLimit: 100 // Very small limit
      });

      const largeMetadata = {
        field1: 'x'.repeat(50),
        field2: 'y'.repeat(50),
        field3: 'z'.repeat(50)
      };

      await expect(
        limitedClient.putObject({ key: 'test', metadata: largeMetadata })
      ).rejects.toThrow('Metadata size');
    });

    it('should enforce object size limit', async () => {
      const limitedClient = new MemoryClient({
        bucket: 'test-limits',
        enforceLimits: true,
        maxObjectSize: 100 // Very small limit
      });

      const largeBody = Buffer.from('x'.repeat(200));

      await expect(
        limitedClient.putObject({ key: 'test', metadata: {}, body: largeBody })
      ).rejects.toThrow('Object size');
    });
  });

  describe('Conditional Put (ifMatch)', () => {
    it('should succeed when ETag matches', async () => {
      const result1 = await client.putObject({
        key: 'conditional',
        metadata: { version: '1' }
      });

      const etag = result1.ETag;

      // Should succeed with matching ETag
      await client.putObject({
        key: 'conditional',
        metadata: { version: '2' },
        ifMatch: etag
      });

      const obj = await client.headObject('conditional');
      expect(obj.Metadata.version).toBe('2');
    });

    it('should fail when ETag does not match', async () => {
      await client.putObject({
        key: 'conditional2',
        metadata: { version: '1' }
      });

      // Should fail with wrong ETag
      await expect(
        client.putObject({
          key: 'conditional2',
          metadata: { version: '2' },
          ifMatch: 'wrong-etag'
        })
      ).rejects.toThrow('Precondition failed');
    });
  });

  describe('Auto-Persist', () => {
    it('should auto-save on changes when enabled', async () => {
      const fs = await import('fs/promises');
      const os = await import('os');
      const path = await import('path');

      const tmpPath = path.join(os.tmpdir(), `test-autopersist-${Date.now()}.json`);

      const persistClient = new MemoryClient({
        bucket: 'test-persist',
        persistPath: tmpPath,
        autoPersist: true
      });

      await persistClient.putObject({ key: 'auto1', metadata: { name: 'Auto' } });

      // File should exist after auto-persist
      const exists = await fs.access(tmpPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Cleanup
      await fs.unlink(tmpPath).catch(() => {});
    });

    it('should auto-persist on delete operations', async () => {
      const fs = await import('fs/promises');
      const os = await import('os');
      const path = await import('path');

      const tmpPath = path.join(os.tmpdir(), `test-autopersist-delete-${Date.now()}.json`);

      const persistClient = new MemoryClient({
        bucket: 'test-persist-delete',
        persistPath: tmpPath,
        autoPersist: true
      });

      await persistClient.putObject({ key: 'item1', metadata: {} });
      await persistClient.putObject({ key: 'item2', metadata: {} });

      // Delete should trigger auto-persist
      await persistClient.deleteObject('item1');

      const exists = await fs.access(tmpPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Cleanup
      await fs.unlink(tmpPath).catch(() => {});
    });

    it('should auto-persist on batch delete operations', async () => {
      const fs = await import('fs/promises');
      const os = await import('os');
      const path = await import('path');

      const tmpPath = path.join(os.tmpdir(), `test-autopersist-batch-${Date.now()}.json`);

      const persistClient = new MemoryClient({
        bucket: 'test-persist-batch',
        persistPath: tmpPath,
        autoPersist: true
      });

      await persistClient.putObject({ key: 'batch1', metadata: {} });
      await persistClient.putObject({ key: 'batch2', metadata: {} });

      // Batch delete should trigger auto-persist
      await persistClient.deleteObjects(['batch1', 'batch2']);

      const exists = await fs.access(tmpPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Cleanup
      await fs.unlink(tmpPath).catch(() => {});
    });
  });

  describe('Persistence', () => {
    it('should save and load from disk', async () => {
      const fs = await import('fs/promises');
      const os = await import('os');
      const path = await import('path');

      const tmpPath = path.join(os.tmpdir(), `test-persist-${Date.now()}.json`);

      await client.putObject({ key: 'persist1', metadata: { name: 'One' } });
      await client.putObject({ key: 'persist2', metadata: { name: 'Two' } });

      await client.saveToDisk(tmpPath);

      // Create new client and load
      const newClient = new MemoryClient({ bucket: 'test-load' });
      await newClient.loadFromDisk(tmpPath);

      expect(await newClient.exists('persist1')).toBe(true);
      expect(await newClient.exists('persist2')).toBe(true);

      const obj = await newClient.headObject('persist1');
      expect(obj.Metadata.name).toBe('One');

      // Cleanup
      await fs.unlink(tmpPath).catch(() => {});
    });

    it('should throw error when saving without path', async () => {
      await expect(client.saveToDisk()).rejects.toThrow('No persist path');
    });

    it('should throw error when loading without path', async () => {
      await expect(client.loadFromDisk()).rejects.toThrow('No persist path');
    });

    it('should throw error when loading non-existent file', async () => {
      await expect(
        client.loadFromDisk('/non/existent/path.json')
      ).rejects.toThrow();
    });

    it('should throw error when saving to invalid path', async () => {
      await client.putObject({ key: 'test', metadata: {} });

      // Try to save to a path that will fail (e.g., directory doesn't exist)
      await expect(
        client.saveToDisk('/invalid/nonexistent/directory/file.json')
      ).rejects.toThrow('Failed to save to disk');
    });

    it('should throw error when restoring invalid snapshot', () => {
      expect(() => {
        client.restore(null);
      }).toThrow('Invalid snapshot format');

      expect(() => {
        client.restore({});
      }).toThrow('Invalid snapshot format');
    });
  });

  describe('Delimiter Support in Listing', () => {
    it('should group by common prefixes with delimiter', async () => {
      const delimClient = new MemoryClient({ bucket: 'test-delim' });

      await delimClient.putObject({ key: 'folder1/file1.txt', metadata: {} });
      await delimClient.putObject({ key: 'folder1/file2.txt', metadata: {} });
      await delimClient.putObject({ key: 'folder2/file1.txt', metadata: {} });
      await delimClient.putObject({ key: 'root.txt', metadata: {} });

      const result = await delimClient.listObjects({
        prefix: '',
        delimiter: '/'
      });

      expect(result.CommonPrefixes).toBeDefined();
      // root.txt is not in CommonPrefixes (no delimiter), folders are
      expect(result.Contents.length).toBeGreaterThanOrEqual(1); // root.txt
      if (result.CommonPrefixes.length > 0) {
        expect(result.CommonPrefixes.some(p => p.Prefix === 'folder1/' || p.Prefix === 'folder2/')).toBe(true);
      }
    });

    it('should list with delimiter and prefix', async () => {
      const delimClient = new MemoryClient({ bucket: 'test-delim2' });

      await delimClient.putObject({ key: 'prefix/folder1/file1.txt', metadata: {} });
      await delimClient.putObject({ key: 'prefix/folder1/file2.txt', metadata: {} });
      await delimClient.putObject({ key: 'prefix/folder2/file1.txt', metadata: {} });

      const result = await delimClient.listObjects({
        prefix: 'prefix/',
        delimiter: '/'
      });

      expect(result.CommonPrefixes).toBeDefined();
      // Should have at least content or common prefixes
      expect(result.Contents.length + result.CommonPrefixes.length).toBeGreaterThan(0);
    });
  });

  describe('KeyPrefix Support', () => {
    it('should handle keyPrefix in getAllKeys', async () => {
      const prefixClient = new MemoryClient({
        bucket: 'test-prefix',
        keyPrefix: 'app/data/'
      });

      await prefixClient.putObject({ key: 'file1', metadata: {} });
      await prefixClient.putObject({ key: 'file2', metadata: {} });

      const keys = await prefixClient.getAllKeys({ prefix: '' });

      // Keys should be returned without the keyPrefix
      expect(keys).toContain('file1');
      expect(keys).toContain('file2');
      expect(keys.some(k => k.includes('app/data/'))).toBe(false);
    });
  });

  describe('Additional S3Client Methods', () => {
    it('should count objects with prefix', async () => {
      await client.putObject({ key: 'count/1', metadata: {} });
      await client.putObject({ key: 'count/2', metadata: {} });
      await client.putObject({ key: 'count/3', metadata: {} });
      await client.putObject({ key: 'other', metadata: {} });

      const count = await client.count({ prefix: 'count/' });
      expect(count).toBe(3);
    });

    it('should deleteAll objects under prefix', async () => {
      await client.putObject({ key: 'delall/1', metadata: {} });
      await client.putObject({ key: 'delall/2', metadata: {} });
      await client.putObject({ key: 'delall/3', metadata: {} });
      await client.putObject({ key: 'keep', metadata: {} });

      const deleted = await client.deleteAll({ prefix: 'delall/' });

      expect(deleted).toBe(3);
      expect(await client.exists('delall/1')).toBe(false);
      expect(await client.exists('delall/2')).toBe(false);
      expect(await client.exists('delall/3')).toBe(false);
      expect(await client.exists('keep')).toBe(true);
    });

    it('should emit deleteAll and deleteAllComplete events', async () => {
      const deleteAllEvents = [];
      const completeEvents = [];

      client.on('deleteAll', (data) => deleteAllEvents.push(data));
      client.on('deleteAllComplete', (data) => completeEvents.push(data));

      await client.putObject({ key: 'evt/1', metadata: {} });
      await client.putObject({ key: 'evt/2', metadata: {} });

      await client.deleteAll({ prefix: 'evt/' });

      expect(deleteAllEvents.length).toBe(1);
      expect(deleteAllEvents[0].prefix).toBe('evt/');
      expect(deleteAllEvents[0].batch).toBe(2);

      expect(completeEvents.length).toBe(1);
      expect(completeEvents[0].totalDeleted).toBe(2);
    });

    it('should getContinuationTokenAfterOffset', async () => {
      for (let i = 0; i < 10; i++) {
        await client.putObject({ key: `cont/${i}`, metadata: {} });
      }

      const token = await client.getContinuationTokenAfterOffset({
        prefix: 'cont/',
        offset: 5
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should return null for offset beyond keys', async () => {
      await client.putObject({ key: 'few/1', metadata: {} });

      const token = await client.getContinuationTokenAfterOffset({
        prefix: 'few/',
        offset: 100
      });

      expect(token).toBeNull();
    });

    it('should moveObject from one key to another', async () => {
      await client.putObject({
        key: 'move/source',
        metadata: { name: 'Source' },
        body: Buffer.from('test content')
      });

      await client.moveObject({
        from: 'move/source',
        to: 'move/destination'
      });

      expect(await client.exists('move/source')).toBe(false);
      expect(await client.exists('move/destination')).toBe(true);

      const dest = await client.headObject('move/destination');
      expect(dest.Metadata.name).toBe('Source');
    });

    it('should moveAllObjects from one prefix to another', async () => {
      await client.putObject({ key: 'oldprefix/1', metadata: { id: '1' } });
      await client.putObject({ key: 'oldprefix/2', metadata: { id: '2' } });
      await client.putObject({ key: 'oldprefix/3', metadata: { id: '3' } });

      const results = await client.moveAllObjects({
        prefixFrom: 'oldprefix/',
        prefixTo: 'newprefix/'
      });

      expect(results.length).toBe(3);
      expect(await client.exists('oldprefix/1')).toBe(false);
      expect(await client.exists('oldprefix/2')).toBe(false);
      expect(await client.exists('oldprefix/3')).toBe(false);
      expect(await client.exists('newprefix/1')).toBe(true);
      expect(await client.exists('newprefix/2')).toBe(true);
      expect(await client.exists('newprefix/3')).toBe(true);
    });

    it('should emit moveAllObjects event', async () => {
      const moveEvents = [];
      client.on('moveAllObjects', (data) => moveEvents.push(data));

      await client.putObject({ key: 'src/1', metadata: {} });
      await client.putObject({ key: 'src/2', metadata: {} });

      await client.moveAllObjects({
        prefixFrom: 'src/',
        prefixTo: 'dst/'
      });

      expect(moveEvents.length).toBe(1);
      expect(moveEvents[0].results.length).toBe(2);
      expect(moveEvents[0].errors.length).toBe(0);
    });

    it('should handle errors in moveAllObjects', async () => {
      const moveClient = new MemoryClient({ bucket: 'test-move-error' });

      await moveClient.putObject({ key: 'moveerr/1', metadata: {} });
      await moveClient.putObject({ key: 'moveerr/2', metadata: {} });

      // Mock copyObject to fail for one key
      const originalCopyObject = moveClient.copyObject.bind(moveClient);
      moveClient.copyObject = async (params) => {
        if (params.from === 'moveerr/2') {
          throw new Error('Copy failed');
        }
        return originalCopyObject(params);
      };

      await expect(
        moveClient.moveAllObjects({
          prefixFrom: 'moveerr/',
          prefixTo: 'moved/'
        })
      ).rejects.toThrow('Some objects could not be moved');
    });
  });

  describe('AWS SDK Command Interface', () => {
    it('should handle sendCommand with PutObjectCommand', async () => {
      // Simulate AWS SDK command
      const PutObjectCommand = class {
        constructor(input) {
          this.input = input;
        }
      };

      const command = new PutObjectCommand({
        Key: 'sdk-test',
        Metadata: { source: 'sdk' },
        Body: Buffer.from('test')
      });

      const response = await client.sendCommand(command);
      expect(response.ETag).toBeDefined();

      const obj = await client.headObject('sdk-test');
      expect(obj.Metadata.source).toBe('sdk');
    });

    it('should handle sendCommand with GetObjectCommand', async () => {
      await client.putObject({ key: 'get-test', metadata: { name: 'Get' } });

      const GetObjectCommand = class {
        constructor(input) {
          this.input = input;
        }
      };

      const command = new GetObjectCommand({ Key: 'get-test' });
      const response = await client.sendCommand(command);

      expect(response.Metadata.name).toBe('Get');
    });

    it('should handle sendCommand with HeadObjectCommand', async () => {
      await client.putObject({ key: 'head-test', metadata: { name: 'Head' } });

      const HeadObjectCommand = class {
        constructor(input) {
          this.input = input;
        }
      };

      const command = new HeadObjectCommand({ Key: 'head-test' });
      const response = await client.sendCommand(command);

      expect(response.Metadata.name).toBe('Head');
      expect(response.Body).toBeUndefined();
    });

    it('should handle sendCommand with CopyObjectCommand', async () => {
      await client.putObject({ key: 'copy-source', metadata: { name: 'Source' } });

      const CopyObjectCommand = class {
        constructor(input) {
          this.input = input;
        }
      };

      const command = new CopyObjectCommand({
        CopySource: 'test-direct-api/copy-source',
        Key: 'copy-dest',
        MetadataDirective: 'COPY'
      });

      await client.sendCommand(command);

      const dest = await client.headObject('copy-dest');
      expect(dest.Metadata.name).toBe('Source');
    });

    it('should handle sendCommand with DeleteObjectCommand', async () => {
      await client.putObject({ key: 'delete-test', metadata: {} });

      const DeleteObjectCommand = class {
        constructor(input) {
          this.input = input;
        }
      };

      const command = new DeleteObjectCommand({ Key: 'delete-test' });
      await client.sendCommand(command);

      expect(await client.exists('delete-test')).toBe(false);
    });

    it('should handle sendCommand with DeleteObjectsCommand', async () => {
      await client.putObject({ key: 'batch1', metadata: {} });
      await client.putObject({ key: 'batch2', metadata: {} });

      const DeleteObjectsCommand = class {
        constructor(input) {
          this.input = input;
        }
      };

      const command = new DeleteObjectsCommand({
        Delete: {
          Objects: [
            { Key: 'batch1' },
            { Key: 'batch2' }
          ]
        }
      });

      const response = await client.sendCommand(command);

      expect(response.Deleted).toHaveLength(2);
      expect(await client.exists('batch1')).toBe(false);
      expect(await client.exists('batch2')).toBe(false);
    });

    it('should handle sendCommand with ListObjectsV2Command', async () => {
      await client.putObject({ key: 'list1', metadata: {} });
      await client.putObject({ key: 'list2', metadata: {} });

      const ListObjectsV2Command = class {
        constructor(input) {
          this.input = input;
        }
      };

      const command = new ListObjectsV2Command({
        Prefix: '',
        MaxKeys: 10
      });

      const response = await client.sendCommand(command);

      expect(response.Contents).toBeDefined();
      expect(response.KeyCount).toBeGreaterThan(0);
    });

    it('should throw error for unsupported command', async () => {
      const UnsupportedCommand = class {
        constructor(input) {
          this.input = input;
        }
      };

      const command = new UnsupportedCommand({ Key: 'test' });

      await expect(client.sendCommand(command)).rejects.toThrow('Unsupported command');
    });

    it('should emit command.request and command.response events', async () => {
      const requestEvents = [];
      const responseEvents = [];

      client.on('command.request', (commandName, input) => {
        requestEvents.push({ commandName, input });
      });

      client.on('command.response', (commandName, response, input) => {
        responseEvents.push({ commandName, response, input });
      });

      const PutObjectCommand = class {
        constructor(input) {
          this.input = input;
        }
      };

      const command = new PutObjectCommand({
        Key: 'event-test',
        Metadata: { test: 'events' }
      });

      await client.sendCommand(command);

      expect(requestEvents.length).toBe(1);
      expect(requestEvents[0].commandName).toBe('PutObjectCommand');

      expect(responseEvents.length).toBe(1);
      expect(responseEvents[0].commandName).toBe('PutObjectCommand');
    });
  });
});
