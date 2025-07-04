import S3db from '../src/index.js';

// Debug timestamp loading from s3db.json
async function debugTimestampLoading() {
  console.log('🔧 Debugging Timestamp Loading from s3db.json...\n');

  const db = await setupDatabase());

  try {
    // Connect to databaseconsole.log('✅ Connected to database');

    // Get the clicks resource
    const clicksResource = await db.getResource('clicks');
    
    console.log('\n📋 Resource Configuration:');
    console.log('  - Name:', clicksResource.name);
    console.log('  - Behavior:', clicksResource.behavior);
    console.log('  - Timestamps in config:', clicksResource.config.timestamps);
    console.log('  - Timestamps in attributes:', 
      clicksResource.attributes.createdAt ? 'Yes' : 'No',
      clicksResource.attributes.updatedAt ? 'Yes' : 'No'
    );
    console.log('  - Partitions:', Object.keys(clicksResource.config.partitions));
    console.log('  - Hooks:', Object.keys(clicksResource.hooks).filter(h => clicksResource.hooks[h].length > 0));

    // Check the saved metadata
    console.log('\n📋 Saved Metadata from s3db.json:');
    const savedResource = db.savedMetadata.resources.clicks;
    if (savedResource) {
      const currentVersion = savedResource.currentVersion || 'v0';
      const versionData = savedResource.versions[currentVersion];
      
      console.log('  - Current version:', currentVersion);
      console.log('  - Timestamps in saved options:', versionData?.options?.timestamps);
      console.log('  - Partitions in saved options:', versionData?.options?.partitions);
      console.log('  - Partitions at resource level:', savedResource.partitions);
      console.log('  - Behavior:', versionData?.behavior);
      
      console.log('\n📋 Full version data:');
      console.log(JSON.stringify(versionData, null, 2));
    }

    // Test inserting data to see if timestamps work
    console.log('\n🧪 Testing timestamp functionality...');
    try {
      const testData = await clicksResource.insert({
        sessionId: 'test-session-' + Date.now(),
        urlId: 'test-url-' + Date.now(),
        queryParams: 'test=true',
        userAgent: 'Test Browser'
      });
      
      console.log('✅ Insert successful:');
      console.log('  - ID:', testData.id);
      console.log('  - Created at:', testData.createdAt);
      console.log('  - Updated at:', testData.updatedAt);
      
      // Test update
      const updatedData = await clicksResource.update(testData.id, {
        queryParams: 'test=updated'
      });
      
      console.log('✅ Update successful:');
      console.log('  - Created at:', updatedData.createdAt);
      console.log('  - Updated at:', updatedData.updatedAt);
      
    } catch (error) {
      console.log('❌ Insert/Update failed:', error.message);
    }
  } finally {
    await teardownDatabase();
  }
  } catch (error) {
    console.error('❌ Error during debug:', error);
  }
}

// Run the debug
debugTimestampLoading().catch(console.error); 