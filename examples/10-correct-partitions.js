const s3db = require('../src/index.js');

(async () => {
  try {
    console.log('\n🔀 Testing Multi-Field Partitions with Consistent Ordering\n');

    // Create database instance with auto-created bucket
    const db = new s3db.Database({
      bucketName: 'my-s3db-multi-partitions',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
      autoCreateBucket: true
    });

    await db.connect();

    // Define a users resource with multi-field partitions
    const users = await db.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required', 
        email: 'string|required',
        region: 'string|required',
        department: 'string|required',
        status: 'string|required',
        role: 'string|required'
      },
      options: {
        timestamps: true,
        partitions: {
          // Multi-field partition: region + department (sorted alphabetically)
          byRegionDept: {
            fields: {
              region: 'string|maxlength:2',    // US-WEST -> US
              department: 'string'             // engineering
            }
          },
          // Multi-field partition: status + role (sorted alphabetically)
          byStatusRole: {
            fields: {
              status: 'string',                // active
              role: 'string'                   // admin
            }
          },
          // Single-field partition for comparison
          byRegionOnly: {
            fields: {
              region: 'string|maxlength:2'
            }
          }
        }
      }
    });

    console.log('✅ Resource created with multi-field partitions\n');

    // Insert test data
    const testUsers = [
      {
        id: 'user1',
        name: 'João Silva',
        email: 'joao@company.com',
        region: 'US-WEST',
        department: 'engineering',
        status: 'active',
        role: 'admin'
      },
      {
        id: 'user2', 
        name: 'Maria Santos',
        email: 'maria@company.com',
        region: 'US-EAST',
        department: 'engineering',
        status: 'active',
        role: 'user'
      },
      {
        id: 'user3',
        name: 'Carlos Lima',
        email: 'carlos@company.com', 
        region: 'US-WEST',
        department: 'marketing',
        status: 'inactive',
        role: 'user'
      },
      {
        id: 'user4',
        name: 'Ana Costa',
        email: 'ana@company.com',
        region: 'US-WEST', 
        department: 'engineering',
        status: 'active',
        role: 'admin'
      }
    ];

    for (const user of testUsers) {
      await users.insert(user);
    }

    console.log('📝 Inserted 4 test users\n');

    // Test listing with multi-field partitions using new API
    console.log('🔍 Testing multi-field partition queries (with consistent field ordering):\n');

    // Query by region + department (fields will be sorted: department, region)
    console.log('1. US-WEST engineering team:');
    const usWestEngineering = await users.listByPartition({
      partition: 'byRegionDept',
      partitionValues: {
        region: 'US-WEST',      // Will become region=US (after maxlength:2)
        department: 'engineering'
      }
    });
    console.log(`   Found ${usWestEngineering.length} users: ${usWestEngineering.map(u => u.name).join(', ')}`);
    console.log(`   Partition path: department=engineering/region=US (sorted alphabetically)\n`);

    // Query by status + role (fields will be sorted: role, status)
    console.log('2. Active admins:');
    const activeAdmins = await users.listByPartition({
      partition: 'byStatusRole',
      partitionValues: {
        status: 'active',
        role: 'admin'
      }
    });
    console.log(`   Found ${activeAdmins.length} users: ${activeAdmins.map(u => u.name).join(', ')}`);
    console.log(`   Partition path: role=admin/status=active (sorted alphabetically)\n`);

    // Query with single field
    console.log('3. All US-WEST users (single field):');
    const usWestUsers = await users.listByPartition({
      partition: 'byRegionOnly',
      partitionValues: {
        region: 'US-WEST'  // Will become region=US
      }
    });
    console.log(`   Found ${usWestUsers.length} users: ${usWestUsers.map(u => u.name).join(', ')}\n`);

    // Test count with multi-field partitions
    console.log('📊 Testing count with partitions:\n');

    const engCount = await users.count({
      partition: 'byRegionDept',
      partitionValues: {
        region: 'US-WEST',
        department: 'engineering'
      }
    });
    console.log(`US-WEST Engineering: ${engCount} users`);

    const adminCount = await users.count({
      partition: 'byStatusRole',
      partitionValues: {
        status: 'active',
        role: 'admin'
      }
    });
    console.log(`Active Admins: ${adminCount} users`);

    const totalCount = await users.count();
    console.log(`Total Users: ${totalCount} users\n`);

    // Test pagination with multi-field partitions
    console.log('� Testing pagination with partitions:\n');
    
    const page1 = await users.page(0, 2, {
      partition: 'byRegionDept',
      partitionValues: {
        region: 'US-WEST',
        department: 'engineering'
      }
    });
    
    console.log(`Page 1 of US-WEST Engineering (${page1.items.length}/${page1.totalItems} items):`);
    page1.items.forEach(user => {
      console.log(`  - ${user.name} (${user.role})`);
    });

    // Demonstrate key ordering consistency
    console.log('\n🔑 Demonstrating consistent key ordering:\n');
    
    const testData1 = { region: 'US-WEST', department: 'engineering' };
    const testData2 = { department: 'engineering', region: 'US-WEST' }; // Different input order
    
    const key1 = users.getPartitionKey('byRegionDept', 'test-user', testData1);
    const key2 = users.getPartitionKey('byRegionDept', 'test-user', testData2);
    
    console.log('Input order 1 (region first):', Object.keys(testData1).join(', '));
    console.log('Generated key 1:', key1);
    console.log('\nInput order 2 (department first):', Object.keys(testData2).join(', '));
    console.log('Generated key 2:', key2);
    console.log('\nKeys are identical:', key1 === key2 ? '✅ YES' : '❌ NO');

    console.log('\n� Expected S3 structure (with sorted field order):');
    console.log('bucket/');
    console.log('├── s3db.json');
    console.log('├── resource=users/');
    console.log('│   ├── v=v0/');
    console.log('│   │   ├── id=user1          # ← MAIN OBJECT (complete data)');
    console.log('│   │   ├── id=user2          # ← MAIN OBJECT');
    console.log('│   │   ├── id=user3          # ← MAIN OBJECT');
    console.log('│   │   └── id=user4          # ← MAIN OBJECT');
    console.log('│   └── partition=byRegionDept/');
    console.log('│       ├── department=engineering/region=US/  # ← SORTED: dept before region');
    console.log('│       │   ├── id=user1      # ← REFERENCE (pointer to main)');
    console.log('│       │   ├── id=user2      # ← REFERENCE (US-EAST -> US)');
    console.log('│       │   └── id=user4      # ← REFERENCE');
    console.log('│       ├── department=marketing/region=US/    # ← SORTED');
    console.log('│       │   └── id=user3      # ← REFERENCE');
    console.log('│       └── partition=byStatusRole/');
    console.log('│           ├── role=admin/status=active/     # ← SORTED: role before status');
    console.log('│           │   ├── id=user1  # ← REFERENCE');
    console.log('│           │   └── id=user4  # ← REFERENCE');
    console.log('│           └── role=user/status=active/      # ← SORTED');
    console.log('│               └── id=user2  # ← REFERENCE');

    console.log('\n✅ Multi-field partitions with consistent ordering completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
})();