#!/usr/bin/env node

import "dotenv/config"
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import S3db from '../src/index.js';
import { CachePlugin } from '../src/plugins/cache.plugin.js';
import { setupDatabase } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function demo() {
  console.log('🚀 Multi-Tier Cache Demo (L1→L2→L3 Cascade)');
  console.log('=============================================\n');

  console.log('📝 Este exemplo demonstra o cache multi-tier:');
  console.log('   L1 (Memory) → L2 (S3) → L3 (S3 com TTL longo)');
  console.log('   Com auto-promoção de dados entre camadas\n');

  // Test 1: Multi-Tier Cache Configuration
  console.log('⚙️  Configuração Multi-Tier');
  console.log('---------------------------');

  const db = new S3db({
    verbose: false,
    parallelism: 20,
    connectionString: process.env.BUCKET_CONNECTION_STRING,
    plugins: [
      new CachePlugin({
        drivers: [
          {
            driver: 'memory',
            name: 'L1-Memory',
            config: {
              ttl: 300000,  // 5 minutes (hot data)
              maxMemoryPercent: 0.05,  // 5% of system memory
              enableCompression: true,
              enableStats: true
            }
          },
          {
            driver: 's3',
            name: 'L2-S3-Warm',
            config: {
              ttl: 3600000,  // 1 hour (warm data)
              keyPrefix: 'cache-l2/'
            }
          },
          {
            driver: 's3',
            name: 'L3-S3-Cold',
            config: {
              ttl: 86400000,  // 24 hours (cold data)
              keyPrefix: 'cache-l3/'
            }
          }
        ],
        promoteOnHit: true,  // Auto-promote to faster layers
        strategy: 'write-through',  // Write to all layers
        fallbackOnError: true,  // Continue on errors
        verbose: true  // Show cascade logs
      })
    ],
  });

  await db.connect();

  console.log('✅ Multi-tier cache configurado:');
  console.log(`   Driver type: ${db.plugins.cache.driver.constructor.name}`);
  console.log(`   Tiers: ${db.plugins.cache.driver.drivers.length}`);
  console.log(`   Strategy: ${db.plugins.cache.config.strategy}`);
  console.log(`   Promote on hit: ${db.plugins.cache.config.promoteOnHit}`);
  console.log('');

  // Create resource for testing
  const users = await db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required',
      country: 'string'
    }
  });

  console.log('📊 Criando dados de teste...');
  await users.insert({ id: 'user1', name: 'João Silva', email: 'joao@example.com', country: 'BR' });
  await users.insert({ id: 'user2', name: 'Maria Santos', email: 'maria@example.com', country: 'BR' });
  await users.insert({ id: 'user3', name: 'John Doe', email: 'john@example.com', country: 'US' });
  console.log('✅ 3 usuários inseridos\n');

  // Test 2: Cascade Flow (L1 → L2 → L3 → Database)
  console.log('🔄 Teste 2: Cascade Flow');
  console.log('------------------------');

  console.log('Primeira busca (miss em todos os tiers):');
  const start1 = Date.now();
  const user1_first = await users.get('user1');
  const time1 = Date.now() - start1;
  console.log(`   ⏱️  Tempo: ${time1}ms`);
  console.log(`   📦 Resultado: ${user1_first.name}`);
  console.log(`   ℹ️  Agora está cacheado em L1, L2 e L3\n`);

  console.log('Segunda busca (hit em L1 - mais rápida):');
  const start2 = Date.now();
  const user1_second = await users.get('user1');
  const time2 = Date.now() - start2;
  console.log(`   ⏱️  Tempo: ${time2}ms`);
  console.log(`   📦 Resultado: ${user1_second.name}`);
  console.log(`   🚀 Speedup: ${(time1/time2).toFixed(1)}x mais rápido (cache L1 hit)\n`);

  // Test 3: Simulate L1 eviction and L2 hit
  console.log('🔄 Teste 3: Simulando L2 Hit (L1 miss)');
  console.log('----------------------------------------');

  // Clear only L1 cache to simulate eviction
  const l1Driver = db.plugins.cache.driver.drivers[0].instance;
  await l1Driver.clear();
  console.log('🗑️  L1 cache cleared (simulando eviction)');

  console.log('Terceira busca (miss L1, hit L2):');
  const start3 = Date.now();
  const user1_third = await users.get('user1');
  const time3 = Date.now() - start3;
  console.log(`   ⏱️  Tempo: ${time3}ms`);
  console.log(`   📦 Resultado: ${user1_third.name}`);
  console.log(`   ℹ️  Encontrado em L2, promovido para L1 automaticamente\n`);

  // Test 4: Statistics per tier
  console.log('📊 Teste 4: Estatísticas por Camada');
  console.log('====================================');

  const stats = db.plugins.cache.driver.getStats();

  console.log(`\n📈 Totals:`);
  console.log(`   Hits: ${stats.totals.hits}`);
  console.log(`   Misses: ${stats.totals.misses}`);
  console.log(`   Hit Rate: ${stats.totals.hitRatePercent}`);
  console.log(`   Promotions: ${stats.totals.promotions}`);

  console.log(`\n📊 Per-Tier Stats:`);
  for (const tierStats of stats.tiers) {
    console.log(`\n   ${tierStats.name}:`);
    console.log(`     Hits: ${tierStats.hits}`);
    console.log(`     Misses: ${tierStats.misses}`);
    console.log(`     Promotions: ${tierStats.promotions}`);
    console.log(`     Hit Rate: ${tierStats.hitRatePercent}`);
    console.log(`     Errors: ${tierStats.errors}`);
  }

  // Test 5: Bulk operations showing cascade benefits
  console.log('\n\n🔄 Teste 5: Operações em Massa (Cascade Benefits)');
  console.log('==================================================');

  console.log('Inserindo 100 registros...');
  for (let i = 1; i <= 100; i++) {
    await users.insert({
      id: `bulk-user-${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      country: i % 2 === 0 ? 'US' : 'BR'
    });
  }
  console.log('✅ 100 registros inseridos e cacheados\n');

  // Simulate mixed access pattern (hot, warm, cold data)
  console.log('Simulando padrão de acesso misto:');
  console.log('  - 50% acesso a dados "quentes" (5 usuários)');
  console.log('  - 30% acesso a dados "mornos" (15 usuários)');
  console.log('  - 20% acesso a dados "frios" (30 usuários)');

  const hotUsers = ['bulk-user-1', 'bulk-user-2', 'bulk-user-3', 'bulk-user-4', 'bulk-user-5'];
  const warmUsers = Array.from({length: 15}, (_, i) => `bulk-user-${i + 6}`);
  const coldUsers = Array.from({length: 30}, (_, i) => `bulk-user-${i + 21}`);

  const startBulk = Date.now();

  // Simulate 1000 requests with mixed pattern
  for (let i = 0; i < 1000; i++) {
    const rand = Math.random();
    let userId;

    if (rand < 0.5) {
      // 50% hot data
      userId = hotUsers[Math.floor(Math.random() * hotUsers.length)];
    } else if (rand < 0.8) {
      // 30% warm data
      userId = warmUsers[Math.floor(Math.random() * warmUsers.length)];
    } else {
      // 20% cold data
      userId = coldUsers[Math.floor(Math.random() * coldUsers.length)];
    }

    await users.get(userId);
  }

  const timeBulk = Date.now() - startBulk;
  console.log(`\n⏱️  1000 requests completed in: ${timeBulk}ms`);
  console.log(`   Average: ${(timeBulk / 1000).toFixed(2)}ms per request\n`);

  // Final statistics
  const finalStats = db.plugins.cache.driver.getStats();

  console.log('📈 Final Statistics:');
  console.log('===================');
  console.log(`\nTotals:`);
  console.log(`  Hits: ${finalStats.totals.hits}`);
  console.log(`  Misses: ${finalStats.totals.misses}`);
  console.log(`  Overall Hit Rate: ${finalStats.totals.hitRatePercent}`);
  console.log(`  Total Promotions: ${finalStats.totals.promotions}`);

  console.log(`\nTier Performance:`);
  for (const tierStats of finalStats.tiers) {
    console.log(`\n  ${tierStats.name}:`);
    console.log(`    Hit Rate: ${tierStats.hitRatePercent}`);
    console.log(`    Promotions: ${tierStats.promotions}`);
  }

  console.log('\n\n💡 Insights:');
  console.log('============');
  console.log('• L1 (Memory) tem maior hit rate pois dados quentes ficam aqui');
  console.log('• L2 (S3-Warm) captura dados mornos que saíram de L1');
  console.log('• L3 (S3-Cold) armazena dados frios com TTL longo');
  console.log('• Promoções automáticas otimizam performance sem intervenção');
  console.log('• Write-through garante consistência entre camadas');
  console.log('• Fallback on error garante resiliência mesmo com falhas');

  await db.disconnect();

  console.log('\n🎉 Demo completa! Multi-tier cache funcionando perfeitamente.');
}

demo().catch(console.error);
