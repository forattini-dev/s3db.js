import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { createDatabaseForTest, sleep } from '../config.js';
import TTLPlugin from '../../src/plugins/ttl.plugin.js';

describe('TTLPlugin - Configuration and Validation Tests', () => {
  test('should create TTL plugin with valid config', () => {
    const plugin = new TTLPlugin({
      checkInterval: 60000,
      batchSize: 50,
      verbose: false,
      resources: {
        sessions: {
          ttl: 3600,
          field: 'expiresAt',
          onExpire: 'soft-delete'
        }
      }
    });

    expect(plugin.checkInterval).toBe(60000);
    expect(plugin.batchSize).toBe(50);
    expect(plugin.verbose).toBe(false);
    expect(plugin.resources.sessions).toBeDefined();
  });

  test('should throw error for resource without ttl', async () => {
    const db = createDatabaseForTest('ttl-validation-no-ttl');
    await db.connect();

    const plugin = new TTLPlugin({
      resources: {
        sessions: {
          field: 'expiresAt',
          onExpire: 'soft-delete'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('must have a numeric "ttl" value');
    await db.disconnect();
  });

  test('should throw error for resource without field', async () => {
    const db = createDatabaseForTest('ttl-validation-no-field');
    await db.connect();

    const plugin = new TTLPlugin({
      resources: {
        sessions: {
          ttl: 3600,
          onExpire: 'soft-delete'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('must have a "field" string');
    await db.disconnect();
  });

  test('should throw error for invalid onExpire strategy', async () => {
    const db = createDatabaseForTest('ttl-validation-invalid-strategy');
    await db.connect();

    const plugin = new TTLPlugin({
      resources: {
        sessions: {
          ttl: 3600,
          field: 'expiresAt',
          onExpire: 'invalid-strategy'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('must have an "onExpire" value');
    await db.disconnect();
  });

  test('should default deleteField to "deletedAt" for soft-delete', async () => {
    const db = createDatabaseForTest('ttl-validation-default-deletefield');
    await db.connect();

    const plugin = new TTLPlugin({
      resources: {
        sessions: {
          ttl: 3600,
          field: 'expiresAt',
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);
    expect(plugin.resources.sessions.deleteField).toBe('deletedAt');
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should throw error for archive without archiveResource', async () => {
    const db = createDatabaseForTest('ttl-validation-no-archive-resource');
    await db.connect();

    const plugin = new TTLPlugin({
      resources: {
        orders: {
          ttl: 2592000,
          field: 'createdAt',
          onExpire: 'archive'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('must have an "archiveResource" specified');
    await db.disconnect();
  });

  test('should throw error for callback without callback function', async () => {
    const db = createDatabaseForTest('ttl-validation-no-callback');
    await db.connect();

    const plugin = new TTLPlugin({
      resources: {
        custom: {
          ttl: 7200,
          field: 'expiresAt',
          onExpire: 'callback'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('must have a "callback" function');
    await db.disconnect();
  });
});

describe('TTLPlugin - Soft Delete Strategy', () => {
  let db, sessions, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-soft-delete');
    await db.connect();

    sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|required',
        token: 'string',
        expiresAt: 'number'
        // deletedAt will be added by the plugin dynamically
      }
    });

    plugin = new TTLPlugin({
      checkInterval: 0, // Disable auto cleanup for tests
      verbose: false,
      resources: {
        sessions: {
          ttl: 5, // 5 seconds
          field: 'expiresAt',
          onExpire: 'soft-delete',
          deleteField: 'deletedAt'
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should soft-delete expired session', async () => {
    const expiredTime = Date.now() - 10000; // 10 seconds ago
    await sessions.insert({
      id: 'session-1',
      token: 'token-1',
      expiresAt: expiredTime
    });

    await plugin.runCleanup();

    const session = await sessions.get('session-1');
    expect(session).toBeDefined();
    expect(session.deletedAt).toBeDefined();
    expect(session.token).toBe('token-1'); // Data still intact
  });

  test('should not delete non-expired session', async () => {
    const futureTime = Date.now() + 10000; // 10 seconds in future
    await sessions.insert({
      id: 'session-2',
      token: 'token-2',
      expiresAt: futureTime
    });

    await plugin.runCleanup();

    const session = await sessions.get('session-2');
    expect(session).toBeDefined();
    expect(session.deletedAt).toBeUndefined();
  });

  test('should update stats after soft-delete', async () => {
    const expiredTime = Date.now() - 10000;
    await sessions.insert({
      id: 'session-3',
      token: 'token-3',
      expiresAt: expiredTime
    });

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalSoftDeleted).toBeGreaterThan(statsBefore.totalSoftDeleted);
    expect(statsAfter.totalScans).toBeGreaterThan(statsBefore.totalScans);
  });
});

describe('TTLPlugin - Hard Delete Strategy', () => {
  let db, tempFiles, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-hard-delete');
    await db.connect();

    tempFiles = await db.createResource({
      name: 'temp_files',
      attributes: {
        id: 'string|required',
        filename: 'string',
        createdAt: 'number'
      }
    });

    plugin = new TTLPlugin({
      checkInterval: 0,
      verbose: false,
      resources: {
        temp_files: {
          ttl: 5,
          field: 'createdAt',
          onExpire: 'hard-delete'
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should hard-delete expired file', async () => {
    const expiredTime = Date.now() - 10000;
    await tempFiles.insert({
      id: 'file-1',
      filename: 'temp.txt',
      createdAt: expiredTime
    });

    await plugin.runCleanup();

    const file = await tempFiles.get('file-1').catch(() => null);
    expect(file).toBeNull();
  });

  test('should not delete non-expired file', async () => {
    const futureTime = Date.now() + 10000;
    await tempFiles.insert({
      id: 'file-2',
      filename: 'temp2.txt',
      createdAt: futureTime
    });

    await plugin.runCleanup();

    const file = await tempFiles.get('file-2');
    expect(file).toBeDefined();
    expect(file.filename).toBe('temp2.txt');
  });

  test('should update stats after hard-delete', async () => {
    const expiredTime = Date.now() - 10000;
    await tempFiles.insert({
      id: 'file-3',
      filename: 'temp3.txt',
      createdAt: expiredTime
    });

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalDeleted).toBeGreaterThan(statsBefore.totalDeleted);
  });
});

describe('TTLPlugin - Archive Strategy', () => {
  let db, orders, archivedOrders, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-archive');
    await db.connect();

    orders = await db.createResource({
      name: 'orders',
      attributes: {
        id: 'string|required',
        orderNumber: 'string',
        total: 'number',
        createdAt: 'number'
      }
    });

    archivedOrders = await db.createResource({
      name: 'archived_orders',
      attributes: {
        id: 'string|required',
        orderNumber: 'string',
        total: 'number',
        createdAt: 'number',
        _archivedAt: 'string',
        _archivedFrom: 'string',
        _originalId: 'string'
      }
    });

    plugin = new TTLPlugin({
      checkInterval: 0,
      verbose: false,
      resources: {
        orders: {
          ttl: 5,
          field: 'createdAt',
          onExpire: 'archive',
          archiveResource: 'archived_orders',
          keepOriginalId: true  // Keep same ID in archive
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should archive expired order', async () => {
    const expiredTime = Date.now() - 10000;
    await orders.insert({
      id: 'order-1',
      orderNumber: 'ORD-001',
      total: 100,
      createdAt: expiredTime
    });

    await plugin.runCleanup();

    // Original should be deleted
    const originalOrder = await orders.get('order-1').catch(() => null);
    expect(originalOrder).toBeNull();

    // Should exist in archive
    const archivedList = await archivedOrders.list();
    expect(archivedList.length).toBeGreaterThan(0);
    const archived = archivedList.find(o => o.orderNumber === 'ORD-001');
    expect(archived).toBeDefined();
    expect(archived.orderNumber).toBe('ORD-001');
    expect(archived.total).toBe(100);
  });

  test('should update stats after archive', async () => {
    const expiredTime = Date.now() - 10000;
    await orders.insert({
      id: 'order-2',
      orderNumber: 'ORD-002',
      total: 200,
      createdAt: expiredTime
    });

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalArchived).toBeGreaterThan(statsBefore.totalArchived);
    expect(statsAfter.totalDeleted).toBeGreaterThan(statsBefore.totalDeleted);
  });
});

describe('TTLPlugin - Callback Strategy', () => {
  let db, customData, plugin, callbackInvoked;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-callback');
    await db.connect();

    customData = await db.createResource({
      name: 'custom_data',
      attributes: {
        id: 'string|required',
        value: 'string',
        priority: 'string',
        expiresAt: 'number'
      }
    });

    callbackInvoked = [];

    plugin = new TTLPlugin({
      checkInterval: 0,
      verbose: false,
      resources: {
        custom_data: {
          ttl: 5,
          field: 'expiresAt',
          onExpire: 'callback',
          callback: async (record, resource) => {
            callbackInvoked.push(record.id);
            // Only delete if priority is not 'high'
            return record.priority !== 'high';
          }
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should invoke callback for expired record', async () => {
    const expiredTime = Date.now() - 10000;
    await customData.insert({
      id: 'data-1',
      value: 'test',
      priority: 'low',
      expiresAt: expiredTime
    });

    callbackInvoked = [];
    await plugin.runCleanup();

    expect(callbackInvoked).toContain('data-1');
  });

  test('should delete when callback returns true', async () => {
    const expiredTime = Date.now() - 10000;
    await customData.insert({
      id: 'data-2',
      value: 'test2',
      priority: 'low',
      expiresAt: expiredTime
    });

    await plugin.runCleanup();

    const record = await customData.get('data-2').catch(() => null);
    expect(record).toBeNull();
  });

  test('should not delete when callback returns false', async () => {
    const expiredTime = Date.now() - 10000;
    await customData.insert({
      id: 'data-3',
      value: 'test3',
      priority: 'high',
      expiresAt: expiredTime
    });

    await plugin.runCleanup();

    const record = await customData.get('data-3');
    expect(record).toBeDefined();
    expect(record.priority).toBe('high');
  });

  test('should update stats after callback', async () => {
    const expiredTime = Date.now() - 10000;
    await customData.insert({
      id: 'data-4',
      value: 'test4',
      priority: 'medium',
      expiresAt: expiredTime
    });

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalCallbacks).toBeGreaterThan(statsBefore.totalCallbacks);
  });
});

describe('TTLPlugin - Multiple Field Formats', () => {
  let db, mixedFormats, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-mixed-formats');
    await db.connect();

    mixedFormats = await db.createResource({
      name: 'mixed_formats',
      attributes: {
        id: 'string|required',
        expiresAt: 'string' // Can be string, number, or Date
      }
    });

    plugin = new TTLPlugin({
      checkInterval: 0,
      verbose: false,
      resources: {
        mixed_formats: {
          ttl: 5,
          field: 'expiresAt',
          onExpire: 'hard-delete'
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should handle ISO string timestamp', async () => {
    const expiredDate = new Date(Date.now() - 10000);
    await mixedFormats.insert({
      id: 'format-1',
      expiresAt: expiredDate.toISOString()
    });

    await plugin.runCleanup();

    const record = await mixedFormats.get('format-1').catch(() => null);
    expect(record).toBeNull();
  });
});

describe('TTLPlugin - Stats and Monitoring', () => {
  let db, testResource, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-stats');
    await db.connect();

    testResource = await db.createResource({
      name: 'test_resource',
      attributes: {
        id: 'string|required',
        expiresAt: 'number'
      }
    });

    plugin = new TTLPlugin({
      checkInterval: 0,
      verbose: false,
      resources: {
        test_resource: {
          ttl: 5,
          field: 'expiresAt',
          onExpire: 'hard-delete'
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should track total scans', async () => {
    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalScans).toBe(statsBefore.totalScans + 2);
  });

  test('should track last scan timestamp', async () => {
    await plugin.runCleanup();
    const stats = plugin.getStats();

    expect(stats.lastScanAt).toBeDefined();
    expect(stats.lastScanDuration).toBeGreaterThanOrEqual(0);
  });

  test('should provide resource count in stats', async () => {
    const stats = plugin.getStats();
    expect(stats.resources).toBe(1);
  });

  test('should track running status', async () => {
    const stats = plugin.getStats();
    expect(stats.isRunning).toBe(false);
    expect(stats.checkInterval).toBeGreaterThanOrEqual(0);
  });
});

describe('TTLPlugin - Manual Cleanup', () => {
  let db, sessions, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-manual');
    await db.connect();

    sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|required',
        expiresAt: 'number'
      }
    });

    plugin = new TTLPlugin({
      checkInterval: 0,
      verbose: false,
      resources: {
        sessions: {
          ttl: 5,
          field: 'expiresAt',
          onExpire: 'hard-delete'
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should cleanup specific resource manually', async () => {
    const expiredTime = Date.now() - 10000;
    await sessions.insert({
      id: 'session-manual-1',
      expiresAt: expiredTime
    });

    const result = await plugin.cleanupResource('sessions');
    expect(result.expired).toBeGreaterThan(0);
    expect(result.processed).toBeGreaterThan(0);

    const record = await sessions.get('session-manual-1').catch(() => null);
    expect(record).toBeNull();
  });

  test('should throw error for non-configured resource', async () => {
    await expect(plugin.cleanupResource('non_existent')).rejects.toThrow(
      'Resource "non_existent" not configured in TTLPlugin'
    );
  });
});
