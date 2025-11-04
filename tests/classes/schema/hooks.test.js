import { describe, expect, test } from '@jest/globals';

import Schema from '#src/schema.class.js';

const createSchema = (attributes, options) =>
  new Schema({
    name: 'hooks-test-schema',
    attributes,
    ...(options ? { options } : {})
  });

describe('Schema hook generation', () => {
  test('generates auto hooks for common field types', () => {
    const schema = createSchema({
      email: 'email',
      phones: 'array|items:string',
      age: 'number',
      active: 'boolean',
      password: 'secret'
    });

    expect(schema.options.hooks.beforeMap.phones).toEqual(['fromArray']);
    expect(schema.options.hooks.afterUnmap.phones).toEqual(['toArray']);

    expect(schema.options.hooks.beforeMap.age).toEqual(['toBase62Decimal']);
    expect(schema.options.hooks.afterUnmap.age).toEqual(['fromBase62Decimal']);

    expect(schema.options.hooks.beforeMap.active).toEqual(['fromBool']);
    expect(schema.options.hooks.afterUnmap.active).toEqual(['toBool']);

    expect(schema.options.hooks.afterUnmap.password).toEqual(['decrypt']);
  });

  test('allows disabling auto hooks and adding custom hooks', () => {
    const schema = createSchema(
      {
        name: 'string',
        surname: 'string'
      },
      {
        generateAutoHooks: false,
        hooks: {
          beforeMap: {
            name: ['trim']
          }
        }
      }
    );

    expect(schema.options.hooks.beforeMap.name).toEqual(['trim']);

    schema.addHook('beforeMap', 'surname', 'trim');
    expect(schema.options.hooks.beforeMap.surname).toEqual(['trim']);
  });
});

describe('Schema hook execution', () => {
  test('applies custom hooks during mapping/unmapping', async () => {
    const schema = createSchema({
      name: 'string',
      age: 'number',
      active: 'boolean',
      password: 'secret'
    });

    schema.addHook('beforeMap', 'name', 'trim');
    schema.addHook('beforeMap', 'password', 'encrypt');
    schema.addHook('afterUnmap', 'password', 'decrypt');

    const mapped = await schema.mapper({
      name: '  John Doe  ',
      age: 30,
      active: true,
      password: 'secret123'
    });

    const mappedPasswordKey = schema.map.password;
    expect(mappedPasswordKey).toBeDefined();
    expect(mapped[mappedPasswordKey]).not.toBe('secret123');

    const unmapped = await schema.unmapper(mapped);

    expect(unmapped.name).toBe('John Doe');
    expect(unmapped.password).toBe('secret123');
  });

  test('ignores unknown hook actions and executes valid ones', async () => {
    const schema = createSchema({
      foo: 'string',
      bar: 'string'
    });

    schema.options.hooks.beforeMap.foo = ['unknownAction'];
    schema.options.hooks.beforeMap.bar = ['trim'];

    await expect(schema.applyHooksActions({ foo: 'test', bar: '  spaced  ' }, 'beforeMap')).resolves.not.toThrow();

    const result = await schema.applyHooksActions({ foo: 'test', bar: '  spaced  ' }, 'beforeMap');
    expect(result.bar).toBe('spaced');
  });
});

describe('Schema numeric hook selection', () => {
  test('applies integer hooks for integer fields', () => {
    const schema = createSchema({
      integerField: 'number|integer:true',
      integerField2: 'number|integer',
      integerField3: 'number|min:0|integer:true'
    });

    expect(schema.options.hooks.beforeMap.integerField).toEqual(['toBase62']);
    expect(schema.options.hooks.afterUnmap.integerField).toEqual(['fromBase62']);

    expect(schema.options.hooks.beforeMap.integerField2).toEqual(['toBase62']);
    expect(schema.options.hooks.afterUnmap.integerField2).toEqual(['fromBase62']);

    expect(schema.options.hooks.beforeMap.integerField3).toEqual(['toBase62']);
    expect(schema.options.hooks.afterUnmap.integerField3).toEqual(['fromBase62']);
  });

  test('applies decimal hooks for non-integer number fields', () => {
    const schema = createSchema({
      decimalField: 'number',
      priceField: 'number|min:0',
      percentageField: 'number|min:0|max:100'
    });

    expect(schema.options.hooks.beforeMap.decimalField).toEqual(['toBase62Decimal']);
    expect(schema.options.hooks.afterUnmap.decimalField).toEqual(['fromBase62Decimal']);

    expect(schema.options.hooks.beforeMap.priceField).toEqual(['toBase62Decimal']);
    expect(schema.options.hooks.afterUnmap.priceField).toEqual(['fromBase62Decimal']);

    expect(schema.options.hooks.beforeMap.percentageField).toEqual(['toBase62Decimal']);
    expect(schema.options.hooks.afterUnmap.percentageField).toEqual(['fromBase62Decimal']);
  });

  test('configures array hooks without conflicting number hooks', () => {
    const schema = createSchema({
      stringArray: 'array|items:string',
      integerArray: 'array|items:number|integer:true',
      decimalArray: 'array|items:number',
      mixedIntegerArray: 'array|items:number|min:1|integer:true'
    });

    expect(schema.options.hooks.beforeMap.stringArray).toEqual(['fromArray']);
    expect(schema.options.hooks.afterUnmap.stringArray).toEqual(['toArray']);

    expect(schema.options.hooks.beforeMap.integerArray).toEqual(['fromArrayOfNumbers']);
    expect(schema.options.hooks.afterUnmap.integerArray).toEqual(['toArrayOfNumbers']);

    expect(schema.options.hooks.beforeMap.decimalArray).toEqual(['fromArrayOfDecimals']);
    expect(schema.options.hooks.afterUnmap.decimalArray).toEqual(['toArrayOfDecimals']);

    expect(schema.options.hooks.beforeMap.mixedIntegerArray).toEqual(['fromArrayOfNumbers']);
    expect(schema.options.hooks.afterUnmap.mixedIntegerArray).toEqual(['toArrayOfNumbers']);
  });

  test('avoids conflicting hooks across mixed field types', () => {
    const schema = createSchema({
      name: 'string',
      age: 'number|integer:true',
      price: 'number',
      active: 'boolean',
      tags: 'array|items:string',
      integerScores: 'array|items:number|integer:true',
      decimalPrices: 'array|items:number',
      metadata: 'json',
      password: 'secret'
    });

    expect(schema.options.hooks.beforeMap.name || []).toEqual([]);
    expect(schema.options.hooks.beforeMap.age).toEqual(['toBase62']);
    expect(schema.options.hooks.beforeMap.price).toEqual(['toBase62Decimal']);
    expect(schema.options.hooks.beforeMap.active).toEqual(['fromBool']);
    expect(schema.options.hooks.beforeMap.tags).toEqual(['fromArray']);
    expect(schema.options.hooks.beforeMap.integerScores).toEqual(['fromArrayOfNumbers']);
    expect(schema.options.hooks.beforeMap.decimalPrices).toEqual(['fromArrayOfDecimals']);
    expect(schema.options.hooks.beforeMap.metadata).toEqual(['toJSON']);
    expect(schema.options.hooks.afterUnmap.password).toEqual(['decrypt']);
  });
});
