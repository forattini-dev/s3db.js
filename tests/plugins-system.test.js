import { join } from 'path';
import { describe, expect, test, beforeEach } from '@jest/globals';

import { S3db } from '../src/index.js';
import { Plugin, PluginObject, LoggingPlugin, CostsPlugin, CachePlugin } from '../src/plugins/index.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'plugins-system-' + Date.now());

describe('Plugin System', () => {
  let s3db;
  let connectionString;

  beforeEach(() => {
    connectionString = process.env.BUCKET_CONNECTION_STRING
      ?.replace('USER', process.env.MINIO_USER)
      ?.replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}`;
  });

  test('Plugin Base Class - Basic Functionality', async () => {
    const plugin = new Plugin({ test: 'option' });
    
    // Test initial state
    expect(plugin.isSetup).toBe(false);
    expect(plugin.isStarted).toBe(false);
    expect(plugin.options).toEqual({ test: 'option' });
    expect(plugin.database).toBeNull();
    
    // Mock database
    const mockDatabase = {
      constructor: { name: 'MockDatabase' },
      emit: jest.fn()
    };
    
    // Test setup
    await plugin.setup(mockDatabase);
    expect(plugin.isSetup).toBe(true);
    expect(plugin.database).toBe(mockDatabase);
    
    // Test start
    await plugin.start();
    expect(plugin.isStarted).toBe(true);
    
    // Test stop
    await plugin.stop();
    expect(plugin.isStarted).toBe(false);
    
    // Test start without setup should throw
    const newPlugin = new Plugin();
    await expect(newPlugin.start()).rejects.toThrow('Plugin must be setup before starting');
  });

  test('Plugin Object - Basic Functionality', async () => {
    // Test initial state
    expect(PluginObject.isSetup).toBe(false);
    expect(PluginObject.isStarted).toBe(false);
    expect(PluginObject.database).toBeNull();
    
    // Mock database
    const mockDatabase = {
      constructor: { name: 'MockDatabase' },
      emit: jest.fn()
    };
    
    // Test setup
    PluginObject.setup(mockDatabase);
    expect(PluginObject.isSetup).toBe(true);
    expect(PluginObject.database).toBe(mockDatabase);
    
    // Test start
    PluginObject.start();
    expect(PluginObject.isStarted).toBe(true);
    
    // Test stop
    PluginObject.stop();
    expect(PluginObject.isStarted).toBe(false);
  });

  test('LoggingPlugin - Functionality', async () => {
    const loggingPlugin = new LoggingPlugin({
      logLevel: 'debug',
      enableColors: false,
      enableTimestamps: false
    });
    
    // Test initial state
    expect(loggingPlugin.logLevel).toBe('debug');
    expect(loggingPlugin.enableColors).toBe(false);
    expect(loggingPlugin.enableTimestamps).toBe(false);
    expect(loggingPlugin.operations).toBeInstanceOf(Map);
    
    // Mock database with client
    const mockDatabase = {
      constructor: { name: 'MockDatabase' },
      emit: jest.fn(),
      on: jest.fn(),
      client: {
        on: jest.fn(),
        costs: { total: 0.001, requests: { total: 5 } }
      }
    };
    
    // Test setup
    await loggingPlugin.setup(mockDatabase);
    expect(loggingPlugin.database).toBe(mockDatabase);
    expect(loggingPlugin.startTime).toBeDefined();
    
    // Test start
    await loggingPlugin.start();
    expect(loggingPlugin.operations.size).toBe(0);
    
    // Test logging methods
    const originalConsoleLog = console.log;
    console.log = jest.fn();
    
    loggingPlugin.logInfo('Test info message');
    loggingPlugin.logError('Test error message');
    loggingPlugin.logDebug('Test debug message');
    loggingPlugin.logWarn('Test warn message');
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test info message'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test error message'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test debug message'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Test warn message'));
    
    console.log = originalConsoleLog;
    
    // Test stats
    const stats = loggingPlugin.getStats();
    expect(stats).toHaveProperty('uptime');
    expect(stats).toHaveProperty('totalOperations');
    expect(stats).toHaveProperty('averageRate');
    expect(stats).toHaveProperty('operations');
    
    // Test stop
    await loggingPlugin.stop();
  });

  test('Database with Plugins Integration', async () => {
    // Custom test plugin
    class TestPlugin extends Plugin {
      constructor() {
        super();
        this.setupCalled = false;
        this.startCalled = false;
        this.stopCalled = false;
      }
      
      async setup(database) {
        await super.setup(database);
        this.setupCalled = true;
      }
      
      async start() {
        await super.start();
        this.startCalled = true;
      }
      
      async stop() {
        await super.stop();
        this.stopCalled = true;
      }
    }
    
    const testPlugin = new TestPlugin();
    
    // Create database with plugins
    s3db = new S3db({
      connectionString,
      plugins: [testPlugin]
    });
    
    // Test plugin lifecycle during database connection
    await s3db.connect();
    
    expect(testPlugin.setupCalled).toBe(true);
    expect(testPlugin.startCalled).toBe(true);
    expect(testPlugin.database).toBe(s3db);
    
    // Test plugin access
    expect(s3db.plugins).toContain(testPlugin);
    
    // Create a resource to test plugin events
    const users = await s3db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required'
      }
    });
    
    expect(users).toBeDefined();
    expect(users.name).toBe('users');
    
    // Cleanup
    await s3db.client.deleteAll({ prefix: '' });
  });

  test('Multiple Plugins Integration', async () => {
    const loggingPlugin = new LoggingPlugin({ logLevel: 'info' });
    
    // Object-based plugin
    const objectPlugin = {
      setupCalled: false,
      startCalled: false,
      
      setup(database) {
        this.setupCalled = true;
        this.database = database;
      },
      
      start() {
        this.startCalled = true;
      },
      
      stop() {
        // No-op for this test
      }
    };
    
    // Create database with multiple plugins
    s3db = new S3db({
      connectionString,
      plugins: [
        CostsPlugin, // Object-based built-in plugin
        loggingPlugin, // Class-based custom plugin
        objectPlugin // Object-based custom plugin
      ]
    });
    
    // Test multiple plugins setup
    await s3db.connect();
    
    expect(loggingPlugin.database).toBe(s3db);
    expect(objectPlugin.setupCalled).toBe(true);
    expect(objectPlugin.startCalled).toBe(true);
    expect(objectPlugin.database).toBe(s3db);
    
    // Test costs plugin integration
    expect(s3db.client.costs).toBeDefined();
    expect(s3db.client.costs.total).toBeDefined();
    
    // Test logging plugin integration
    expect(loggingPlugin.isStarted).toBe(true);
    
    // Cleanup
    await s3db.client.deleteAll({ prefix: '' });
  });

  test('Plugin Error Handling', async () => {
    // Plugin that throws error during setup
    class FailingPlugin extends Plugin {
      async setup(database) {
        await super.setup(database);
        throw new Error('Plugin setup failed');
      }
    }
    
    const failingPlugin = new FailingPlugin();
    
    s3db = new S3db({
      connectionString,
      plugins: [failingPlugin]
    });
    
    // Database connection should handle plugin setup errors
    await expect(s3db.connect()).rejects.toThrow('Plugin setup failed');
  });

  test('Plugin Configuration and Options', async () => {
    const customOptions = {
      logLevel: 'debug',
      enableColors: true,
      enableTimestamps: true,
      customOption: 'test-value'
    };
    
    const loggingPlugin = new LoggingPlugin(customOptions);
    
    expect(loggingPlugin.logLevel).toBe('debug');
    expect(loggingPlugin.enableColors).toBe(true);
    expect(loggingPlugin.enableTimestamps).toBe(true);
    expect(loggingPlugin.options).toEqual(customOptions);
    
    // Test plugin with minimal options
    const minimalPlugin = new LoggingPlugin();
    expect(minimalPlugin.logLevel).toBe('info'); // Default
    expect(minimalPlugin.enableColors).toBe(true); // Default
    expect(minimalPlugin.enableTimestamps).toBe(true); // Default
  });

  test('Plugin Event Listeners', async () => {
    const events = [];
    
    class EventTestPlugin extends Plugin {
      async setup(database) {
        await super.setup(database);
        
        // Listen to plugin events
        this.on('plugin.setup', (data) => events.push('setup'));
        this.on('plugin.start', (data) => events.push('start'));
        this.on('plugin.stop', (data) => events.push('stop'));
        
        // Listen to database events
        database.on('s3db.resourceCreated', (resourceName) => {
          events.push(`resource.created.${resourceName}`);
        });
      }
    }
    
    const eventPlugin = new EventTestPlugin();
    
    s3db = new S3db({
      connectionString,
      plugins: [eventPlugin]
    });
    
    await s3db.connect();
    
    // Create a resource to trigger events
    await s3db.createResource({
      name: 'test-resource',
      attributes: {
        name: 'string|required'
      }
    });
    
    expect(events).toContain('setup');
    expect(events).toContain('start');
    expect(events).toContain('resource.created.test-resource');
    
    // Cleanup
    await s3db.client.deleteAll({ prefix: '' });
  });

  test('Plugin Metrics and Statistics', async () => {
    const loggingPlugin = new LoggingPlugin({ logLevel: 'debug' });
    
    s3db = new S3db({
      connectionString,
      plugins: [CostsPlugin, loggingPlugin]
    });
    
    await s3db.connect();
    
    // Perform some operations to generate metrics
    const users = await s3db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required'
      }
    });
    
    await users.insert({ name: 'John', email: 'john@example.com' });
    await users.list();
    await users.count();
    
    // Test logging plugin stats
    const stats = loggingPlugin.getStats();
    expect(stats.uptime).toBeDefined();
    expect(stats.totalOperations).toBeDefined();
    expect(stats.averageRate).toBeDefined();
    expect(stats.operations).toBeDefined();
    
    // Test costs plugin stats
    expect(s3db.client.costs.total).toBeGreaterThan(0);
    expect(s3db.client.costs.requests.total).toBeGreaterThan(0);
    
    // Cleanup
    await s3db.client.deleteAll({ prefix: '' });
  });
});