import { setupDatabase, teardownDatabase } from './database.js';

// Debug resource creation to understand why timestamps is not being captured
async function debugResourceCreation() {
  console.log('🔧 Debugging Resource Creation...\n');

  try {
    const db = await setupDatabase();
    console.log('✅ Connected to database');

    // Create a simple resource with timestamps
    const testResource = await db.createResource({
      name: 'test-debug',
      behavior: 'body-overflow',
      timestamps: true,
      attributes: {
        name: 'string|required',
        email: 'string|required'
      },
      partitions: {
        byEmail: {
          fields: { email: 'string' }
        }
      }
    });

    console.log('\n📋 Resource Configuration:');
    console.log('  - Name:', testResource.name);
    console.log('  - Behavior:', testResource.behavior);
    console.log('  - Timestamps in config:', testResource.config.timestamps);
    console.log('  - Timestamps in attributes:', 
      testResource.attributes.createdAt ? 'Yes' : 'No',
      testResource.attributes.updatedAt ? 'Yes' : 'No'
    );
    console.log('  - Partitions:', Object.keys(testResource.config.partitions));
    console.log('  - Hooks:', Object.keys(testResource.hooks).filter(h => testResource.hooks[h].length > 0));

    // Test inserting data
    console.log('\n🧪 Testing insert with timestamps...');
    const testData = await testResource.insert({
      name: 'John Doe',
      email: 'john@example.com'
    });
    
    console.log('✅ Insert successful:');
    console.log('  - ID:', testData.id);
    console.log('  - Created at:', testData.createdAt);
    console.log('  - Updated at:', testData.updatedAt);

  } catch (error) {
    console.error('❌ Error during debug:', error);
  } finally {
    await teardownDatabase();
  }
}

// Run the debug
debugResourceCreation().catch(console.error); 