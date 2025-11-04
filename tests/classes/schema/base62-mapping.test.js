import { describe, expect, test } from '@jest/globals';

import Schema from '#src/schema.class.js';
import { encode as toBase62, decode as fromBase62 } from '#src/concerns/base62.js';

describe('Schema base62 mapping', () => {
  test('assigns sequential base62 keys to attributes', () => {
    const schema = new Schema({
      name: 'base62-test',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        age: 'number|optional',
        active: 'boolean|optional',
        password: 'secret|required'
      }
    });

    expect(schema.map.name).toBe(toBase62(0));
    expect(schema.map.email).toBe(toBase62(1));
    expect(schema.map.age).toBe(toBase62(2));
    expect(schema.map.active).toBe(toBase62(3));
    expect(schema.map.password).toBe(toBase62(4));

    Object.entries(schema.map).forEach(([originalKey, encodedKey]) => {
      expect(schema.reversedMap[encodedKey]).toBe(originalKey);
    });
  });

  test('supports dozens of attributes while keeping reversible mapping', () => {
    const attributes = {};
    for (let i = 0; i < 50; i++) {
      attributes[`field${i}`] = 'string|optional';
    }

    const schema = new Schema({
      name: 'many-fields-test',
      attributes
    });

    Object.keys(attributes).forEach((attr, index) => {
      const encoded = schema.map[attr];
      expect(encoded).toMatch(/^[0-9a-zA-Z]+$/);
      expect(encoded).toBe(toBase62(index));
      expect(schema.reversedMap[encoded]).toBe(attr);
    });
  });
});

describe('base62 encode/decode', () => {
  test('round-trips boundary values', () => {
    for (const value of [0, 1, 9, 10, 35, 36, 61, 62, 125]) {
      const encoded = toBase62(value);
      expect(fromBase62(encoded)).toBe(value);
    }
  });
});
