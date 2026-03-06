/**
 * EventualConsistencyPlugin - Link Redirect Analytics Example
 *
 * Este exemplo demonstra o uso correto do plugin para um
 * sistema de redirecionamento de links com contadores de clicks.
 */

import S3db from '../src/database.class.js';
import { EventualConsistencyPlugin } from '../src/plugins/eventual-consistency/index.js';

async function main() {
  console.log('🚀 EventualConsistency Plugin - Link Redirect Analytics Example\n');

  // 1. Conectar ao banco
  const db = new S3db({
    connectionString: process.env.S3DB_CONNECTION || 's3://test:test@localhost:9000/test-bucket'
  });
  await db.connect();
  console.log('✅ Connected to S3DB\n');

  // 2. Configurar plugin
  const plugin = new EventualConsistencyPlugin({
    resources: {
      urls: ['clicks', 'views']
    },

    consolidation: {
      mode: 'sync',  // Consolidação imediata
      auto: false
    },

    analytics: {
      enabled: true
    },

    verbose: true
  });

  await db.usePlugin(plugin);
  console.log('✅ Plugin configured\n');

  // 3. Criar resource de URLs
  const urls = await db.createResource({
    name: 'urls',
    attributes: {
      id: 'string|required',
      link: 'string|required',
      shortCode: 'string|required',
      clicks: 'number|default:0',
      views: 'number|default:0',
      createdAt: 'string|required'
    }
  });
  console.log('✅ URLs resource created\n');

  // 4. Criar resource de Clicks
  const clicks = await db.createResource({
    name: 'clicks',
    attributes: {
      id: 'string|required',
      urlId: 'string|required',
      timestamp: 'string|required',
      userAgent: 'string|optional',
      ip: 'string|optional'
    }
  });
  console.log('✅ Clicks resource created\n');

  // 5. Configurar hook para auto-incrementar
  clicks.addHook('afterInsert', async (record) => {
    console.log(`   📈 Hook triggered: incrementing clicks for ${record.urlId}`);
    await urls.add(record.urlId, 'clicks', 1);
  });
  console.log('✅ Hook configured\n');

  // 6. Criar algumas URLs
  console.log('📝 Creating URLs...\n');

  await urls.insert({
    id: 'url-001',
    link: 'https://google.com',
    shortCode: 'goog',
    clicks: 0,
    views: 0,
    createdAt: new Date().toISOString()
  });
  console.log('   ✅ Created: goog -> https://google.com');

  await urls.insert({
    id: 'url-002',
    link: 'https://github.com',
    shortCode: 'gh',
    clicks: 0,
    views: 0,
    createdAt: new Date().toISOString()
  });
  console.log('   ✅ Created: gh -> https://github.com\n');

  // 7. Simular clicks
  console.log('🖱️  Simulating clicks...\n');

  for (let i = 0; i < 5; i++) {
    await clicks.insert({
      id: `click-${Date.now()}-${i}`,
      urlId: 'url-001',
      timestamp: new Date().toISOString(),
      userAgent: 'Mozilla/5.0',
      ip: '192.168.1.1'
    });
    console.log(`   👆 Click ${i + 1} registered for goog`);
  }

  for (let i = 0; i < 3; i++) {
    await clicks.insert({
      id: `click-${Date.now()}-${i}-gh`,
      urlId: 'url-002',
      timestamp: new Date().toISOString(),
      userAgent: 'Mozilla/5.0',
      ip: '192.168.1.2'
    });
    console.log(`   👆 Click ${i + 1} registered for gh`);
  }

  console.log('\n');

  // 8. Verificar contadores
  console.log('📊 Checking counters...\n');

  const url1 = await urls.get('url-001');
  console.log(`   goog: ${url1.clicks} clicks ✅`);

  const url2 = await urls.get('url-002');
  console.log(`   gh: ${url2.clicks} clicks ✅\n`);

  // 9. Incrementar views manualmente
  console.log('👀 Adding views...\n');

  await urls.add('url-001', 'views', 10);
  await urls.add('url-002', 'views', 5);

  const url1Updated = await urls.get('url-001');
  const url2Updated = await urls.get('url-002');

  console.log(`   goog: ${url1Updated.views} views ✅`);
  console.log(`   gh: ${url2Updated.views} views ✅\n`);

  // 10. Verificar transações
  console.log('🔍 Checking transactions...\n');

  const transactions = await db.resources.urls_transactions_clicks.query({
    originalId: 'url-001',
    applied: true
  });

  console.log(`   Found ${transactions.length} applied transactions for url-001 ✅\n`);

  // 11. Analytics (se habilitado)
  if (plugin.config.enableAnalytics) {
    console.log('📈 Getting analytics...\n');

    const topUrls = await plugin.getTopRecords('urls', 'clicks', {
      limit: 10
    });

    console.log(`   Top URLs by clicks:`);
    topUrls.forEach((record, index) => {
      console.log(`   ${index + 1}. ${record.originalId}: ${record.totalValue} clicks`);
    });
    console.log('');
  }

  // 12. Limpeza
  console.log('🧹 Cleanup...\n');
  await db.disconnect();
  console.log('✅ Disconnected\n');

  console.log('🎉 Example completed successfully!\n');
  console.log('Summary:');
  console.log(`   - URLs created: 2`);
  console.log(`   - Total clicks: ${url1.clicks + url2.clicks}`);
  console.log(`   - Total views: ${url1Updated.views + url2Updated.views}`);
  console.log(`   - Plugin mode: ${plugin.config.mode}`);
  console.log(`   - Analytics: ${plugin.config.enableAnalytics ? 'enabled' : 'disabled'}`);
  console.log('');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
