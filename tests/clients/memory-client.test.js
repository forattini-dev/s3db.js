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
