/**
 * Plugin Exports Validation Test
 * Ensures all plugins can be imported via named imports from 's3db.js'
 * This test prevents production errors where plugins are implemented but not exported.
 */


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

  it('should only export named exports (no default exports)', async () => {
    // Verify plugins use named exports only
    const auditModule = await import('../../src/plugins/audit.plugin.js');
    expect(auditModule.AuditPlugin).toBeDefined();
    expect(auditModule.default).toBeUndefined();

    const backupModule = await import('../../src/plugins/backup.plugin.js');
    expect(backupModule.BackupPlugin).toBeDefined();
    expect(backupModule.default).toBeUndefined();

    const cacheModule = await import('../../src/plugins/cache.plugin.js');
    expect(cacheModule.CachePlugin).toBeDefined();
    expect(cacheModule.default).toBeUndefined();

    const queueModule = await import('../../src/plugins/queue-consumer.plugin.js');
    expect(queueModule.QueueConsumerPlugin).toBeDefined();
    expect(queueModule.default).toBeUndefined();

    const replicatorModule = await import('../../src/plugins/replicator.plugin.js');
    expect(replicatorModule.ReplicatorPlugin).toBeDefined();
    expect(replicatorModule.default).toBeUndefined();
  });
});
