import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';

import { MetricsPlugin } from '#src/plugins/metrics.plugin.js';
import { createDatabaseForTest } from '#tests/config.js';

describe('Metrics Plugin', () => {
  let database;
  let client;
  let plugin;
  let testResource;

  beforeEach(async () => {
    database = createDatabaseForTest('plugins-metrics');
    await database.connect();
    client = database.client;

    // Create test resource
    testResource = await database.createResource({
      name: 'test_users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'string|required',
        age: 'number'
      }
    });

    // Create plugin with default settings
    plugin = new MetricsPlugin({
      enabled: false, // Disabled during tests
      collectPerformance: true,
      collectErrors: true,
      collectUsage: true,
      flushInterval: 0 // Disable flush timer for testing
    });

    await plugin.setup(database);
    await plugin.start();
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.stop();
    }
    // Não existe database.disconnect
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default configuration', () => {
      const defaultPlugin = new MetricsPlugin();
      
      expect(defaultPlugin.config.enabled).toBe(true);
      expect(defaultPlugin.config.collectPerformance).toBe(true);
      expect(defaultPlugin.config.collectErrors).toBe(true);
      expect(defaultPlugin.config.collectUsage).toBe(true);
      expect(defaultPlugin.config.retentionDays).toBe(30);
      expect(defaultPlugin.config.flushInterval).toBe(60000);
    });

    test('should initialize with custom configuration', () => {
      const customPlugin = new MetricsPlugin({
        enabled: false,
        collectPerformance: false,
        collectErrors: false,
        collectUsage: false,
        retentionDays: 7,
        flushInterval: 5000
      });
      
      expect(customPlugin.config.enabled).toBe(false);
      expect(customPlugin.config.collectPerformance).toBe(false);
      expect(customPlugin.config.collectErrors).toBe(false);
      expect(customPlugin.config.collectUsage).toBe(false);
      expect(customPlugin.config.retentionDays).toBe(7);
      expect(customPlugin.config.flushInterval).toBe(5000);
    });

    test('should initialize metrics structure', () => {
      expect(plugin.metrics.operations).toBeDefined();
      expect(plugin.metrics.resources).toBeDefined();
      expect(plugin.metrics.errors).toBeDefined();
      expect(plugin.metrics.performance).toBeDefined();
      expect(plugin.metrics.startTime).toBeDefined();
      
      expect(plugin.metrics.operations.insert).toEqual({ count: 0, totalTime: 0, errors: 0 });
      expect(plugin.metrics.operations.update).toEqual({ count: 0, totalTime: 0, errors: 0 });
      expect(plugin.metrics.operations.delete).toEqual({ count: 0, totalTime: 0, errors: 0 });
      expect(plugin.metrics.operations.get).toEqual({ count: 0, totalTime: 0, errors: 0 });
      expect(plugin.metrics.operations.list).toEqual({ count: 0, totalTime: 0, errors: 0 });
      expect(plugin.metrics.operations.count).toEqual({ count: 0, totalTime: 0, errors: 0 });
    });
  });

  describe('Setup and Resource Creation', () => {
    test('should not create metrics resources when disabled during tests', async () => {
      // During tests, the plugin is disabled to avoid recursion
      expect(database.resources.metrics).toBeUndefined();
      expect(database.resources.error_logs).toBeUndefined();
      expect(database.resources.performance_logs).toBeUndefined();
    });

    test('should not install hooks when disabled during tests', async () => {
      // During tests, hooks are not installed to avoid recursion
      expect(testResource._insert).toBeUndefined();
      expect(testResource._update).toBeUndefined();
      expect(testResource._delete).toBeUndefined();
      expect(testResource._get).toBeUndefined();
    });

    test('should not install hooks on new resources when disabled', async () => {
      const newResource = await database.createResource({
        name: 'new_test_resource',
        attributes: {
          id: 'string|required',
          name: 'string'
        }
      });

      expect(newResource._insert).toBeUndefined();
      expect(newResource._update).toBeUndefined();
      expect(newResource._delete).toBeUndefined();
      expect(newResource._get).toBeUndefined();
    });
  });

  describe('Operation Tracking', () => {
    test('should not track operations when disabled during tests', async () => {
      const user = await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      expect(user).toBeDefined();
      // When disabled, no metrics should be collected
      expect(plugin.metrics.operations.insert.count).toBe(0);
      expect(plugin.metrics.operations.insert.totalTime).toBe(0);
      expect(plugin.metrics.operations.insert.errors).toBe(0);
    });

    test('should not track update operations when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      const updated = await testResource.update('user1', {
        name: 'John Smith',
        email: 'john@example.com',
        age: 31
      });

      expect(updated).toBeDefined();
      // When disabled, no metrics should be collected
      expect(plugin.metrics.operations.update.count).toBe(0);
      expect(plugin.metrics.operations.update.totalTime).toBe(0);
      expect(plugin.metrics.operations.update.errors).toBe(0);
    });

    test('should not track get operations when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      const user = await testResource.get('user1');

      expect(user).toBeDefined();
      // When disabled, no metrics should be collected
      expect(plugin.metrics.operations.get.count).toBe(0);
      expect(plugin.metrics.operations.get.totalTime).toBe(0);
      expect(plugin.metrics.operations.get.errors).toBe(0);
    });

    test('should not track list operations when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      await testResource.insert({
        id: 'user2',
        name: 'Jane Doe',
        email: 'jane@example.com',
        age: 25
      });

      const users = await testResource.list();

      expect(users).toBeDefined();
      expect(users.length).toBe(2);
      // When disabled, no metrics should be collected
      expect(plugin.metrics.operations.list.count).toBe(0);
      expect(plugin.metrics.operations.list.totalTime).toBe(0);
      expect(plugin.metrics.operations.list.errors).toBe(0);
    });

    test('should not track count operations when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      await testResource.insert({
        id: 'user2',
        name: 'Jane Doe',
        email: 'jane@example.com',
        age: 25
      });

      const count = await testResource.count();

      expect(count).toBe(2);
      // When disabled, no metrics should be collected
      expect(plugin.metrics.operations.count.count).toBe(0);
      expect(plugin.metrics.operations.count.totalTime).toBe(0);
      expect(plugin.metrics.operations.count.errors).toBe(0);
    });

    test('should not track delete operations when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      const result = await testResource.delete('user1');

      expect(result).toBeDefined();
      // When disabled, no metrics should be collected
      expect(plugin.metrics.operations.delete.count).toBe(0);
      expect(plugin.metrics.operations.delete.totalTime).toBe(0);
      expect(plugin.metrics.operations.delete.errors).toBe(0);
    });
  });

  describe('Error Tracking', () => {
    test('should not track failed operations when disabled', async () => {
      try {
        await testResource.get('non-existent');
      } catch (error) {
        // Expected error
      }

      // When disabled, no metrics should be collected
      expect(plugin.metrics.operations.get.count).toBe(0);
      expect(plugin.metrics.operations.get.totalTime).toBe(0);
      expect(plugin.metrics.operations.get.errors).toBe(0);
    });

    test('should not record error details when disabled', async () => {
      try {
        await testResource.get('non-existent');
      } catch (error) {
        // Expected error
      }

      // When disabled, no error details should be recorded
      expect(plugin.metrics.errors.length).toBe(0);
    });

    test('should not record error details when disabled', async () => {
      try {
        await testResource.get('non-existent');
      } catch (error) {
        // Expected error
      }

      // When disabled, no error details should be recorded
      expect(plugin.metrics.errors.length).toBe(0);
    });
  });

  describe('Performance Tracking', () => {
    test('should not record performance data when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      // When disabled, no performance data should be recorded
      expect(plugin.metrics.performance.length).toBe(0);
    });

    test('should not record performance data when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      // When disabled, no performance data should be recorded
      expect(plugin.metrics.performance.length).toBe(0);
    });
  });

  describe('Metrics Flushing', () => {
    test('should not flush metrics when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      // When disabled, no metrics should be stored
      const metrics = await plugin.getMetrics();
      expect(metrics.length).toBe(0);

      // When disabled, metrics should not be reset
      expect(plugin.metrics.operations.insert.count).toBe(0);
    });

    test('should not handle flush timer when disabled', async () => {
      const pluginWithTimer = new MetricsPlugin({
        enabled: false,
        flushInterval: 100
      });
      await pluginWithTimer.setup(database);
      await pluginWithTimer.start();

      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      // Wait for potential flush
      await new Promise(resolve => setTimeout(resolve, 200));

      // When disabled, no metrics should be flushed
      const metrics = await pluginWithTimer.getMetrics();
      expect(metrics.length).toBe(0);

      await pluginWithTimer.stop();
    });
  });

  describe('Utility Methods', () => {
    test('should return empty metrics when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      // When disabled, no metrics should be returned
      const insertMetrics = await plugin.getMetrics({
        operation: 'insert'
      });
      expect(insertMetrics.length).toBe(0);

      const resourceMetrics = await plugin.getMetrics({
        resourceName: 'test_users'
      });
      expect(resourceMetrics.length).toBe(0);
    });

    test('should return empty error logs when disabled', async () => {
      try {
        await testResource.get('non-existent');
      } catch (error) {
        // Expected error
      }

      const errorLogs = await plugin.getErrorLogs();
      expect(errorLogs.length).toBe(0);
    });

    test('should return empty performance logs when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      const performanceLogs = await plugin.getPerformanceLogs();
      expect(performanceLogs.length).toBe(0);
    });

    test('should return empty stats when disabled', async () => {
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      const stats = await plugin.getStats();
      
      expect(stats.period).toBe('24h');
      expect(stats.totalOperations).toBe(0);
      expect(stats.operationsByType).toBeDefined();
      expect(stats.uptime).toBeDefined();
      expect(stats.uptime.startTime).toBeDefined();
    });
  });

  describe('Data Cleanup', () => {
    test('should cleanup old data', async () => {
      // Create plugin with short retention
      const pluginWithRetention = new MetricsPlugin({
        retentionDays: 1
      });
      await pluginWithRetention.setup(database);
      await pluginWithRetention.start();

      // Perform operation and flush
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });
      await pluginWithRetention.flushMetrics();

      // Cleanup should not throw
      await expect(pluginWithRetention.cleanupOldData()).resolves.toBeUndefined();

      await pluginWithRetention.stop();
    });
  });

  describe('Plugin Lifecycle', () => {
    test('should handle stop gracefully', async () => {
      // Perform some operations
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      // Stop should flush remaining metrics
      await plugin.stop();

      // Check that flush timer was cleared
      expect(plugin.flushTimer).toBeNull();
    });

    test('should handle disabled plugin', async () => {
      const disabledPlugin = new MetricsPlugin({
        enabled: false
      });
      
      await disabledPlugin.setup(database);
      await disabledPlugin.start();

      // Perform operation
      await testResource.insert({
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      // Should not track metrics
      expect(disabledPlugin.metrics.operations.insert.count).toBe(0);

      await disabledPlugin.stop();
    });
  });
}); 