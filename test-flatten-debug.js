import { flatten, unflatten } from "flat";

function testFlatten() {
  console.log('Testing flatten behavior with empty/null objects...\n');

  const testCases = [
    {
      name: 'Object with null values',
      data: {
        id: 'click1',
        utms: {
          source: 'google',
          medium: null,
        }
      }
    },
    {
      name: 'Empty object',
      data: {
        id: 'click2',
        utms: {}
      }
    },
    {
      name: 'Null object',
      data: {
        id: 'click4',
        utms: null
      }
    },
    {
      name: 'Multiple nested empty objects',
      data: {
        id: 'click6',
        utms: {},
        metadata: {}
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.name} ===`);
    console.log('Original:', JSON.stringify(testCase.data, null, 2));
    
    const flattened = flatten(testCase.data, { safe: true });
    console.log('Flattened:', flattened);
    
    const unflattened = unflatten(flattened);
    console.log('Unflattened:', JSON.stringify(unflattened, null, 2));
    
    console.log('Match:', JSON.stringify(testCase.data) === JSON.stringify(unflattened));
  }
}

testFlatten();