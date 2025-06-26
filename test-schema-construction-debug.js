import { flatten } from "flat";
import { cloneDeep, invert } from 'lodash-es';

function testSchemaMapConstruction() {
  console.log('Testing Schema map construction...\n');

  const attributes = {
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
  };

  console.log('Original attributes:', JSON.stringify(attributes, null, 2));
  
  const flatAttrs = flatten(attributes, { safe: true });
  console.log('Flattened attributes:', flatAttrs);
  
  const reversedMap = { ...Object.keys(flatAttrs).filter(k => !k.includes('$$')) }
  console.log('ReversedMap (object keys):', reversedMap);
  
  const map = invert(reversedMap);
  console.log('Map (inverted):', map);
  
  // Test what happens with objects that are present in data but not in schema map
  const testKeys = ['id', 'utms', 'metadata', 'utms.source', 'utms.medium'];
  
  console.log('\nTesting key mapping:');
  for (const key of testKeys) {
    console.log(`"${key}" -> "${map[key]}" (${map[key] === undefined ? 'MISSING!' : 'OK'})`);
  }
}

testSchemaMapConstruction();