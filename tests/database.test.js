import Database from '../src/database.class';

describe('Database', () => {
  const s3db = new Database({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + '/s3db/tests/db-' + new Date().toISOString().substring(0, 10)
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
        password: "secret",
        scopes: "array|items:string|optional",
      },
    })

    await users.insert({
      name: 'John Doe',
      email: 'filipe@forattini.com.br',
      password: '123456',
    })
  })
});
