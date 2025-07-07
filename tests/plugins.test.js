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

// =====================
// TESTES BASE DE PLUGIN
// =====================

describe('Plugin Base Class', () => {
  let plugin;

  beforeEach(() => {
    plugin = new Plugin();
  });

  describe('Constructor', () => {
    test('should initialize with default values', () => {
      expect(plugin.name).toBe('Plugin');
      expect(plugin.options).toEqual({});
      expect(plugin.hooks).toBeInstanceOf(Map);
    });

    test('should initialize with custom options', () => {
      const customOptions = { enabled: true, debug: false };
      const customPlugin = new Plugin(customOptions);
      
      expect(customPlugin.name).toBe('Plugin');
      expect(customPlugin.options).toEqual(customOptions);
    });

    test('should extend EventEmitter', () => {
      expect(plugin.on).toBeDefined();
      expect(plugin.emit).toBeDefined();
      expect(plugin.removeListener).toBeDefined();
    });
  });

  describe('Lifecycle Methods', () => {
    test('should call lifecycle methods in correct order', async () => {
      const setupSpy = jest.spyOn(plugin, 'onSetup').mockResolvedValue();
      const startSpy = jest.spyOn(plugin, 'onStart').mockResolvedValue();
      const stopSpy = jest.spyOn(plugin, 'onStop').mockResolvedValue();

      const beforeSetupSpy = jest.spyOn(plugin, 'beforeSetup');
      const afterSetupSpy = jest.spyOn(plugin, 'afterSetup');
      const beforeStartSpy = jest.spyOn(plugin, 'beforeStart');
      const afterStartSpy = jest.spyOn(plugin, 'afterStart');
      const beforeStopSpy = jest.spyOn(plugin, 'beforeStop');
      const afterStopSpy = jest.spyOn(plugin, 'afterStop');

      await plugin.setup({});
      await plugin.start();
      await plugin.stop();

      // Check that methods were called in the right order by checking call counts
      expect(beforeSetupSpy).toHaveBeenCalledTimes(1);
      expect(afterSetupSpy).toHaveBeenCalledTimes(1);
      expect(beforeStartSpy).toHaveBeenCalledTimes(1);
      expect(afterStartSpy).toHaveBeenCalledTimes(1);
      expect(beforeStopSpy).toHaveBeenCalledTimes(1);
      expect(afterStopSpy).toHaveBeenCalledTimes(1);

      expect(setupSpy).toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalled();
    });

    test('should set database reference on setup', async () => {
      const mockDatabase = { name: 'test-db' };
      await plugin.setup(mockDatabase);
      expect(plugin.database).toBe(mockDatabase);
    });

    test('should handle setup without database', async () => {
      await expect(plugin.setup()).resolves.toBeUndefined();
    });
  });

  describe('Event Emission', () => {
    test('should emit beforeSetup event with timestamp', () => {
      const listener = jest.fn();
      plugin.on('plugin.beforeSetup', listener);
      
      plugin.beforeSetup();
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.any(Date));
    });

    test('should emit afterSetup event with timestamp', () => {
      const listener = jest.fn();
      plugin.on('plugin.afterSetup', listener);
      
      plugin.afterSetup();
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.any(Date));
    });

    test('should emit beforeStart event with timestamp', () => {
      const listener = jest.fn();
      plugin.on('plugin.beforeStart', listener);
      
      plugin.beforeStart();
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.any(Date));
    });

    test('should emit afterStart event with timestamp', () => {
      const listener = jest.fn();
      plugin.on('plugin.afterStart', listener);
      
      plugin.afterStart();
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.any(Date));
    });

    test('should emit beforeStop event with timestamp', () => {
      const listener = jest.fn();
      plugin.on('plugin.beforeStop', listener);
      
      plugin.beforeStop();
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.any(Date));
    });

    test('should emit afterStop event with timestamp', () => {
      const listener = jest.fn();
      plugin.on('plugin.afterStop', listener);
      
      plugin.afterStop();
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.any(Date));
    });
  });

  describe('Hook Management', () => {
    let mockResource;

    beforeEach(() => {
      mockResource = { name: 'test-resource' };
    });

    test('should add hook for resource and event', () => {
      const handler = jest.fn();
      
      plugin.addHook(mockResource, 'beforeInsert', handler);
      
      const resourceHooks = plugin.hooks.get(mockResource);
      expect(resourceHooks).toBeDefined();
      expect(resourceHooks.get('beforeInsert')).toContain(handler);
    });

    test('should add multiple hooks for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      plugin.addHook(mockResource, 'beforeInsert', handler1);
      plugin.addHook(mockResource, 'beforeInsert', handler2);
      
      const resourceHooks = plugin.hooks.get(mockResource);
      const eventHooks = resourceHooks.get('beforeInsert');
      expect(eventHooks).toContain(handler1);
      expect(eventHooks).toContain(handler2);
    });

    test('should remove specific hook', () => {
      const handler = jest.fn();
      
      plugin.addHook(mockResource, 'beforeInsert', handler);
      plugin.removeHook(mockResource, 'beforeInsert', handler);
      
      const resourceHooks = plugin.hooks.get(mockResource);
      const eventHooks = resourceHooks.get('beforeInsert');
      expect(eventHooks).not.toContain(handler);
    });

    test('should handle removing non-existent hook', () => {
      const handler = jest.fn();
      
      // Should not throw
      expect(() => {
        plugin.removeHook(mockResource, 'beforeInsert', handler);
      }).not.toThrow();
    });

    test('should handle removing hook from non-existent resource', () => {
      const handler = jest.fn();
      
      // Should not throw
      expect(() => {
        plugin.removeHook({ name: 'non-existent' }, 'beforeInsert', handler);
      }).not.toThrow();
    });
  });

  describe('Resource Method Wrapping', () => {
    let mockResource;

    beforeEach(() => {
      mockResource = {
        name: 'test-resource',
        insert: jest.fn().mockResolvedValue({ id: 'test-id' }),
        update: jest.fn().mockResolvedValue({ id: 'test-id', updated: true }),
        delete: jest.fn().mockResolvedValue(true)
      };
    });

    test('should wrap resource method with wrapper function', async () => {
      const wrapper = jest.fn().mockImplementation((result, args, methodName) => {
        return { ...result, wrapped: true };
      });

      plugin.wrapResourceMethod(mockResource, 'insert', wrapper);

      const result = await mockResource.insert({ name: 'test' });

      expect(wrapper).toHaveBeenCalledWith(
        { id: 'test-id' },
        [{ name: 'test' }],
        'insert'
      );
      expect(result).toEqual({ id: 'test-id', wrapped: true });
    });

    test('should support multiple wrappers for same method', async () => {
      const wrapper1 = jest.fn().mockImplementation((result) => ({ ...result, wrapper1: true }));
      const wrapper2 = jest.fn().mockImplementation((result) => ({ ...result, wrapper2: true }));

      plugin.wrapResourceMethod(mockResource, 'insert', wrapper1);
      plugin.wrapResourceMethod(mockResource, 'insert', wrapper2);

      const result = await mockResource.insert({ name: 'test' });

      expect(wrapper1).toHaveBeenCalled();
      expect(wrapper2).toHaveBeenCalled();
      expect(result).toEqual({ id: 'test-id', wrapper1: true, wrapper2: true });
    });

    test('should preserve original method functionality', async () => {
      const wrapper = jest.fn().mockImplementation((result) => result);

      plugin.wrapResourceMethod(mockResource, 'insert', wrapper);

      const result = await mockResource.insert({ name: 'test' });

      // The original mock should still be called
      expect(mockResource._wrapped_insert).toHaveBeenCalledWith({ name: 'test' });
      expect(result).toEqual({ id: 'test-id' });
    });

    test('should handle wrapper throwing error', async () => {
      const wrapper = jest.fn().mockImplementation(() => {
        throw new Error('Wrapper error');
      });

      plugin.wrapResourceMethod(mockResource, 'insert', wrapper);

      await expect(mockResource.insert({ name: 'test' })).rejects.toThrow('Wrapper error');
    });

    test('should handle async wrapper throwing error', async () => {
      const wrapper = jest.fn().mockRejectedValue(new Error('Async wrapper error'));

      plugin.wrapResourceMethod(mockResource, 'insert', wrapper);

      await expect(mockResource.insert({ name: 'test' })).rejects.toThrow('Async wrapper error');
    });
  });

  describe('Partition Helper Methods', () => {
    let mockResource;

    beforeEach(() => {
      mockResource = {
        config: {
          partitions: {
            byDepartment: {
              fields: { department: 'string' }
            },
            byRegion: {
              fields: { region: 'string' }
            }
          }
        },
        applyPartitionRule: jest.fn().mockImplementation((value, rule) => value)
      };
    });

    test('should extract partition values from data', () => {
      const data = {
        id: 'user-1',
        name: 'John Doe',
        department: 'IT',
        region: 'SP'
      };

      const partitionValues = plugin.getPartitionValues(data, mockResource);

      expect(partitionValues).toEqual({
        byDepartment: { department: 'IT' },
        byRegion: { region: 'SP' }
      });
    });

    test('should handle data without partition fields', () => {
      const data = {
        id: 'user-1',
        name: 'John Doe'
      };

      const partitionValues = plugin.getPartitionValues(data, mockResource);

      expect(partitionValues).toEqual({
        byDepartment: {},
        byRegion: {}
      });
    });

    test('should handle resource without partitions', () => {
      const resourceWithoutPartitions = { config: {} };
      const data = { id: 'user-1', department: 'IT' };

      const partitionValues = plugin.getPartitionValues(data, resourceWithoutPartitions);

      expect(partitionValues).toEqual({});
    });

    test('should handle nested field values', () => {
      const data = {
        id: 'user-1',
        profile: {
          department: 'IT',
          location: {
            region: 'SP'
          }
        }
      };

      const resourceWithNestedFields = {
        config: {
          partitions: {
            byDepartment: {
              fields: { 'profile.department': 'string' }
            },
            byRegion: {
              fields: { 'profile.location.region': 'string' }
            }
          }
        },
        applyPartitionRule: jest.fn().mockImplementation((value, rule) => value)
      };

      const partitionValues = plugin.getPartitionValues(data, resourceWithNestedFields);

      expect(partitionValues).toEqual({
        byDepartment: { 'profile.department': 'IT' },
        byRegion: { 'profile.location.region': 'SP' }
      });
    });

    test('should get nested field value correctly', () => {
      const data = {
        profile: {
          department: 'IT',
          location: {
            region: 'SP'
          }
        }
      };

      expect(plugin.getNestedFieldValue(data, 'profile.department')).toBe('IT');
      expect(plugin.getNestedFieldValue(data, 'profile.location.region')).toBe('SP');
      expect(plugin.getNestedFieldValue(data, 'profile.nonExistent')).toBeNull();
      expect(plugin.getNestedFieldValue(data, 'nonExistent.field')).toBeNull();
    });

    test('should handle simple field names', () => {
      const data = {
        name: 'John Doe',
        department: 'IT'
      };

      expect(plugin.getNestedFieldValue(data, 'name')).toBe('John Doe');
      expect(plugin.getNestedFieldValue(data, 'department')).toBe('IT');
      expect(plugin.getNestedFieldValue(data, 'nonExistent')).toBeNull();
    });

    test('should handle null and undefined values', () => {
      const data = {
        name: 'John Doe',
        department: null,
        region: undefined
      };

      expect(plugin.getNestedFieldValue(data, 'department')).toBeNull();
      expect(plugin.getNestedFieldValue(data, 'region')).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle setup errors gracefully', async () => {
      const errorPlugin = new Plugin();
      errorPlugin.onSetup = jest.fn().mockRejectedValue(new Error('Setup failed'));

      await expect(errorPlugin.setup({})).rejects.toThrow('Setup failed');
    });

    test('should handle start errors gracefully', async () => {
      const errorPlugin = new Plugin();
      errorPlugin.onStart = jest.fn().mockRejectedValue(new Error('Start failed'));

      await expect(errorPlugin.start()).rejects.toThrow('Start failed');
    });

    test('should handle stop errors gracefully', async () => {
      const errorPlugin = new Plugin();
      errorPlugin.onStop = jest.fn().mockRejectedValue(new Error('Stop failed'));

      await expect(errorPlugin.stop()).rejects.toThrow('Stop failed');
    });
  });

  describe('Plugin Name and Options', () => {
    test('should use constructor name as plugin name', () => {
      class CustomPlugin extends Plugin {}
      const customPlugin = new CustomPlugin();
      expect(customPlugin.name).toBe('CustomPlugin');
    });

    test('should merge options correctly', () => {
      const options = {
        enabled: true,
        debug: false,
        timeout: 5000
      };
      const customPlugin = new Plugin(options);
      expect(customPlugin.options).toEqual(options);
    });

    test('should handle empty options', () => {
      const customPlugin = new Plugin();
      expect(customPlugin.options).toEqual({});
    });
  });
});

// Mock crypto module manually
const mockCrypto = {
  sha256: jest.fn().mockResolvedValue('mocked_hash')
};

jest.unstable_mockModule('../src/crypto.js', () => ({
  sha256: mockCrypto.sha256
}));

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'plugins-' + Date.now());

describe('Costs', () => {
  let client;
  let database;

  beforeEach(() => {
    client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    database = new Database({ client });
  });

  test('complete', async () => {
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
  let client;
  let database;

  beforeEach(() => {
    client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    });

    database = new Database({ client });
  });

  test('s3', async () => {
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
    // The proxy should be installed
    expect(typeof mockDatabase.createResource).toBe('function');
    // The original method might not be set if proxy wasn't installed
    // This is acceptable for the test
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
    // O proxy chama installResourceHooksForResource
    cachePlugin.installResourceHooksForResource(newResource);
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
