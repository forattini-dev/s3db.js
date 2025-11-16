import { describe, expect, jest, test } from '@jest/globals';

import { ReplicatorPlugin } from '../../../src/plugins/replicator.plugin.js';

const minimalReplicator = {
  driver: 's3db',
  config: { connectionString: 's3://user:pass@bucket/path' },
  resources: { users: 'users' }
};

describe('ReplicatorPlugin configuration', () => {
  test('accepts minimal configuration and optional flags', () => {
    const plugin = new ReplicatorPlugin({
      logLevel: 'silent',
      persistReplicatorLog: true,
      replicatorLogResource: 'custom_logs',
      replicatorConcurrency: 12.7,
      stopConcurrency: -3,
      replicators: [minimalReplicator]
    });

    expect(plugin.config.verbose).toBe(false);
    expect(plugin.config.persistReplicatorLog).toBe(true);
    expect(plugin.logResourceName).toBe('plg_custom_logs');
    expect(plugin.config.replicatorConcurrency).toBe(12);
    expect(plugin.config.stopConcurrency).toBe(1);
  });

  test('supports different resource syntaxes and drivers', () => {
    const transform = data => ({ ...data, transformed: true });

    const plugin = new ReplicatorPlugin({
      logLevel: 'silent',
      replicators: [
        { driver: 's3db', client: {}, resources: ['users', 'orders'] },
        {
          driver: 's3db',
          client: {},
          resources: {
            users: { resource: 'users', actions: ['insert'], transform }
          }
        },
        {
          driver: 'sqs',
          defaultQueue: 'default-queue',
          resources: {
            users: { queueUrl: 'users-queue', actions: ['insert'] },
            orders: { queueUrl: 'orders-queue', actions: ['insert', 'update'] }
          }
        }
      ]
    });

    expect(plugin.config.replicators).toHaveLength(3);
    expect(plugin.config.replicators[0].resources).toEqual(['users', 'orders']);
    expect(plugin.config.replicators[1].resources.users.transform).toBe(transform);
    expect(plugin.config.replicators[2].defaultQueue).toBe('default-queue');
    expect(plugin.config.replicators[2].resources.orders.queueUrl).toBe('orders-queue');
  });

  test('validates missing configuration', () => {
    expect(() => new ReplicatorPlugin({ replicators: [{}] })).toThrow();
    expect(() => new ReplicatorPlugin({})).toThrow();
    expect(
      () =>
        new ReplicatorPlugin({
      logLevel: 'silent',
          replicators: [
            minimalReplicator,
            { driver: 'sqs', defaultQueue: 'q', resources: { orders: 'orders' } }
          ]
        })
    ).not.toThrow();
  });
});

describe('Data handling helpers', () => {
  test('filters internal fields', () => {
    const plugin = new ReplicatorPlugin({ replicators: [minimalReplicator] });
    const filtered = plugin.filterInternalFields({ id: '1', _internal: 'x', $overflow: 'y' });
    expect(filtered).toEqual({ id: '1' });
  });

  test('processReplicatorEvent sanitizes payload before replicate', async () => {
    const plugin = new ReplicatorPlugin({ replicators: [minimalReplicator] });
    const replicator = {
      name: 'test-replicator',
      shouldReplicateResource: jest.fn().mockReturnValue(true),
      replicate: jest.fn().mockResolvedValue({ success: true })
    };
    plugin.replicators = [replicator];

    await plugin.processReplicatorEvent('insert', 'users', '1', { id: '1', _internal: 'remove' });
    expect(replicator.replicate).toHaveBeenCalledWith('users', 'insert', { id: '1' }, '1', null);
  });
});

describe('Event listeners', () => {
  test('installs listeners for CRUD operations once per resource', () => {
    const resource = { name: 'users', on: jest.fn(), database: {} };
    const plugin = new ReplicatorPlugin({ replicators: [minimalReplicator] });
    plugin.database = resource.database;

    plugin.installEventListeners(resource);
    plugin.installEventListeners(resource);

    expect(resource.on).toHaveBeenCalledWith('inserted', expect.any(Function));
    expect(resource.on).toHaveBeenCalledWith('updated', expect.any(Function));
    expect(resource.on).toHaveBeenCalledWith('deleted', expect.any(Function));
    expect(resource.on).toHaveBeenCalledTimes(3);
  });

  test('skips listener installation for replicator log resource', () => {
    const resource = { name: 'plg_replicator_logs', on: jest.fn(), database: {} };
    const plugin = new ReplicatorPlugin({
      logLevel: 'silent',
      replicatorLogResource: 'replicator_logs',
      replicators: [minimalReplicator]
    });
    plugin.database = resource.database;

    plugin.installEventListeners(resource);
    expect(resource.on).not.toHaveBeenCalled();
  });

  const createResourceForListeners = () => {
    const listeners = {};
    return {
      name: 'users',
      database: {},
      on: jest.fn((event, handler) => {
        listeners[event] = handler;
      }),
      __listeners: listeners
    };
  };

  test('listener errors emit plg:replicator:error events', async () => {
    const plugin = new ReplicatorPlugin({ logLevel: 'silent', replicators: [minimalReplicator] });
    const resource = createResourceForListeners();
    plugin.database = resource.database;
    plugin.processReplicatorEvent = jest.fn().mockRejectedValue(new Error('Replication failed'));

    let receivedError;
    plugin.on('plg:replicator:error', event => {
      receivedError = event;
    });

    plugin.installEventListeners(resource);

    await resource.__listeners.inserted({ id: '1' });
    await resource.__listeners.updated({ id: '1' }, { id: '1' });
    await resource.__listeners.deleted({ id: '1' });

    expect(receivedError.resource).toBe('users');
  });
});

describe('Replication execution and logging', () => {
  test('processReplicatorEvent updates stats, emits events and handles errors', async () => {
    const plugin = new ReplicatorPlugin({ replicators: [minimalReplicator] });
    plugin.database = { resources: {} };

    const successReplicator = {
      name: 'success-replicator',
      shouldReplicateResource: jest.fn().mockReturnValue(true),
      replicate: jest.fn().mockResolvedValue({ success: true })
    };
    plugin.replicators = [successReplicator];
    const emitSpy = jest.spyOn(plugin, 'emit');

    await plugin.processReplicatorEvent('insert', 'users', '1', { id: '1' });
    expect(plugin.stats.totalReplications).toBe(1);
    expect(emitSpy).toHaveBeenCalledWith(
      'plg:replicator:replicated',
      expect.objectContaining({ replicator: 'success-replicator', success: true })
    );

    successReplicator.replicate.mockRejectedValue(new Error('boom'));
    const results = await plugin.processReplicatorEvent('insert', 'users', '2', { id: '2' });
    expect(results[0].status).toBe('rejected');
    expect(plugin.stats.totalErrors).toBe(1);
  });

  test('logReplicator persists entries when enabled', async () => {
    const plugin = new ReplicatorPlugin({ persistReplicatorLog: true, replicators: [minimalReplicator] });
    const insert = jest.fn().mockResolvedValue({ id: 'log-1' });
    plugin.replicatorLog = { insert };

    await plugin.logReplicator({ resource: 'users', operation: 'insert', recordId: '1' });
    expect(insert).toHaveBeenCalled();
  });

  test('retryWithBackoff retries on failure and returns result', async () => {
    const plugin = new ReplicatorPlugin({ replicators: [minimalReplicator] });
    let attempts = 0;
    const operation = async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('Temporary failure');
      return { success: true };
    };

    const result = await plugin.retryWithBackoff(operation, 3);
    expect(attempts).toBe(3);
    expect(result).toEqual({ success: true });
  });

  test('getReplicatorStats returns structured data', async () => {
    const plugin = new ReplicatorPlugin({ replicators: [minimalReplicator] });
    const stats = await plugin.getReplicatorStats();
    expect(stats).toMatchObject({
      replicators: expect.any(Array),
      stats: expect.objectContaining({
        totalReplications: expect.any(Number),
        totalErrors: expect.any(Number)
      })
    });
  });

  test('installs and removes database hooks with stored reference', () => {
    const plugin = new ReplicatorPlugin({ replicators: [minimalReplicator] });
    const mockDatabase = {
      addHook: jest.fn(),
      removeHook: jest.fn(),
      resources: {}
    };
    plugin.database = mockDatabase;

    plugin.installDatabaseHooks();
    expect(mockDatabase.addHook).toHaveBeenCalledWith('afterCreateResource', expect.any(Function));

    const hookRef = plugin._afterCreateResourceHook;
    plugin.removeDatabaseHooks();

    expect(mockDatabase.removeHook).toHaveBeenCalledWith('afterCreateResource', hookRef);
    expect(plugin._afterCreateResourceHook).toBeNull();
  });

  test('getReplicatorLogs queries log resource with pagination', async () => {
    const plugin = new ReplicatorPlugin({ replicators: [minimalReplicator] });
    const records = [{ id: '1', resource: 'users' }];
    plugin.replicatorLog = { query: jest.fn().mockResolvedValue(records) };

    const logs = await plugin.getReplicatorLogs({ resourceName: 'users', limit: 50, offset: 0 });
    expect(plugin.replicatorLog.query).toHaveBeenCalledWith({ resourceName: 'users' }, { limit: 50, offset: 0 });
    expect(logs).toEqual(records);
  });

  test('retryFailedReplicators processes and updates log entries', async () => {
    const plugin = new ReplicatorPlugin({ replicators: [minimalReplicator] });
    const failed = [{ operation: 'insert', resourceName: 'users', recordId: '1', data: { id: '1' }, id: 'log-1', retryCount: 0 }];
    plugin.replicatorLog = { query: jest.fn().mockResolvedValue(failed) };
    plugin.processReplicatorEvent = jest.fn().mockResolvedValue([{ status: 'fulfilled' }]);
    plugin.updateReplicatorLog = jest.fn();

    await plugin.retryFailedReplicators();
    expect(plugin.processReplicatorEvent).toHaveBeenCalledWith('insert', 'users', '1', { id: '1' }, null);
    expect(plugin.updateReplicatorLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'success' })
    );

    plugin.processReplicatorEvent.mockResolvedValue([{ status: 'rejected', reason: new Error('still broken') }]);
    await plugin.retryFailedReplicators();
    expect(plugin.updateReplicatorLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'failed' })
    );
  });
});
