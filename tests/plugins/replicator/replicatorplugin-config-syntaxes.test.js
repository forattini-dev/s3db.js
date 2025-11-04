import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { ReplicatorPlugin } from '../../../src/plugins/replicator.plugin.js';

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

  test('accepts config with SQS driver and defaultQueue', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [
        {
          driver: 'sqs',
          defaultQueue: 'my-queue',
          config: { credentials: 'test' },
          resources: { users: 'users' }
        }
      ]
    });
    expect(plugin.config.replicators[0].defaultQueue).toBe('my-queue');
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
        { driver: 'sqs', defaultQueue: 'q', config: { credentials: 'x' }, resources: { orders: 'orders' } }
      ]
    });
    expect(plugin.config.replicators.length).toBe(2);
  });
}
