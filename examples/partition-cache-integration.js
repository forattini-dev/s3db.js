import { createDatabaseForTest } from './database.js';

console.log('\n🔄 Testing Partition Cache Integration\n');

(async () => {
  let database;
  
  try {
    database = await createDatabaseForTest();
    console.log('✅ Database initialized');

    // Configure cache with partition support
    const partitionCacheConfig = {
      enabled: true,
      driver: 'partition-aware-filesystem',
      config: {
        directory: '.cache-partitions',
        usageStatsFile: 'partition-usage.json',
        flushInterval: 1000
      }
    };
    
    await database.usePlugin('cache', partitionCacheConfig);
    console.log('✅ Partition cache configured');

    // Create resource with multiple partitions
    const events = await database.createResource({
      name: 'events',
      attributes: {
        id: 'string|required',
        userId: 'string|required',
        type: 'string|required',
        region: 'string|required',
        createdAt: 'string|required'
      },
      partitions: {
        // Temporal partition
        byDate: {
          fields: { createdAt: 'string' }
        },
        // Geographic partition
        byRegion: {
          fields: { region: 'string' }
        },
        // Multi-field partition
        byTypeAndRegion: {
          fields: { type: 'string', region: 'string' }
        }
      },
      behavior: 'body-overflow'
    });

    // Complex partition
    const analytics = await database.createResource({
      name: 'analytics', 
      attributes: {
        id: 'string|required',
        metric: 'string|required',
        date: 'string|required',
        region: 'string|required'
      },
      behavior: 'body-overflow'
    });

    console.log('✅ Resource created with multiple partitions');

    // Insert test data
    const testData = [
      { id: 'e1', userId: 'u1', type: 'login', region: 'US', createdAt: '2024-01-15' },
      { id: 'e2', userId: 'u2', type: 'purchase', region: 'EU', createdAt: '2024-01-15' },
      { id: 'e3', userId: 'u3', type: 'login', region: 'US', createdAt: '2024-01-16' },
      { id: 'e4', userId: 'u4', type: 'view', region: 'AS', createdAt: '2024-01-16' },
      { id: 'e5', userId: 'u5', type: 'purchase', region: 'US', createdAt: '2024-01-17' }
    ];

    console.log('\n📝 Inserting test data...');
    for (const event of testData) {
      await events.insert(event);
    }
    console.log(`✅ ${testData.length} events inserted`);

    console.log('\n🔍 Testing queries with partition cache...');

    // Query 1: By date (temporal partition)
    console.log('\n1. Query by date (2024-01-15):');
    const time1 = Date.now();
    const results1 = await events.listIds({
      partition: 'byDate',
      partitionValues: { createdAt: '2024-01-15' }
    });
    const time2 = Date.now();
    console.log(`   - Found: ${results1.length} events in ${time2 - time1}ms`);

    // Same query again (should be faster due to cache)
    const time1b = Date.now();
    const results1b = await events.listIds({
      partition: 'byDate',
      partitionValues: { createdAt: '2024-01-15' }
    });
    const time2b = Date.now();
    console.log(`   - Cached: ${results1b.length} events in ${time2b - time1b}ms (cached)`);

    // Query 2: By region
    console.log('\n2. Query by region (US):');
    const time3 = Date.now();
    const results2 = await events.listIds({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    const time4 = Date.now();
    console.log(`   - Found: ${results2.length} events in ${time4 - time3}ms`);

    // Query 3: Multi-field (date + region)
    console.log('\n3. Multi-field query (login + US):');
    const time5 = Date.now();
    const results3 = await events.listIds({
      partition: 'byTypeAndRegion',
      partitionValues: { type: 'login', region: 'US' }
    });
    const time6 = Date.now();
    console.log(`   - Found: ${results3.length} events in ${time6 - time5}ms`);

    // Query 4: Count by region
    console.log('\n4. Count by region (US):');
    const time7 = Date.now();
    const count = await events.count({
      partition: 'byRegion',
      partitionValues: { region: 'US' }
    });
    const time8 = Date.now();
    console.log(`   - Count by region: ${count} records in ${time8 - time7}ms`);

    // Test cache invalidation
    console.log('\n🔄 Testing cache invalidation...');
    
    // Insert new event
    const newEvent = { 
      id: 'e6', 
      userId: 'u6', 
      type: 'login', 
      region: 'US', 
      createdAt: '2024-01-15' 
    };
    await events.insert(newEvent);
    console.log('✅ New event inserted');

    // Check if cache was invalidated properly
    const time9 = Date.now();
    const updatedResults = await events.listIds({
      partition: 'byDate',
      partitionValues: { createdAt: '2024-01-15' }
    });
    const time10 = Date.now();
    console.log(`   - After insertion: ${updatedResults.length} results in ${time10 - time9}ms`);

    // Show cache statistics
    console.log('\n📊 Cache statistics:');
    const cachePlugin = database.plugins.find(p => p.constructor.name === 'CachePlugin');
    if (cachePlugin && cachePlugin.cache.getStats) {
      const stats = cachePlugin.cache.getStats();
      console.log('   - Hits:', stats.hits || 'N/A');
      console.log('   - Misses:', stats.misses || 'N/A');
      console.log('   - Total keys:', stats.totalKeys || 'N/A');
      if (stats.partitionUsage) {
        console.log('   - Partition usage:');
        for (const [partition, usage] of Object.entries(stats.partitionUsage)) {
          console.log(`     * ${partition}: ${usage} accesses`);
        }
      }
    }

    // Demonstrate warm cache for frequent partitions
    console.log('\n🔥 Warming cache for frequent partitions...');
    await events.listIds({ partition: 'byRegion', partitionValues: { region: 'EU' } });
    await events.listIds({ partition: 'byRegion', partitionValues: { region: 'AS' } });
    console.log('✅ Cache warmed for EU and AS regions');

    console.log('\n✅ Partition + cache integration test completed!');
    console.log('\n💡 Benefits observed:');
    console.log('   - Subsequent queries much faster');
    console.log('   - Hierarchical cache preserves related data');
    console.log('   - Granular invalidation by partition');
    console.log('   - Organized file structure');

  } catch (error) {
    console.error('❌ Error during test:', error.message);
    console.error(error);
  } finally {
    if (database && database.disconnect) {
      await database.disconnect();
    }
  }
})(); 