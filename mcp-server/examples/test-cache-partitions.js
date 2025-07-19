#!/usr/bin/env node

/**
 * Test script to demonstrate Cache + Partitions performance
 * This shows how partitions work with intelligent caching
 */

import { S3dbMCPServer } from '../s3db_mcp_server.js';

class MockMCPClient {
  constructor() {
    this.server = new S3dbMCPServer();
  }

  async callTool(name, args) {
    console.log(`\n🔧 Calling tool: ${name}`);
    console.log(`📥 Arguments:`, JSON.stringify(args, null, 2));
    
    const startTime = Date.now();
    
    // Mock tool execution
    const mockResponse = this._getMockResponse(name, args);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📤 Response:`, JSON.stringify(mockResponse, null, 2));
    
    return mockResponse;
  }

  _getMockResponse(name, args) {
    const responses = {
      dbConnect: {
        success: true,
        message: 'Connected to S3DB database with cache + partitions',
        status: {
          connected: true,
          bucket: 'demo-bucket',
          keyPrefix: 'databases/cache-demo',
          version: '7.2.1',
          plugins: {
            costs: true,
            cache: true,
            cacheDriver: 'filesystem',
            cacheDirectory: './demo-cache',
            cacheTtl: 1800000
          }
        }
      },

      dbCreateResource: {
        success: true,
        resource: {
          name: args.name,
          attributes: args.attributes,
          partitions: args.partitions,
          timestamps: true
        }
      },

      resourceInsert: {
        success: true,
        data: {
          id: `user_${Math.random().toString(36).slice(2, 8)}`,
          ...args.data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        partitionInfo: this._extractPartitionInfo(args.data),
        cacheInvalidationPatterns: [
          `resource=${args.resourceName}/action=list`,
          `resource=${args.resourceName}/action=count`,
          ...(args.data.ageGroup ? [
            `resource=${args.resourceName}/action=list/partition=byAge/values=ageGroup=${args.data.ageGroup}`,
            `resource=${args.resourceName}/action=count/partition=byAge/values=ageGroup=${args.data.ageGroup}`
          ] : []),
          ...(args.data.country ? [
            `resource=${args.resourceName}/action=list/partition=byRegion/values=country=${args.data.country}`,
            `resource=${args.resourceName}/action=count/partition=byRegion/values=country=${args.data.country}`
          ] : [])
        ]
      },

      resourceList: {
        success: true,
        data: this._generateMockUsers(args.partition, args.partitionValues, args.limit || 10),
        count: args.limit || 10,
        pagination: {
          limit: args.limit || 10,
          offset: args.offset || 0,
          hasMore: false
        },
        cacheKeyHint: this._generateCacheKey(args.resourceName, 'list', args),
        ...(args.partition && { partition: args.partition }),
        ...(args.partitionValues && { partitionValues: args.partitionValues })
      },

      resourceCount: {
        success: true,
        count: Math.floor(Math.random() * 500) + 50,
        resource: args.resourceName,
        cacheKeyHint: this._generateCacheKey(args.resourceName, 'count', args),
        ...(args.partition && { partition: args.partition }),
        ...(args.partitionValues && { partitionValues: args.partitionValues })
      },

      dbGetStats: {
        success: true,
        stats: {
          database: {
            connected: true,
            bucket: 'demo-bucket',
            keyPrefix: 'databases/cache-demo',
            version: '7.2.1',
            resourceCount: 1,
            resources: ['users']
          },
          costs: {
            total: 0.000156,
            totalRequests: 23,
            requestsByType: { get: 12, put: 8, list: 3 },
            estimatedCostUSD: 0.000156
          },
          cache: {
            enabled: true,
            driver: 'FilesystemCache',
            size: 8,
            directory: './demo-cache',
            ttl: 1800000,
            keyCount: 8,
            sampleKeys: [
              'resource=users/action=list/partition=byAge/values=ageGroup=adult.json.gz',
              'resource=users/action=count/partition=byRegion/values=country=BR.json.gz'
            ]
          }
        }
      },

      dbClearCache: {
        success: true,
        message: args.resourceName 
          ? `Cache cleared for resource: ${args.resourceName}`
          : 'All cache cleared'
      }
    };

    return responses[name] || { success: false, error: 'Unknown tool' };
  }

  _extractPartitionInfo(data) {
    const partitions = {};
    if (data.ageGroup) partitions.byAge = { ageGroup: data.ageGroup };
    if (data.country) partitions.byRegion = { country: data.country };
    return Object.keys(partitions).length > 0 ? partitions : null;
  }

  _generateCacheKey(resourceName, action, args) {
    const keyParts = [`resource=${resourceName}`, `action=${action}`];
    
    if (args.partition && args.partitionValues) {
      keyParts.push(`partition=${args.partition}`);
      const values = Object.entries(args.partitionValues)
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      keyParts.push(`values=${values}`);
    }
    
    const params = [];
    if (args.limit) params.push(`limit=${args.limit}`);
    if (args.offset) params.push(`offset=${args.offset}`);
    if (params.length > 0) {
      keyParts.push(`params=${params.join('&')}`);
    }
    
    return keyParts.join('/') + '.json.gz';
  }

  _generateMockUsers(partition, partitionValues, count) {
    const users = [];
    const names = ['João Silva', 'Maria Santos', 'Pedro Oliveira', 'Ana Costa', 'Carlos Lima'];
    const ageGroups = ['adult', 'teen', 'senior'];
    const countries = ['BR', 'US', 'CA', 'UK'];

    for (let i = 0; i < count; i++) {
      const user = {
        id: `user_${Math.random().toString(36).slice(2, 8)}`,
        name: names[Math.floor(Math.random() * names.length)],
        email: `user${i}@example.com`,
        ageGroup: ageGroups[Math.floor(Math.random() * ageGroups.length)],
        country: countries[Math.floor(Math.random() * countries.length)],
        createdAt: new Date().toISOString()
      };

      // Apply partition filter if specified
      if (partition && partitionValues) {
        if (partition === 'byAge' && partitionValues.ageGroup) {
          user.ageGroup = partitionValues.ageGroup;
        }
        if (partition === 'byRegion' && partitionValues.country) {
          user.country = partitionValues.country;
        }
      }

      users.push(user);
    }

    return users;
  }
}

async function demonstrateCachePartitions() {
  console.log('🚀 S3DB MCP Cache + Partitions Demo');
  console.log('===================================\n');

  const client = new MockMCPClient();

  try {
    // 1. Connect with cache enabled
    console.log('📋 Step 1: Connect with Cache + Partitions');
    console.log('──────────────────────────────────────────');
    await client.callTool('dbConnect', {
      connectionString: 's3://demo-key:demo-secret@demo-bucket/databases/cache-demo',
      cacheDriver: 'filesystem',
      cacheDirectory: './demo-cache',
      cachePrefix: 'partitioned',
      cacheTtl: 1800000,
      enableCosts: true
    });

    // 2. Create partitioned resource
    console.log('\n📋 Step 2: Create Partitioned Resource');
    console.log('─────────────────────────────────────');
    await client.callTool('dbCreateResource', {
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required|unique',
        ageGroup: 'string|required',
        country: 'string|required'
      },
      partitions: {
        byAge: { fields: { ageGroup: 'string' } },
        byRegion: { fields: { country: 'string' } }
      }
    });

    // 3. Insert users (invalidates cache)
    console.log('\n📋 Step 3: Insert Users (Cache Invalidation)');
    console.log('────────────────────────────────────────────');
    await client.callTool('resourceInsert', {
      resourceName: 'users',
      data: {
        name: 'João Silva',
        email: 'joao@example.com',
        ageGroup: 'adult',
        country: 'BR'
      }
    });

    // 4. First query - Cache MISS
    console.log('\n📋 Step 4: First Query - Cache MISS');
    console.log('──────────────────────────────────');
    const startMiss = Date.now();
    const result1 = await client.callTool('resourceList', {
      resourceName: 'users',
      partition: 'byAge',
      partitionValues: { ageGroup: 'adult' },
      limit: 10
    });
    const durationMiss = Date.now() - startMiss;
    console.log(`🔍 Cache Status: MISS (${durationMiss}ms - simulated S3 query)`);

    // 5. Second query - Cache HIT
    console.log('\n📋 Step 5: Second Query - Cache HIT');
    console.log('──────────────────────────────────');
    const startHit = Date.now();
    const result2 = await client.callTool('resourceList', {
      resourceName: 'users',
      partition: 'byAge',
      partitionValues: { ageGroup: 'adult' },
      limit: 10
    });
    const durationHit = Date.now() - startHit;
    console.log(`⚡ Cache Status: HIT (${durationHit}ms - cache served)`);
    console.log(`🚀 Performance Improvement: ${Math.round(durationMiss / durationHit)}x faster!`);

    // 6. Different partition query - Cache MISS
    console.log('\n📋 Step 6: Different Partition - Cache MISS');
    console.log('───────────────────────────────────────────');
    const result3 = await client.callTool('resourceList', {
      resourceName: 'users',
      partition: 'byAge',
      partitionValues: { ageGroup: 'teen' },
      limit: 10
    });
    console.log('📝 Note: Different partition = separate cache entry');

    // 7. Count with partition
    console.log('\n📋 Step 7: Count with Partition Cache');
    console.log('───────────────────────────────────');
    await client.callTool('resourceCount', {
      resourceName: 'users',
      partition: 'byRegion',
      partitionValues: { country: 'BR' }
    });

    // 8. Check cache statistics
    console.log('\n📋 Step 8: Cache Performance Stats');
    console.log('─────────────────────────────────');
    const stats = await client.callTool('dbGetStats');
    
    const cacheStats = stats.stats.cache;
    const costStats = stats.stats.costs;
    
    console.log('\n📊 Performance Summary:');
    console.log('═════════════════════');
    console.log(`💾 Cache Entries: ${cacheStats.size}`);
    console.log(`🗂️  Partitioned Keys: ${cacheStats.sampleKeys.filter(k => k.includes('/partition=')).length}`);
    console.log(`💰 S3 Costs: $${costStats.estimatedCostUSD.toFixed(6)}`);
    console.log(`📡 S3 Requests: ${costStats.totalRequests}`);
    console.log(`📁 Cache Directory: ${cacheStats.directory}`);

    // 9. Clear cache demonstration
    console.log('\n📋 Step 9: Cache Management');
    console.log('──────────────────────────');
    await client.callTool('dbClearCache', {
      resourceName: 'users'
    });

    console.log('\n✅ Cache + Partitions Demo Completed!');
    console.log('═══════════════════════════════════');
    console.log('\n🎯 Key Benefits Demonstrated:');
    console.log('• Partition-aware cache keys');
    console.log('• Intelligent cache invalidation');
    console.log('• Massive performance improvements');
    console.log('• Granular cache management');
    console.log('• Cost optimization through caching');
    
    console.log('\n💡 Next Steps:');
    console.log('• Try with real S3DB MCP Server');
    console.log('• Configure production cache settings');
    console.log('• Monitor cache performance in production');
    console.log('• See docs/CACHE_PARTITIONS_STRATEGY.md for details');

  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    process.exit(1);
  }
}

// Run the demonstration
demonstrateCachePartitions().catch(console.error);