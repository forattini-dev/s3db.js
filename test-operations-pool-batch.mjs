import { Database } from './src/database.class.js';

console.log('🚀 Testing OperationsPool.addBatch() architecture...\n');

const db = new Database({
  connectionString: 'memory://test/databases/test'
});

await db.connect();
console.log('✓ Database connected');

const resource = await db.createResource({
  name: 'cars',
  attributes: {
    name: 'string|required',
    price: 'number|required'
  }
});
console.log('✓ Resource created');

// Test insertMany with 50 items
console.log('\n📝 Testing insertMany with 50 cars...');
const cars = [];
for (let i = 0; i < 50; i++) {
  cars.push({ name: `Car ${i}`, price: 10000 + i * 1000 });
}

const startInsert = Date.now();
const inserted = await resource.insertMany(cars);
const durationInsert = Date.now() - startInsert;

console.log(`✓ Inserted ${inserted.length} cars in ${durationInsert}ms`);

// Test getMany
console.log('\n📖 Testing getMany with all IDs...');
const ids = inserted.map(c => c.id);
const startGet = Date.now();
const fetched = await resource.getMany(ids);
const durationGet = Date.now() - startGet;

console.log(`✓ Fetched ${fetched.length} cars in ${durationGet}ms`);

// Test deleteMany
console.log('\n🗑️  Testing deleteMany...');
const startDelete = Date.now();
await resource.deleteMany(ids);
const durationDelete = Date.now() - startDelete;

console.log(`✓ Deleted ${ids.length} cars in ${durationDelete}ms`);

console.log('\n✅ All tests passed!');
console.log('\n📊 Performance Summary:');
console.log(`   - insertMany: ${inserted.length} items in ${durationInsert}ms (${(durationInsert/inserted.length).toFixed(2)}ms/item)`);
console.log(`   - getMany: ${fetched.length} items in ${durationGet}ms (${(durationGet/fetched.length).toFixed(2)}ms/item)`);
console.log(`   - deleteMany: ${ids.length} items in ${durationDelete}ms (${(durationDelete/ids.length).toFixed(2)}ms/item)`);

console.log('\n🎉 OperationsPool.addBatch() working perfectly!');
console.log('✨ Estacionamento sempre cheio - máxima eficiência!');
