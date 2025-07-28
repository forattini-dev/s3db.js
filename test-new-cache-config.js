import { S3db, CachePlugin } from './src/index.js';
import { createClientForTest } from './tests/config.js';

async function testNewCacheConfig() {
  console.log('🧪 Testando nova configuração do cache...');

  // Test memory cache with new config format
  const client = createClientForTest('test-new-cache-config');
  const s3db = new S3db({ 
    client,
    plugins: [
      new CachePlugin({
        driver: 'memory',
        ttl: 60000,
        maxSize: 500,
        config: {
          checkPeriod: 10000
        }
      })
    ]
  });

  await s3db.connect();

  const users = await s3db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required'
    }
  });

  console.log('✅ Cache plugin configurado com sucesso');
  console.log('Cache driver:', s3db.plugins[0].driver.constructor.name);

  // Test basic cache operations
  const user = await users.insert({
    id: 'test-1',
    name: 'Test User',
    email: 'test@example.com'
  });

  console.log('✅ Insert realizado:', user.id);

  const cachedUser = await users.get('test-1');
  console.log('✅ Get realizado:', cachedUser.id);

  await s3db.disconnect();
  console.log('✅ Teste concluído com sucesso!');
}

testNewCacheConfig().catch(console.error); 