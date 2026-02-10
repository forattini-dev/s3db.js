
import Schema from '#src/schema.class.js';
import { encode as toBase62, decode as fromBase62, encodeKey } from '#src/concerns/base62.js';

describe('Schema base62 mapping', () => {
  test('assigns sequential base36 keys to attributes', () => {
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

    expect(schema.map.name).toBe(encodeKey(0));
    expect(schema.map.email).toBe(encodeKey(1));
    expect(schema.map.age).toBe(encodeKey(2));
    expect(schema.map.active).toBe(encodeKey(3));
    expect(schema.map.password).toBe(encodeKey(4));

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
      expect(encoded).toMatch(/^[0-9a-z]+$/);
      expect(encoded).toBe(encodeKey(index));
      expect(schema.reversedMap[encoded]).toBe(attr);
    });
  });

  test('generates registry indices correctly for base36 maps', () => {
    const attributes = {};
    for (let i = 0; i < 40; i++) {
      attributes[`field${i}`] = 'string|optional';
    }

    const schema = new Schema({
      name: 'registry-base36-test',
      attributes
    });

    const { schemaRegistry } = schema.generateInitialRegistry();

    expect(schemaRegistry.mapping.field10).toBe(10);
    expect(schemaRegistry.mapping.field36).toBe(36);
  });

  test('rejects legacy base62 maps with uppercase keys', () => {
    const attributes = {};
    const legacyMap = {};
    for (let i = 0; i < 40; i++) {
      const key = `field${i}`;
      attributes[key] = 'string|optional';
      legacyMap[key] = toBase62(i);
    }

    expect(() => new Schema({
      name: 'registry-base62-test',
      attributes,
      map: legacyMap
    })).toThrow('Schema map contains non-base36 keys.');
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
