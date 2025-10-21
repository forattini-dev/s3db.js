import { createDatabaseForTest } from './tests/config.js';

const database = createDatabaseForTest('test-partitions-debug');
await database.connect();

const resource = await database.createResource({
  name: 'test_items',
  attributes: {
    id: 'string|required',
    type: 'string|required',
    name: 'string'
  },
  options: {
    asyncPartitions: false,
    partitions: {
      byType: { fields: { type: 'string' } }
    }
  }
});

console.log('Resource created');
console.log('asyncPartitions:', resource.config.asyncPartitions);
console.log('Partitions:', Object.keys(resource.config.partitions));
console.log('afterInsert hooks count:', resource.hooks.afterInsert?.length || 0);

// Insert a record
console.log('\nInserting record...');
const record = await resource.insert({
  id: 'item1',
  type: 'widget',
  name: 'Test Widget'
});
console.log('Record inserted:', record.id);

// Try to query by partition
console.log('\nQuerying by partition...');
const results = await resource.listPartition({
  partition: 'byType',
  partitionValues: { type: 'widget' }
});
console.log('Partition results:', results.length);

if (results.length === 0) {
  console.log('\n❌ PARTITION EMPTY - partitions not created!');

  // List all objects to see what's there
  const allKeys = await database.client.listObjects({ prefix: 'resource=test_items/' });
  console.log('\nAll keys in S3:');
  allKeys.forEach(key => console.log(' -', key));
} else {
  console.log('\n✅ PARTITION WORKING');
}

await database.disconnect();
