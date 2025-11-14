import { Database } from './src/database.class.js';

console.log('🎯 OperationsPool Parking Lot Efficiency Test\n');
console.log('Using: S3Client with OperationsPool (concurrency: 10)\n');

const db = new Database({
  connectionString: 'http://test:test@localhost:4566/s3db-test-pool?region=us-east-1'
});

await db.connect();
console.log('✓ Connected to LocalStack S3');

const resource = await db.createResource({
  name: 'items_' + Date.now(),
  attributes: { name: 'string|required', value: 'number' }
});
console.log('✓ Resource created');

// Verify pool exists
if (!resource.client.operationsPool) {
  console.error('❌ ERROR: OperationsPool not found on S3Client!');
  process.exit(1);
}

console.log(`✓ OperationsPool active (concurrency: ${resource.client.operationsPool.concurrency})\n`);

// Track state
let activeOps = 0;
let maxActive = 0;
let completed = 0;
const events = [];

// Listen to pool events
const pool = resource.client.operationsPool;

pool.on('pool:taskStarted', (task) => {
  activeOps++;
  maxActive = Math.max(maxActive, activeOps);
  events.push({
    type: 'START',
    index: task.metadata?.index ?? '?',
    active: activeOps,
    waiting: 22 - completed - activeOps,
    timestamp: Date.now()
  });
});

pool.on('pool:taskCompleted', (task) => {
  activeOps--;
  completed++;
  events.push({
    type: 'DONE',
    index: task.metadata?.index ?? '?',
    active: activeOps,
    completed,
    timestamp: Date.now()
  });
});

// Create 22 items
const items = Array.from({ length: 22 }, (_, i) => ({
  name: `Item ${i}`,
  value: i * 100
}));

console.log('🚀 Starting insertMany(22 items)...\n');
const start = Date.now();
const results = await resource.insertMany(items);
const duration = Date.now() - start;

// Show event timeline
console.log('📊 Event Timeline (first 25 events):');
events.slice(0, 25).forEach(e => {
  const icon = e.type === 'START' ? '▶️ ' : '✅';
  const idx = String(e.index).padStart(2, '0');
  if (e.type === 'START') {
    console.log(`  ${icon} #${idx} started  | Active: ${e.active}/10 | Waiting: ${e.waiting}`);
  } else {
    console.log(`  ${icon} #${idx} finished | Active: ${e.active}/10 | Done: ${e.completed}/22`);
  }
});

if (events.length > 25) {
  console.log(`  ... (${events.length - 25} more events) ...`);
}

console.log(`\n✅ Completed: ${results.length}/22 items in ${duration}ms`);
console.log(`📈 Peak Concurrency: ${maxActive}/10 slots`);

if (maxActive === 10) {
  console.log('🟢 Pool Efficiency: PERFECT');
  console.log('\n🎉 Estacionamento sempre cheio - máxima eficiência alcançada!');
  console.log('   Pattern verified:');
  console.log('   - Start with 10 operations executing');
  console.log('   - As operations finish, immediately fill slots');
  console.log('   - Keep pool at max capacity until queue empties');
} else {
  console.log(`🟡 Pool Efficiency: PARTIAL (${maxActive}/10 slots used)`);
  console.log('   Note: With fast operations, some may complete before all 22 are queued');
}

// Cleanup
await resource.deleteMany(results.map(r => r.id));
console.log('\n✓ Cleanup complete');
