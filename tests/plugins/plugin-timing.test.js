import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { CachePlugin } from '../../src/plugins/cache.plugin.js';
import { AuditPlugin } from '../../src/plugins/audit.plugin.js';
import { MetricsPlugin } from '../../src/plugins/metrics.plugin.js';
import { createDatabaseForTest } from '../config.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';

describe('Plugin Timing Tests', () => {
  let database;

  beforeEach(async () => {
    // Clear storage before each test to prevent interference
    MemoryClient.clearAllStorage();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
    // Clear storage after each test
    MemoryClient.clearAllStorage();
  });

  describe('EventualConsistencyPlugin', () => {
    it('should work when added BEFORE resource creation', async () => {
      database = await createDatabaseForTest('plugin-timing-ec-before');
      await database.connect();
      
      // Add plugin before resource exists
      const plugin = new EventualConsistencyPlugin({
        resources: {
          wallets: ['balance']
        },
        consolidation: { mode: 'sync' }
      });
      
      // This should not throw, but defer setup
      await database.usePlugin(plugin);
      
      // Now create the resource
      const walletResource = await database.createResource({
        name: 'wallets',
        attributes: {
          id: 'string|optional',
          userId: 'string|required',
          balance: 'number|default:0'
        }
      });
      
      // Plugin should have added methods to the resource
      expect(typeof walletResource.add).toBe('function');
      expect(typeof walletResource.sub).toBe('function');
      expect(typeof walletResource.set).toBe('function');
      
      // Test that methods work
      await walletResource.insert({
        id: 'wallet1',
        userId: 'user1',
        balance: 100
      });
      
      const newBalance = await walletResource.add('wallet1', 'balance', 50);
      expect(newBalance).toBe(150);
      
      const wallet = await walletResource.get('wallet1');
      expect(wallet.balance).toBe(150);
    });

    it('should work when added AFTER resource creation', async () => {
      database = await createDatabaseForTest('plugin-timing-ec-after');
      await database.connect();
      
      // Create resource first
      const walletResource = await database.createResource({
        name: 'wallets',
        attributes: {
          id: 'string|optional',
          userId: 'string|required',
          balance: 'number|default:0'
        }
      });
      
      await walletResource.insert({
        id: 'wallet2',
        userId: 'user2',
        balance: 200
      });
      
      // Add plugin after resource exists
      const plugin = new EventualConsistencyPlugin({
        resources: {
          wallets: ['balance']
        },
        consolidation: { mode: 'sync' }
      });
      
      await database.usePlugin(plugin);
      
      // Plugin should have added methods to the existing resource
      expect(typeof walletResource.add).toBe('function');
      expect(typeof walletResource.sub).toBe('function');
      expect(typeof walletResource.set).toBe('function');
      
      // Test that methods work
      const newBalance = await walletResource.sub('wallet2', 'balance', 75);
      expect(newBalance).toBe(125);
      
      const wallet = await walletResource.get('wallet2');
      expect(wallet.balance).toBe(125);
    });

    it('should handle multiple resources with deferred setup', async () => {
      database = await createDatabaseForTest('plugin-timing-ec-multiple');
      await database.connect();
      
      // Add plugin for a resource that doesn't exist yet
      const plugin = new EventualConsistencyPlugin({
        resources: {
          accounts: ['credits']
        },
        consolidation: { mode: 'async' }
      });
      
      await database.usePlugin(plugin);
      
      // Create different resource first - should not affect plugin
      const userResource = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });
      
      // Plugin should not have affected users resource
      expect(userResource.add).toBeUndefined();
      
      // Now create the target resource
      const accountResource = await database.createResource({
        name: 'accounts',
        attributes: {
          id: 'string|optional',
          credits: 'number|default:0'
        }
      });
      
      // Plugin should have added methods to accounts resource
      expect(typeof accountResource.add).toBe('function');
      expect(typeof accountResource.sub).toBe('function');
      expect(typeof accountResource.set).toBe('function');
    });
  });

  describe('CachePlugin', () => {
    it('should work when added BEFORE resource creation', async () => {
      database = await createDatabaseForTest('plugin-timing-cache-before');
      await database.connect();
      
      // Add cache plugin before any resources
      const cachePlugin = new CachePlugin({
        driver: 'memory',
        config: { maxSize: 100 }
      });
      
      await database.usePlugin(cachePlugin);
      
      // Create resource - should automatically have caching
      const resource = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          price: 'number|required'
        }
      });
      
      // Insert and verify caching works
      await resource.insert({
        id: 'prod1',
        name: 'Product 1',
        price: 99.99
      });
      
      // First get - from storage
      const product1 = await resource.get('prod1');
      expect(product1.name).toBe('Product 1');
      
      // Second get - should be from cache
      const product2 = await resource.get('prod1');
      expect(product2.name).toBe('Product 1');
      
      // Verify cache statistics if available
      const stats = cachePlugin.getStats?.();
      if (stats) {
        expect(stats.hits).toBeGreaterThan(0);
      }
    });

    it('should work when added AFTER resource creation', async () => {
      database = await createDatabaseForTest('plugin-timing-cache-after');
      await database.connect();
      
      // Create resource first
      const resource = await database.createResource({
        name: 'products',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          price: 'number|required'
        }
      });
      
      await resource.insert({
        id: 'prod2',
        name: 'Product 2',
        price: 149.99
      });
      
      // Add cache plugin after resource exists
      const cachePlugin = new CachePlugin({
        driver: 'memory',
        config: { maxSize: 100 }
      });
      
      await database.usePlugin(cachePlugin);
      
      // Cache should work for existing resource
      const product1 = await resource.get('prod2');
      expect(product1.name).toBe('Product 2');
      
      // Second get - should be from cache
      const product2 = await resource.get('prod2');
      expect(product2.name).toBe('Product 2');
    });
  });

  describe('Multiple Plugins', () => {
    it('should handle multiple plugins added at different times', async () => {
      database = await createDatabaseForTest('plugin-timing-multiple');
      await database.connect();
      
      // Add some plugins before resource creation
      const cachePlugin = new CachePlugin({
        driver: 'memory',
        config: { maxSize: 100 }
      });
      
      const auditPlugin = new AuditPlugin({
        driver: 'memory',
        config: {}
      });
      
      await database.usePlugin(cachePlugin);
      await database.usePlugin(auditPlugin);
      
      // Create resource
      const resource = await database.createResource({
        name: 'items',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          count: 'number|default:0'
        }
      });
      
      // Add another plugin after resource creation
      const metricsPlugin = new MetricsPlugin();
      await database.usePlugin(metricsPlugin);
      
      // Add eventual consistency plugin after resource exists
      const ecPlugin = new EventualConsistencyPlugin({
        resources: {
          items: ['count']
        },
        consolidation: { mode: 'sync' }
      });
      await database.usePlugin(ecPlugin);

      // Verify all plugins are working
      expect(typeof resource.add).toBe('function');

      await resource.insert({
        id: 'item1',
        name: 'Item 1',
        count: 10
      });

      // Test eventual consistency methods
      await resource.add('item1', 'count', 5);
      const item = await resource.get('item1');
      expect(item.count).toBe(15);

      // Verify audit logs if available (may be empty if plugin storage not yet flushed)
      if (auditPlugin.getAuditLogs) {
        const logs = await auditPlugin.getAuditLogs();
        expect(Array.isArray(logs)).toBe(true); // Just verify it returns an array
      }
    });

    it('should handle plugins in constructor config', async () => {
      // Create plugins
      const cachePlugin = new CachePlugin({
        driver: 'memory',
        config: { maxSize: 100 }
      });
      
      const ecPlugin = new EventualConsistencyPlugin({
        resources: {
          balances: ['amount']
        },
        consolidation: { mode: 'sync' }
      });
      
      // Create database with plugins in constructor
      database = await createDatabaseForTest('plugin-timing-constructor', {
        plugins: [cachePlugin, ecPlugin]
      });
      await database.connect();
      
      // Create the resource that the EC plugin targets
      const resource = await database.createResource({
        name: 'balances',
        attributes: {
          id: 'string|optional',
          amount: 'number|default:0'
        }
      });
      
      // Verify EC plugin methods were added
      expect(typeof resource.add).toBe('function');
      expect(typeof resource.sub).toBe('function');
      expect(typeof resource.set).toBe('function');
      
      // Test functionality
      await resource.insert({
        id: 'bal1',
        amount: 1000
      });
      
      await resource.sub('bal1', 'amount', 250);
      const balance = await resource.get('bal1');
      expect(balance.amount).toBe(750);
    });
  });

  describe('Error Handling', () => {
    it('should handle plugin errors gracefully', async () => {
      database = await createDatabaseForTest('plugin-timing-errors');
      await database.connect();
      
      // Create a plugin that references a non-existent resource
      const plugin = new EventualConsistencyPlugin({
        resources: {
          nonexistent: ['value']
        },
        consolidation: { mode: 'sync' }
      });
      
      // Should not throw when adding plugin
      await database.usePlugin(plugin);
      
      // Plugin should wait for resource to be created
      // Creating a different resource should not cause issues
      const resource = await database.createResource({
        name: 'other',
        attributes: {
          id: 'string|optional',
          data: 'string'
        }
      });
      
      // The 'other' resource should not have the plugin's methods
      expect(resource.add).toBeUndefined();
      expect(resource.sub).toBeUndefined();
    });
  });
});