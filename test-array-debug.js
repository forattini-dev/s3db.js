import Schema from './src/schema.class.js';

async function testArraySerialization() {
  console.log('Testing Array Serialization/Deserialization...\n');

  const schema = new Schema({
    name: 'users',
    attributes: {
      name: 'string',
      phones: 'array|items:string',
      tags: 'array|items:string'
    },
  });

  console.log('Schema hooks for phones:');
  console.log('beforeMap:', schema.options.hooks.beforeMap.phones);
  console.log('afterUnmap:', schema.options.hooks.afterUnmap.phones);
  console.log();

  // Test cases with different scenarios
  const testCases = [
    {
      name: 'Basic array',
      data: {
        name: 'John Doe',
        phones: ['555-1234', '555-5678', '555-9999'],
        tags: ['developer', 'javascript', 'nodejs']
      }
    },
    {
      name: 'Empty array',
      data: {
        name: 'Jane Doe',
        phones: [],
        tags: []
      }
    },
    {
      name: 'Undefined arrays',
      data: {
        name: 'Bob Smith',
        phones: undefined,
        tags: undefined
      }
    },
    {
      name: 'Null arrays',
      data: {
        name: 'Alice Brown',
        phones: null,
        tags: null
      }
    },
    {
      name: 'Arrays with special characters',
      data: {
        name: 'Charlie Wilson',
        phones: ['555-1234', '555|special', '555-with|pipe'],
        tags: ['tag|with|pipes', 'normal-tag', 'another|tag']
      }
    },
    {
      name: 'Arrays with empty strings',
      data: {
        name: 'David Johnson',
        phones: ['555-1234', '', '555-5678'],
        tags: ['', 'tag1', '', 'tag2']
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.name} ===`);
    console.log('Original data:', testCase.data);

    try {
      // Test mapping (serialization)
      const mapped = await schema.mapper(testCase.data);
      console.log('Mapped data:', mapped);

      // Test unmapping (deserialization)
      const unmapped = await schema.unmapper(mapped);
      console.log('Unmapped data:', unmapped);

      // Check if data is preserved
      const phonesMatch = JSON.stringify(testCase.data.phones) === JSON.stringify(unmapped.phones);
      const tagsMatch = JSON.stringify(testCase.data.tags) === JSON.stringify(unmapped.tags);
      
      console.log('Phones match:', phonesMatch);
      console.log('Tags match:', tagsMatch);
      
      if (!phonesMatch || !tagsMatch) {
        console.log('❌ MISMATCH DETECTED!');
        console.log('Original phones:', testCase.data.phones);
        console.log('Unmapped phones:', unmapped.phones);
        console.log('Original tags:', testCase.data.tags);
        console.log('Unmapped tags:', unmapped.tags);
      } else {
        console.log('✅ Test passed');
      }

    } catch (error) {
      console.error('❌ Error during test:', error);
    }
  }
}

testArraySerialization();