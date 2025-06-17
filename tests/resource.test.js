import { join } from 'path';

import Client from '../src/client.class';
import Resource from '../src/resource.class';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'resource-' + Date.now())

describe('Resource', () => {
  const client = new Client({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}`
  })

  const resource = new Resource({
    client,
    name: 'breeds',
    attributes: {
      animal: 'string',
      name: 'string',
    },
    options: {
      timestamps: true,
    }
  })

  beforeEach(async () => {
    await resource.deleteAll()
  })

  test('single element complete example', async () => {
    const in1 = await resource.insert({
      animal: 'dog',
      name: 'beagle',
    })

    expect(in1).toBeDefined()
    expect(in1.id).toBeDefined()
    expect(in1.animal).toBe('dog')
    expect(in1.name).toBe('beagle')
    expect(in1.createdAt).toBeDefined()
    expect(in1.updatedAt).toBeDefined()

    const ex1 = await resource.exists(in1.id)
    expect(ex1).toBe(true)
    const ex2 = await resource.exists(in1.id + '$$')
    expect(ex2).toBe(false)

    const up1 = await resource.update(in1.id, { name: 'bulldog' })

    expect(up1).toBeDefined()
    expect(up1.id).toBe(in1.id)
    expect(up1.animal).toBe('dog')
    expect(up1.name).toBe('bulldog')
    expect(up1.createdAt).toBeDefined()
    expect(up1.updatedAt).toBeDefined()
    expect(up1.createdAt).toBe(in1.createdAt)
    expect(up1.updatedAt).not.toBe(in1.updatedAt)

    const up2 = await resource.upsert({ 
      id: in1.id, 
      name: 'dalmata',
    })

    expect(up2).toBeDefined()
    expect(up2.id).toBe(in1.id)
    expect(up2.animal).toBe('dog')
    expect(up2.name).toBe('dalmata')
    expect(up2.createdAt).toBeDefined()
    expect(up2.updatedAt).toBeDefined()
    expect(up2.createdAt).toBe(in1.createdAt)
    expect(up2.updatedAt).not.toBe(in1.updatedAt)

    const del1 = await resource.delete(in1.id)
    const count = await resource.count()

    expect(del1).toBeDefined()
    expect(count).toBe(0)

    const in2 = await resource.upsert({
      animal: 'cat',
      name: 'persian',
    })

    expect(in2).toBeDefined()
    expect(in2.id).toBeDefined()
    expect(in2.animal).toBe('cat')
    expect(in2.name).toBe('persian')
    expect(in2.createdAt).toBeDefined()
    expect(in2.updatedAt).toBeDefined()

    const del2 = await resource.delete(in2.id)
    const count2 = await resource.count()

    expect(del2).toBeDefined()
    expect(count2).toBe(0)
  });

  test('multiple elements complete example', async () => {
    const [in1, in2, in3] = await resource.insertMany([
      { animal: 'dog', name: 'beagle', token: '$ecret1' },
      { animal: 'dog', name: 'poodle', token: '$ecret3' },
      { animal: 'dog', name: 'bulldog', token: '$ecret2' },
    ])

    const count = await resource.count()
    expect(count).toBe(3)

    const list = await resource.listIds()
    expect(list).toBeDefined()
    expect(list.length).toBe(3)

    const del1 = await resource.deleteMany([ in1.id, in2.id, in3.id ])
    expect(del1).toBeDefined()

    const count2 = await resource.count()
    expect(count2).toBe(0)
  });
});
