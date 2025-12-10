
import Schema, { SchemaActions } from '#src/schema.class.js';
import { encode as toBase62 } from '#src/concerns/base62.js';

const separator = '|';

describe('SchemaActions array helpers', () => {
  test('handle nullish and non-array inputs gracefully', () => {
    expect(SchemaActions.fromArray(null, { separator })).toBe(null);
    expect(SchemaActions.fromArray(undefined, { separator })).toBe(undefined);
    expect(SchemaActions.fromArray('not-array', { separator })).toBe('not-array');
    expect(SchemaActions.fromArray([], { separator })).toBe('');

    expect(SchemaActions.toArray(null, { separator })).toBe(null);
    expect(SchemaActions.toArray(undefined, { separator })).toBe(undefined);
    expect(SchemaActions.toArray('', { separator })).toEqual([]);
    expect(SchemaActions.toArray('[]', { separator })).toEqual(['[]']);
  });

  test('escape and restore separators and backslashes', () => {
    const joined = SchemaActions.fromArray(['a|b', 'c\\d', 'e'], { separator });
    expect(joined).toBe('a\\|b|c\\\\d|e');
    expect(SchemaActions.toArray(joined, { separator })).toEqual(['a|b', 'c\\d', 'e']);
  });

  test('support number arrays with base62 encoding', () => {
    const numbers = [10, 61, 12345];
    const encoded = SchemaActions.fromArrayOfNumbers(numbers, { separator });
    expect(encoded).toBe(`${toBase62(10)}|${toBase62(61)}|${toBase62(12345)}`);
    expect(SchemaActions.toArrayOfNumbers(encoded, { separator })).toEqual(numbers);
  });

  test('convert number arrays with negatives and floats', () => {
    const encoded = SchemaActions.fromArrayOfNumbers([0, -1, 3.14, 42], { separator });
    expect(encoded).toBe('0|-1|3|G');

    const parsed = SchemaActions.toArrayOfNumbers(encoded, { separator });
    expect(parsed[0]).toBe(0);
    expect(parsed[1]).toBe(-1);
    expect(parsed[2]).toBe(3);
    expect(parsed[3]).toBe(42);
  });

  test('propagates invalid base62 entries as NaN', () => {
    const result = SchemaActions.toArrayOfNumbers(`0|a|${toBase62(36)}|@invalid@`, { separator });
    expect(result).toEqual([0, 10, 36, NaN]);
  });
});

describe('SchemaActions scalar helpers', () => {
  test('serialize and deserialize JSON when possible', () => {
    const obj = { a: 1, b: [2, 3] };
    expect(SchemaActions.toJSON(obj)).toBe(JSON.stringify(obj));
    expect(SchemaActions.fromJSON(JSON.stringify(obj))).toEqual(obj);

    expect(SchemaActions.toJSON(null)).toBe(null);
    expect(SchemaActions.toJSON(undefined)).toBe(undefined);
    expect(SchemaActions.fromJSON('notjson')).toBe('notjson');
  });

  test('convert primitives to strings and numbers', () => {
    expect(SchemaActions.toString(null)).toBe(null);
    expect(SchemaActions.toString(undefined)).toBe(undefined);
    expect(SchemaActions.toString(123)).toBe('123');

    expect(SchemaActions.toNumber('42')).toBe(42);
    expect(SchemaActions.toNumber('3.14')).toBeCloseTo(3.14);
    expect(SchemaActions.toNumber(7)).toBe(7);
  });

  test('map booleans to string representations and back', () => {
    expect(SchemaActions.toBool('true')).toBe(true);
    expect(SchemaActions.toBool('1')).toBe(true);
    expect(SchemaActions.toBool('no')).toBe(false);

    expect(SchemaActions.fromBool(true)).toBe('1');
    expect(SchemaActions.fromBool(false)).toBe('0');
  });
});

describe('Schema attribute import/export helpers', () => {
  test('round-trip nested attribute definitions', () => {
    const schema = new Schema({
      name: 'export',
      attributes: {
        foo: 'string',
        bar: { baz: 'number' },
        arr: { $$type: 'array', items: 'string' }
      }
    });

    expect(schema._exportAttributes(schema.attributes)).toEqual(schema.attributes);
  });

  test('import handles JSON strings, arrays and fallbacks', () => {
    const imported = Schema.import({
      name: 'import',
      attributes: JSON.stringify({ foo: 'string' })
    });
    expect(imported.attributes.foo).toBe('string');

    expect(Schema._importAttributes([JSON.stringify({ a: 1 })])).toEqual([{ a: 1 }]);
    expect(Schema._importAttributes('notjson')).toBe('notjson');
    expect(Schema._importAttributes({ foo: 'bar' })).toEqual({ foo: 'bar' });
  });

  test('extractObjectKeys finds top-level object attributes', () => {
    const schema = Object.create(Schema.prototype);
    const keys = schema.extractObjectKeys({
      foo: { bar: { baz: { qux: 'string' } } },
      simple: 'string'
    });

    expect(keys).toContain('foo');
    expect(keys).not.toContain('simple');
  });
});
