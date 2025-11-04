import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { ReplicatorPlugin } from '../../../src/plugins/replicator.plugin.js';

describe('ReplicatorPlugin - previously untested methods', () => {
  test('retryWithBackoff returns actual result, not boolean', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const expectedResult = { success: true, data: 'test-data' };
    const operation = async () => expectedResult;

    const result = await plugin.retryWithBackoff(operation, 2);
    expect(result).toEqual(expectedResult);
    expect(typeof result).toBe('object');
  });

  test('retryWithBackoff retries on failure with exponential backoff', async () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Temporary failure');
      }
      return { success: true };
    };

    const result = await plugin.retryWithBackoff(operation, 3);
    expect(attempts).toBe(3);
    expect(result).toEqual({ success: true });
  });

  test('getReplicatorStats returns stats with initialized properties', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const stats = await plugin.getReplicatorStats();

    expect(stats).toHaveProperty('replicators');
    expect(stats).toHaveProperty('stats');
    expect(stats.stats).toHaveProperty('totalReplications');
    expect(stats.stats).toHaveProperty('totalErrors');
    expect(stats.stats).toHaveProperty('lastSync');
  });

  test('removeDatabaseHooks removes the correct hook using stored reference', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockDatabase = {
      addHook: jest.fn(),
      removeHook: jest.fn(),
      resources: {}
    };

    plugin.database = mockDatabase;
    plugin.installDatabaseHooks();

    expect(mockDatabase.addHook).toHaveBeenCalledWith('afterCreateResource', expect.any(Function));
    expect(plugin._afterCreateResourceHook).toBeDefined();

    const hookRef = plugin._afterCreateResourceHook;
    plugin.removeDatabaseHooks();

    expect(mockDatabase.removeHook).toHaveBeenCalledWith('afterCreateResource', hookRef);
    expect(plugin._afterCreateResourceHook).toBeNull();
  });

  test('getReplicatorLogs uses query API with pagination', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockLogs = [
      { id: '1', resource: 'users', action: 'insert' },
      { id: '2', resource: 'orders', action: 'update' }
    ];

    plugin.replicatorLog = {
      query: jest.fn().mockResolvedValue(mockLogs)
    };

    const logs = await plugin.getReplicatorLogs({
      resourceName: 'users',
      limit: 50,
      offset: 0
    });

    expect(plugin.replicatorLog.query).toHaveBeenCalledWith(
      { resourceName: 'users' },
      { limit: 50, offset: 0 }
    );
    expect(logs).toEqual(mockLogs);
  });

  test('retryFailedReplicators uses query API and processes failed logs', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const failedLogs = [
      { operation: 'insert', resourceName: 'users', recordId: '1', data: { id: '1' }, status: 'failed' }
    ];

    plugin.replicatorLog = {
      query: jest.fn().mockResolvedValue(failedLogs)
    };

    plugin.processReplicatorEvent = jest.fn().mockResolvedValue([{ status: 'fulfilled' }]);

    const result = await plugin.retryFailedReplicators();

    expect(plugin.replicatorLog.query).toHaveBeenCalledWith({ status: 'failed' });
    expect(plugin.processReplicatorEvent).toHaveBeenCalledWith(
      'insert',
      'users',
      '1',
      { id: '1' },
      null
    );
    expect(result.retried).toBe(1);
  });

  test('retryFailedReplicators marks successful retries in the log', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const logEntry = {
      id: 'log-1',
      operation: 'insert',
      resourceName: 'users',
      recordId: '1',
      data: { id: '1' },
      retryCount: 2,
      status: 'failed'
    };

    plugin.replicatorLog = {
      query: jest.fn().mockResolvedValue([logEntry])
    };

    plugin.processReplicatorEvent = jest.fn().mockResolvedValue([{ status: 'fulfilled' }]);
    plugin.updateReplicatorLog = jest.fn();

    await plugin.retryFailedReplicators();

    expect(plugin.updateReplicatorLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({
        status: 'success',
        error: null,
        retryCount: 2,
        lastSuccessAt: expect.any(String)
      })
    );
  });

  test('retryFailedReplicators increments retryCount when retry fails', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const logEntry = {
      id: 'log-2',
      operation: 'update',
      resourceName: 'users',
      recordId: '42',
      data: { id: '42' },
      retryCount: 1,
      status: 'failed'
    };

    plugin.replicatorLog = {
      query: jest.fn().mockResolvedValue([logEntry])
    };

    const error = new Error('still broken');
    plugin.processReplicatorEvent = jest.fn().mockResolvedValue([
      { status: 'rejected', reason: error }
    ]);
    plugin.updateReplicatorLog = jest.fn();

    await plugin.retryFailedReplicators();

    expect(plugin.updateReplicatorLog).toHaveBeenCalledWith(
      'log-2',
      expect.objectContaining({
        status: 'failed',
        error: 'still broken',
        retryCount: 2
      })
    );
  });

  test('retryFailedReplicators treats unsuccessful fulfilled entries as failures', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const logEntry = {
      id: 'log-3',
      operation: 'delete',
      resourceName: 'users',
      recordId: '55',
      data: { id: '55' },
      retryCount: 0,
      status: 'failed'
    };

    plugin.replicatorLog = {
      query: jest.fn().mockResolvedValue([logEntry])
    };

    plugin.processReplicatorEvent = jest.fn().mockResolvedValue([
      { status: 'fulfilled', value: { success: false, error: 'downstream refused request' } }
    ]);
    plugin.updateReplicatorLog = jest.fn();

    await plugin.retryFailedReplicators();

    expect(plugin.updateReplicatorLog).toHaveBeenCalledWith(
      'log-3',
      expect.objectContaining({
        status: 'failed',
        error: 'downstream refused request',
        retryCount: 1
      })
    );
  });

  test('syncAllData uses pagination instead of getAll', async () => {
    const plugin = new ReplicatorPlugin({
      batchSize: 2,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockReplicator = {
      id: 'test-replicator',
      shouldReplicateResource: jest.fn().mockReturnValue(true),
      replicate: jest.fn().mockResolvedValue({ success: true })
    };

    plugin.replicators = [mockReplicator];

    const mockRecords = [
      { items: [{ id: '1' }, { id: '2' }] },
      { items: [{ id: '3' }, { id: '4' }] },
      { items: [] }
    ];

    let callCount = 0;
    const mockResource = {
      page: jest.fn().mockImplementation(() => mockRecords[callCount++])
    };

    plugin.database = {
      resources: {
        users: mockResource
      }
    };

    await plugin.syncAllData('test-replicator');

    // Should call page() with increasing offsets
    expect(mockResource.page).toHaveBeenCalledWith({ offset: 0, size: 2 });
    expect(mockResource.page).toHaveBeenCalledWith({ offset: 2, size: 2 });
    expect(mockResource.page).toHaveBeenCalledWith({ offset: 4, size: 2 });

    // Should replicate all 4 records
    expect(mockReplicator.replicate).toHaveBeenCalledTimes(4);
  });
}
