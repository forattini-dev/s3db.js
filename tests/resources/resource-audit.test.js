import { createDatabaseForTest } from '#tests/config.js';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Plugin } from '../../src/plugins/plugin.class.js';

let database, audits;

describe('Resource Audit - Minimal Insert/Get', () => {
  beforeAll(async () => {
    database = createDatabaseForTest('resource-audit');
    audits = await database.createResource({
      name: 'audits',
      attributes: {
        id: 'string|required',
        resourceName: 'string|required',
        operation: 'string|required',
        recordId: 'string|required',
        userId: 'string|optional',
        timestamp: 'string|required',
        oldData: 'string|optional',
        newData: 'string|optional',
        partition: 'string|optional',
        partitionValues: 'string|optional',
        metadata: 'string|optional'
      }
    });
  });

  test('should insert and retrieve audit record', async () => {
    const record = {
      id: 'audit-test-1',
      resourceName: 'users',
      operation: 'insert',
      recordId: 'user-1',
      userId: 'system',
      timestamp: new Date().toISOString(),
      oldData: null,
      newData: JSON.stringify({ foo: 'bar' }),
      partition: null,
      partitionValues: null,
      metadata: JSON.stringify({ test: true })
    };
    await audits.insert(record);
    const all = await audits.getAll();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
    const found = all.find(r => r.id === 'audit-test-1');
    expect(found).toBeDefined();
    expect(found.resourceName).toBe('users');
    expect(found.operation).toBe('insert');
  });
});

describe('Resource Middleware - Chaining and Short-circuit', () => {
  let resource, plugin;
  beforeAll(async () => {
    database = createDatabaseForTest('resource-middleware');
    resource = await database.createResource({
      name: 'mw-test',
      attributes: { id: 'string|required', name: 'string|required' }
    });
    plugin = new Plugin();
  });

  test('should chain middlewares and allow short-circuit', async () => {
    const calls = [];
    // Logger middleware for insert
    plugin.addMiddleware(resource, 'insert', async (next, data) => {
      calls.push('logger-insert');
      return await next(data);
    });
    // Blocker middleware for insert
    plugin.addMiddleware(resource, 'insert', async (next, data) => {
      if (data.name === 'Block') {
        calls.push('blocker-insert');
        return null;
      }
      return await next(data);
    });
    // Blocked insert
    const blocked = await resource.insert({ id: '1', name: 'Block' });
    expect(blocked).toBeNull();
    expect(calls).toEqual(['logger-insert', 'blocker-insert']);
    // Normal insert
    calls.length = 0;
    const normal = await resource.insert({ id: '2', name: 'Ok' });
    expect(normal).toBeDefined();
    expect(normal.id).toBe('2');
    expect(calls).toEqual(['logger-insert']); // Only logger, blocker not triggered

    // --- Update middlewares ---
    // Logger middleware for update
    plugin.addMiddleware(resource, 'update', async (next, id, update) => {
      calls.push('logger-update');
      return await next(id, update);
    });
    // Modifier middleware for update
    plugin.addMiddleware(resource, 'update', async (next, id, update) => {
      if (update.name) {
        update.name += ' [MW]';
        calls.push('modifier-update');
      }
      return await next(id, update);
    });
    // Update test
    calls.length = 0;
    const updated = await resource.update('2', { name: 'Changed' });
    expect(updated).toBeDefined();
    expect(updated.name).toContain('[MW]');
    expect(calls).toEqual(['logger-update', 'modifier-update']);

    // --- Delete middlewares ---
    // Logger middleware for delete
    plugin.addMiddleware(resource, 'delete', async (next, id) => {
      calls.push('logger-delete');
      return await next(id);
    });
    // Blocker middleware for delete
    plugin.addMiddleware(resource, 'delete', async (next, id) => {
      if (id === 'block-del') {
        calls.push('blocker-delete');
        return null;
      }
      return await next(id);
    });
    // Blocked delete
    calls.length = 0;
    const blockedDel = await resource.delete('block-del');
    expect(blockedDel).toBeNull();
    expect(calls).toEqual(['logger-delete', 'blocker-delete']);
    // Normal delete
    calls.length = 0;
    const normalDel = await resource.delete('2');
    expect(normalDel).toBeDefined();
    expect(calls).toEqual(['logger-delete']);
  });
}); 
