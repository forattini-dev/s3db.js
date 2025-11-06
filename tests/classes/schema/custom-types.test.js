import { describe, expect, test } from '@jest/globals';

import Schema from '#src/schema.class.js';

describe('Schema custom type: secret', () => {
  const schema = new Schema({
    name: 'secret-test',
    attributes: { secret: 'secret' },
    passphrase: 'test-secret'
  });

  const mapAndUnmap = async value => schema.unmapper(await schema.mapper({ secret: value }));

  test('round-trips primitive values', async () => {
    await expect(mapAndUnmap('mySecret')).resolves.toMatchObject({ secret: 'mySecret' });
    await expect(mapAndUnmap('')).resolves.toMatchObject({ secret: '' });
    await expect(mapAndUnmap(12345)).resolves.toMatchObject({ secret: '12345' });
    await expect(mapAndUnmap(true)).resolves.toMatchObject({ secret: 'true' });
  });

  test('preserves nullish values', async () => {
    await expect(mapAndUnmap(null)).resolves.toMatchObject({ secret: null });
    await expect(mapAndUnmap(undefined)).resolves.toMatchObject({ secret: undefined });
  });
});

describe('Schema custom type: json', () => {
  const schema = new Schema({
    name: 'json-test',
    attributes: { data: 'json' }
  });

  const mapAndUnmap = async value => schema.unmapper(await schema.mapper({ data: value }));

  test('round-trips structured data', async () => {
    await expect(mapAndUnmap({ foo: 'bar', n: 1 })).resolves.toMatchObject({
      data: { foo: 'bar', n: 1 }
    });

    await expect(mapAndUnmap([1, 2, 3])).resolves.toMatchObject({ data: [1, 2, 3] });
  });

  test('handles stringified JSON transparently', async () => {
    await expect(mapAndUnmap(JSON.stringify({ foo: 'bar' }))).resolves.toMatchObject({
      data: { foo: 'bar' }
    });
  });

  test('preserves scalars and nullish values', async () => {
    await expect(mapAndUnmap(null)).resolves.toMatchObject({ data: null });
    await expect(mapAndUnmap(undefined)).resolves.toMatchObject({ data: undefined });
    await expect(mapAndUnmap('')).resolves.toMatchObject({ data: '' });
    await expect(mapAndUnmap(42)).resolves.toMatchObject({ data: 42 });
    await expect(mapAndUnmap(false)).resolves.toMatchObject({ data: false });
  });
});
