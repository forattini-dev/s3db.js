import { join } from 'path';
import { nanoid } from 'nanoid';

import Database from '../src/database.class';

import { 
  CostsPlugin, 
  CachePlugin,
} from '../src/plugins';

import { MemoryCache } from '../src/cache';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'plugins-' + Date.now())

describe('Costs', () => {
  test('complete', async () => {
    const s3db = new Database({
      verbose: true,
      plugins: [CostsPlugin],
      connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}-costs`
    })

    await s3db.connect()
    
    let clicks = await s3db.createResource({
      name: "clicks",
      attributes: {
        name: "string",
        email: "string",
      },
    })

    const amount = 50

    await clicks.insertMany(new Array(amount).fill({
      name: 'Filipe Forattini #' + nanoid(4),
      email: 'filipe@forattini.com.br',
    }))

    await clicks.deleteAll()

    const costs = s3db.client.costs
    expect(costs.requests.total).toBeGreaterThan(amount)
    expect(costs.requests.put).toBeGreaterThan(amount)
    expect(costs.requests.delete).toBe(1)
    expect(costs.events.total).toBeGreaterThan(amount)
    expect(costs.events.PutObjectCommand).toBeGreaterThan(1)
    expect(costs.events.DeleteObjectsCommand).toBe(1)
  }, 60 * 1000)
});

describe('Cache', () => {
  test('s3', async () => {
    const s3db = new Database({
      verbose: true,
      plugins: [ new CachePlugin() ],
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}-cache-s3`
    })

    await s3db.connect()

    const clicks = await s3db.createResource({
      name: "clicks",
      attributes: {
        name: "string",
        email: "string",
      },
    })

    const el = await clicks.insert({
      name: 'Filipe Forattini #' + nanoid(4),
      email: 'filipe@forattini.com.br',
    })

    const count1 = await clicks.count()
    const count2 = await clicks.count()

    const list1 = await clicks.listIds()
    const list2 = await clicks.listIds()

    const get1 = await clicks.getMany([el.id])
    const get2 = await clicks.getMany([el.id])
  })

  test('memory', async () => {
    const s3db = new Database({
      verbose: true,
      plugins: [ new CachePlugin({ driver: new MemoryCache() }) ],
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}-cache-memory`
    })

    await s3db.connect()

    const clicks = await s3db.createResource({
      name: "clicks",
      attributes: {
        name: "string",
        email: "string",
      },
    })

    const el = await clicks.insert({
      name: 'Filipe Forattini #' + nanoid(4),
      email: 'filipe@forattini.com.br',
    })

    const count1 = await clicks.count()
    const count2 = await clicks.count()

    await clicks.insert({
      name: 'Filipe Forattini #' + nanoid(4),
      email: 'filipe@forattini.com.br',
    })

    const list1 = await clicks.listIds()
    const list2 = await clicks.listIds()

    await clicks.insert({
      name: 'Filipe Forattini #' + nanoid(4),
      email: 'filipe@forattini.com.br',
    })

    const get1 = await clicks.getMany([el.id])
    const get2 = await clicks.getMany([el.id])

    await clicks.insert({
      name: 'Filipe Forattini #' + nanoid(4),
      email: 'filipe@forattini.com.br',
    })
  })
});
