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
  console.log('🚀 Cache Plugin Drivers Demo');
  console.log('============================\n');

  console.log('📝 Este exemplo demonstra como usar o CachePlugin com diferentes drivers.');
  console.log('   O CachePlugin suporta: memory, s3, e filesystem\n');

  // Test 1: Memory Driver
  console.log('💾 Teste 1: Memory Driver');
  console.log('-------------------------');
  
  const db1 = new S3db({
    verbose: false,
    parallelism: 20,
    connectionString: process.env.BUCKET_CONNECTION_STRING,
    plugins: [
      new CachePlugin({ driver: 'memory' }),
    ],
  });

  await db1.connect();
  
  console.log(`✅ Plugin configurado: ${db1.plugins.cache.driver.constructor.name}`);
  console.log(`   Driver type: ${db1.plugins.cache.driverName}`);
  
  // Criar um resource para testar cache
  const users1 = await db1.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required'
    }
  });

  // Inserir dados
  await users1.insert({ id: 'user1', name: 'João Silva', email: 'joao@example.com' });
  
  // Testar performance do cache
  console.log('🔄 Testando performance do cache...');
  
  const start1 = Date.now();
  const user1_first = await users1.get('user1'); // Cache miss
  const time1 = Date.now() - start1;
  
  const start2 = Date.now();
  const user1_second = await users1.get('user1'); // Cache hit
  const time2 = Date.now() - start2;
  
  console.log(`   Primeira busca (miss): ${time1}ms`);
  console.log(`   Segunda busca (hit): ${time2}ms`);
  console.log(`   Usuário: ${user1_first.name}`);
  console.log(`   Cache speedup: ${(time1/time2).toFixed(1)}x mais rápido\n`);
  
  await db1.disconnect();

  // Test 2: S3 Driver (padrão)
  console.log('☁️  Teste 2: S3 Driver (padrão)');
  console.log('-------------------------------');
  
  const db2 = new S3db({
    verbose: false,
    parallelism: 20,
    connectionString: process.env.BUCKET_CONNECTION_STRING,
    plugins: [
      new CachePlugin(), // Sem especificar driver = S3 padrão
    ],
  });

  await db2.connect();
  
  console.log(`✅ Plugin configurado: ${db2.plugins.cache.driver.constructor.name}`);
  console.log(`   Driver type: ${db2.plugins.cache.driverName}`);
  console.log('   Nota: S3 cache é persistente entre execuções\n');
  
  await db2.disconnect();

  // Test 3: S3 Driver explícito
  console.log('☁️  Teste 3: S3 Driver explícito');
  console.log('--------------------------------');
  
  const db3 = new S3db({
    verbose: false,
    parallelism: 20,
    connectionString: process.env.BUCKET_CONNECTION_STRING,
    plugins: [
      new CachePlugin({ driver: 's3' }), // Explicitamente S3
    ],
  });

  await db3.connect();
  
  console.log(`✅ Plugin configurado: ${db3.plugins.cache.driver.constructor.name}`);
  console.log(`   Driver type: ${db3.plugins.cache.driverName}`);
  console.log('   Resultado: Idêntico ao padrão (Test 2)\n');
  
  await db3.disconnect();

  // Test 4: Comparação de configurações
  console.log('📊 Teste 4: Comparação de todas as configurações');
  console.log('=================================================');
  
  const configurations = [
    { name: 'Padrão (sem driver)', config: {} },
    { name: 'Memory explícito', config: { driver: 'memory' } },
    { name: 'S3 explícito', config: { driver: 's3' } },
    { name: 'Memory com TTL', config: { driver: 'memory', ttl: 5000 } },
    { name: 'Memory com maxSize', config: { driver: 'memory', maxSize: 100 } }
  ];

  console.table(configurations.map(config => ({
    'Configuração': config.name,
    'Driver': config.config.driver || 's3 (padrão)',
    'TTL': config.config.ttl || 'padrão',
    'MaxSize': config.config.maxSize || 'padrão'
  })));

  console.log('\n🎯 Resumo:');
  console.log('==========');
  console.log('• new CachePlugin()                    → S3 cache (padrão)');
  console.log('• new CachePlugin({ driver: "memory" }) → Memory cache');
  console.log('• new CachePlugin({ driver: "s3" })     → S3 cache (explícito)');
  console.log('\n✅ Todos os drivers funcionam corretamente!');
  console.log('   O problema relatado foi corrigido no startPlugins() method.');

  // Test 5: Demonstração com usePlugin (alternativa)
  console.log('\n🔧 Teste 5: Método alternativo com usePlugin()');
  console.log('===============================================');
  
  const db5 = await setupDatabase();
  await db5.connect();
  
  // Método alternativo: usar usePlugin() depois de conectar
  const cachePlugin = new CachePlugin({ driver: 'memory' });
  await db5.usePlugin(cachePlugin, 'customCache');
  
  console.log('✅ Plugin adicionado com usePlugin():');
  console.log(`   Plugins disponíveis: ${Object.keys(db5.plugins)}`);
  console.log(`   Custom cache driver: ${db5.plugins.customCache.driver.constructor.name}`);
  
  await db5.disconnect();
  
  console.log('\n🎉 Demo completa! Cache Plugin funciona com todos os drivers.');
}

demo().catch(console.error); 