import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest, sleep } from '../config.js';
import TTLPlugin from '../../src/plugins/ttl.plugin.js';

describe('TTLPlugin v2 - Configuration and Validation', () => {
  test('should create TTL plugin with valid config', () => {
    const plugin = new TTLPlugin({
      batchSize: 50,
      verbose: false,
      resources: {
        sessions: {
          ttl: 3600,
          onExpire: 'soft-delete'
        }
      }
    });

    expect(plugin.batchSize).toBe(50);
    expect(plugin.verbose).toBe(false);
    expect(plugin.resources.sessions).toBeDefined();
  });

  test('should allow resource with only TTL (uses _createdAt)', async () => {
    const db = createDatabaseForTest('ttl-validation-ttl-only');
    await db.connect();

    // Create resource BEFORE installing plugin
    await db.createResource({
      name: 'sessions',
      attributes: { id: 'string|required', token: 'string' }
    });

    const plugin = new TTLPlugin({
      resources: {
        sessions: {
          ttl: 3600,
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);
    expect(plugin.resources.sessions.field).toBe('_createdAt');
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should allow resource with only field (absolute expiration)', async () => {
    const db = createDatabaseForTest('ttl-validation-field-only');
    await db.connect();

    // Create resource BEFORE installing plugin
    await db.createResource({
      name: 'subscriptions',
      attributes: { id: 'string|required', endsAt: 'number' }
    });

    const plugin = new TTLPlugin({
      resources: {
        subscriptions: {
          field: 'endsAt',
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);
    expect(plugin.resources.subscriptions.field).toBe('endsAt');
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should throw error for resource without ttl and field', async () => {
    const db = createDatabaseForTest('ttl-validation-no-ttl-field');
    await db.connect();

    const plugin = new TTLPlugin({
      resources: {
        sessions: {
          onExpire: 'soft-delete'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('must have either "ttl"');
    await db.disconnect();
  });

  test('should throw error for invalid onExpire strategy', async () => {
    const db = createDatabaseForTest('ttl-validation-invalid-strategy');
    await db.connect();

    const plugin = new TTLPlugin({
      resources: {
        sessions: {
          ttl: 3600,
          onExpire: 'invalid-strategy'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('must have an "onExpire" value');
    await db.disconnect();
  });

  test('should default deleteField to "deletedat" for soft-delete', async () => {
    const db = createDatabaseForTest('ttl-validation-default-deletefield');
    await db.connect();

    // Create resource BEFORE installing plugin
    await db.createResource({
      name: 'sessions',
      attributes: { id: 'string|required' }
    });

    const plugin = new TTLPlugin({
      resources: {
        sessions: {
          ttl: 3600,
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);
    expect(plugin.resources.sessions.deleteField).toBe('deletedat');
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should auto-detect granularity based on TTL', async () => {
    const db = createDatabaseForTest('ttl-validation-granularity');
    await db.connect();

    // Create resources BEFORE installing plugin
    await db.createResource({ name: 'shortLived', attributes: { id: 'string|required' } });
    await db.createResource({ name: 'mediumLived', attributes: { id: 'string|required' } });
    await db.createResource({ name: 'longLived', attributes: { id: 'string|required' } });
    await db.createResource({ name: 'veryLongLived', attributes: { id: 'string|required' } });

    const plugin = new TTLPlugin({
      resources: {
        shortLived: { ttl: 300, onExpire: 'hard-delete' },     // < 1h = minute
        mediumLived: { ttl: 7200, onExpire: 'hard-delete' },   // < 24h = hour
        longLived: { ttl: 86400, onExpire: 'hard-delete' },    // < 30d = day
        veryLongLived: { ttl: 2592000, onExpire: 'hard-delete' } // >= 30d = week
      }
    });

    await plugin.install(db);
    expect(plugin.resources.shortLived.granularity).toBe('minute');
    expect(plugin.resources.mediumLived.granularity).toBe('hour');
    expect(plugin.resources.longLived.granularity).toBe('day');
    expect(plugin.resources.veryLongLived.granularity).toBe('week');
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
          onExpire: 'callback'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('must have a "callback" function');
    await db.disconnect();
  });
});

describe('TTLPlugin v2 - Plugin Storage & Expiration Index', () => {
  let db, plugin, sessions;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-plugin-storage');
    await db.connect();

    // Create resource BEFORE installing plugin
    sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|required',
        token: 'string'
      }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        sessions: {
          ttl: 60, // 1 minute
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should create expiration index resource', () => {
    expect(plugin.expirationIndex).toBeDefined();
    expect(plugin.expirationIndex.name).toBe('plg_ttl_expiration_index');
  });

  test('should have partition on expiresAtCohort', () => {
    const partitions = plugin.expirationIndex.config.partitions;
    expect(partitions).toBeDefined();
    expect(partitions.byExpiresAtCohort).toBeDefined();
    expect(partitions.byExpiresAtCohort.fields.expiresAtCohort).toBe('string');
  });

  test('should add records to expiration index on insert', async () => {
    await sessions.insert({
      id: 'session-1',
      token: 'token-1'
    });

    // Give it a moment for the hook to execute
    await sleep(100);

    const indexEntries = await plugin.expirationIndex.query({ recordId: 'session-1' });
    expect(indexEntries.length).toBeGreaterThan(0);
    expect(indexEntries[0].resourceName).toBe('sessions');
    expect(indexEntries[0].recordId).toBe('session-1');
    expect(indexEntries[0].granularity).toBe('minute');
    expect(indexEntries[0].expiresAtCohort).toBeDefined();
  });

  test('should remove records from expiration index on delete', async () => {

    await sessions.insert({
      id: 'session-2',
      token: 'token-2'
    });

    await sleep(100);

    // Verify it's in the index
    let indexEntries = await plugin.expirationIndex.query({ recordId: 'session-2' });
    expect(indexEntries.length).toBeGreaterThan(0);

    // Delete the record
    await sessions.delete('session-2');
    await sleep(100);

    // Should be removed from index
    indexEntries = await plugin.expirationIndex.query({ recordId: 'session-2' });
    expect(indexEntries.length).toBe(0);
  });

  test('should be idempotent - updating same record should not create duplicates', async () => {
    // Insert a record
    await sessions.insert({
      id: 'session-idempotent',
      token: 'token-original'
    });

    await sleep(100);

    // Check index - should have exactly 1 entry
    let indexEntries = await plugin.expirationIndex.query({ recordId: 'session-idempotent' });
    expect(indexEntries.length).toBe(1);
    const originalIndexId = indexEntries[0].id;

    // Update the record (triggers delete + insert hooks)
    await sessions.update('session-idempotent', { token: 'token-updated' });

    await sleep(100);

    // Check index again - still should have exactly 1 entry (idempotent!)
    indexEntries = await plugin.expirationIndex.query({ recordId: 'session-idempotent' });
    expect(indexEntries.length).toBe(1);
    expect(indexEntries[0].id).toBe(originalIndexId); // Same deterministic ID
  });

  test('should use O(1) deletion with deterministic ID', async () => {
    // Insert a record
    await sessions.insert({
      id: 'session-o1-test',
      token: 'token-test'
    });

    await sleep(100);

    // Verify it exists in index
    const indexEntries = await plugin.expirationIndex.query({ recordId: 'session-o1-test' });
    expect(indexEntries.length).toBe(1);

    // The deterministic ID should follow pattern: resourceName:recordId
    const expectedId = 'sessions:session-o1-test';
    expect(indexEntries[0].id).toBe(expectedId);

    // Delete should be O(1) using this deterministic ID
    await sessions.delete('session-o1-test');
    await sleep(100);

    // Verify it's gone from index
    const afterDelete = await plugin.expirationIndex.query({ recordId: 'session-o1-test' });
    expect(afterDelete.length).toBe(0);
  });
});

describe('TTLPlugin v2 - Soft Delete Strategy', () => {
  let db, sessions, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-soft-delete');
    await db.connect();

    sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|required',
        token: 'string'
      }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        sessions: {
          ttl: 1, // 1 second for testing
          onExpire: 'soft-delete'
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
    await sessions.insert({
      id: 'session-expire-1',
      token: 'token-1'
    });

    // Wait for expiration
    await sleep(1500);

    await plugin.runCleanup();

    const session = await sessions.get('session-expire-1');
    expect(session).toBeDefined();
    expect(session.deletedat).toBeDefined();
    expect(session.isdeleted).toBe('true');
    expect(session.token).toBe('token-1'); // Data still intact
  });

  test('should not delete non-expired session', async () => {
    await sessions.insert({
      id: 'session-active-1',
      token: 'token-2'
    });

    await plugin.runCleanup();

    const session = await sessions.get('session-active-1');
    expect(session).toBeDefined();
    expect(session.deletedat).toBeUndefined();
    expect(session.isdeleted).toBeUndefined();
  });

  test('should update stats after soft-delete', async () => {
    await sessions.insert({
      id: 'session-stats-1',
      token: 'token-3'
    });

    await sleep(1500);

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalSoftDeleted).toBeGreaterThan(statsBefore.totalSoftDeleted);
    expect(statsAfter.totalScans).toBeGreaterThan(statsBefore.totalScans);
  });
});

describe('TTLPlugin v2 - Hard Delete Strategy', () => {
  let db, tempFiles, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-hard-delete');
    await db.connect();

    tempFiles = await db.createResource({
      name: 'temp_files',
      attributes: {
        id: 'string|required',
        filename: 'string'
      }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        temp_files: {
          ttl: 1,
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
    await tempFiles.insert({
      id: 'file-1',
      filename: 'temp.txt'
    });

    await sleep(1500);
    await plugin.runCleanup();

    const file = await tempFiles.get('file-1').catch(() => null);
    expect(file).toBeNull();
  });

  test('should not delete non-expired file', async () => {
    await tempFiles.insert({
      id: 'file-2',
      filename: 'temp2.txt'
    });

    await plugin.runCleanup();

    const file = await tempFiles.get('file-2');
    expect(file).toBeDefined();
    expect(file.filename).toBe('temp2.txt');
  });

  test('should update stats after hard-delete', async () => {
    await tempFiles.insert({
      id: 'file-3',
      filename: 'temp3.txt'
    });

    await sleep(1500);

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalDeleted).toBeGreaterThan(statsBefore.totalDeleted);
  });
});

describe('TTLPlugin v2 - Archive Strategy', () => {
  let db, orders, archivedOrders, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-archive');
    await db.connect();

    orders = await db.createResource({
      name: 'orders',
      attributes: {
        id: 'string|required',
        orderNumber: 'string',
        total: 'number'
      }
    });

    archivedOrders = await db.createResource({
      name: 'archived_orders',
      attributes: {
        id: 'string|required',
        orderNumber: 'string',
        total: 'number',
        archivedAt: 'string',
        archivedFrom: 'string',
        originalId: 'string'
      }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        orders: {
          ttl: 1,
          onExpire: 'archive',
          archiveResource: 'archived_orders',
          keepOriginalId: true
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
    await orders.insert({
      id: 'order-1',
      orderNumber: 'ORD-001',
      total: 100
    });

    await sleep(1500);
    await plugin.runCleanup();

    // Original should be deleted
    const originalOrder = await orders.get('order-1').catch(() => null);
    expect(originalOrder).toBeNull();

    // Should exist in archive
    const archivedList = await archivedOrders.list();
    const archived = archivedList.find(o => o.orderNumber === 'ORD-001');
    expect(archived).toBeDefined();
    expect(archived.orderNumber).toBe('ORD-001');
    expect(archived.total).toBe(100);
    expect(archived.archivedAt).toBeDefined();
    expect(archived.archivedFrom).toBe('orders');
  });

  test('should update stats after archive', async () => {
    await orders.insert({
      id: 'order-2',
      orderNumber: 'ORD-002',
      total: 200
    });

    await sleep(1500);

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalArchived).toBeGreaterThan(statsBefore.totalArchived);
    expect(statsAfter.totalDeleted).toBeGreaterThan(statsBefore.totalDeleted);
  });
});

describe('TTLPlugin v2 - Callback Strategy', () => {
  let db, customData, plugin, callbackInvoked;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-callback');
    await db.connect();

    customData = await db.createResource({
      name: 'custom_data',
      attributes: {
        id: 'string|required',
        value: 'string',
        priority: 'string'
      }
    });

    callbackInvoked = [];

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        custom_data: {
          ttl: 1,
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
    await customData.insert({
      id: 'data-1',
      value: 'test',
      priority: 'low'
    });

    await sleep(1500);

    callbackInvoked = [];
    await plugin.runCleanup();

    expect(callbackInvoked).toContain('data-1');
  });

  test('should delete when callback returns true', async () => {
    await customData.insert({
      id: 'data-2',
      value: 'test2',
      priority: 'low'
    });

    await sleep(1500);
    await plugin.runCleanup();

    const record = await customData.get('data-2').catch(() => null);
    expect(record).toBeNull();
  });

  test('should not delete when callback returns false', async () => {
    await customData.insert({
      id: 'data-3',
      value: 'test3',
      priority: 'high'
    });

    await sleep(1500);
    await plugin.runCleanup();

    const record = await customData.get('data-3');
    expect(record).toBeDefined();
    expect(record.priority).toBe('high');
  });

  test('should update stats after callback', async () => {
    await customData.insert({
      id: 'data-4',
      value: 'test4',
      priority: 'medium'
    });

    await sleep(1500);

    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalCallbacks).toBeGreaterThan(statsBefore.totalCallbacks);
  });
});

describe('TTLPlugin v2 - Stats and Monitoring', () => {
  let db, testResource, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-stats');
    await db.connect();

    testResource = await db.createResource({
      name: 'test_resource',
      attributes: {
        id: 'string|required',
        value: 'string'
      }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        test_resource: {
          ttl: 1,
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

    expect(statsAfter.totalScans).toBeGreaterThan(statsBefore.totalScans);
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

  test('should track interval count', async () => {
    const stats = plugin.getStats();
    expect(stats.intervals).toBeGreaterThan(0);
    expect(stats.isRunning).toBe(true);
  });
});

describe('TTLPlugin v2 - Manual Cleanup', () => {
  let db, sessions, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-manual');
    await db.connect();

    sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|required',
        token: 'string'
      }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        sessions: {
          ttl: 1,
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
    await sessions.insert({
      id: 'session-manual-1',
      token: 'token-1'
    });

    await sleep(1500);

    const result = await plugin.cleanupResource('sessions');
    expect(result.resource).toBe('sessions');
    expect(result.granularity).toBe('minute');

    const record = await sessions.get('session-manual-1').catch(() => null);
    expect(record).toBeNull();
  });

  test('should throw error for non-configured resource', async () => {
    await expect(plugin.cleanupResource('non_existent')).rejects.toThrow(
      'Resource "non_existent" not configured in TTLPlugin'
    );
  });
});

describe('TTLPlugin v2 - Custom Field Support', () => {
  let db, subscriptions, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-custom-field');
    await db.connect();

    subscriptions = await db.createResource({
      name: 'subscriptions',
      attributes: {
        id: 'string|required',
        userId: 'string',
        endsAt: 'number'
      }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        subscriptions: {
          ttl: 1,
          field: 'endsAt', // Custom field
          onExpire: 'soft-delete'
        }
      }
    });

    await plugin.install(db);
  });

  afterAll(async () => {
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should use custom field for expiration', async () => {
    const pastTime = Date.now() - 2000;

    await subscriptions.insert({
      id: 'sub-1',
      userId: 'user-1',
      endsAt: pastTime
    });

    await plugin.runCleanup();

    const sub = await subscriptions.get('sub-1');
    expect(sub).toBeDefined();
    expect(sub.deletedat).toBeDefined();
    expect(sub.isdeleted).toBe('true');
  });
});

describe('TTLPlugin v2 - Multiple Granularities', () => {
  let db, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-multi-granularity');
    await db.connect();

    await db.createResource({
      name: 'short_lived',
      attributes: { id: 'string|required' }
    });

    await db.createResource({
      name: 'medium_lived',
      attributes: { id: 'string|required' }
    });

    await db.createResource({
      name: 'long_lived',
      attributes: { id: 'string|required' }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        short_lived: {
          ttl: 300,      // minute granularity
          onExpire: 'hard-delete'
        },
        medium_lived: {
          ttl: 7200,     // hour granularity
          onExpire: 'hard-delete'
        },
        long_lived: {
          ttl: 2592000,  // week granularity
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

  test('should create multiple intervals for different granularities', () => {
    const stats = plugin.getStats();
    // Should have 3 intervals (one for each granularity: minute, hour, week)
    expect(stats.intervals).toBeGreaterThan(0);
    expect(stats.isRunning).toBe(true);
  });

  test('should cleanup all granularities with runCleanup', async () => {
    const shortLived = db.resource('short_lived');
    const mediumLived = db.resource('medium_lived');

    await shortLived.insert({ id: 'short-1' });
    await mediumLived.insert({ id: 'medium-1' });

    await sleep(1000);

    await plugin.runCleanup();

    const stats = plugin.getStats();
    expect(stats.totalScans).toBeGreaterThan(0);
  });
});

describe('TTLPlugin v2 - Interval Management', () => {
  let db, plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-intervals');
    await db.connect();

    await db.createResource({
      name: 'test_data',
      attributes: { id: 'string|required' }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        test_data: {
          ttl: 60,
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

  test('should start intervals on install', () => {
    expect(plugin.isRunning).toBe(true);
    expect(plugin.intervals.length).toBeGreaterThan(0);
  });

  test('should stop intervals on uninstall', async () => {
    await plugin.uninstall();
    expect(plugin.isRunning).toBe(false);
    expect(plugin.intervals.length).toBe(0);
  });
});
