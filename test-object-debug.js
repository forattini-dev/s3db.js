import Schema from './src/schema.class.js';

async function testObjectSerialization() {
  console.log('Testing Object Serialization/Deserialization with empty/null values...\n');

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

  // Test cases that are causing issues
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
      name: 'Object with undefined values',
      data: {
        id: 'click3',
        utms: {
          source: 'facebook',
          medium: undefined,
          campaign: 'summer2024'
        }
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
      name: 'Undefined object',
      data: {
        id: 'click5',
        utms: undefined
      }
    },
    {
      name: 'Multiple nested empty objects',
      data: {
        id: 'click6',
        utms: {},
        metadata: {}
      }
    },
    {
      name: 'Mixed null and empty objects',
      data: {
        id: 'click7',
        utms: {
          source: 'twitter',
          medium: null
        },
        metadata: {}
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n=== ${testCase.name} ===`);
    console.log('Original data:', JSON.stringify(testCase.data, null, 2));

    try {
      // Test validation first
      console.log('Validating...');
      const isValid = await schema.validate(testCase.data);
      console.log('Validation result:', isValid);

      // Test mapping (serialization)
      console.log('Mapping (serialization)...');
      const mapped = await schema.mapper(testCase.data);
      console.log('Mapped data:', mapped);

      // Test unmapping (deserialization)
      console.log('Unmapping (deserialization)...');
      const unmapped = await schema.unmapper(mapped);
      console.log('Unmapped data:', JSON.stringify(unmapped, null, 2));

      // Check if data is preserved
      const dataMatch = JSON.stringify(testCase.data) === JSON.stringify(unmapped);
      
      if (dataMatch) {
        console.log('✅ Test passed - Data integrity preserved');
      } else {
        console.log('❌ MISMATCH DETECTED!');
        console.log('Expected:', JSON.stringify(testCase.data, null, 2));
        console.log('Got:', JSON.stringify(unmapped, null, 2));
      }

    } catch (error) {
      console.error('❌ Error during test:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

testObjectSerialization();