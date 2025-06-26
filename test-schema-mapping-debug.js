import Schema from './src/schema.class.js';
import { flatten, unflatten } from "flat";
import { cloneDeep } from 'lodash-es';

async function testSchemaMapping() {
  console.log('Testing Schema mapping process step by step...\n');

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
  console.log();

  const testData = {
    id: 'click2',
    utms: {},
    metadata: {}
  };

  console.log('=== Testing mapping process ===');
  console.log('Original data:', JSON.stringify(testData, null, 2));
  
  // Step 1: Clone and flatten
  const obj = flatten(cloneDeep(testData), { safe: true });
  console.log('1. After flatten:', obj);
  
  // Step 2: Apply beforeMap hooks (should be empty for this test)
  console.log('2. Hooks beforeMap:', schema.options.hooks.beforeMap);
  await schema.applyHooksActions(obj, "beforeMap");
  console.log('   After beforeMap hooks:', obj);
  
  // Step 3: Map to numbered keys
  const rest = { '_v': schema.version + '' }
  for (const [key, value] of Object.entries(obj)) {
    console.log(`   Mapping "${key}" -> "${schema.map[key]}" = ${JSON.stringify(value)}`);
    rest[schema.map[key]] = value;
  }
  console.log('3. After key mapping:', rest);
  
  // Step 4: Apply afterMap hooks
  await schema.applyHooksActions(rest, "afterMap");
  console.log('4. After afterMap hooks:', rest);
  
  console.log('\n=== Testing unmapping process ===');
  
  // Step 1: Clone and remove version
  const unmapObj = cloneDeep(rest);
  delete unmapObj._v;
  console.log('1. After removing _v:', unmapObj);
  
  // Step 2: Apply beforeUnmap hooks
  await schema.applyHooksActions(unmapObj, "beforeUnmap");
  console.log('2. After beforeUnmap hooks:', unmapObj);
  
  // Step 3: Reverse map keys
  const unmapRest = {}
  for (const [key, value] of Object.entries(unmapObj)) {
    console.log(`   Reverse mapping "${key}" -> "${schema.reversedMap[key]}" = ${JSON.stringify(value)}`);
    unmapRest[schema.reversedMap[key]] = value;
  }
  console.log('3. After reverse key mapping:', unmapRest);
  
  // Step 4: Apply afterUnmap hooks
  await schema.applyHooksActions(unmapRest, "afterUnmap");
  console.log('4. After afterUnmap hooks:', unmapRest);
  
  // Step 5: Unflatten
  const final = unflatten(unmapRest);
  console.log('5. After unflatten:', JSON.stringify(final, null, 2));
}

testSchemaMapping();