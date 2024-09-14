import { nanoid } from 'nanoid';

import Database from '../src/database.class';
import CostsPlugin from '../src/plugins/costs.plugin';

describe('Plugins', () => {
  let clicks

  const s3db = new Database({
    verbose: true,
    parallelism: 20,
    plugins: [CostsPlugin],
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + '/s3db/tests/plugins-' + new Date().toISOString().substring(0, 10),
  })

  beforeAll(async () => {
    await s3db.connect()
    clicks = await s3db.createResource({
      name: "clicks",
      attributes: {
        name: "string",
        email: "string",
      },
    })
  })

  test('create resource', async () => {
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
  }, 60000)
});
