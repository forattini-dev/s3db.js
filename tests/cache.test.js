import { join } from 'path';

import Client from '../src/client.class';

import { 
  S3Cache,
  MemoryCache, 
} from '../src/cache';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'cache-' + Date.now())

describe('Cache flavors', () => {
  
  describe('Memory', () => {
    test('complete', async () => {
      const cache = new MemoryCache()
      await cache.set('id=1', { email: 'filipe@forattini.com.br' })
      const value = await cache.get('id=1')
      expect(value).toBeDefined()
      expect(value.email).toBe('filipe@forattini.com.br')
    })
  })

  describe('S3', () => {
    test('complete', async () => {
      const cache = new S3Cache({
        keyPrefix: 'cache',
        client: new Client({
          connectionString: process.env.BUCKET_CONNECTION_STRING
            .replace('USER', process.env.MINIO_USER)
            .replace('PASSWORD', process.env.MINIO_PASSWORD)
            + `/${testPrefix}-s3`,
        }),
      })
      await cache.set('id=1', { email: 'filipe@forattini.com.br' })
      const value = await cache.get('id=1')
      expect(value).toBeDefined()
      expect(value.email).toBe('filipe@forattini.com.br')
    })
  })
})
