import S3db from '../src/index.js';
import { setupDatabase, teardownDatabase } from './database.js';

// Test configuration loading after reboot
async function testConfigurationLoading() {
  console.log('🔧 Testing Resource Configuration Loading...\n');

  const db = await setupDatabase();

  try {
    // Connect to database
    console.log('✅ Connected to database');

    // Create a resource with specific configurations
    const testResource = await db.createResource({
      name: 'test-config',
      behavior: 'body-overflow',
      timestamps: true,
      autoDecrypt: false,
      paranoid: false,
      allNestedObjectsOptional: false,
      cache: true,
      attributes: {
        name: 'string|required',
        email: 'string|required',
        age: 'number|optional',
        metadata: {
          $$type: 'object|optional',
          tags: 'array|optional',
          preferences: {
            $$type: 'object|optional',
            theme: 'string|optional',
            notifications: 'boolean|optional'
          }
        }
      },
      partitions: {
        byEmail: {
          fields: { email: 'string' }
        },
        byAge: {
          fields: { age: 'number' }
        }
      }
    });

    console.log('✅ Created test resource with configurations:');
    console.log('  - Behavior:', testResource.behavior);
    console.log('  - Timestamps:', testResource.config.timestamps);
    console.log('  - AutoDecrypt:', testResource.config.autoDecrypt);
    console.log('  - Paranoid:', testResource.config.paranoid);
    console.log('  - AllNestedObjectsOptional:', testResource.config.allNestedObjectsOptional);
    console.log('  - Cache:', testResource.config.cache);
    console.log('  - Partitions:', Object.keys(testResource.config.partitions));

    // Insert some test data
    const testData = await testResource.insert({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      metadata: {
        tags: ['test', 'example'],
        preferences: {
          theme: 'dark',
          notifications: true
        }
      }
    });

    console.log('✅ Inserted test data:', testData.id);

    // Simulate database reboot by creating a new instance
    console.log('\n🔄 Simulating database reboot...');
    
    const db2 = await setupDatabase();
    console.log('✅ Reconnected to database');

    // Get the resource from the "rebooted" database
    const reloadedResource = await db2.getResource('test-config');

    console.log('\n📋 Reloaded resource configurations:');
    console.log('  - Behavior:', reloadedResource.behavior);
    console.log('  - Timestamps:', reloadedResource.config.timestamps);
    console.log('  - AutoDecrypt:', reloadedResource.config.autoDecrypt);
    console.log('  - Paranoid:', reloadedResource.config.paranoid);
    console.log('  - AllNestedObjectsOptional:', reloadedResource.config.allNestedObjectsOptional);
    console.log('  - Cache:', reloadedResource.config.cache);
    console.log('  - Partitions:', Object.keys(reloadedResource.config.partitions));

    // Verify configurations match
    const configsMatch = 
      testResource.behavior === reloadedResource.behavior &&
      testResource.config.timestamps === reloadedResource.config.timestamps &&
      testResource.config.autoDecrypt === reloadedResource.config.autoDecrypt &&
      testResource.config.paranoid === reloadedResource.config.paranoid &&
      testResource.config.allNestedObjectsOptional === reloadedResource.config.allNestedObjectsOptional &&
      testResource.config.cache === reloadedResource.config.cache &&
      JSON.stringify(testResource.config.partitions) === JSON.stringify(reloadedResource.config.partitions);

    if (configsMatch) {
      console.log('\n✅ SUCCESS: All configurations loaded correctly after reboot!');
    } else {
      console.log('\n❌ FAILURE: Configurations do not match after reboot!');
      console.log('Original vs Reloaded:');
      console.log('  Behavior:', testResource.behavior, 'vs', reloadedResource.behavior);
      console.log('  Timestamps:', testResource.config.timestamps, 'vs', reloadedResource.config.timestamps);
      console.log('  AutoDecrypt:', testResource.config.autoDecrypt, 'vs', reloadedResource.config.autoDecrypt);
      console.log('  Paranoid:', testResource.config.paranoid, 'vs', reloadedResource.config.paranoid);
      console.log('  AllNestedObjectsOptional:', testResource.config.allNestedObjectsOptional, 'vs', reloadedResource.config.allNestedObjectsOptional);
      console.log('  Cache:', testResource.config.cache, 'vs', reloadedResource.config.cache);
      console.log('  Partitions:', testResource.config.partitions, 'vs', reloadedResource.config.partitions);
    }

    // Test retrieving the data to ensure it works
    const retrievedData = await reloadedResource.get(testData.id);
    console.log('\n✅ Retrieved data successfully:', retrievedData.name);

    // Test partition functionality
    const partitionData = await reloadedResource.getFromPartition({
      id: testData.id,
      partitionName: 'byEmail',
      partitionValues: { email: 'john@example.com' }
    });
    console.log('✅ Partition access works:', partitionData.name);

  } catch (error) {
    console.error('❌ Error during configuration test:', error);
  } finally {
    await teardownDatabase();
  }
}

// Run the test
testConfigurationLoading().catch(console.error); 