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
      { operation: 'insert', resourceName: 'users', recordId: '1', data: { id: '1' } }
    ];

    plugin.replicatorLog = {
      query: jest.fn().mockResolvedValue(failedLogs)
    };

    plugin.processReplicatorEvent = jest.fn().mockResolvedValue({ success: true });

    const result = await plugin.retryFailedReplicators();

    expect(plugin.replicatorLog.query).toHaveBeenCalledWith({ status: 'failed' });
    expect(plugin.processReplicatorEvent).toHaveBeenCalledWith(
      'insert',
      'users',
      '1',
      { id: '1' }
    );
    expect(result.retried).toBe(1);
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
});

describe('ReplicatorPlugin - error handling and edge cases', () => {
  test('handles errors in insert event listener gracefully', async () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    plugin.processReplicatorEvent = jest.fn().mockRejectedValue(new Error('Replication failed'));

    // Register error listener to prevent unhandled error
    let errorEvent = null;
    plugin.on('error', (event) => {
      errorEvent = event;
    });

    const resource = {
      name: 'users',
      on: jest.fn(),
      database: {}
    };

    plugin.database = resource.database;
    plugin.installEventListeners(resource, plugin.database, plugin);

    const insertHandler = resource.on.mock.calls.find(call => call[0] === 'insert')[1];

    await insertHandler({ id: '1', name: 'Test' });

    expect(errorEvent).toEqual(expect.objectContaining({
      operation: 'insert',
      resource: 'users'
    }));
  });

  test('handles errors in update event listener gracefully', async () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    plugin.getCompleteData = jest.fn().mockResolvedValue({ id: '1', name: 'Updated' });
    plugin.processReplicatorEvent = jest.fn().mockRejectedValue(new Error('Replication failed'));

    // Register error listener to prevent unhandled error
    let errorEvent = null;
    plugin.on('error', (event) => {
      errorEvent = event;
    });

    const resource = {
      name: 'users',
      on: jest.fn(),
      database: {},
      get: jest.fn().mockResolvedValue({ id: '1', name: 'Updated' })
    };

    plugin.database = resource.database;
    plugin.installEventListeners(resource, plugin.database, plugin);

    const updateHandler = resource.on.mock.calls.find(call => call[0] === 'update')[1];

    await updateHandler({ id: '1', name: 'Updated' }, { id: '1', name: 'Old' });

    expect(errorEvent).toEqual(expect.objectContaining({
      operation: 'update',
      resource: 'users'
    }));
  });

  test('handles errors in delete event listener gracefully', async () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    plugin.processReplicatorEvent = jest.fn().mockRejectedValue(new Error('Replication failed'));

    // Register error listener to prevent unhandled error
    let errorEvent = null;
    plugin.on('error', (event) => {
      errorEvent = event;
    });

    const resource = {
      name: 'users',
      on: jest.fn(),
      database: {}
    };

    plugin.database = resource.database;
    plugin.installEventListeners(resource, plugin.database, plugin);

    const deleteHandler = resource.on.mock.calls.find(call => call[0] === 'delete')[1];

    await deleteHandler({ id: '1' });

    expect(errorEvent).toEqual(expect.objectContaining({
      operation: 'delete',
      resource: 'users'
    }));
  });

  test('processReplicatorEvent emits success event', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockReplicator = {
      shouldReplicateResource: jest.fn().mockReturnValue(true),
      replicate: jest.fn().mockResolvedValue({ success: true }),
      name: 'test-replicator'
    };

    plugin.replicators = [mockReplicator];

    const replicatedSpy = jest.spyOn(plugin, 'emit');

    await plugin.processReplicatorEvent('insert', 'users', '1', { id: '1', name: 'Test' });

    expect(replicatedSpy).toHaveBeenCalledWith('replicated', expect.objectContaining({
      replicator: 'test-replicator',
      resourceName: 'users',
      operation: 'insert',
      recordId: '1',
      success: true
    }));
  });

  test('processReplicatorEvent handles replicator errors', async () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      logErrors: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockReplicator = {
      shouldReplicateResource: jest.fn().mockReturnValue(true),
      replicate: jest.fn().mockRejectedValue(new Error('Replication error')),
      name: 'test-replicator'
    };

    plugin.replicators = [mockReplicator];
    plugin.database = {
      resources: {}
    };

    const errorSpy = jest.spyOn(plugin, 'emit');

    const results = await plugin.processReplicatorEvent('insert', 'users', '1', { id: '1' });

    expect(errorSpy).toHaveBeenCalledWith('replicator_error', expect.objectContaining({
      replicator: 'test-replicator',
      resourceName: 'users',
      operation: 'insert'
    }));

    expect(results[0].status).toBe('rejected');
  });

  test('logReplicator creates log entry successfully', async () => {
    const plugin = new ReplicatorPlugin({
      persistReplicatorLog: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockLogResource = {
      insert: jest.fn().mockResolvedValue({ id: 'log-1' })
    };

    plugin.replicatorLog = mockLogResource;

    await plugin.logReplicator({
      resource: 'users',
      operation: 'insert',
      data: { id: '1' }
    });

    expect(mockLogResource.insert).toHaveBeenCalledWith(expect.objectContaining({
      resource: 'users',
      action: 'insert',
      data: { id: '1' }
    }));
  });

  test('logReplicator emits event when log resource not found', async () => {
    const plugin = new ReplicatorPlugin({
      persistReplicatorLog: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    plugin.replicatorLog = null;
    plugin.database = {
      resources: {}
    };

    const eventSpy = jest.spyOn(plugin, 'emit');

    await plugin.logReplicator({ resource: 'users', operation: 'insert' });

    expect(eventSpy).toHaveBeenCalledWith('replicator.log.failed', expect.objectContaining({
      error: 'replicator log resource not found'
    }));
  });

  test('updateReplicatorLog updates log entry', async () => {
    const plugin = new ReplicatorPlugin({
      persistReplicatorLog: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockLogResource = {
      patch: jest.fn().mockResolvedValue({ id: 'log-1' })
    };

    plugin.replicatorLog = mockLogResource;

    await plugin.updateReplicatorLog('log-1', { status: 'success' });

    expect(mockLogResource.patch).toHaveBeenCalledWith('log-1', expect.objectContaining({
      status: 'success',
      lastAttempt: expect.any(String)
    }));
  });

  test('cleanup handles errors gracefully', async () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockReplicator = {
      name: 'test-replicator',
      cleanup: jest.fn().mockRejectedValue(new Error('Cleanup failed'))
    };

    plugin.replicators = [mockReplicator];

    const eventSpy = jest.spyOn(plugin, 'emit');

    await plugin.cleanup();

    expect(eventSpy).toHaveBeenCalledWith('replicator_cleanup_error', expect.objectContaining({
      replicator: 'test-replicator',
      error: 'Cleanup failed'
    }));

    expect(plugin.replicators).toEqual([]);
    expect(plugin.database).toBeNull();
  });

  test('getCompleteData returns full record from resource', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockResource = {
      get: jest.fn().mockResolvedValue({ id: '1', name: 'Full Name', email: 'test@test.com' })
    };

    const result = await plugin.getCompleteData(mockResource, { id: '1', name: 'Partial' });

    expect(result).toEqual({ id: '1', name: 'Full Name', email: 'test@test.com' });
    expect(mockResource.get).toHaveBeenCalledWith('1');
  });

  test('getCompleteData falls back to provided data on error', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockResource = {
      get: jest.fn().mockRejectedValue(new Error('Not found'))
    };

    const result = await plugin.getCompleteData(mockResource, { id: '1', name: 'Fallback' });

    expect(result).toEqual({ id: '1', name: 'Fallback' });
  });

  test('filterInternalFields removes all internal prefixes', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const data = {
      id: '1',
      name: 'Test',
      _internal: 'hidden',
      $overflow: 'hidden',
      $before: 'hidden',
      $after: 'hidden',
      validField: 'visible'
    };

    const result = plugin.filterInternalFields(data);

    expect(result).toEqual({
      id: '1',
      name: 'Test',
      validField: 'visible'
    });
  });

  test('multiple replicators work independently', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [
        { driver: 's3db', config: { connectionString: 's3://test1' }, resources: { users: 'users' } },
        { driver: 'sqs', queueUrl: 'test-queue', resources: { users: true } }
      ]
    });

    const mockReplicator1 = {
      shouldReplicateResource: jest.fn().mockReturnValue(true),
      replicate: jest.fn().mockResolvedValue({ success: true }),
      name: 'replicator1'
    };

    const mockReplicator2 = {
      shouldReplicateResource: jest.fn().mockReturnValue(true),
      replicate: jest.fn().mockResolvedValue({ success: true }),
      name: 'replicator2'
    };

    plugin.replicators = [mockReplicator1, mockReplicator2];

    await plugin.processReplicatorEvent('insert', 'users', '1', { id: '1' });

    expect(mockReplicator1.replicate).toHaveBeenCalled();
    expect(mockReplicator2.replicate).toHaveBeenCalled();
  });

  test('setup with persistReplicatorLog creates log resource', async () => {
    const plugin = new ReplicatorPlugin({
      persistReplicatorLog: true,
      replicatorLogResource: 'custom_log',
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockLogResource = { name: 'custom_log' };
    const mockDatabase = {
      resources: {},
      createResource: jest.fn().mockResolvedValue(mockLogResource),
      addHook: jest.fn()
    };

    plugin.initializeReplicators = jest.fn();

    await plugin.install(mockDatabase);

    expect(mockDatabase.createResource).toHaveBeenCalledWith(expect.objectContaining({
      name: 'custom_log',
      behavior: 'truncate-data'
    }));
    expect(plugin.replicatorLogResource).toBe(mockLogResource);
  });

  test('setup with persistReplicatorLog uses existing resource on error', async () => {
    const plugin = new ReplicatorPlugin({
      persistReplicatorLog: true,
      replicatorLogResource: 'existing_log',
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const existingLog = { name: 'existing_log' };
    const mockDatabase = {
      resources: { existing_log: existingLog },
      createResource: jest.fn().mockRejectedValue(new Error('Already exists')),
      addHook: jest.fn()
    };

    plugin.initializeReplicators = jest.fn();

    await plugin.install(mockDatabase);

    expect(plugin.replicatorLogResource).toBe(existingLog);
  });

  test('retryWithBackoff exhausts all retries and throws', async () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const failingOperation = jest.fn().mockRejectedValue(new Error('Permanent failure'));

    await expect(plugin.retryWithBackoff(failingOperation, 2)).rejects.toThrow('Permanent failure');
    expect(failingOperation).toHaveBeenCalledTimes(2);
  });

  test('logError writes to log resource when it exists', async () => {
    const plugin = new ReplicatorPlugin({
      replicatorLogResource: 'test_log',
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockLogResource = {
      insert: jest.fn().mockResolvedValue({})
    };

    plugin.database = {
      resources: { test_log: mockLogResource }
    };

    const mockReplicator = { name: 'test-replicator', id: 'repl-1' };
    const error = new Error('Replication error');

    await plugin.logError(mockReplicator, 'users', 'insert', '123', { id: '123' }, error);

    expect(mockLogResource.insert).toHaveBeenCalledWith(expect.objectContaining({
      replicator: 'test-replicator',
      resourceName: 'users',
      operation: 'insert',
      recordId: '123',
      error: 'Replication error',
      status: 'error'
    }));
  });

  test('logError emits event when logging fails', async () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      replicatorLogResource: 'test_log',
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockLogResource = {
      insert: jest.fn().mockRejectedValue(new Error('Insert failed'))
    };

    plugin.database = {
      resources: { test_log: mockLogResource }
    };

    const eventSpy = jest.spyOn(plugin, 'emit');
    const mockReplicator = { name: 'test-replicator' };
    const error = new Error('Replication error');

    await plugin.logError(mockReplicator, 'users', 'insert', '123', { id: '123' }, error);

    expect(eventSpy).toHaveBeenCalledWith('replicator_log_error', expect.objectContaining({
      replicator: 'test-replicator',
      resourceName: 'users',
      logError: 'Insert failed'
    }));
  });

  test('processReplicatorEvent returns early when no applicable replicators', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockReplicator = {
      shouldReplicateResource: jest.fn().mockReturnValue(false),
      replicate: jest.fn()
    };

    plugin.replicators = [mockReplicator];

    const result = await plugin.processReplicatorEvent('insert', 'products', '1', { id: '1' });

    expect(result).toBeUndefined();
    expect(mockReplicator.replicate).not.toHaveBeenCalled();
  });

  test('processReplicatorItem processes item successfully', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockReplicator = {
      shouldReplicateResource: jest.fn().mockReturnValue(true),
      replicate: jest.fn().mockResolvedValue({ success: true }),
      name: 'test-replicator'
    };

    plugin.replicators = [mockReplicator];

    const item = {
      resourceName: 'users',
      operation: 'insert',
      recordId: '1',
      data: { id: '1', name: 'Test' }
    };

    const eventSpy = jest.spyOn(plugin, 'emit');

    await plugin.processReplicatorItem(item);

    expect(mockReplicator.replicate).toHaveBeenCalledWith('users', 'insert', { id: '1', name: 'Test' }, '1', undefined);
    expect(eventSpy).toHaveBeenCalledWith('replicated', expect.objectContaining({
      replicator: 'test-replicator',
      success: true
    }));
  });

  test('processReplicatorItem handles replicator errors', async () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      logErrors: true,
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockReplicator = {
      shouldReplicateResource: jest.fn().mockReturnValue(true),
      replicate: jest.fn().mockRejectedValue(new Error('Replication failed')),
      name: 'test-replicator'
    };

    plugin.replicators = [mockReplicator];
    plugin.database = { resources: {} };
    plugin.logError = jest.fn();

    const item = {
      resourceName: 'users',
      operation: 'insert',
      recordId: '1',
      data: { id: '1', name: 'Test' }
    };

    const eventSpy = jest.spyOn(plugin, 'emit');

    await plugin.processReplicatorItem(item);

    expect(eventSpy).toHaveBeenCalledWith('replicator_error', expect.objectContaining({
      replicator: 'test-replicator',
      error: 'Replication failed'
    }));
    expect(plugin.logError).toHaveBeenCalled();
  });

  test('logReplicator handles errors and emits event', async () => {
    const plugin = new ReplicatorPlugin({
      verbose: true,
      replicatorLogResource: 'test_log',
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockLogResource = {
      insert: jest.fn().mockRejectedValue(new Error('Insert failed'))
    };

    plugin.database = {
      resources: { test_log: mockLogResource }
    };
    plugin.replicatorLog = mockLogResource;

    const eventSpy = jest.spyOn(plugin, 'emit');

    await plugin.logReplicator({
      resource: 'users',
      operation: 'insert',
      data: { id: '1' }
    });

    expect(eventSpy).toHaveBeenCalledWith('replicator.log.failed', expect.objectContaining({
      error: expect.any(Error)
    }));
  });

  test('updateReplicatorLog emits event on error', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockLogResource = {
      patch: jest.fn().mockRejectedValue(new Error('Update failed'))
    };

    plugin.replicatorLog = mockLogResource;

    const eventSpy = jest.spyOn(plugin, 'emit');

    await plugin.updateReplicatorLog('log-1', { status: 'failed' });

    expect(eventSpy).toHaveBeenCalledWith('replicator.updateLog.failed', expect.objectContaining({
      error: 'Update failed',
      logId: 'log-1'
    }));
  });

  test('getReplicatorStats returns complete stats', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockReplicator = {
      id: 'repl-1',
      driver: 's3db',
      config: { connectionString: 's3://test' },
      getStatus: jest.fn().mockResolvedValue({ connected: true, errors: 0 })
    };

    plugin.replicators = [mockReplicator];
    plugin.stats.lastSync = '2025-01-01T00:00:00.000Z';

    const stats = await plugin.getReplicatorStats();

    expect(stats).toEqual({
      replicators: [{
        id: 'repl-1',
        driver: 's3db',
        config: { connectionString: 's3://test' },
        status: { connected: true, errors: 0 }
      }],
      stats: plugin.stats,
      lastSync: '2025-01-01T00:00:00.000Z'
    });
  });

  test('getReplicatorLogs returns empty array when no log exists', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    plugin.replicatorLog = null;

    const logs = await plugin.getReplicatorLogs();

    expect(logs).toEqual([]);
  });

  test('getReplicatorLogs applies filters correctly', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockLogs = [
      { id: '1', resourceName: 'users', operation: 'insert', status: 'success' }
    ];

    const mockLogResource = {
      query: jest.fn().mockResolvedValue(mockLogs)
    };

    plugin.replicatorLog = mockLogResource;

    const logs = await plugin.getReplicatorLogs({
      resourceName: 'users',
      operation: 'insert',
      status: 'success',
      limit: 50,
      offset: 10
    });

    expect(mockLogResource.query).toHaveBeenCalledWith(
      { resourceName: 'users', operation: 'insert', status: 'success' },
      { limit: 50, offset: 10 }
    );
    expect(logs).toEqual(mockLogs);
  });

  test('retryFailedReplicators returns early when no log exists', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    plugin.replicatorLog = null;

    const result = await plugin.retryFailedReplicators();

    expect(result).toEqual({ retried: 0 });
  });

  test('syncAllData throws error for invalid replicator ID', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockReplicator = { id: 'repl-1' };
    plugin.replicators = [mockReplicator];

    await expect(plugin.syncAllData('invalid-id')).rejects.toThrow(/Replicator not found/);
  });

  test('installDatabaseHooks filters out log resource', async () => {
    const plugin = new ReplicatorPlugin({
      replicatorLogResource: 'test_log',
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const mockDatabase = {
      addHook: jest.fn()
    };

    plugin.database = mockDatabase;
    plugin.installEventListeners = jest.fn();

    plugin.installDatabaseHooks();

    expect(mockDatabase.addHook).toHaveBeenCalledWith('afterCreateResource', expect.any(Function));

    // Trigger the hook with log resource - should not install listeners
    const hook = mockDatabase.addHook.mock.calls[0][1];
    hook({ name: 'test_log' });

    expect(plugin.installEventListeners).not.toHaveBeenCalled();

    // Trigger with regular resource - should install listeners
    hook({ name: 'users' });

    expect(plugin.installEventListeners).toHaveBeenCalledWith({ name: 'users' }, plugin.database, plugin);
  });

  test('cleanup removes event listeners from resources to prevent memory leaks', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    // Mock resource with event listener tracking
    const mockResource = {
      name: 'users',
      on: jest.fn(),
      off: jest.fn()
    };

    const mockDatabase = {
      resources: { users: mockResource },
      addHook: jest.fn(),
      removeHook: jest.fn()
    };

    plugin.database = mockDatabase;
    plugin.initializeReplicators = jest.fn();

    await plugin.install(mockDatabase);

    // Install event listeners manually (normally done in setup)
    plugin.installEventListeners(mockResource, mockDatabase, plugin);

    // Verify listeners were installed
    expect(mockResource.on).toHaveBeenCalledTimes(3);
    expect(plugin.eventListenersInstalled.has('users')).toBe(true);
    expect(plugin.eventHandlers.has('users')).toBe(true);

    // Cleanup
    await plugin.cleanup();

    // Verify listeners were removed
    expect(mockResource.off).toHaveBeenCalledTimes(3);
    expect(mockResource.off).toHaveBeenCalledWith('insert', expect.any(Function));
    expect(mockResource.off).toHaveBeenCalledWith('update', expect.any(Function));
    expect(mockResource.off).toHaveBeenCalledWith('delete', expect.any(Function));
    expect(plugin.eventListenersInstalled.size).toBe(0);
    expect(plugin.eventHandlers.size).toBe(0);
  });
});