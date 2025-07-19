import { describe, test, expect, jest } from '@jest/globals';

import { ReplicatorPlugin } from '#src/plugins/replicator.plugin.js';

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
    expect(plugin.config.replicatorLogResource).toBe('custom_logs');
  });
});

describe('ReplicatorPlugin - config syntaxes', () => {
  test('accepts config with client and resources as array', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [
        {
          driver: 's3db',
          client: {},
          resources: ['users', 'orders']
        }
      ]
    });
    expect(plugin.config.replicators[0].resources).toEqual(['users', 'orders']);
  });

  test('accepts config with resources as object with actions and transform', () => {
    const transform = (data) => ({ ...data, transformedAt: new Date() });
    const plugin = new ReplicatorPlugin({
      replicators: [
        {
          driver: 's3db',
          client: {},
          resources: {
            users: {
              resource: 'users',
              actions: ['insert', 'update', 'delete'],
              transform
            }
          }
        }
      ]
    });
    expect(plugin.config.replicators[0].resources.users.transform).toBe(transform);
  });

  test('accepts config with SQS driver and queueUrlDefault', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [
        {
          driver: 'sqs',
          queueUrlDefault: 'my-queue',
          config: { credentials: 'test' },
          resources: { users: 'users' }
        }
      ]
    });
    expect(plugin.config.replicators[0].queueUrlDefault).toBe('my-queue');
  });

  test('accepts config with SQS driver and per-resource queue URLs', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [
        {
          driver: 'sqs',
          resources: {
            users: {
              queueUrl: 'users-queue',
              actions: ['insert']
            },
            orders: {
              queueUrl: 'orders-queue',
              actions: ['insert', 'update']
            }
          }
        }
      ]
    });
    expect(plugin.config.replicators[0].resources.users.queueUrl).toBe('users-queue');
    expect(plugin.config.replicators[0].resources.orders.queueUrl).toBe('orders-queue');
  });

  test('throws on missing driver', () => {
    expect(() => new ReplicatorPlugin({ replicators: [{}] })).toThrow();
  });

  test('throws on missing replicators array', () => {
    expect(() => new ReplicatorPlugin({})).toThrow();
  });

  test('accepts multiple replicators', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [
        { driver: 's3db', config: { connectionString: 's3://a' }, resources: { users: 'users' } },
        { driver: 'sqs', queueUrlDefault: 'q', config: { credentials: 'x' }, resources: { orders: 'orders' } }
      ]
    });
    expect(plugin.config.replicators.length).toBe(2);
  });
});

describe('ReplicatorPlugin - listener installation', () => {
  test('installs listeners for insert, update, delete', () => {
    const resource = {
      name: 'users',
      on: jest.fn(),
      database: {}
    };
    const plugin = new ReplicatorPlugin({
      replicators: [
        { driver: 's3db', resources: ['users'] }
      ]
    });
    plugin.database = resource.database;
    plugin.installEventListeners(resource);
    
    expect(resource.on).toHaveBeenCalledWith('insert', expect.any(Function));
    expect(resource.on).toHaveBeenCalledWith('update', expect.any(Function));
    expect(resource.on).toHaveBeenCalledWith('delete', expect.any(Function));
  });

  test('does not install listeners for replicator log resource', () => {
    const resource = {
      name: 'replicator_logs',
      on: jest.fn(),
      database: {}
    };
    const plugin = new ReplicatorPlugin({
      replicatorLogResource: 'replicator_logs',
      replicators: [
        { driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }
      ]
    });
    plugin.database = resource.database;
    plugin.installEventListeners(resource);
    
    expect(resource.on).not.toHaveBeenCalled();
  });

  test('does not install listeners multiple times on same resource', () => {
    const resource = {
      name: 'users',
      on: jest.fn(),
      database: {}
    };
    const plugin = new ReplicatorPlugin({
      replicators: [
        { driver: 's3db', resources: ['users'] }
      ]
    });
    plugin.database = resource.database;
    
    plugin.installEventListeners(resource);
    plugin.installEventListeners(resource);
    
    expect(resource.on).toHaveBeenCalledTimes(3); // Once each for insert/update/delete
  });
});

describe('ReplicatorPlugin - data handling', () => {
  test('filters internal fields from data', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });
    
    const data = {
      id: '123',
      name: 'test',
      _internal: 'hidden',
      $overflow: 'hidden'
    };
    
    const filtered = plugin.filterInternalFields(data);
    expect(filtered).toEqual({
      id: '123',
      name: 'test'
    });
  });
});