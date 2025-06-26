import Schema from './src/schema.class.js';

function testSchemaFix() {
  console.log('Testing Schema fix for empty objects...\n');

  const schema = new Schema({
    name: 'clicks',
    attributes: {
      id: 'string',
      utms: {
        $$type: 'object',
        source: 'string|optional',
        medium: 'string|optional',
        campaign: 'string|optional'
      },
      metadata: {
        $$type: 'object',
        browser: 'string|optional',
        device: 'string|optional'
      }
    },
  });

  console.log('Schema map:', schema.map);
  console.log('Schema reversedMap:', schema.reversedMap);
  
  // Test what happens with objects that are present in data but not in schema map
  const testKeys = ['id', 'utms', 'metadata', 'utms.source', 'utms.medium'];
  
  console.log('\nTesting key mapping:');
  for (const key of testKeys) {
    console.log(`"${key}" -> "${schema.map[key]}" (${schema.map[key] === undefined ? 'MISSING!' : 'OK'})`);
  }
}

testSchemaFix();