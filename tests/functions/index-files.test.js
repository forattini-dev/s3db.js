import { describe, expect, test } from '@jest/globals';

describe('Index Files - Export Tests', () => {
  test('main index.js should export core classes', async () => {
    const { Database, S3db, Client, Resource, Schema, Validator, ConnectionString } = await import('../../src/index.js');
    
    expect(Database).toBeDefined();
    expect(S3db).toBeDefined();
    expect(Client).toBeDefined();
    expect(Resource).toBeDefined();
    expect(Schema).toBeDefined();
    expect(Validator).toBeDefined();
    expect(ConnectionString).toBeDefined();
    
    // Check they are functions/classes
    expect(typeof Database).toBe('function');
    expect(typeof S3db).toBe('function');
    expect(typeof Client).toBe('function');
    expect(typeof Resource).toBe('function');
    expect(typeof Schema).toBe('function');
    expect(typeof Validator).toBe('function');
    expect(typeof ConnectionString).toBe('function');
  });

  test('main index.js should export stream classes', async () => {
    const { ResourceReader, ResourceWriter, ResourceIdsReader, ResourceIdsPageReader, streamToString } = await import('../../src/index.js');
    
    expect(ResourceReader).toBeDefined();
    expect(ResourceWriter).toBeDefined();
    expect(ResourceIdsReader).toBeDefined();
    expect(ResourceIdsPageReader).toBeDefined();
    expect(streamToString).toBeDefined();
    
    expect(typeof ResourceReader).toBe('function');
    expect(typeof ResourceWriter).toBe('function');
    expect(typeof ResourceIdsReader).toBe('function');
    expect(typeof ResourceIdsPageReader).toBe('function');
    expect(typeof streamToString).toBe('function');
  });

  test('main index.js should export behaviors', async () => {
    const { behaviors, getBehavior, AVAILABLE_BEHAVIORS, DEFAULT_BEHAVIOR } = await import('../../src/index.js');
    
    expect(behaviors).toBeDefined();
    expect(getBehavior).toBeDefined();
    expect(AVAILABLE_BEHAVIORS).toBeDefined();
    expect(DEFAULT_BEHAVIOR).toBeDefined();
    
    expect(typeof behaviors).toBe('object');
    expect(typeof getBehavior).toBe('function');
    expect(Array.isArray(AVAILABLE_BEHAVIORS)).toBe(true);
    expect(typeof DEFAULT_BEHAVIOR).toBe('string');
  });

  test('concerns index.js should export utility functions', async () => {
    const concerns = await import('../../src/concerns/index.js');
    
    expect(concerns.idGenerator).toBeDefined();
    expect(concerns.passwordGenerator).toBeDefined();
    expect(concerns.encode).toBeDefined();
    expect(concerns.decode).toBeDefined();
    expect(concerns.tryFn).toBeDefined();
    expect(concerns.calculateUTF8Bytes).toBeDefined();
    expect(concerns.encrypt).toBeDefined();
    expect(concerns.decrypt).toBeDefined();
    
    expect(typeof concerns.idGenerator).toBe('function');
    expect(typeof concerns.passwordGenerator).toBe('function');
    expect(typeof concerns.encode).toBe('function');
    expect(typeof concerns.decode).toBe('function');
    expect(typeof concerns.tryFn).toBe('function');
    expect(typeof concerns.calculateUTF8Bytes).toBe('function');
    expect(typeof concerns.encrypt).toBe('function');
    expect(typeof concerns.decrypt).toBe('function');
  });

  test('plugins index.js should export plugin classes', async () => {
    const plugins = await import('../../src/plugins/index.js');
    
    expect(plugins.Plugin).toBeDefined();
    expect(plugins.AuditPlugin).toBeDefined();
    expect(plugins.CachePlugin).toBeDefined();
    expect(plugins.CostsPlugin).toBeDefined();
    expect(plugins.FullTextPlugin).toBeDefined();
    expect(plugins.MetricsPlugin).toBeDefined();
    expect(plugins.ReplicatorPlugin).toBeDefined();
    
    expect(typeof plugins.Plugin).toBe('function');
    expect(typeof plugins.AuditPlugin).toBe('function');
    expect(typeof plugins.CachePlugin).toBe('function');
    expect(typeof plugins.CostsPlugin).toBe('object');
    expect(typeof plugins.FullTextPlugin).toBe('function');
    expect(typeof plugins.MetricsPlugin).toBe('function');
    expect(typeof plugins.ReplicatorPlugin).toBe('function');
  });

  test('cache index.js should export cache classes', async () => {
    const cache = await import('../../src/plugins/cache/index.js');
    
    expect(cache.Cache).toBeDefined();
    expect(cache.MemoryCache).toBeDefined();
    expect(cache.FilesystemCache).toBeDefined();
    expect(cache.S3Cache).toBeDefined();
    expect(cache.PartitionAwareFilesystemCache).toBeDefined();
    
    expect(typeof cache.Cache).toBe('function');
    expect(typeof cache.MemoryCache).toBe('function');
    expect(typeof cache.FilesystemCache).toBeDefined(); // Can be function or undefined if not imported
    expect(typeof cache.S3Cache).toBe('function');
    expect(typeof cache.PartitionAwareFilesystemCache).toBeDefined();
  });

  test('replicators index.js should export replicator classes', async () => {
    const replicators = await import('../../src/plugins/replicators/index.js');
    
    expect(replicators.BaseReplicator).toBeDefined();
    expect(replicators.S3dbReplicator).toBeDefined();
    expect(replicators.SqsReplicator).toBeDefined();
    
    expect(typeof replicators.BaseReplicator).toBe('function');
    expect(typeof replicators.S3dbReplicator).toBe('function');
    expect(typeof replicators.SqsReplicator).toBe('function');
    
    // BigQuery and Postgres replicators are optional (require external dependencies)
    expect(replicators.BigqueryReplicator).toBeDefined();
    expect(replicators.PostgresReplicator).toBeDefined();
  });

  test('consumers index.js should export consumer classes', async () => {
    const consumers = await import('../../src/plugins/consumers/index.js');
    
    expect(consumers.SqsConsumer).toBeDefined();
    expect(consumers.RabbitMqConsumer).toBeDefined();
    expect(consumers.createConsumer).toBeDefined();
    
    expect(typeof consumers.SqsConsumer).toBe('function');
    expect(typeof consumers.RabbitMqConsumer).toBe('function');
    expect(typeof consumers.createConsumer).toBe('function');
  });

  test('stream index.js should export stream classes and utilities', async () => {
    const stream = await import('../../src/stream/index.js');
    
    expect(stream.ResourceReader).toBeDefined();
    expect(stream.ResourceWriter).toBeDefined();
    expect(stream.ResourceIdsReader).toBeDefined();
    expect(stream.ResourceIdsPageReader).toBeDefined();
    expect(stream.streamToString).toBeDefined();
    
    expect(typeof stream.ResourceReader).toBe('function');
    expect(typeof stream.ResourceWriter).toBe('function');
    expect(typeof stream.ResourceIdsReader).toBe('function');
    expect(typeof stream.ResourceIdsPageReader).toBe('function');
    expect(typeof stream.streamToString).toBe('function');
  });

  test('plugin.obj.js should export object', async () => {
    const pluginObj = await import('../../src/plugins/plugin.obj.js');
    
    // This file exports an object with metadata
    expect(pluginObj.PluginObject).toBeDefined();
    expect(typeof pluginObj.PluginObject).toBe('object');
    expect(typeof pluginObj.PluginObject.setup).toBe('function');
    expect(typeof pluginObj.PluginObject.start).toBe('function');
    expect(typeof pluginObj.PluginObject.stop).toBe('function');
  });
}); 