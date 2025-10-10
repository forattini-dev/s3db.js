/**
 * EventualConsistencyPlugin - Exemplo Simples
 *
 * Este é o exemplo MAIS SIMPLES possível para você testar o plugin.
 */

import S3db from '../src/database.class.js';
import { EventualConsistencyPlugin } from '../src/plugins/eventual-consistency/index.js';

async function main() {
  console.log('\n🚀 EventualConsistency - Exemplo Simples\n');

  // 1. Conectar
  const db = new S3db({
    connectionString: process.env.S3DB_CONNECTION || 's3://test:test@localhost:9000/test-bucket'
  });
  await db.connect();
  console.log('✅ Conectado\n');

  // 2. Plugin com configuração MÍNIMA
  const plugin = new EventualConsistencyPlugin({
    resources: { urls: ['clicks'] },
    mode: 'sync'  // Consolida automaticamente
  });

  await db.usePlugin(plugin);
  console.log('✅ Plugin configurado\n');

  // 3. Criar resource
  const urls = await db.createResource({
    name: 'urls',
    attributes: {
      id: 'string|required',
      link: 'string|required',
      clicks: 'number|default:0'
    }
  });
  console.log('✅ Resource criado\n');

  // 4. Criar uma URL
  console.log('📝 Criando URL...');
  await urls.insert({
    id: 'url-1',
    link: 'https://google.com',
    clicks: 0
  });
  console.log('   ✅ URL criada\n');

  // 5. Incrementar clicks
  console.log('👆 Incrementando clicks...');
  await urls.add('url-1', 'clicks', 1);
  console.log('   ✅ +1 click');

  await urls.add('url-1', 'clicks', 1);
  console.log('   ✅ +1 click');

  await urls.add('url-1', 'clicks', 1);
  console.log('   ✅ +1 click\n');

  // 6. Verificar resultado
  console.log('📊 Verificando resultado...');
  const url = await urls.get('url-1');
  console.log(`   Clicks: ${url.clicks}\n`);

  if (url.clicks === 3) {
    console.log('✅ ✅ ✅ FUNCIONOU PERFEITAMENTE! ✅ ✅ ✅\n');
  } else {
    console.log(`❌ Esperado: 3, Recebido: ${url.clicks}\n`);
  }

  // 7. Demonstrar subtração
  console.log('➖ Subtraindo 1 click...');
  await urls.sub('url-1', 'clicks', 1);

  const url2 = await urls.get('url-1');
  console.log(`   Clicks agora: ${url2.clicks}\n`);

  // 8. Demonstrar set
  console.log('🔢 Definindo valor absoluto...');
  await urls.set('url-1', 'clicks', 100);

  const url3 = await urls.get('url-1');
  console.log(`   Clicks agora: ${url3.clicks}\n`);

  // Limpeza
  await db.disconnect();
  console.log('✅ Desconectado\n');

  console.log('🎉 Exemplo concluído com sucesso!\n');
}

main().catch(error => {
  console.error('❌ Erro:', error.message);
  console.error(error.stack);
  process.exit(1);
});
