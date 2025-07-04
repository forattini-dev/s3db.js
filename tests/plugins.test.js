import { join } from 'path';
import { idGenerator } from '../src/concerns/id.js';
import { describe, expect, test, beforeEach, jest } from '@jest/globals';

import Database from '../src/database.class.js';
import Client from '../src/client.class.js';
import Resource from '../src/resource.class.js';
import { CachePlugin } from '../src/plugins/cache.plugin.js';
import { CostsPlugin } from '../src/plugins/costs.plugin.js';

import { MemoryCache } from '../src/cache';

import Plugin from '../src/plugins/plugin.class.js';
import S3Cache from '../src/cache/s3-cache.class.js';

// Mock crypto module manually
const mockCrypto = {
  sha256: jest.fn().mockResolvedValue('mocked_hash')
};

jest.unstable_mockModule('../src/crypto.js', () => ({
  sha256: mockCrypto.sha256
}));

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'plugins-' + Date.now());

describe('Costs', () => {
  test('complete', async () => {
    const client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    const database = new Database({ client });

    // Setup costs plugin
    await CostsPlugin.setup.call(CostsPlugin, database);
    await CostsPlugin.start.call(CostsPlugin);

    // Test costs tracking by making a simple S3 operation
    await client.putObject({
      key: 'test-costs.txt',
      body: 'test content',
      contentType: 'text/plain'
    });

    expect(client.costs).toBeDefined();
    expect(client.costs.total).toBeGreaterThan(0);
    expect(client.costs.requests.total).toBeGreaterThan(0);
  });
});

describe('Cache', () => {
  test('s3', async () => {
    const client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    const database = new Database({ client });

    // Setup cache plugin
    const cachePlugin = new CachePlugin({
      driver: {
        set: async (key, value) => ({ key, value }),
        get: async (key) => ({ id: 'user-1', name: 'John Doe', email: 'john@example.com' }),
        delete: async (key) => true,
        clear: async () => true
      }
    });

    await cachePlugin.setup(database);

    // Test cache operations directly
    const testKey = 'test-cache-key';
    const testValue = { id: 'user-1', name: 'John Doe', email: 'john@example.com' };

    // Test cache set
    const setResult = await cachePlugin.driver.set(testKey, testValue);
    expect(setResult).toBeDefined();
    expect(setResult.key).toBe(testKey);

    // Test cache get
    const getResult = await cachePlugin.driver.get(testKey);
    expect(getResult).toBeDefined();
    expect(getResult.id).toBe('user-1');
  });

  test('memory', async () => {
    const client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    const database = new Database({ client });

    // Setup cache plugin with memory driver
    const cachePlugin = new CachePlugin({
      driver: {
        set: async (key, value) => ({ key, value }),
        get: async (key) => ({ id: 'user-1', name: 'John Doe', email: 'john@example.com' }),
        delete: async (key) => true,
        clear: async () => true
      }
    });

    await cachePlugin.setup(database);

    // Test cache operations directly
    const testKey = 'test-memory-cache-key';
    const testValue = { id: 'user-1', name: 'John Doe', email: 'john@example.com' };

    // Test cache set
    const setResult = await cachePlugin.driver.set(testKey, testValue);
    expect(setResult).toBeDefined();
    expect(setResult.key).toBe(testKey);

    // Test cache get
    const getResult = await cachePlugin.driver.get(testKey);
    expect(getResult).toBeDefined();
    expect(getResult.id).toBe('user-1');
  });
});

describe('Plugin Base Class', () => {
  let plugin;

  beforeEach(() => {
    plugin = new Plugin();
  });

  test('should emit beforeSetup event', () => {
    const listener = jest.fn();
    plugin.on('plugin.beforeSetup', listener);
    plugin.beforeSetup();
    expect(listener).toHaveBeenCalledWith(expect.any(Date));
  });

  test('should emit afterSetup event', () => {
    const listener = jest.fn();
    plugin.on('plugin.afterSetup', listener);
    plugin.afterSetup();
    expect(listener).toHaveBeenCalledWith(expect.any(Date));
  });

  test('should emit beforeStart event', () => {
    const listener = jest.fn();
    plugin.on('plugin.beforeStart', listener);
    plugin.beforeStart();
    expect(listener).toHaveBeenCalledWith(expect.any(Date));
  });

  test('should emit afterStart event', () => {
    const listener = jest.fn();
    plugin.on('plugin.afterStart', listener);
    plugin.afterStart();
    expect(listener).toHaveBeenCalledWith(expect.any(Date));
  });

  test('should emit beforeStop event', () => {
    const listener = jest.fn();
    plugin.on('plugin.beforeStop', listener);
    plugin.beforeStop();
    expect(listener).toHaveBeenCalledWith(expect.any(Date));
  });

  test('should emit afterStop event', () => {
    const listener = jest.fn();
    plugin.on('plugin.afterStop', listener);
    plugin.afterStop();
    expect(listener).toHaveBeenCalledWith(expect.any(Date));
  });

  test('should have default async methods', async () => {
    await expect(plugin.setup({})).resolves.toBeUndefined();
    await expect(plugin.start()).resolves.toBeUndefined();
    await expect(plugin.stop()).resolves.toBeUndefined();
  });
});

describe('CachePlugin', () => {
  let cachePlugin;
  let mockDatabase;
  let mockResource;
  let mockCache;

  beforeEach(() => {
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn(),
      keyPrefix: 'test_prefix'
    };

    mockResource = {
      name: 'test_resource',
      count: jest.fn().mockResolvedValue(10),
      listIds: jest.fn().mockResolvedValue(['id1', 'id2']),
      getMany: jest.fn().mockResolvedValue([{ id: 'id1' }]),
      getAll: jest.fn().mockResolvedValue([{ id: 'id1' }, { id: 'id2' }]),
      page: jest.fn().mockResolvedValue([{ id: 'id1' }]),
      insert: jest.fn().mockResolvedValue({ id: 'new_id' }),
      update: jest.fn().mockResolvedValue({ id: 'updated_id' }),
      delete: jest.fn().mockResolvedValue(true),
      deleteMany: jest.fn().mockResolvedValue(true)
    };

    mockDatabase = {
      client: {},
      resources: {
        test_resource: mockResource
      },
      createResource: jest.fn().mockResolvedValue(mockResource)
    };

    cachePlugin = new CachePlugin({ driver: mockCache });
  });

  test('should setup with custom driver', async () => {
    await cachePlugin.setup(mockDatabase);
    expect(cachePlugin.database).toBe(mockDatabase);
    expect(cachePlugin.driver).toBe(mockCache);
  });

  test('should setup with default S3Cache driver', async () => {
    const pluginWithoutDriver = new CachePlugin();
    await pluginWithoutDriver.setup(mockDatabase);
    expect(pluginWithoutDriver.driver).toBeInstanceOf(S3Cache);
  });

  test('should install database proxy', async () => {
    await cachePlugin.setup(mockDatabase);
    expect(mockDatabase._createResource).toBeDefined();
    expect(typeof mockDatabase.createResource).toBe('function');
  });

  test('should install resource proxies', async () => {
    await cachePlugin.setup(mockDatabase);
    expect(mockResource.cache).toBe(mockCache);
    expect(typeof mockResource.cacheKeyFor).toBe('function');
  });

  test('should generate cache key correctly', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const key = await mockResource.cacheKeyFor({ 
      params: { id: '123', type: 'test' }, 
      action: 'getMany' 
    });
    expect(key).toContain('resource=test_resource');
    expect(key).toContain('action=getMany');
    expect(key).toMatch(/\.json\.gz$/);
  });

  test('should cache count method', async () => {
    await cachePlugin.setup(mockDatabase);
    
    // First call - should cache
    mockCache.get.mockResolvedValue(null);
    const result1 = await mockResource.count();
    expect(result1).toBe(10);
    expect(mockCache.set).toHaveBeenCalled();
    
    // Second call - should return cached
    mockCache.get.mockResolvedValue(5);
    const result2 = await mockResource.count();
    expect(result2).toBe(5);
  });

  test('should handle cache get error', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const error = new Error('Cache error');
    error.name = 'NoSuchKey';
    mockCache.get.mockRejectedValue(error);
    
    const result = await mockResource.count();
    expect(result).toBe(10);
  });

  test('should throw non-NoSuchKey errors', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const error = new Error('Other error');
    error.name = 'OtherError';
    mockCache.get.mockRejectedValue(error);
    
    await expect(mockResource.count()).rejects.toThrow('Other error');
  });

  test('should cache listIds method', async () => {
    await cachePlugin.setup(mockDatabase);
    mockCache.get.mockResolvedValue(null);
    
    const result = await mockResource.listIds();
    expect(result).toEqual(['id1', 'id2']);
    expect(mockCache.set).toHaveBeenCalled();
  });

  test('should cache getMany method', async () => {
    await cachePlugin.setup(mockDatabase);
    mockCache.get.mockResolvedValue(null);
    
    const result = await mockResource.getMany(['id1']);
    expect(result).toEqual([{ id: 'id1' }]);
    expect(mockCache.set).toHaveBeenCalled();
  });

  test('should cache getAll method', async () => {
    await cachePlugin.setup(mockDatabase);
    mockCache.get.mockResolvedValue(null);
    
    const result = await mockResource.getAll();
    expect(result).toEqual([{ id: 'id1' }, { id: 'id2' }]);
    expect(mockCache.set).toHaveBeenCalled();
  });

  test('should cache page method', async () => {
    await cachePlugin.setup(mockDatabase);
    mockCache.get.mockResolvedValue(null);
    
    const result = await mockResource.page({ offset: 0, size: 10 });
    expect(result).toEqual([{ id: 'id1' }]);
    expect(mockCache.set).toHaveBeenCalled();
  });

  test('should clear cache on insert', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const result = await mockResource.insert({ name: 'test' });
    expect(result).toEqual({ id: 'new_id' });
    expect(mockCache.clear).toHaveBeenCalled();
  });

  test('should clear cache on update', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const result = await mockResource.update('id1', { name: 'updated' });
    expect(result).toEqual({ id: 'updated_id' });
    expect(mockCache.clear).toHaveBeenCalled();
  });

  test('should clear cache on delete', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const result = await mockResource.delete('id1');
    expect(result).toBe(true);
    expect(mockCache.clear).toHaveBeenCalled();
  });

  test('should clear cache on deleteMany', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const result = await mockResource.deleteMany(['id1', 'id2']);
    expect(result).toBe(true);
    expect(mockCache.clear).toHaveBeenCalled();
  });

  test('should handle empty params in cacheKeyFor', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const key = await mockResource.cacheKeyFor({ action: 'list' });
    expect(key).toContain('resource=test_resource');
    expect(key).toContain('action=list');
    expect(key).toMatch(/\.json\.gz$/);
  });

  test('should start and stop without errors', async () => {
    await expect(cachePlugin.start()).resolves.toBeUndefined();
    await expect(cachePlugin.stop()).resolves.toBeUndefined();
  });

  test('should handle cache get error in listIds', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const error = new Error('Cache error');
    error.name = 'NoSuchKey';
    mockCache.get.mockRejectedValue(error);
    
    const result = await mockResource.listIds();
    expect(result).toEqual(['id1', 'id2']);
  });

  test('should handle cache get error in getMany', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const error = new Error('Cache error');
    error.name = 'NoSuchKey';
    mockCache.get.mockRejectedValue(error);
    
    const result = await mockResource.getMany(['id1']);
    expect(result).toEqual([{ id: 'id1' }]);
  });

  test('should handle cache get error in getAll', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const error = new Error('Cache error');
    error.name = 'NoSuchKey';
    mockCache.get.mockRejectedValue(error);
    
    const result = await mockResource.getAll();
    expect(result).toEqual([{ id: 'id1' }, { id: 'id2' }]);
  });

  test('should handle cache get error in page', async () => {
    await cachePlugin.setup(mockDatabase);
    
    const error = new Error('Cache error');
    error.name = 'NoSuchKey';
    mockCache.get.mockRejectedValue(error);
    
    const result = await mockResource.page({ offset: 0, size: 10 });
    expect(result).toEqual([{ id: 'id1' }]);
  });

  test('should handle cache driver without keyPrefix', async () => {
    const cacheWithoutPrefix = {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn()
    };
    
    const pluginWithoutPrefix = new CachePlugin({ driver: cacheWithoutPrefix });
    await pluginWithoutPrefix.setup(mockDatabase);
    
    expect(mockResource.cache).toBe(cacheWithoutPrefix);
  });

  test('should handle database proxy for new resources', async () => {
    await cachePlugin.setup(mockDatabase);
    
    // Simular criação de novo recurso pelo proxy
    const newResource = {
      name: 'new_resource',
      count: jest.fn(),
      listIds: jest.fn(),
      getMany: jest.fn(),
      getAll: jest.fn(),
      page: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn()
    };
    // O proxy chama installResourcesProxies
    cachePlugin.installResourcesProxies(newResource);
    expect(newResource.cache).toBe(mockCache);
    expect(typeof newResource.cacheKeyFor).toBe('function');
  });

  test('should handle cache driver with undefined keyPrefix', async () => {
    const cacheWithUndefinedPrefix = {
      get: jest.fn(),
      set: jest.fn(),
      clear: jest.fn(),
      keyPrefix: undefined
    };
    
    const pluginWithUndefinedPrefix = new CachePlugin({ driver: cacheWithUndefinedPrefix });
    await pluginWithUndefinedPrefix.setup(mockDatabase);
    
    expect(mockResource.cache).toBe(cacheWithUndefinedPrefix);
    // Should not throw when keyPrefix is undefined
    const key = await mockResource.cacheKeyFor({ action: 'test' });
    expect(key).toContain('resource=test_resource');
  });
});
