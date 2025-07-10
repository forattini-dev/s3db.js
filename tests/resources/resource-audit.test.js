import Client from '../../src/client.class.js';
import Database from '../../src/database.class.js';
import Resource from '../../src/resource.class.js';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';

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