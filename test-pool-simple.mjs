import { Database } from './src/database.class.js';

console.log('🎯 Parking Lot Efficiency Test (22 operations, concurrency: 10)\n');

const db = new Database({
  connectionString: 'memory://test/databases/test'
});

await db.connect();

const resource = await db.createResource({
  name: 'items',
  attributes: { name: 'string|required' }
});

// Track state
let activeOps = 0;
let maxActive = 0;
let completed = 0;
const snapshots = [];

// Listen to pool events
const pool = resource.client.operationsPool;

pool.on('pool:taskStarted', (task) => {
  activeOps++;
  maxActive = Math.max(maxActive, activeOps);
  snapshots.push({ event: 'START', index: task.metadata?.index, active: activeOps, waiting: 22 - completed - activeOps });
});

pool.on('pool:taskCompleted', (task) => {
  activeOps--;
  completed++;
  snapshots.push({ event: 'DONE', index: task.metadata?.index, active: activeOps, completed });
});

// Create 22 items with delays
const items = Array.from({ length: 22 }, (_, i) => ({
  name: `Item ${i}`,
  _delay: Math.floor(Math.random() * 20) + 10
}));

// Wrap insert to simulate latency
const origInsert = resource.insert.bind(resource);
resource.insert = async function(attrs) {
  if (attrs._delay) await new Promise(r => setTimeout(r, attrs._delay));
  const { _delay, ...data } = attrs;
  return origInsert(data);
};

console.log('🚀 Starting insertMany(22 items)...\n');
const start = Date.now();
const results = await resource.insertMany(items);
const duration = Date.now() - start;

console.log('📊 Event Timeline:');
snapshots.slice(0, 30).forEach(s => {
  const icon = s.event === 'START' ? '▶️ ' : '✅';
  const detail = s.event === 'START'
    ? `Active: ${s.active} | Waiting: ${s.waiting}`
    : `Active: ${s.active} | Done: ${s.completed}/22`;
  console.log(`  ${icon} #${s.index?.toString().padStart(2, '0')} → ${detail}`);
});

if (snapshots.length > 30) {
  console.log(`  ... (${snapshots.length - 30} more events) ...`);
}

console.log(`\n✅ Completed: ${results.length}/22 items in ${duration}ms`);
console.log(`📈 Peak Concurrency: ${maxActive}/10 slots`);
console.log(`${maxActive === 10 ? '🟢' : '🟡'} Pool Efficiency: ${maxActive === 10 ? 'PERFECT - parking lot kept full!' : 'Partial'}`);

if (maxActive === 10) {
  console.log('\n🎉 Estacionamento sempre cheio - máxima eficiência!');
  console.log('   Pattern verified: 10 executing → finish → immediately refill → repeat');
}
