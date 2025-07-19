import { Database } from '../src/index.js';

/**
 * Example: Metadata Type Fix
 * 
 * This example demonstrates how the s3db.js library now properly handles
 * different data types in metadata by converting them to strings before
 * sending to S3, preventing the "headers[headerName].trim is not a function" error.
 */

async function main() {
  console.log('🚀 Starting Metadata Type Fix Example\n');

  // Create database connection
  const db = new Database({
    connectionString: 's3://test:test@test-bucket',
    verbose: true
  });

  // Define a resource with various data types
  const urls = db.createResource('urls', {
    link: 'string|required',
    getFingerprints: 'boolean|optional',
    webpush: 'object|optional',
    openGraph: 'object|optional',
    userIp: 'string|optional',
    userId: 'string|optional',
    id: 'string|required',
    shareableLink: 'string|optional'
  });

  // Test data with various types that previously caused issues
  const testData = {
    link: 'http://localhost:9001/browser/shortner',
    getFingerprints: true, // boolean
    webpush: { 
      enabled: true, 
      clicks: true, 
      views: true, 
      shares: true 
    }, // object
    openGraph: {
      title: 'testsetest',
      description: 'setsetsetsetsetset',
      shortDescription: 'setsetsetsetsetset',
      imageAlt: 'Logo da Stone',
      siteName: 'Stone: complete sales solution made',
      type: 'website',
      locale: 'pt_BR',
      imageWidth: 128,
      imageHeight: 128
    }, // object
    userIp: '172.18.0.1',
    userId: 'filipe.forattini@stone.com.br',
    id: 'ujEEA87RLX4JI4Twkl',
    shareableLink: 'http://localhost:8000/ujEEA87RLX4JI4Twkl'
  };

  try {
    console.log('📝 Inserting data with various types...');
    console.log('Data types check:', {
      link: typeof testData.link,
      getFingerprints: typeof testData.getFingerprints,
      webpush: typeof testData.webpush,
      openGraph: typeof testData.openGraph,
      userIp: typeof testData.userIp,
      userId: typeof testData.userId,
      id: typeof testData.id,
      shareableLink: typeof testData.shareableLink
    });

    // This should now work without the trim() error
    const result = await urls.insert(testData);
    
    console.log('✅ Successfully inserted data!');
    console.log('Inserted ID:', result.id);
    
    // Retrieve the data to verify it was stored correctly
    console.log('\n📖 Retrieving data...');
    const retrieved = await urls.get(result.id);
    
    console.log('✅ Successfully retrieved data!');
    console.log('Retrieved data types:', {
      link: typeof retrieved.link,
      getFingerprints: typeof retrieved.getFingerprints,
      webpush: typeof retrieved.webpush,
      openGraph: typeof retrieved.openGraph,
      userIp: typeof retrieved.userIp,
      userId: typeof retrieved.userId,
      id: typeof retrieved.id,
      shareableLink: typeof retrieved.shareableLink
    });

    // Verify that boolean and object values are preserved correctly
    console.log('\n🔍 Verifying data integrity...');
    console.log('getFingerprints (should be boolean):', retrieved.getFingerprints);
    console.log('webpush (should be object):', retrieved.webpush);
    console.log('openGraph (should be object):', retrieved.openGraph);

    if (retrieved.getFingerprints === true && 
        typeof retrieved.webpush === 'object' && 
        typeof retrieved.openGraph === 'object') {
      console.log('✅ All data types preserved correctly!');
    } else {
      console.log('❌ Data type preservation issue detected');
    }

  } catch (error) {
    console.error('❌ Error occurred:', error.message);
    if (error.details) {
      console.error('Error details:', error.details);
    }
  }

  console.log('\n🎉 Metadata Type Fix Example completed!');
}

// Run the example
main().catch(console.error); 