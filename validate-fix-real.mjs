#!/usr/bin/env node

/**
 * VALIDAÇÃO REAL DO FIX - EventualConsistency
 *
 * Este script valida se o fix está REALMENTE funcionando usando:
 * - MinIO real (não LocalStack)
 * - Código real do s3db.js local
 * - Cenário exato do bug do mrt-shortner
 */

import S3DB from './dist/s3db.es.js';
import { EventualConsistencyPlugin } from './dist/s3db.es.js';

console.log('\n🔬 VALIDAÇÃO REAL DO FIX - EventualConsistency\n');
console.log('='.repeat(70));

// Configuração
const config = {
  connectionString: process.env.S3DB_CONNECTION || 'http://minioadmin:minioadmin123@localhost:9100/s3db',
  verbose: true
};

console.log('\n📋 Configuração:');
console.log(`   Connection: ${config.connectionString}`);
console.log(`   Verbose: ${config.verbose}`);

const database = new S3DB({ connectionString: config.connectionString });

try {
  console.log('\n1️⃣  Conectando ao MinIO...');
  await database.connect();
  console.log('   ✅ Conectado');

  console.log('\n2️⃣  Criando resource de teste...');
  const resourceName = `test_validation_${Date.now()}`;
  const urls = await database.createResource({
    name: resourceName,
    attributes: {
      id: 'string|required',
      link: 'string|optional',
      clicks: 'number|default:0',
      views: 'number|default:0'
    }
  });
  console.log(`   ✅ Resource criado: ${resourceName}`);

  console.log('\n3️⃣  Configurando EventualConsistency...');
  const plugin = new EventualConsistencyPlugin({
    resource: resourceName,
    field: 'clicks',
    mode: 'sync',
    autoConsolidate: false,
    verbose: config.verbose
  });
  await database.usePlugin(plugin);
  console.log('   ✅ Plugin configurado');

  console.log('\n' + '='.repeat(70));
  console.log('🔴 TESTE DO BUG: Adicionar clicks ANTES do URL existir');
  console.log('='.repeat(70));

  const testId = `url-${Date.now()}`;

  console.log('\n4️⃣  Adicionando clicks a URL INEXISTENTE...');
  console.log(`   URL ID: ${testId}`);
  console.log('   ⚠️  IMPORTANTE: URL NÃO FOI CRIADO ainda!\n');

  console.log('   [1/3] Adicionando click 1...');
  await urls.add(testId, 'clicks', 1);
  console.log('   ✅ Click 1 adicionado');

  console.log('   [2/3] Adicionando click 2...');
  await urls.add(testId, 'clicks', 1);
  console.log('   ✅ Click 2 adicionado');

  console.log('   [3/3] Adicionando click 3...');
  await urls.add(testId, 'clicks', 1);
  console.log('   ✅ Click 3 adicionado');

  console.log('\n5️⃣  Lendo do banco de dados...\n');

  const url = await urls.get(testId);

  console.log('='.repeat(70));
  console.log('📊 RESULTADO DA VALIDAÇÃO');
  console.log('='.repeat(70));

  if (!url) {
    console.log('\n❌ FALHA: URL não existe!');
    console.log('\n🔴 FIX NÃO ESTÁ FUNCIONANDO!');
    console.log('\nO que aconteceu:');
    console.log('  - Clicks foram adicionados a URL inexistente');
    console.log('  - Consolidação deveria ter criado o URL');
    console.log('  - Mas URL.get() retornou null');
    console.log('\nPossíveis causas:');
    console.log('  1. Você está usando s3db.js do npm (não tem o fix)');
    console.log('  2. O fix não foi aplicado corretamente');
    console.log('  3. Há outro problema não identificado');
    console.log('\nSolução:');
    console.log('  Use: pnpm link --global s3db.js');
    console.log('='.repeat(70));
    process.exit(1);
  }

  console.log(`\n✅ URL existe! ID: ${url.id}`);
  console.log(`📊 Clicks: ${url.clicks}`);
  console.log(`📊 Views: ${url.views || 0}`);

  console.log('\n🔍 Análise:');

  if (url.clicks === 3) {
    console.log('  ✅ Clicks = 3 (CORRETO!)');
    console.log('  ✅ Consolidação funcionou');
    console.log('  ✅ Upsert (insert) funcionou');
    console.log('  ✅ Valores foram persistidos');

    console.log('\n' + '='.repeat(70));
    console.log('🎉 SUCESSO! FIX ESTÁ FUNCIONANDO!');
    console.log('='.repeat(70));
    console.log('\nDetalhes:');
    console.log('  - URL foi criado automaticamente pela consolidação (upsert)');
    console.log('  - 3 clicks foram contabilizados corretamente');
    console.log('  - Valores foram persistidos no S3/MinIO');
    console.log('\n✅ EventualConsistency está funcionando corretamente!');
    console.log('✅ Você pode usar no mrt-shortner com segurança!');
    console.log('='.repeat(70));
    process.exit(0);
  } else if (url.clicks === 0) {
    console.log(`  ❌ Clicks = 0 (ERRADO! Deveria ser 3)`);
    console.log('  ❌ Consolidação não persistiu os valores');
    console.log('  ❌ Bug ainda presente');

    console.log('\n' + '='.repeat(70));
    console.log('🔴 FALHA! BUG AINDA PRESENTE!');
    console.log('='.repeat(70));
    console.log('\nO que aconteceu:');
    console.log('  - URL foi criado (por insert manual ou outro meio)');
    console.log('  - MAS clicks não foram contabilizados');
    console.log('  - Consolidação calculou mas não persistiu');
    console.log('\nPossível causa:');
    console.log('  - Você está usando s3db.js do npm (versão 10.0.9 sem fix)');
    console.log('\nSolução:');
    console.log('  1. cd ~/work/martech/s3db.js');
    console.log('  2. pnpm link --global');
    console.log('  3. cd ~/work/martech/mrt-shortner');
    console.log('  4. pnpm link --global s3db.js');
    console.log('  5. Rodar este script novamente');
    console.log('='.repeat(70));
    process.exit(1);
  } else {
    console.log(`  ⚠️  Clicks = ${url.clicks} (INESPERADO! Deveria ser 3)`);
    console.log('  ⚠️  Valor parcial ou incorreto');

    console.log('\n' + '='.repeat(70));
    console.log('⚠️  RESULTADO INESPERADO');
    console.log('='.repeat(70));
    console.log(`\nValor esperado: 3`);
    console.log(`Valor obtido: ${url.clicks}`);
    console.log('\nInvestigue:');
    console.log('  - Verifique logs de consolidação');
    console.log('  - Verifique transações pendentes');
    console.log('  - Pode haver race condition ou outro problema');
    console.log('='.repeat(70));
    process.exit(1);
  }

} catch (error) {
  console.log('\n' + '='.repeat(70));
  console.log('❌ ERRO DURANTE VALIDAÇÃO');
  console.log('='.repeat(70));
  console.error('\nErro:', error.message);
  console.error('\nStack:', error.stack);
  console.log('\nPossíveis causas:');
  console.log('  - MinIO não está rodando');
  console.log('  - Credenciais incorretas');
  console.log('  - s3db.js com problema de build');
  console.log('\nVerifique:');
  console.log('  docker compose ps | grep minio');
  console.log('='.repeat(70));
  process.exit(1);
} finally {
  await database.disconnect();
}
