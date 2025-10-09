/**
 * Plugin Exports Validation Test
 * Ensures all plugins can be imported via named imports from 's3db.js'
 * This test prevents production errors where plugins are implemented but not exported.
 */

import { describe, it, expect } from '@jest/globals';

describe('Plugin Exports', () => {
  it('should export all plugin classes as named exports from main package', async () => {
    // Import all plugins from the main package
    const s3db = await import('../../src/index.js');

    // List of all plugin classes/objects that should be exportable
    const requiredPlugins = [
      'AuditPlugin',
      'BackupPlugin',
      'CachePlugin',
      'CostsPlugin',
      'EventualConsistencyPlugin',
      'FullTextPlugin',
      'MetricsPlugin',
      'QueueConsumerPlugin',
      'ReplicatorPlugin',
      'S3QueuePlugin',
      'SchedulerPlugin',
      'StateMachinePlugin',
    ];

    // Verify each plugin is exported
    for (const pluginName of requiredPlugins) {
      expect(s3db[pluginName]).toBeDefined();
      expect(s3db[pluginName]).not.toBeNull();

      // Verify it's either a class or an object with setup method
      const plugin = s3db[pluginName];
      const isClass = typeof plugin === 'function' && /^class\s/.test(Function.prototype.toString.call(plugin));
      const isPluginObject = typeof plugin === 'object' && typeof plugin.setup === 'function';

      expect(isClass || isPluginObject).toBe(true);
    }
  });

  it('should export Plugin base class', async () => {
    const { Plugin } = await import('../../src/index.js');

    expect(Plugin).toBeDefined();
    expect(typeof Plugin).toBe('function');
  });

  it('should allow direct import of each plugin from src/plugins/index.js', async () => {
    const plugins = await import('../../src/plugins/index.js');

    const requiredPlugins = [
      'AuditPlugin',
      'BackupPlugin',
      'CachePlugin',
      'CostsPlugin',
      'EventualConsistencyPlugin',
      'FullTextPlugin',
      'MetricsPlugin',
      'QueueConsumerPlugin',
      'ReplicatorPlugin',
      'S3QueuePlugin',
      'SchedulerPlugin',
      'StateMachinePlugin',
      'Plugin',
    ];

    for (const pluginName of requiredPlugins) {
      expect(plugins[pluginName]).toBeDefined();
    }
  });

  it('should allow default import of individual plugins', async () => {
    // Test a few plugins with default imports
    const AuditPlugin = (await import('../../src/plugins/audit.plugin.js')).default;
    const BackupPlugin = (await import('../../src/plugins/backup.plugin.js')).default;
    const CachePlugin = (await import('../../src/plugins/cache.plugin.js')).default;
    const QueueConsumerPlugin = (await import('../../src/plugins/queue-consumer.plugin.js')).default;
    const ReplicatorPlugin = (await import('../../src/plugins/replicator.plugin.js')).default;

    expect(AuditPlugin).toBeDefined();
    expect(BackupPlugin).toBeDefined();
    expect(CachePlugin).toBeDefined();
    expect(QueueConsumerPlugin).toBeDefined();
    expect(ReplicatorPlugin).toBeDefined();
  });

  it('should have matching named and default exports', async () => {
    // Verify that named export and default export are the same
    const auditModule = await import('../../src/plugins/audit.plugin.js');
    expect(auditModule.AuditPlugin).toBe(auditModule.default);

    const backupModule = await import('../../src/plugins/backup.plugin.js');
    expect(backupModule.BackupPlugin).toBe(backupModule.default);

    const cacheModule = await import('../../src/plugins/cache.plugin.js');
    expect(cacheModule.CachePlugin).toBe(cacheModule.default);

    const queueModule = await import('../../src/plugins/queue-consumer.plugin.js');
    expect(queueModule.QueueConsumerPlugin).toBe(queueModule.default);

    const replicatorModule = await import('../../src/plugins/replicator.plugin.js');
    expect(replicatorModule.ReplicatorPlugin).toBe(replicatorModule.default);
  });
});
