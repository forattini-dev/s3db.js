import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Database } from '../../../src/database.class.js';

describe('Metadata key collision (base62 case-sensitivity)', () => {
  let database;

  beforeAll(async () => {
    const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    database = new Database({
      connectionString: `file:///tmp/s3db-key-collision-test-${suffix}`,
      logLevel: 'silent'
    });
    await database.connect();
  });

  afterAll(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  it('should handle 40+ attributes without key collisions', async () => {
    const resource = await database.createResource({
      name: 'wide-schema',
      attributes: {
        attr00: 'string|optional',
        attr01: 'string|optional',
        attr02: 'string|optional',
        attr03: 'string|optional',
        attr04: 'string|optional',
        attr05: 'string|optional',
        attr06: 'string|optional',
        attr07: 'string|optional',
        attr08: 'string|optional',
        attr09: 'string|optional',
        attr10: 'string|optional',
        attr11: 'string|optional',
        attr12: 'string|optional',
        attr13: 'string|optional',
        attr14: 'string|optional',
        attr15: 'string|optional',
        attr16: 'string|optional',
        attr17: 'string|optional',
        attr18: 'string|optional',
        attr19: 'string|optional',
        attr20: 'string|optional',
        attr21: 'string|optional',
        attr22: 'string|optional',
        attr23: 'string|optional',
        attr24: 'string|optional',
        attr25: 'string|optional',
        attr26: 'string|optional',
        attr27: 'string|optional',
        attr28: 'string|optional',
        attr29: 'string|optional',
        attr30: 'string|optional',
        attr31: 'string|optional',
        attr32: 'string|optional',
        attr33: 'string|optional',
        attr34: 'string|optional',
        attr35: 'string|optional',
        attr36: 'string|optional',
        attr37: 'string|optional',
        attr38: 'string|optional',
        attr39: 'string|optional',
        attr40: 'string|optional',
        attr41: 'string|optional',
        attr42: 'string|optional',
      }
    });

    const allMappedKeys = Object.values(resource.schema.map);
    const uniqueKeys = new Set(allMappedKeys);
    expect(uniqueKeys.size).toBe(allMappedKeys.length);

    const lowercasedKeys = allMappedKeys.map(k => k.toLowerCase());
    const uniqueLowercasedKeys = new Set(lowercasedKeys);
    expect(uniqueLowercasedKeys.size).toBe(allMappedKeys.length);

    const data: Record<string, string> = { id: 'test-wide-1' };
    for (let i = 0; i <= 42; i++) {
      const key = `attr${String(i).padStart(2, '0')}`;
      data[key] = `value-${i}`;
    }

    await resource.insert(data);
    const result = await resource.get('test-wide-1');

    for (let i = 0; i <= 42; i++) {
      const key = `attr${String(i).padStart(2, '0')}`;
      expect(result[key]).toBe(`value-${i}`);
    }
  });

  it('should not leak late-schema fields into early-schema fields on patch', async () => {
    const resource = await database.createResource({
      name: 'collision-patch',
      attributes: {
        field00: 'string|optional',
        field01: 'string|optional',
        field02: 'string|optional',
        field03: 'string|optional',
        field04: 'string|optional',
        field05: 'string|optional',
        field06: 'string|optional',
        field07: 'string|optional',
        field08: 'string|optional',
        field09: 'string|optional',
        field10: 'string|optional',
        field11: 'string|optional',
        field12: 'string|optional',
        field13: 'string|optional',
        field14: 'string|optional',
        field15: 'string|optional',
        field16: 'string|optional',
        field17: 'string|optional',
        field18: 'string|optional',
        field19: 'string|optional',
        field20: 'string|optional',
        field21: 'string|optional',
        field22: 'string|optional',
        field23: 'string|optional',
        field24: 'string|optional',
        field25: 'string|optional',
        field26: 'string|optional',
        field27: 'string|optional',
        field28: 'string|optional',
        field29: 'string|optional',
        field30: 'string|optional',
        field31: 'string|optional',
        field32: 'string|optional',
        field33: 'string|optional',
        field34: 'string|optional',
        field35: 'string|optional',
        field36: 'string|optional',
        field37: 'string|optional',
        field38: 'string|optional',
        field39: 'string|optional',
      }
    });

    await resource.insert({
      id: 'test-patch-1',
      field10: 'early-value',
    });

    await resource.patch('test-patch-1', {
      field36: 'late-value',
    });

    const result = await resource.get('test-patch-1');

    expect(result.field10).toBe('early-value');
    expect(result.field36).toBe('late-value');
    expect(result.field10).not.toBe('late-value');
  });
});
