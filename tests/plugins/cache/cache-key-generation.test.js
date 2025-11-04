import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createDatabaseForTest, createTemporaryPathForTest } from '../../config.js';
import { CachePlugin } from '../../../src/plugins/cache.plugin.js';
import { Cache, MemoryCache, S3Cache } from '../../../src/plugins/cache/index.js';
import { FilesystemCache } from '../../../src/plugins/cache/filesystem-cache.class.js';
import { PartitionAwareFilesystemCache } from '../../../src/plugins/cache/partition-aware-filesystem-cache.class.js';

describe('Cache Plugin - Cache Key Generation', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/cache');
    await database.connect();
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  let cachePlugin;
  let users;

  beforeEach(async () => {
    cachePlugin = new CachePlugin({
      driver: 'memory'
    });
    await cachePlugin.install(database);

    users = await database.createResource({
      name: 'key_users',
      attributes: {
        name: 'string|required',
        region: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: { region: 'string' }
        }
      }
    });
  });

  test('should generate cache key for count operation', async () => {
    const key = await users.cacheKeyFor({ action: 'count' });
    expect(key).toContain('resource=key_users');
    expect(key).toContain('action=count');
  });

  test('should generate cache key with parameters', async () => {
    const key = await users.cacheKeyFor({
      action: 'getMany',
      params: { ids: ['user1', 'user2'] }
    });
    expect(key).toContain('resource=key_users');
    expect(key).toContain('action=getMany');
  });

  test('should generate cache key with partition information', async () => {
    const key = await users.cacheKeyFor({
      action: 'list',
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    expect(key).toContain('resource=key_users');
    expect(key).toContain('action=list');
    expect(key).toContain('partition:byRegion');
    expect(key).toContain('region:US');
  });

  test('should generate different keys for different actions', async () => {
    const listKey = await users.cacheKeyFor({ action: 'list' });
    const countKey = await users.cacheKeyFor({ action: 'count' });
    
    expect(listKey).not.toBe(countKey);
  });

  test('should generate different keys for different partitions', async () => {
    const usKey = await users.cacheKeyFor({
      action: 'list',
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    
    const euKey = await users.cacheKeyFor({
      action: 'list',
      partition: 'byRegion',
      partitionValues: { region: 'EU' }
    });
    
    expect(usKey).not.toBe(euKey);
  });
    
});
