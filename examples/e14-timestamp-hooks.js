import S3db from '../src/index.js';

// Test timestamp and hooks configuration after loading from s3db.json
async function testTimestampAndHooksValidation() {
  console.log('🔧 Testing Timestamp and Hooks Configuration After Loading...\n');

  const db = await setupDatabase());

  try {
    // Connect to databaseconsole.log('✅ Connected to database');

    // Create a resource with timestamps enabled and custom partitions
    const testResource = await db.createResource({
      name: 'test-timestamps',
      behavior: 'body-overflow',
      timestamps: true,
      attributes: {
        name: 'string|required',
        email: 'string|required',
        category: 'string|optional'
      },
      partitions: {
        byCategory: {
          fields: { category: 'string' }
        }
      }
    });

    console.log('✅ Created test resource with timestamps enabled');
    console.log('  - Timestamps enabled:', testResource.config.timestamps);
    console.log('  - Attributes include timestamps:', 
      testResource.attributes.createdAt ? 'Yes' : 'No',
      testResource.attributes.updatedAt ? 'Yes' : 'No'
    );
    console.log('  - Timestamp partitions:', 
      testResource.config.partitions.byCreatedDate ? 'Yes' : 'No',
      testResource.config.partitions.byUpdatedDate ? 'Yes' : 'No'
    );
    console.log('  - Custom partitions:', Object.keys(testResource.config.partitions));
    console.log('  - Hooks setup:', Object.keys(testResource.hooks).filter(h => testResource.hooks[h].length > 0));

    // Insert test data
    const testData = await testResource.insert({
      name: 'John Doe',
      email: 'john@example.com',
      category: 'premium'
    });

    console.log('✅ Inserted test data:', testData.id);
    console.log('  - Created at:', testData.createdAt);
    console.log('  - Updated at:', testData.updatedAt);

    // Simulate database reboot
    console.log('\n🔄 Simulating database reboot...');
    
    const db2 = await setupDatabase());console.log('✅ Reconnected to database');

    // Get the resource from the "rebooted" database
    const reloadedResource = await db2.getResource('test-timestamps');

    console.log('\n📋 Reloaded resource configuration:');
    console.log('  - Timestamps enabled:', reloadedResource.config.timestamps);
    console.log('  - Attributes include timestamps:', 
      reloadedResource.attributes.createdAt ? 'Yes' : 'No',
      reloadedResource.attributes.updatedAt ? 'Yes' : 'No'
    );
    console.log('  - Timestamp partitions:', 
      reloadedResource.config.partitions.byCreatedDate ? 'Yes' : 'No',
      reloadedResource.config.partitions.byUpdatedDate ? 'Yes' : 'No'
    );
    console.log('  - Custom partitions:', Object.keys(reloadedResource.config.partitions));
    console.log('  - Hooks setup:', Object.keys(reloadedResource.hooks).filter(h => reloadedResource.hooks[h].length > 0));

    // Verify configurations match
    const timestampsMatch = 
      testResource.config.timestamps === reloadedResource.config.timestamps &&
      !!testResource.attributes.createdAt === !!reloadedResource.attributes.createdAt &&
      !!testResource.attributes.updatedAt === !!reloadedResource.attributes.updatedAt &&
      !!testResource.config.partitions.byCreatedDate === !!reloadedResource.config.partitions.byCreatedDate &&
      !!testResource.config.partitions.byUpdatedDate === !!reloadedResource.config.partitions.byUpdatedDate;

    const partitionsMatch = 
      JSON.stringify(testResource.config.partitions) === JSON.stringify(reloadedResource.config.partitions);

    const hooksMatch = 
      testResource.hooks.afterInsert.length === reloadedResource.hooks.afterInsert.length &&
      testResource.hooks.afterDelete.length === reloadedResource.hooks.afterDelete.length;

    if (timestampsMatch && partitionsMatch && hooksMatch) {
      console.log('\n✅ SUCCESS: All timestamp and hook configurations loaded correctly!');
    } else {
      console.log('\n❌ FAILURE: Some configurations do not match!');
      console.log('Timestamps match:', timestampsMatch);
      console.log('Partitions match:', partitionsMatch);
      console.log('Hooks match:', hooksMatch);
    }

    // Test that timestamps are still working
    const retrievedData = await reloadedResource.get(testData.id);
    console.log('\n✅ Retrieved data with timestamps:', {
      id: retrievedData.id,
      createdAt: retrievedData.createdAt,
      updatedAt: retrievedData.updatedAt
    });

    // Test that partitions are still working
    const partitionData = await reloadedResource.getFromPartition({
      id: testData.id,
      partitionName: 'byCategory',
      partitionValues: { category: 'premium' }
    });
    console.log('✅ Partition access works:', partitionData.name);

    // Test inserting new data to ensure timestamps are added
    const newData = await reloadedResource.insert({
      name: 'Jane Smith',
      email: 'jane@example.com',
      category: 'standard'
    });
    console.log('✅ New data with timestamps:', {
      id: newData.id,
      createdAt: newData.createdAt,
      updatedAt: newData.updatedAt
    });

    // Test updating data to ensure updatedAt is updated
    const updatedData = await reloadedResource.update(newData.id, {
      name: 'Jane Smith Updated'
    });
    console.log('✅ Updated data with new timestamp:', {
      id: updatedData.id,
      createdAt: updatedData.createdAt,
      updatedAt: updatedData.updatedAt
    });

    console.log('\n✅ All timestamp and hook functionality verified!');

  } catch (error) {
    console.error('❌ Error during timestamp and hooks test:', error);
  }  } finally {
    await teardownDatabase();
  }
}

// Run the test
testTimestampAndHooksValidation().catch(console.error); 