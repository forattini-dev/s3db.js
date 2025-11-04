import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { ReplicatorPlugin } from '../../../src/plugins/replicator.plugin.js';

describe('ReplicatorPlugin - config parsing and validation', () => {
  test('accepts minimal valid config with s3db driver and connectionString', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [
        { driver: 's3db', config: { connectionString: 's3://user:pass@bucket/path' }, resources: { users: 'users' } }
      ]
    });
    expect(plugin.config.replicators).toHaveLength(1);
    expect(plugin.config.replicators[0].driver).toBe('s3db');
  });

  test('accepts verbose flag', () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      replicators: [
        { driver: 's3db', config: { connectionString: 's3://user:pass@bucket/path' }, resources: { users: 'users' } }
      ]
    });
    expect(plugin.config.verbose).toBe(true);
  });

  test('accepts persistReplicatorLog flag', () => {
    const plugin = new ReplicatorPlugin({
      persistReplicatorLog: true,
      replicators: [
        { driver: 's3db', config: { connectionString: 's3://user:pass@bucket/path' }, resources: { users: 'users' } }
      ]
    });
    expect(plugin.config.persistReplicatorLog).toBe(true);
  });

  test('accepts custom replicatorLogResource name', () => {
    const plugin = new ReplicatorPlugin({
      replicatorLogResource: 'custom_logs',
      replicators: [
        { driver: 's3db', config: { connectionString: 's3://user:pass@bucket/path' }, resources: { users: 'users' } }
      ]
    });
    expect(plugin.logResourceName).toBe('plg_custom_logs');
  });

  test('applies bounded concurrency defaults', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [
        { driver: 's3db', config: { connectionString: 's3://user:pass@bucket/path' }, resources: { users: 'users' } }
      ]
    });

    expect(plugin.config.replicatorConcurrency).toBe(5);
    expect(plugin.config.stopConcurrency).toBe(plugin.config.replicatorConcurrency);
  });

  test('sanitizes custom concurrency values', () => {
    const plugin = new ReplicatorPlugin({
      replicatorConcurrency: 12.7,
      stopConcurrency: -3,
      replicators: [
        { driver: 's3db', config: { connectionString: 's3://user:pass@bucket/path' }, resources: { users: 'users' } }
      ]
    });

    expect(plugin.config.replicatorConcurrency).toBe(12);
    expect(plugin.config.stopConcurrency).toBe(1);
  });
}
