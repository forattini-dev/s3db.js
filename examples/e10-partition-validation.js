import s3db from '../src/index.js';

(async () => {
  try {
    console.log('\n🔒 Testing Partition Validation and Secure Delete Operations\n');

    const db = new s3db.Database({
      bucketName: 'my-s3db-validation',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
      autoCreateBucket: true
    });console.log('🔍 1. Testing Partition Validation\n');

    // This should work - all partition fields exist
    console.log('✅ Creating resource with valid partitions...');
    const users = await db.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        region: 'string|required',
        department: 'string|required',
        status: 'string|required'
      },
      options: {
        timestamps: true,
        partitions: {
          byRegionDept: {
            fields: {
              region: 'string|maxlength:2',
              department: 'string'
            }
          },
          byStatus: {
            fields: {
              status: 'string'
            }
          }
        }
      }
    });
    console.log('   Resource created successfully!\n');

    // This should fail - partition uses non-existent field
    console.log('❌ Trying to create resource with invalid partition...');
    try {
      await db.createResource({
        name: 'products',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          price: 'number|required'
          // 'category' field missing but used in partition
        },
        options: {
          partitions: {
            byCategory: {
              fields: {
                category: 'string'  // This field doesn't exist!
              }
            }
          }
        }
      });
    } catch (error) {
      console.log('   Expected error caught:');
      console.log(`   "${error.message}"\n`);
    }

    // Insert some test data
    console.log('📝 Inserting test data...');
    const testUsers = [
      { id: 'user1', name: 'João Silva', region: 'US-WEST', department: 'engineering', status: 'active' },
      { id: 'user2', name: 'Maria Santos', region: 'EU-NORTH', department: 'marketing', status: 'active' },
      { id: 'user3', name: 'Carlos Lima', region: 'AS-EAST', department: 'engineering', status: 'inactive' }
    ];

    for (const user of testUsers) {
      await users.insert(user);
    }
    console.log(`   Inserted ${testUsers.length} test users\n`);

    console.log('🗂️ 2. Testing Delete Operations with Paranoid Mode\n');

    // Test paranoid mode (default: true)
    console.log('🛡️ Testing with paranoid mode enabled (default)...');
    try {
      await users.deleteAll();
    } catch (error) {
      console.log('   Expected security error:');
      console.log(`   "${error.message}"\n`);
    }

    try {
      await users.deleteAllData();
    } catch (error) {
      console.log('   Expected security error:');
      console.log(`   "${error.message}"\n`);
    }

    // Create a resource with paranoid mode disabled
    console.log('⚠️ Creating resource with paranoid mode disabled...');
    const tempData = await db.createResource({
      name: 'temp_data',
      attributes: {
        id: 'string|required',
        value: 'string|required'
      },
      options: {
        paranoid: false  // Explicitly disable security
      }  } finally {
    await teardownDatabase();
  }
    });

    // Insert some temp data
    await tempData.insert({ id: 'temp1', value: 'test1' });
    await tempData.insert({ id: 'temp2', value: 'test2' });
    await tempData.insert({ id: 'temp3', value: 'test3' });
    console.log('   Inserted 3 temp records\n');

    // Test deleteAll (current version only)
    console.log('🗑️ Testing deleteAll() - deletes current version only...');
    const deleteAllResult = await tempData.deleteAll();
    console.log(`   Deleted ${deleteAllResult.deletedCount} objects from version ${deleteAllResult.version}\n`);

    // Insert more data to test deleteAllData
    await tempData.insert({ id: 'temp4', value: 'test4' });
    await tempData.insert({ id: 'temp5', value: 'test5' });
    console.log('   Inserted 2 more temp records\n');

    // Test deleteAllData (all versions)
    console.log('💥 Testing deleteAllData() - deletes ALL versions...');
    const deleteAllDataResult = await tempData.deleteAllData();
    console.log(`   Deleted ${deleteAllDataResult.deletedCount} objects for resource ${deleteAllDataResult.resource}\n`);

    console.log('🔄 3. Testing Schema Evolution with Partition Validation\n');

    // Create a resource and then try to update its attributes
    const evolving = await db.createResource({
      name: 'evolving',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        region: 'string|required'
      },
      options: {
        partitions: {
          byRegion: {
            fields: {
              region: 'string|maxlength:2'
            }
          }
        }
      }
    });

    console.log('✅ Created evolving resource with region partition');

    // Try to remove the region field (should fail)
    console.log('❌ Trying to remove region field (used by partition)...');
    try {
      evolving.updateAttributes({
        id: 'string|required',
        name: 'string|required'
        // region removed - should fail because partition uses it
      });
    } catch (error) {
      console.log('   Expected validation error:');
      console.log(`   "${error.message}"\n`);
    }

    // Add a new field and create a new partition (should work)
    console.log('✅ Adding new field and updating partitions...');
    evolving.updateAttributes({
      id: 'string|required',
      name: 'string|required',
      region: 'string|required',
      department: 'string|required'  // New field
    });

    // Manually add new partition after field is available
    evolving.options.partitions.byDepartment = {
      fields: {
        department: 'string'
      }
    };
    evolving.validatePartitions(); // Should pass now
    console.log('   Successfully added department field and partition\n');

    console.log('📊 4. Summary of Expected S3 Structure\n');
    console.log('After deletePrefix operations, the S3 structure would be:');
    console.log('bucket/');
    console.log('├── s3db.json');
    console.log('├── resource=users/');
    console.log('│   ├── v=v0/');
    console.log('│   │   ├── id=user1          # ← Still exists (paranoid protection)');
    console.log('│   │   ├── id=user2          # ← Still exists (paranoid protection)');
    console.log('│   │   └── id=user3          # ← Still exists (paranoid protection)');
    console.log('│   └── partition=byRegionDept/');
    console.log('│       └── ...              # ← Partition references still exist');
    console.log('├── resource=temp_data/       # ← COMPLETELY DELETED by deleteAllData()');
    console.log('└── resource=evolving/');
    console.log('    ├── v=v0/');
    console.log('    │   └── (no data inserted yet)');
    console.log('    └── partition=byRegion/');
    console.log('        └── (no partition references yet)');

    console.log('\n🎯 Key Features Demonstrated:');
    console.log('=====================================');
    console.log('✅ Partition field validation against current schema');
    console.log('✅ Automatic validation on attribute updates');
    console.log('✅ Paranoid mode protection (default: true)');
    console.log('✅ deleteAll() - deletes current version only');
    console.log('✅ deleteAllData() - deletes all versions');
    console.log('✅ deletePrefix() client method for bulk operations');
    console.log('✅ Schema evolution with partition compatibility checks');
    console.log('✅ Security-first approach with explicit opt-out required');

    console.log('\n🔒 Security Recommendations:');
    console.log('=====================================');
    console.log('• Keep paranoid: true in production (default)');
    console.log('• Only use paranoid: false for temporary/test resources');
    console.log('• Always validate partition compatibility before schema changes');
    console.log('• Use deleteAll() vs deleteAllData() based on your needs');
    console.log('• Monitor partition field usage before removing attributes');

    console.log('\n✅ Partition validation and secure delete demonstration completed!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
})();