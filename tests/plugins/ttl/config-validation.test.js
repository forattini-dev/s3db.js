import { describe, expect, test } from '@jest/globals';

import { createDatabaseForTest } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

describe('TTLPlugin v2 - Configuration and Validation', () => {
  test('should create TTL plugin with valid config', () => {
    const plugin = new TTLPlugin({
      logLevel: 'silent',
      batchSize: 50,
      logLevel: 'silent',
      resources: {
        sessions: {
          ttl: 3600,
          onExpire: 'soft-delete'
        }
      }
    });

    expect(plugin.batchSize).toBe(50);
    expect(plugin.logLevel || plugin.options?.logLevel).not.toBe('debug');
    expect(plugin.resources.sessions).toBeDefined();
  });

  test('should allow resource with only TTL (uses _createdAt)', async () => {
    const db = createDatabaseForTest('ttl-validation-ttl-only');
    await db.connect();

    await db.createResource({
      name: 'sessions',
      attributes: { id: 'string|optional', token: 'string' }
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
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

    await db.createResource({
      name: 'subscriptions',
      attributes: { id: 'string|optional', endsAt: 'number' }
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
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
      logLevel: 'silent',
      resources: {
        sessions: {
          onExpire: 'soft-delete'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('[TTLPlugin] Missing TTL configuration');
    await db.disconnect();
  });

  test('should throw error for invalid onExpire strategy', async () => {
    const db = createDatabaseForTest('ttl-validation-invalid-strategy');
    await db.connect();

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        sessions: {
          ttl: 3600,
          onExpire: 'invalid-strategy'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('[TTLPlugin] Invalid onExpire strategy');
    await db.disconnect();
  });

  test('should default deleteField to "deletedat" for soft-delete', async () => {
    const db = createDatabaseForTest('ttl-validation-default-deletefield');
    await db.connect();

    await db.createResource({
      name: 'sessions',
      attributes: { id: 'string|optional' }
    });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
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

    await db.createResource({ name: 'shortLived', attributes: { id: 'string|optional' } });
    await db.createResource({ name: 'mediumLived', attributes: { id: 'string|optional' } });
    await db.createResource({ name: 'longLived', attributes: { id: 'string|optional' } });
    await db.createResource({ name: 'veryLongLived', attributes: { id: 'string|optional' } });

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        shortLived: { ttl: 300, onExpire: 'hard-delete' },
        mediumLived: { ttl: 7200, onExpire: 'hard-delete' },
        longLived: { ttl: 86400, onExpire: 'hard-delete' },
        veryLongLived: { ttl: 2592000, onExpire: 'hard-delete' }
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
      logLevel: 'silent',
      resources: {
        orders: {
          ttl: 2592000,
          onExpire: 'archive'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('[TTLPlugin] Archive resource required');
    await db.disconnect();
  });

  test('should throw error for callback without callback function', async () => {
    const db = createDatabaseForTest('ttl-validation-no-callback');
    await db.connect();

    const plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        custom: {
          ttl: 7200,
          onExpire: 'callback'
        }
      }
    });

    await expect(plugin.install(db)).rejects.toThrow('[TTLPlugin] Callback handler required');
    await db.disconnect();
  });
});
