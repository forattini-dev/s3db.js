import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import { createDatabaseForTest } from '../../config.js';
import { waitFor } from './helpers.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

describe('TTLPlugin v2 - Plugin Storage & Expiration Index', () => {
  let db;
  let plugin;
  let sessions;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-plugin-storage');
    await db.connect();

    sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|optional',
        token: 'string'
      }
    });

    plugin = new TTLPlugin({
      logLevel: 'silent',
      resources: {
        sessions: {
          ttl: 60,
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
    await sessions.insert({ id: 'session-1', token: 'token-1' });

    const indexEntries = await waitFor(async () => {
      const entries = await plugin.expirationIndex.query({ recordId: 'session-1' });
      return entries.length ? entries : null;
    });

    expect(indexEntries.length).toBeGreaterThan(0);
    expect(indexEntries[0].resourceName).toBe('sessions');
    expect(indexEntries[0].recordId).toBe('session-1');
    expect(indexEntries[0].granularity).toBe('minute');
    expect(indexEntries[0].expiresAtCohort).toBeDefined();
  });

  test('should remove records from expiration index on delete', async () => {
    await sessions.insert({ id: 'session-2', token: 'token-2' });

    await waitFor(async () => {
      const entries = await plugin.expirationIndex.query({ recordId: 'session-2' });
      return entries.length ? entries : null;
    });

    await sessions.delete('session-2');

    const indexEntries = await waitFor(async () => {
      const entries = await plugin.expirationIndex.query({ recordId: 'session-2' });
      return entries.length === 0 ? entries : null;
    });

    expect(indexEntries.length).toBe(0);
  });

  test('should be idempotent - updating same record should not create duplicates', async () => {
    await sessions.insert({
      id: 'session-idempotent',
      token: 'token-original'
    });

    const indexEntries = await waitFor(async () => {
      const entries = await plugin.expirationIndex.query({ recordId: 'session-idempotent' });
      return entries.length ? entries : null;
    });
    const originalIndexId = indexEntries[0].id;

    await sessions.update('session-idempotent', { token: 'token-updated' });

    const refreshedEntries = await waitFor(async () => {
      const entries = await plugin.expirationIndex.query({ recordId: 'session-idempotent' });
      return entries.length ? entries : null;
    });

    expect(refreshedEntries.length).toBe(1);
    expect(refreshedEntries[0].id).toBe(originalIndexId);
  });

  test('should use O(1) deletion with deterministic ID', async () => {
    await sessions.insert({
      id: 'session-o1-test',
      token: 'token-test'
    });

    const indexEntries = await waitFor(async () => {
      const entries = await plugin.expirationIndex.query({ recordId: 'session-o1-test' });
      return entries.length ? entries : null;
    });

    const expectedId = 'sessions:session-o1-test';
    expect(indexEntries[0].id).toBe(expectedId);

    await sessions.delete('session-o1-test');

    const afterDelete = await waitFor(async () => {
      const entries = await plugin.expirationIndex.query({ recordId: 'session-o1-test' });
      return entries.length === 0 ? entries : null;
    });

    expect(afterDelete.length).toBe(0);
  });
});
