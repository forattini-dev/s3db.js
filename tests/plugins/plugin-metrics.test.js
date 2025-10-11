import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';
import { MetricsPlugin } from '../../src/plugins/metrics.plugin.js';

describe('MetricsPlugin Coverage Tests', () => {
  let database;
  let metricsPlugin;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=plugins/metrics');
    await database.connect();
    
    metricsPlugin = new MetricsPlugin({
      enabled: true,
      collectPerformance: true,
      collectErrors: true,
      collectUsage: true,
      retentionDays: 30,
      flushInterval: 0 // Disable auto-flush in tests
    });
    
    // Setup plugin with forced environment for tests
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      await metricsPlugin.install(database);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  afterEach(async () => {
    if (metricsPlugin) {
      await metricsPlugin.stop();
    }
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  describe('Plugin Initialization', () => {
    test('should initialize with default configuration', () => {
      const plugin = new MetricsPlugin();
      expect(plugin.config.collectPerformance).toBe(true);
      expect(plugin.config.collectErrors).toBe(true);
      expect(plugin.config.retentionDays).toBe(30);
      expect(plugin.metrics).toBeDefined();
      expect(plugin.metrics.operations).toBeDefined();
    });

    test('should initialize with custom configuration', () => {
      const plugin = new MetricsPlugin({
        enabled: false,
        collectPerformance: false,
        retentionDays: 60,
        flushInterval: 120000
      });
      expect(plugin.config.enabled).toBe(false);
      expect(plugin.config.collectPerformance).toBe(false);
      expect(plugin.config.retentionDays).toBe(60);
      expect(plugin.config.flushInterval).toBe(120000);
    });

    test('should have correct initial metrics structure', () => {
      const plugin = new MetricsPlugin();
      expect(plugin.metrics.operations.insert).toEqual({ count: 0, totalTime: 0, errors: 0 });
      expect(plugin.metrics.operations.update).toEqual({ count: 0, totalTime: 0, errors: 0 });
      expect(plugin.metrics.operations.delete).toEqual({ count: 0, totalTime: 0, errors: 0 });
      expect(plugin.metrics.operations.get).toEqual({ count: 0, totalTime: 0, errors: 0 });
      expect(plugin.metrics.operations.list).toEqual({ count: 0, totalTime: 0, errors: 0 });
      expect(plugin.metrics.operations.count).toEqual({ count: 0, totalTime: 0, errors: 0 });
    });
  });

  describe('Plugin Setup', () => {
    test('should setup plugin without errors', async () => {
      await expect(metricsPlugin.install(database)).resolves.not.toThrow();
      expect(metricsPlugin.database).toBe(database);
    });

    test('should create metrics resources during setup', async () => {
      // Resources should be available from beforeEach setup
      expect(metricsPlugin.metricsResource).toBeDefined();
      expect(metricsPlugin.errorsResource).toBeDefined();
      expect(metricsPlugin.performanceResource).toBeDefined();
    });

    test('should handle setup when resources already exist', async () => {
      // Create resources first
      await database.createResource({
        name: 'metrics',
        attributes: { id: 'string|required', type: 'string|required' }
      });
      
      await expect(metricsPlugin.install(database)).resolves.not.toThrow();
    });

    test('should skip setup when disabled', async () => {
      const disabledPlugin = new MetricsPlugin({ enabled: false });
      await disabledPlugin.install(database);
      
      expect(disabledPlugin.database).toBe(database);
      // Should not create timer when disabled
      expect(disabledPlugin.flushTimer).toBeNull();
    });
  });

  describe('Operation Recording', () => {
    beforeEach(async () => {
      await metricsPlugin.install(database);
    });

    test('should record operation metrics', () => {
      metricsPlugin.recordOperation('test_resource', 'insert', 100, false);
      
      expect(metricsPlugin.metrics.operations.insert.count).toBe(1);
      expect(metricsPlugin.metrics.operations.insert.totalTime).toBe(100);
      expect(metricsPlugin.metrics.operations.insert.errors).toBe(0);
    });

    test('should record operation errors', () => {
      metricsPlugin.recordOperation('test_resource', 'insert', 150, true);
      
      expect(metricsPlugin.metrics.operations.insert.count).toBe(1);
      expect(metricsPlugin.metrics.operations.insert.totalTime).toBe(150);
      expect(metricsPlugin.metrics.operations.insert.errors).toBe(1);
    });

    test('should record resource-specific metrics', () => {
      metricsPlugin.recordOperation('test_resource', 'get', 50, false);
      
      expect(metricsPlugin.metrics.resources.test_resource).toBeDefined();
      expect(metricsPlugin.metrics.resources.test_resource.get.count).toBe(1);
      expect(metricsPlugin.metrics.resources.test_resource.get.totalTime).toBe(50);
    });

    test('should record performance data when enabled', () => {
      const initialLength = metricsPlugin.metrics.performance.length;
      metricsPlugin.recordOperation('test_resource', 'update', 200, false);
      
      expect(metricsPlugin.metrics.performance.length).toBe(initialLength + 1);
      expect(metricsPlugin.metrics.performance[initialLength].resourceName).toBe('test_resource');
      expect(metricsPlugin.metrics.performance[initialLength].operation).toBe('update');
      expect(metricsPlugin.metrics.performance[initialLength].duration).toBe(200);
    });

    test('should record error details', () => {
      const error = new Error('Test error message');
      metricsPlugin.recordError('test_resource', 'insert', error);
      
      expect(metricsPlugin.metrics.errors.length).toBe(1);
      expect(metricsPlugin.metrics.errors[0].resourceName).toBe('test_resource');
      expect(metricsPlugin.metrics.errors[0].operation).toBe('insert');
      expect(metricsPlugin.metrics.errors[0].error).toBe('Test error message');
    });

    test('should not record errors when disabled', () => {
      const noErrorPlugin = new MetricsPlugin({ collectErrors: false });
      const error = new Error('Test error');
      noErrorPlugin.recordError('test_resource', 'insert', error);
      
      expect(noErrorPlugin.metrics.errors.length).toBe(0);
    });
  });

  describe('Hook Installation', () => {
    beforeEach(async () => {
      await metricsPlugin.install(database);
    });

    test('should install hooks on existing resources', async () => {
      const resource = await database.createResource({
        name: 'test_hooks',
        attributes: {
          id: 'string|required',
          name: 'string|required'
        }
      });

      metricsPlugin.installResourceHooks(resource);

      // Check that original methods are stored
      expect(resource._insert).toBeDefined();
      expect(resource._update).toBeDefined();
      expect(resource._get).toBeDefined();
      expect(resource._delete).toBeDefined();
    });

    test('should record metrics through hooked insert operation', async () => {
      const resource = await database.createResource({
        name: 'test_insert_hook',
        attributes: {
          id: 'string|required',
          name: 'string|required'
        }
      });

      metricsPlugin.installResourceHooks(resource);

      await resource.insert({ id: 'test-1', name: 'Test Item' });

      expect(metricsPlugin.metrics.operations.insert.count).toBeGreaterThan(0);
      expect(metricsPlugin.metrics.resources.test_insert_hook.insert.count).toBeGreaterThan(0);
    });

    test('should record metrics through hooked get operation', async () => {
      const resource = await database.createResource({
        name: 'test_get_hook',
        attributes: {
          id: 'string|required',
          name: 'string|required'
        }
      });

      metricsPlugin.installResourceHooks(resource);

      // Insert first to have something to get
      await resource.insert({ id: 'test-2', name: 'Test Item 2' });
      await resource.get('test-2');

      expect(metricsPlugin.metrics.operations.get.count).toBeGreaterThan(0);
      expect(metricsPlugin.metrics.resources.test_get_hook.get.count).toBeGreaterThan(0);
    });

    test('should record metrics through hooked update operation', async () => {
      const resource = await database.createResource({
        name: 'test_update_hook',
        attributes: {
          id: 'string|required',
          name: 'string|required'
        }
      });

      metricsPlugin.installResourceHooks(resource);

      await resource.insert({ id: 'test-3', name: 'Test Item 3' });
      await resource.update('test-3', { name: 'Updated Name' });

      expect(metricsPlugin.metrics.operations.update.count).toBeGreaterThan(0);
      expect(metricsPlugin.metrics.resources.test_update_hook.update.count).toBeGreaterThan(0);
    });

    test('should record metrics through hooked delete operation', async () => {
      const resource = await database.createResource({
        name: 'test_delete_hook',
        attributes: {
          id: 'string|required',
          name: 'string|required'
        }
      });

      metricsPlugin.installResourceHooks(resource);

      await resource.insert({ id: 'test-4', name: 'Test Item 4' });
      await resource.delete('test-4');

      expect(metricsPlugin.metrics.operations.delete.count).toBeGreaterThan(0);
      expect(metricsPlugin.metrics.resources.test_delete_hook.delete.count).toBeGreaterThan(0);
    });

    test('should skip metrics resources when installing hooks', async () => {
      await metricsPlugin.install(database);

      // Should not install hooks on metrics resources
      const metricsResource = metricsPlugin.metricsResource;
      expect(metricsResource._insert).toBeUndefined();
    });
  });

  describe('Metrics Flushing', () => {
    beforeEach(async () => {
      await metricsPlugin.install(database);
    });

    test('should flush metrics to storage', async () => {
      // Record some metrics first
      metricsPlugin.recordOperation('test_flush', 'insert', 100, false);
      metricsPlugin.recordOperation('test_flush', 'get', 50, false);

      await metricsPlugin.flushMetrics();

      // Check that metrics were stored
      const storedMetrics = await metricsPlugin.metricsResource.getAll();
      expect(storedMetrics.length).toBeGreaterThan(0);
    });

    test('should reset metrics after flushing', async () => {
      metricsPlugin.recordOperation('test_reset', 'insert', 100, false);
      expect(metricsPlugin.metrics.operations.insert.count).toBe(1);

      metricsPlugin.resetMetrics();
      expect(metricsPlugin.metrics.operations.insert.count).toBe(0);
      expect(metricsPlugin.metrics.operations.insert.totalTime).toBe(0);
      expect(metricsPlugin.metrics.operations.insert.errors).toBe(0);
    });

    test('should handle flush errors gracefully', async () => {
      // Mock a failing metricsResource
      metricsPlugin.metricsResource = null;
      
      await expect(metricsPlugin.flushMetrics()).resolves.not.toThrow();
    });
  });

  describe('Utility Methods', () => {
    beforeEach(async () => {
      await metricsPlugin.install(database);
      
      // Add some test data
      const now = new Date();
      await metricsPlugin.metricsResource.insert({
        id: 'test-metric-1',
        type: 'operation',
        resourceName: 'test_resource',
        operation: 'insert',
        count: 5,
        totalTime: 500,
        errors: 0,
        avgTime: 100,
        timestamp: now.toISOString(),
        createdAt: now.toISOString().slice(0, 10),
        metadata: {}
      });
    });

    test('should get metrics with filters', async () => {
      const metrics = await metricsPlugin.getMetrics({
        type: 'operation',
        resourceName: 'test_resource'
      });

      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].type).toBe('operation');
      expect(metrics[0].resourceName).toBe('test_resource');
    });

    test('should get metrics with date filters', async () => {
      const startDate = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
      const endDate = new Date().toISOString();

      const metrics = await metricsPlugin.getMetrics({
        startDate,
        endDate
      });

      expect(Array.isArray(metrics)).toBe(true);
    });

    test('should get error logs', async () => {
      // Add test error
      const now = new Date();
      await metricsPlugin.errorsResource.insert({
        id: 'test-error-1',
        resourceName: 'test_resource',
        operation: 'insert',
        error: 'Test error',
        timestamp: now.toISOString(),
        createdAt: now.toISOString().slice(0, 10),
        metadata: {}
      });

      const errors = await metricsPlugin.getErrorLogs({
        resourceName: 'test_resource'
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].resourceName).toBe('test_resource');
    });

    test('should get performance logs', async () => {
      // Add test performance log
      const now = new Date();
      await metricsPlugin.performanceResource.insert({
        id: 'test-perf-1',
        resourceName: 'test_resource',
        operation: 'get',
        duration: 150,
        timestamp: now.toISOString(),
        createdAt: now.toISOString().slice(0, 10),
        metadata: {}
      });

      const performance = await metricsPlugin.getPerformanceLogs({
        operation: 'get'
      });

      expect(performance.length).toBeGreaterThan(0);
      expect(performance[0].operation).toBe('get');
    });

    test('should get aggregated stats', async () => {
      const stats = await metricsPlugin.getStats();

      expect(stats).toBeDefined();
      expect(stats.period).toBe('24h');
      expect(typeof stats.totalOperations).toBe('number');
      expect(typeof stats.totalErrors).toBe('number');
      expect(stats.uptime).toBeDefined();
      expect(stats.uptime.startTime).toBeDefined();
    });
  });

  describe('Plugin Lifecycle', () => {
    test('should start plugin without errors', async () => {
      await expect(metricsPlugin.start()).resolves.not.toThrow();
    });

    test('should stop plugin and clear timer', async () => {
      await metricsPlugin.install(database);
      await metricsPlugin.start();
      
      // Simulate timer being set
      metricsPlugin.flushTimer = setInterval(() => {}, 1000);
      
      await metricsPlugin.stop();
      expect(metricsPlugin.flushTimer).toBeNull();
    });

    test('should handle timer management', () => {
      const plugin = new MetricsPlugin({ flushInterval: 1000 });
      
      // Should create timer when flushInterval > 0
      plugin.startFlushTimer();
      expect(plugin.flushTimer).not.toBeNull();
      
      // Clean up timer
      if (plugin.flushTimer) {
        clearInterval(plugin.flushTimer);
        plugin.flushTimer = null;
      }

      // Test with interval disabled
      plugin.config.flushInterval = 0;
      plugin.startFlushTimer();
      expect(plugin.flushTimer).toBeNull();
    });
  });

  describe('Data Cleanup', () => {
    beforeEach(async () => {
      await metricsPlugin.install(database);
    });

    test('should cleanup old data', async () => {
      // Add old data (simulate old timestamp)
      const oldDate = new Date(Date.now() - (40 * 24 * 60 * 60 * 1000)); // 40 days ago

      await metricsPlugin.metricsResource.insert({
        id: 'old-metric',
        type: 'operation',
        resourceName: 'test',
        operation: 'insert',
        count: 1,
        totalTime: 100,
        errors: 0,
        avgTime: 100,
        timestamp: oldDate.toISOString(),
        createdAt: oldDate.toISOString().slice(0, 10),
        metadata: {}
      });

      await expect(metricsPlugin.cleanupOldData()).resolves.not.toThrow();
    });
  });
}); 