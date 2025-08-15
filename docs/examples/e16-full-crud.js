import { setupDatabase, teardownDatabase } from './database.js';
import { Plugin } from '../src/plugins/plugin.class.js';

// Test if timestamps fix worked
async function testTimestampsFix() {
  console.log('🔧 Testing Timestamps Fix...\n');

  const db = await setupDatabase();
  console.log('✅ Connected to database');

    // Create a resource with timestamps: true directly in the config
    const testResource = await db.createResource({
      name: 'test-timestamps-fix',
      behavior: 'body-overflow',
      timestamps: true,  // This should now work!
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

    // --- Middleware Example ---
    const plugin = new Plugin();
    // Middleware 1: Block insert if name is 'Blocked User'
    plugin.addMiddleware(testResource, 'insert', async (next, data) => {
      if (data.name === 'Blocked User') {
        console.log('🚫 Insert blocked by middleware!');
        return null;
      }
      return await next(data);
    });
    // Middleware 2: Log every insert attempt (runs before or after block)
    plugin.addMiddleware(testResource, 'insert', async (next, data) => {
      console.log('📥 Middleware log: insert called with', data);
      return await next(data);
    });
    // Middleware 1: Log all updates
    plugin.addMiddleware(testResource, 'update', async (next, id, update) => {
      console.log('📝 Middleware log: update called for id', id, 'with', update);
      return await next(id, update);
    });
    // Middleware 2: Modify update payload (append ' [MW]' to name)
    plugin.addMiddleware(testResource, 'update', async (next, id, update) => {
      if (update.name) {
        update.name += ' [MW]';
        console.log('🔧 Middleware modified update name:', update.name);
      }
      return await next(id, update);
    });
    // --- End Middleware Example ---

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
    // Try blocked insert
    await testResource.insert({
      name: 'Blocked User',
      email: 'blocked@example.com'
    });
    
    console.log('✅ Insert successful:');
    console.log('  - ID:', testData.id);
    console.log('  - Created at:', testData.createdAt);
    console.log('  - Updated at:', testData.updatedAt);

    // Test update
    const updatedData = await testResource.update(testData.id, {
      name: 'John Doe Updated'
    });
    
    console.log('✅ Update successful:');
    console.log('  - Name:', updatedData.name);
    console.log('  - Created at:', updatedData.createdAt);
    console.log('  - Updated at:', updatedData.updatedAt);

    if (testResource.config.timestamps === true && 
        testResource.attributes.createdAt && 
        testResource.attributes.updatedAt &&
        testData.createdAt && 
        testData.updatedAt) {
      console.log('\n✅ SUCCESS: Timestamps are working correctly!');
    } else {
      console.log('\n❌ FAILURE: Timestamps are not working correctly!');
    }

  } catch (error) {
    console.error('❌ Error during test:', error);
  } finally {
    await teardownDatabase();
  }
}

// Run the test
testTimestampsFix().catch(console.error); 