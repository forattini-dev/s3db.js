#!/usr/bin/env node

/**
 * Test script to demonstrate FilesystemCache functionality
 * This tests the cache directly without the full MCP server
 */

import { FilesystemCache } from '../src/plugins/cache/filesystem-cache.class.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testFilesystemCache() {
  console.log('🧪 Testing FilesystemCache Implementation');
  console.log('=========================================\n');

  const cacheDir = path.join(__dirname, '../test-cache-demo');
  
  // Create cache instance
  const cache = new FilesystemCache({
    directory: cacheDir,
    prefix: 'demo',
    ttl: 10000, // 10 seconds for quick testing
    enableCompression: true,
    enableStats: true,
    enableCleanup: true,
    cleanupInterval: 5000, // 5 seconds for quick testing
    createDirectory: true
  });

  console.log('📁 Cache directory:', cacheDir);
  console.log('⚙️ Configuration:', {
    ttl: '10 seconds',
    compression: 'enabled',
    cleanup: 'enabled (5s interval)'
  });
  console.log();

  try {
    // Test 1: Set some cache data
    console.log('📝 Test 1: Setting cache data');
    await cache.set('user:123', { 
      id: 123, 
      name: 'John Doe', 
      email: 'john@example.com',
      profile: { bio: 'Software developer', avatar: 'https://example.com/avatar.jpg' }
    });
    await cache.set('user:456', { 
      id: 456, 
      name: 'Jane Smith', 
      email: 'jane@example.com' 
    });
    await cache.set('config:app', { 
      theme: 'dark', 
      language: 'en', 
      notifications: true 
    });
    console.log('✅ Set 3 cache entries');
    console.log();

    // Test 2: Get cache data
    console.log('📖 Test 2: Getting cache data');
    const user123 = await cache.get('user:123');
    const user456 = await cache.get('user:456');
    const config = await cache.get('config:app');
    console.log('✅ User 123:', user123?.name);
    console.log('✅ User 456:', user456?.name);
    console.log('✅ Config theme:', config?.theme);
    console.log();

    // Test 3: Cache size and keys
    console.log('📊 Test 3: Cache statistics');
    const size = await cache.size();
    const keys = await cache.keys();
    console.log('✅ Cache size:', size);
    console.log('✅ Cache keys:', keys);
    console.log();

    // Test 4: Cache stats
    console.log('📈 Test 4: Cache performance stats');
    const stats = cache.getStats();
    console.log('✅ Statistics:', {
      hits: stats.hits,
      misses: stats.misses,
      sets: stats.sets,
      directory: stats.directory,
      compression: stats.compression
    });
    console.log();

    // Test 5: Non-existent key
    console.log('❓ Test 5: Getting non-existent key');
    const notFound = await cache.get('user:999');
    console.log('✅ Non-existent key result:', notFound);
    console.log();

    // Test 6: Clear specific key
    console.log('🗑️ Test 6: Deleting specific key');
    await cache.del('user:456');
    const deletedUser = await cache.get('user:456');
    console.log('✅ Deleted user result:', deletedUser);
    console.log();

    // Test 7: Wait for TTL expiration
    console.log('⏱️ Test 7: Waiting for TTL expiration (10 seconds)...');
    console.log('   This demonstrates automatic cleanup of expired files');
    
    // Wait 12 seconds to ensure TTL expiration
    await new Promise(resolve => setTimeout(resolve, 12000));
    
    const expiredUser = await cache.get('user:123');
    const expiredConfig = await cache.get('config:app');
    console.log('✅ Expired user (should be null):', expiredUser);
    console.log('✅ Expired config (should be null):', expiredConfig);
    console.log();

    // Test 8: Final cache state
    console.log('📊 Test 8: Final cache state');
    const finalSize = await cache.size();
    const finalKeys = await cache.keys();
    console.log('✅ Final cache size:', finalSize);
    console.log('✅ Final cache keys:', finalKeys);
    console.log();

    // Test 9: Clear all cache
    console.log('🧹 Test 9: Clearing all cache');
    await cache.clear();
    const clearedSize = await cache.size();
    console.log('✅ Cache size after clear:', clearedSize);
    console.log();

    // Cleanup
    cache.destroy();
    console.log('✅ All FilesystemCache tests completed successfully!');
    console.log('🗂️ Check the cache directory for any remaining files:', cacheDir);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testFilesystemCache().catch(console.error);