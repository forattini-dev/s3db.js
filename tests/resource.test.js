import Client from '../src/client.class';
import Resource from '../src/resource.class';

const currentDate = new Date().toISOString().substring(0, 10)

describe('Resource', () => {
  const client = new Client({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/s3db/tests/${currentDate}/resources`
  })

  const resource = new Resource({
    client,
    name: 'breeds',
    attributes: {
      animal: 'string',
      name: 'string',
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

    const up1 = await resource.update(in1.id, { name: 'bulldog' })

    expect(up1).toBeDefined()
    expect(up1.id).toBe(in1.id)
    expect(up1.animal).toBe('dog')
    expect(up1.name).toBe('bulldog')

    const del1 = await resource.delete(in1.id)
    const count = await resource.count()

    expect(del1).toBeDefined()
    expect(count).toBe(0)
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
