
import Schema from '#src/schema.class.js';

describe('Schema construction basics', () => {
  test('supports minimal and rich attribute definitions', () => {
    expect(() => new Schema({ name: 'no-attrs' })).not.toThrow();

    const schema = new Schema({
      name: 'objects',
      attributes: {
        obj: { $$type: 'object', foo: 'string' },
        arr: { $$type: 'array', items: 'string' }
      }
    });

    expect(schema.attributes.obj.foo).toBe('string');
  });

  test('provides sane default options', () => {
    const schema = new Schema({ name: 'defaults', attributes: {} });
    const defaults = schema.defaultOptions();

    expect(defaults).toHaveProperty('autoEncrypt');
    expect(defaults).toHaveProperty('hooks');
  });
});

describe('Schema export/import helpers', () => {
  test('round-trips export/import preserving nested objects', () => {
    const schema = new Schema({
      name: 'nested',
      attributes: {
        name: 'string|required',
        profile: {
          bio: 'string|optional',
          social: {
            twitter: 'string|optional',
            github: 'string|optional'
          }
        },
        address: {
          city: 'string',
          country: 'string'
        }
      }
    });

    const exported = schema.export();
    const imported = Schema.import(exported);

    expect(imported).toBeInstanceOf(Schema);
    expect(imported.name).toBe('nested');

    const attrs = imported.attributes;
    expect(typeof attrs.profile).toBe('object');
    expect(typeof attrs.profile.social).toBe('object');
    expect(attrs.profile.social.twitter).toContain('string');
    expect(() => JSON.parse(attrs.profile)).toThrow();
  });

  test('keeps schema metadata when serializing/deserializing', () => {
    const schema = new Schema({
      name: 'serialization',
      attributes: { foo: 'string' }
    });

    const roundTrip = Schema.import(schema.export());
    expect(roundTrip).toBeInstanceOf(Schema);
    expect(roundTrip.attributes.foo).toBe('string');
  });
});
