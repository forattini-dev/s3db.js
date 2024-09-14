import Database from '../src/database.class';

const currentDate = new Date().toISOString().substring(0, 10)

describe('Database', () => {
  const s3db = new Database({
    verbose: true,
    connectionString: process.env.BUCKET_CONNECTION_STRING
      .replace('USER', process.env.MINIO_USER)
      .replace('PASSWORD', process.env.MINIO_PASSWORD)
      + `/s3db/tests/${currentDate}/database`
  })

  beforeAll(async () => {
    await s3db.connect()
    // console.log(s3db)
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
