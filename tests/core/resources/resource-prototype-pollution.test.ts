import { createDatabaseForTest } from '#tests/config.js';

describe('Resource prototype pollution guards', () => {
  let database;
  let resource;

  const hasOwn = (obj: Record<string, unknown>, key: string) =>
    Object.prototype.hasOwnProperty.call(obj, key);

  beforeEach(async () => {
    database = createDatabaseForTest('resource-prototype-pollution');
    await database.connect();

    resource = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|optional',
        metadata: 'object|optional'
      }
    });
  });

  afterEach(async () => {
    if (database?.disconnect) {
      await database.disconnect();
    }
  });

  test('insert removes nested dangerous keys', async () => {
    await resource.insert({
      id: 'user-1',
      name: 'Alice',
      metadata: {
        safe: true,
        __proto__: { polluted: true },
        nested: {
          value: 'ok',
          constructor: { polluted: true },
          deeper: { safe: true, prototype: { polluted: true } }
        }
      }
    });

    const fetched = await resource.get('user-1');

    expect(fetched.metadata.safe).toBe(true);
    expect(hasOwn(fetched.metadata, '__proto__')).toBe(false);
    expect(hasOwn(fetched.metadata.nested, 'constructor')).toBe(false);
    expect(hasOwn(fetched.metadata.nested.deeper, 'prototype')).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  test('update removes nested dangerous keys', async () => {
    await resource.insert({
      id: 'user-2',
      name: 'Bob',
      metadata: { safe: true }
    });

    await resource.update('user-2', {
      metadata: {
        safe: false,
        nested: { value: 'updated', __proto__: { polluted: true } }
      }
    });

    const fetched = await resource.get('user-2');

    expect(fetched.metadata.safe).toBe(false);
    expect(hasOwn(fetched.metadata.nested, '__proto__')).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  test('updateConditional removes nested dangerous keys', async () => {
    await resource.insert({
      id: 'user-3',
      name: 'Cara',
      metadata: { safe: true }
    });

    const current = await resource.get('user-3');

    const result = await resource.updateConditional(
      'user-3',
      { metadata: { safe: true, nested: { constructor: { polluted: true }, value: 'ok' } } },
      { ifMatch: current._etag }
    );

    expect(result.success).toBe(true);

    const fetched = await resource.get('user-3');

    expect(hasOwn(fetched.metadata.nested, 'constructor')).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  test('patch removes nested dangerous keys', async () => {
    await resource.insert({
      id: 'user-4',
      name: 'Dana',
      metadata: { safe: true }
    });

    await resource.patch('user-4', {
      metadata: { nested: { prototype: { polluted: true }, value: 'ok' } }
    });

    const fetched = await resource.get('user-4');

    expect(hasOwn(fetched.metadata.nested, 'prototype')).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  test('replace removes nested dangerous keys', async () => {
    await resource.insert({
      id: 'user-5',
      name: 'Evan',
      metadata: { safe: true }
    });

    await resource.replace('user-5', {
      name: 'Evan',
      metadata: {
        safe: true,
        nested: { __proto__: { polluted: true }, value: 'ok' }
      }
    });

    const fetched = await resource.get('user-5');

    expect(hasOwn(fetched.metadata.nested, '__proto__')).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
