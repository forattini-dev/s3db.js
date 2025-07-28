#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import S3db from '../src/index.js';
import { setupDatabase } from './database.js';
import { CachePlugin } from '../src/plugins/cache.plugin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function demo() {
  console.log('🚀 Improved Caching System Demo');
  console.log('================================\n');

  // Create database with improved cache plugin using hooks
  const database = await setupDatabase();
  
  // Add cache plugin using the new hooks system
  const cachePlugin = new CachePlugin({
    driver: 'memory',
    includePartitions: true,
    partitionAware: true
  });
  
  await database.usePlugin(cachePlugin);
  await database.connect();

  // Create a test resource with partitions
  const users = await database.createResource({
    name: 'users',
    attributes: {
      name: 'string|required',
      email: 'string|required',
      region: 'string',
      status: 'string|default:active',
      content: 'string|optional'
    },
    partitions: {
      byRegion: {
        fields: { region: 'string' }
      },
      byStatus: {
        fields: { status: 'string' }
      }
    },
    timestamps: true
  });

  console.log('📝 Database hooks system installed automatically');
  console.log('✅ Cache middleware added to all read methods\n');

  // Insert test data
  console.log('💾 Inserting test data...');
  const user1 = await users.insert({
    name: 'Alice Johnson',
    email: 'alice@example.com',
    region: 'US',
    status: 'active'
  });

  const user2 = await users.insert({
    name: 'Bob Smith', 
    email: 'bob@example.com',
    region: 'EU',
    status: 'active'
  });

  const user3 = await users.insert({
    name: 'Charlie Brown',
    email: 'charlie@example.com', 
    region: 'US',
    status: 'inactive'
  });

  console.log(`✅ Inserted ${[user1, user2, user3].length} users\n`);

  // Test caching of previously uncached methods
  console.log('🔍 Testing newly cached methods:');
  console.log('===============================\n');

  // Test exists() caching
  console.log('1. Testing exists() method caching:');
  console.time('exists-first-call');
  const existsResult1 = await users.exists(user1.id);
  console.timeEnd('exists-first-call');
  console.log(`   Result: ${existsResult1}`);

  console.time('exists-cached-call');
  const existsResult2 = await users.exists(user1.id);
  console.timeEnd('exists-cached-call');
  console.log(`   Cached result: ${existsResult2}\n`);

  // Test query() caching
  console.log('2. Testing query() method caching:');
  console.time('query-first-call');
  const queryResult1 = await users.query({ region: 'US' });
  console.timeEnd('query-first-call');
  console.log(`   Found ${queryResult1.length} US users`);

  console.time('query-cached-call');
  const queryResult2 = await users.query({ region: 'US' });
  console.timeEnd('query-cached-call');
  console.log(`   Cached result: ${queryResult2.length} US users\n`);

  // Test getFromPartition() caching  
  console.log('3. Testing getFromPartition() method caching:');
  console.time('partition-first-call');
  const partitionResult1 = await users.getFromPartition({
    id: user1.id,
    partitionName: 'byRegion',
    partitionValues: { region: 'US' }
  });
  console.timeEnd('partition-first-call');
  console.log(`   User: ${partitionResult1.name}`);

  console.time('partition-cached-call');
  const partitionResult2 = await users.getFromPartition({
    id: user1.id,
    partitionName: 'byRegion', 
    partitionValues: { region: 'US' }
  });
  console.timeEnd('partition-cached-call');
  console.log(`   Cached user: ${partitionResult2.name}\n`);

  // Set content and test content() and hasContent() caching
  console.log('4. Testing content methods caching:');
  await users.setContent({
    id: user1.id,
    buffer: 'This is some test content',
    contentType: 'text/plain'
  });

  console.time('hasContent-first-call');
  const hasContent1 = await users.hasContent(user1.id);
  console.timeEnd('hasContent-first-call');
  console.log(`   Has content: ${hasContent1}`);

  console.time('hasContent-cached-call');
  const hasContent2 = await users.hasContent(user1.id);
  console.timeEnd('hasContent-cached-call');
  console.log(`   Cached has content: ${hasContent2}`);

  console.time('content-first-call');
  const content1 = await users.content(user1.id);
  console.timeEnd('content-first-call');
  console.log(`   Content: ${content1.buffer?.toString()?.substring(0, 20)}...`);

  console.time('content-cached-call');
  const content2 = await users.content(user1.id);
  console.timeEnd('content-cached-call');
  console.log(`   Cached content: ${content2.buffer?.toString()?.substring(0, 20)}...\n`);

  // Test cache invalidation on writes
  console.log('🔄 Testing cache invalidation:');
  console.log('=============================\n');

  console.log('Updating user (should invalidate cache)...');
  await users.update(user1.id, { name: 'Alice Updated' });

  console.log('Testing if exists() cache was invalidated:');
  console.time('exists-after-update');
  const existsAfterUpdate = await users.exists(user1.id);
  console.timeEnd('exists-after-update');
  console.log(`   Result: ${existsAfterUpdate} (should be fresh, not cached)\n`);

  // Test cache stats if available
  if (cachePlugin.getCacheStats) {
    console.log('📊 Cache Statistics:');
    console.log('===================');
    const stats = await cachePlugin.getCacheStats();
    console.table(stats);
  }

  // Demonstrate database hooks working
  console.log('\n🎯 Database Hooks Demo:');
  console.log('======================');
  
  // Add a custom hook
  database.addHook('afterCreateResource', async ({ resource }) => {
    console.log(`✅ Hook: Resource '${resource.name}' was created with cache support`);
  });

  // Create another resource to trigger the hook
  const products = await database.createResource({
    name: 'products',
    attributes: {
      title: 'string|required',
      price: 'number|required',
      category: 'string'
    }
  });

  console.log('\n✅ Demo completed successfully!');
  console.log('✨ Key improvements demonstrated:');
  console.log('   • Database hooks system (no method overwriting)');
  console.log('   • Additional cached methods: exists, query, getFromPartition, content, hasContent');
  console.log('   • Clean plugin architecture');
  console.log('   • Proper cache invalidation on writes');
}

// Run the demo
demo().catch(console.error);

export default demo; 