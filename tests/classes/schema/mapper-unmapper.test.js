import { describe, expect, test } from '@jest/globals';

import Schema from '#src/schema.class.js';

const baseAttributes = {
  name: 'string|required',
  email: 'email|required',
  age: 'number|optional',
  active: 'boolean|default:true',
  password: 'secret'
};

describe('Schema mapper/unmapper', () => {
  test('maps and unmapps basic resources with generated keys', async () => {
    const schema = new Schema({
      name: 'test-schema',
      attributes: baseAttributes
    });

    const mapped = await schema.mapper({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      active: true,
      password: 'hunter2'
    });

    expect(mapped._v).toBe('1');
    expect(Object.keys(mapped)).not.toContain('name');
    expect(Object.keys(mapped)).not.toContain('email');

    const unmapped = await schema.unmapper(mapped);

    expect(unmapped.name).toBe('John Doe');
    expect(unmapped.email).toBe('john@example.com');
    expect(unmapped.age).toBe(30);
    expect(unmapped.active).toBe(true);
    expect(unmapped.password).toBe('hunter2');
  });

  test('handles edge cases for json, arrays and metadata fields', async () => {
    const schema = new Schema({
      name: 'edge-schema',
      attributes: {
        foo: 'string',
        obj: 'json',
        arr: 'array|items:string'
      }
    });

    const mapped = await schema.mapper({
      foo: 'bar',
      obj: { a: 1 },
      arr: ['x', 'y'],
      $meta: 123
    });

    const objKey = schema.map.obj;
    expect(typeof mapped[objKey]).toBe('string');
    expect(mapped.$meta).toBe(123);

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.foo).toBe('bar');
    expect(unmapped.obj).toEqual({ a: 1 });
    expect(unmapped.arr).toEqual(['x', 'y']);
    expect(unmapped.$meta).toBe(123);
  });

  test('preserves nullish and empty values through mapper/unmapper', async () => {
    const schema = new Schema({
      name: 'nullish-schema',
      attributes: {
        foo: 'string',
        arr: 'array|items:string',
        obj: 'json'
      }
    });

    const mapped = await schema.mapper({
      foo: null,
      arr: [],
      obj: undefined
    });

    const unmapped = await schema.unmapper(mapped);

    expect(unmapped.foo).toBeNull();
    expect(Array.isArray(unmapped.arr)).toBe(true);
    expect(unmapped.obj).toBeUndefined();
  });

  test('tolerates invalid JSON payloads when unmapping', async () => {
    const schema = new Schema({
      name: 'json-resilience',
      attributes: { foo: 'string', bar: 'json' }
    });

    const mapped = {
      [schema.map.foo]: '[object Object]',
      [schema.map.bar]: '{invalidJson}',
      _v: '1'
    };

    const unmapped = await schema.unmapper(mapped);
    expect(unmapped.foo).toEqual({});
    expect(unmapped.bar).toBe('{invalidJson}');
  });
});

describe('Schema mapper/unmapper for arrays', () => {
  test('round-trips array|items:number', async () => {
    const schema = new Schema({
      name: 'arr-num',
      attributes: { nums: 'array|items:number' }
    });

    const unmapped = await schema.unmapper(await schema.mapper({ nums: [1, 2, 3, 255, 12345] }));
    expect(unmapped.nums).toEqual([1, 2, 3, 255, 12345]);
  });

  test('round-trips array|items:string with escaping', async () => {
    const schema = new Schema({
      name: 'arr-str',
      attributes: { tags: 'array|items:string' }
    });

    const unmapped = await schema.unmapper(
      await schema.mapper({ tags: ['foo', 'bar|baz', 'qux\\quux', ''] })
    );

    expect(unmapped.tags[0]).toBe('foo');
    expect(unmapped.tags[1]).toBe('bar|baz');
    expect(unmapped.tags[2]).toBe('qux\\quux');
    expect(unmapped.tags[3]).toBe('');
  });

  test('handles nullish and empty arrays gracefully', async () => {
    const schema = new Schema({
      name: 'arr-edge',
      attributes: { tags: 'array|items:string', nums: 'array|items:number' }
    });

    for (const tags of [null, undefined, []]) {
      for (const nums of [null, undefined, []]) {
        const unmapped = await schema.unmapper(await schema.mapper({ tags, nums }));
        expect(Array.isArray(unmapped.tags) || unmapped.tags == null).toBe(true);
        expect(Array.isArray(unmapped.nums) || unmapped.nums == null).toBe(true);
      }
    }
  });
});
