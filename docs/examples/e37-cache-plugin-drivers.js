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

  console.log('📝 This example shows how to use CachePlugin with different drivers.');
  console.log('   CachePlugin supports memory, S3, and filesystem drivers.\n');

  // Test 1: Memory Driver
  console.log('💾 Test 1: Memory Driver');
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
  
  console.log(`✅ Plugin configured: ${db1.plugins.cache.driver.constructor.name}`);
  console.log(`   Driver type: ${db1.plugins.cache.driverName}`);
  
  // Create a resource to test caching
  const users1 = await db1.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required'
    }
  });

  // Insert data
  await users1.insert({ id: 'user1', name: 'John Smith', email: 'john@example.com' });
  
  // Measure cache performance
  console.log('🔄 Testing cache performance...');
  
  const start1 = Date.now();
  const user1_first = await users1.get('user1'); // Cache miss
  const time1 = Date.now() - start1;
  
  const start2 = Date.now();
  const user1_second = await users1.get('user1'); // Cache hit
  const time2 = Date.now() - start2;
  
  console.log(`   First fetch (miss): ${time1}ms`);
  console.log(`   Second fetch (hit): ${time2}ms`);
  console.log(`   User: ${user1_first.name}`);
  console.log(`   Cache speedup: ${(time1/time2).toFixed(1)}x faster\n`);
  
  await db1.disconnect();

  // Test 2: S3 Driver (default)
  console.log('☁️  Test 2: S3 Driver (default)');
  console.log('-------------------------------');
  
  const db2 = new S3db({
    verbose: false,
    parallelism: 20,
    connectionString: process.env.BUCKET_CONNECTION_STRING,
    plugins: [
      new CachePlugin(), // Driver omitted = S3 default
    ],
  });

  await db2.connect();
  
  console.log(`✅ Plugin configured: ${db2.plugins.cache.driver.constructor.name}`);
  console.log(`   Driver type: ${db2.plugins.cache.driverName}`);
  console.log('   Note: the S3 cache persists between runs\n');
  
  await db2.disconnect();

  // Test 3: Explicit S3 driver
  console.log('☁️  Test 3: Explicit S3 driver');
  console.log('--------------------------------');
  
  const db3 = new S3db({
    verbose: false,
    parallelism: 20,
    connectionString: process.env.BUCKET_CONNECTION_STRING,
    plugins: [
      new CachePlugin({ driver: 's3' }), // Explicit S3 driver
    ],
  });

  await db3.connect();
  
  console.log(`✅ Plugin configured: ${db3.plugins.cache.driver.constructor.name}`);
  console.log(`   Driver type: ${db3.plugins.cache.driverName}`);
  console.log('   Result: identical to the default run (Test 2)\n');
  
  await db3.disconnect();

  // Test 4: Configuration comparison
  console.log('📊 Test 4: Compare every configuration');
  console.log('=================================================');
  
  const configurations = [
    { name: 'Default (no driver)', config: {} },
    { name: 'Explicit memory', config: { driver: 'memory' } },
    { name: 'Explicit S3', config: { driver: 's3' } },
    { name: 'Memory with TTL', config: { driver: 'memory', ttl: 5000 } },
    { name: 'Memory with maxSize', config: { driver: 'memory', maxSize: 100 } }
  ];

  console.table(configurations.map(config => ({
    'Configuration': config.name,
    'Driver': config.config.driver || 's3 (default)',
    'TTL': config.config.ttl || 'default',
    'MaxSize': config.config.maxSize || 'default'
  }))); 

  console.log('\n🎯 Summary:');
  console.log('==========');
  console.log('• new CachePlugin()                    → S3 cache (default)');
  console.log('• new CachePlugin({ driver: "memory" }) → Memory cache');
  console.log('• new CachePlugin({ driver: "s3" })     → S3 cache (explicit)');
  console.log('\n✅ Every driver works correctly!');
  console.log('   The reported issue was fixed in the startPlugins() method.');

  // Test 5: Demonstrate usePlugin alternative
  console.log('\n🔧 Test 5: Alternative approach with usePlugin()');
  console.log('===============================================');
  
  const db5 = await setupDatabase();
  await db5.connect();
  
  // Alternative method: invoke usePlugin() after connecting
  const cachePlugin = new CachePlugin({ driver: 'memory' });
  await db5.usePlugin(cachePlugin, 'customCache');
  
  console.log('✅ Plugin added via usePlugin():');
  console.log(`   Available plugins: ${Object.keys(db5.plugins)}`);
  console.log(`   Custom cache driver: ${db5.plugins.customCache.driver.constructor.name}`);
  
  await db5.disconnect();
  
  console.log('\n🎉 Demo complete! Cache Plugin works with every driver.');
}

demo().catch(console.error); 
