import { Database } from './src/database.class.js';

console.log('🎯 Visual Test: OperationsPool Parking Lot Efficiency\n');
console.log('Goal: Keep pool at max concurrency (10 slots) until all operations complete\n');

const db = new Database({
  connectionString: 'memory://test/databases/test'
});

await db.connect();
console.log('✓ Database connected');

const resource = await db.createResource({
  name: 'items',
  attributes: {
    name: 'string|required'
  }
});
console.log('✓ Resource created');

// Track active operations
let activeOps = 0;
let maxActiveOps = 0;
let completedOps = 0;
const totalOps = 22;
const events = [];

// Intercept pool events to track concurrency
resource.client.operationsPool.on('pool:taskStarted', (task) => {
  activeOps++;
  maxActiveOps = Math.max(maxActiveOps, activeOps);
  const event = `Started #${task.metadata?.index ?? '?'} | Active: ${activeOps} | Waiting: ${totalOps - completedOps - activeOps}`;
  events.push(`▶️  ${event}`);
});

resource.client.operationsPool.on('pool:taskCompleted', (task) => {
  activeOps--;
  completedOps++;
  const event = `Finished #${task.metadata?.index ?? '?'} | Active: ${activeOps} | Completed: ${completedOps}/${totalOps}`;
  events.push(`✅ ${event}`);
});

console.log('📝 Testing insertMany with 22 items (parallelism: 10)...\n');

// Create items with varying delays to simulate real S3 operations
const items = [];
for (let i = 0; i < 22; i++) {
  items.push({
    name: `Item ${i}`,
    _delay: Math.floor(Math.random() * 30) + 10 // 10-40ms random delay
  });
}

// Wrap insert to add artificial delay (simulating S3 latency)
const originalInsert = resource.insert.bind(resource);
resource.insert = async function(attributes) {
  const delay = attributes._delay || 0;
  await new Promise(resolve => setTimeout(resolve, delay));
  const { _delay, ...data } = attributes; // Remove delay field
  return originalInsert(data);
};

const startTime = Date.now();
const results = await resource.insertMany(items);
const duration = Date.now() - startTime;

console.log('\n🎬 Event Log (showing parking lot behavior):');
events.forEach(e => console.log(`  ${e}`));

console.log('\n✅ All operations completed!');
console.log('\n📊 Parking Lot Efficiency Report:');
console.log(`   - Total operations: ${totalOps}`);
console.log(`   - Duration: ${duration}ms`);
console.log(`   - Max concurrent: ${maxActiveOps}/10 slots`);
console.log(`   - Results: ${results.length} successful`);
console.log(`   - Pool efficiency: ${maxActiveOps === 10 ? '🟢 PERFECT' : '🟡 PARTIAL'} (kept parking lot full)`);

if (maxActiveOps === 10) {
  console.log('\n🎉 Estacionamento sempre cheio - máxima eficiência alcançada!');
  console.log('   Pattern: 10 executing → some finish → immediately fill slots → repeat');
} else {
  console.log(`\n⚠️  Warning: Expected 10 concurrent, got ${maxActiveOps}`);
}
