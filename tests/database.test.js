import { join } from 'path';

import Database from '../src/database.class';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'database-' + Date.now())

describe('Database', () => {
  const s3db = new Database({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/${testPrefix}`
  })

  beforeAll(async () => {
    await s3db.connect()
  })

  test('create resource', async () => {
    const users = await s3db.createResource({
      name: "users",
      attributes: {
        name: "string",
        email: "string",
      },
    })

    await users.insert({
      name: 'Filipe Forattini',
      email: 'filipe@forattini.com.br',
    })
  })
});
