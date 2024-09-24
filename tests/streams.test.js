import { join } from 'path';

import { Database } from '../src/database.class';

import { 
  ResourceReader,
  ResourceWriter,
  ResourceIdsReader,
  ResourceIdsPageReader,
} from "../src/stream/index"

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'streams-' + Date.now())

describe('Readable streams', () => {
  let s3db = new Database({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}-read`
  });

  let resource

  beforeAll(async () => {
    await s3db.connect()

    resource = await s3db.createResource({
      name: "users",
      attributes: {
        name: "string",
        email: "string",
      },
    })

    await resource.insertMany(new Array(25).fill(0).map((_, i) => ({ 
      name: 'Filipe Forattini', 
      email: 'filipe@forattini.com.br'
    })))
  })

  it('should stream ids', async () => {
    const stream = new ResourceIdsReader({ resource })

    let ids = []
    const reader = stream.build();

    let next
    while (true) {
      next = await reader.read()
      if (next?.done) break
      ids.push(next.value);
    }

    expect(ids.length).toBe(25)
  })

  it('should stream ids pages', async () => {
    const stream = new ResourceIdsPageReader({ resource })

    let pages = 0
    const reader = stream.build();

    let next
    while (true) {
      next = await reader.read()
      if (next?.done) break
      pages++;
    }

    expect(pages).toBe(1)
  })

  it('should stream all data', async () => {
    const stream = new ResourceReader({ resource })

    let elements = []
    const reader = stream.build();

    let next
    while (true) {
      next = await reader.read()
      if (next?.done) break
      elements.push({ ...next.value });
    }

    expect(elements.length).toBe(25)
  })
})

describe('Writable streams', () => {
  let s3db = new Database({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}-write`
  });

  let resource

  beforeAll(async () => {
    await s3db.connect()

    resource = await s3db.createResource({
      name: "users",
      attributes: {
        name: "string",
        email: "string",
      },
    })
  })

  it('should write data', async () => {
    const stream = new ResourceWriter({ resource })
    const writer = stream.build();

    await writer.write({ name: 'Filipe Forattini', email: 'filipe@forattini.com.br' }),
    await writer.write({ name: 'Filipe Forattini', email: 'filipe@forattini.com.br' }),

    await writer.write([
      { name: 'Filipe Forattini', email: 'filipe@forattini.com.br' },
      { name: 'Filipe Forattini', email: 'filipe@forattini.com.br' },
    ])

    const total = await resource.count()
    expect(total).toBe(4)
  })
})