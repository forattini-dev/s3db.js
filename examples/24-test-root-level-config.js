import S3db from '../src/index.js';

// Test root level configuration
async function testRootLevelConfig() {
  console.log('🔧 Testing Root Level Configuration...\n');

  const db = await setupDatabase());

  try {
    // Connect to databaseconsole.log('✅ Connected to database');

    // Create a resource with all config at root level
    const testResource = await db.createResource({
      name: 'test-root-config',
      behavior: 'body-overflow',
      timestamps: true,
      autoDecrypt: false,
      paranoid: false,
      allNestedObjectsOptional: false,
      attributes: {
        name: 'string|required',
        email: 'string|required',
        age: 'number|optional'
      }
    });

    console.log('\n📋 Resource Configuration:');
    console.log('  - Name:', testResource.name);
    console.log('  - Behavior:', testResource.behavior);
    console.log('  - Timestamps:', testResource.config.timestamps);
    console.log('  - AutoDecrypt:', testResource.config.autoDecrypt);
    console.log('  - Paranoid:', testResource.config.paranoid);
    console.log('  - AllNestedObjectsOptional:', testResource.config.allNestedObjectsOptional);
    console.log('  - Partitions:', Object.keys(testResource.config.partitions || {}));

    // Insert a test record
    const testRecord = await testResource.insert({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30
    });

    console.log('\n✅ Test record inserted:', testRecord.id);

    // Disconnect and reconnect to test persistence
    console.log('\n🔄 Testing persistence...');
    
    // Create a new database instance
    const db2 = await setupDatabase());console.log('✅ Reconnected to database');

    // Get the resource
    const reloadedResource = await db2.getResource('test-root-config');

    console.log('\n📋 Reloaded Resource Configuration:');
    console.log('  - Name:', reloadedResource.name);
    console.log('  - Behavior:', reloadedResource.behavior);
    console.log('  - Timestamps:', reloadedResource.config.timestamps);
    console.log('  - AutoDecrypt:', reloadedResource.config.autoDecrypt);
    console.log('  - Paranoid:', reloadedResource.config.paranoid);
    console.log('  - AllNestedObjectsOptional:', reloadedResource.config.allNestedObjectsOptional);
    console.log('  - Partitions:', Object.keys(reloadedResource.config.partitions || {}));

    // Verify timestamps were applied
    console.log('\n📋 Attributes with timestamps:');
    console.log('  - createdAt:', reloadedResource.attributes.createdAt ? '✅ Present' : '❌ Missing');
    console.log('  - updatedAt:', reloadedResource.attributes.updatedAt ? '✅ Present' : '❌ Missing');

    // Verify partitions were applied
    console.log('\n📋 Timestamp partitions:');
    console.log('  - byCreatedDate:', reloadedResource.config.partitions.byCreatedDate ? '✅ Present' : '❌ Missing');
    console.log('  - byUpdatedDate:', reloadedResource.config.partitions.byUpdatedDate ? '✅ Present' : '❌ Missing');

    // Get the test record
    const reloadedRecord = await reloadedResource.get(testRecord.id);
    console.log('\n✅ Test record retrieved:', reloadedRecord.id);
    console.log('  - Timestamps present:', reloadedRecord.createdAt && reloadedRecord.updatedAt ? '✅ Yes' : '❌ No');

    console.log('\n🎉 Root level configuration test completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }  } finally {
    await teardownDatabase();
  }
}

testRootLevelConfig(); 