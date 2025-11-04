/**
 * Example 68: SafeEventEmitter - Auto-cleanup EventEmitter
 *
 * Problem: EventEmitter listeners leak memory on nodemon restart (SIGTERM).
 * Solution: SafeEventEmitter auto-removes ALL listeners on process signals.
 *
 * Run: node docs/examples/e68-safe-event-emitter.js
 */

import { SafeEventEmitter, Database } from '../../src/index.js';

console.log('='.repeat(80));
console.log('Example 68: SafeEventEmitter - Auto-cleanup EventEmitter');
console.log('='.repeat(80));
console.log();

// ============================================================================
// Level 1: Basic Usage - Drop-in EventEmitter Replacement
// ============================================================================

console.log('--- Level 1: Basic Usage ---');

// ❌ OLD WAY (memory leak on nodemon restart):
// import EventEmitter from 'events';
// class MyService extends EventEmitter {}

// ✅ NEW WAY (auto-cleanup on SIGTERM/SIGINT):
class MyService extends SafeEventEmitter {
  constructor() {
    super({ verbose: true });
  }

  processData(data) {
    this.emit('data:processed', data);
  }
}

const service = new MyService();

service.on('data:processed', (data) => {
  console.log(`[Service] Data processed: ${data}`);
});

service.processData('test-data');

console.log('✓ Service created with auto-cleanup');
console.log();

// ============================================================================
// Level 2: Database with Auto-cleanup Listeners
// ============================================================================

console.log('--- Level 2: Database Integration ---');

const db = new Database({
  connectionString: 'memory://test/db',
  verbose: true // Database now extends SafeEventEmitter!
});

await db.connect();

// All listeners auto-cleanup on SIGTERM/SIGINT
db.on('resource:created', (data) => {
  console.log(`[DB Event] Resource created: ${data.name}`);
});

db.on('resource:updated', (data) => {
  console.log(`[DB Event] Resource updated: ${data.id}`);
});

db.on('resource:deleted', (data) => {
  console.log(`[DB Event] Resource deleted: ${data.id}`);
});

await db.createResource({
  name: 'users',
  attributes: { email: 'string|required' }
});

console.log('✓ Database events registered with auto-cleanup');
console.log();

// ============================================================================
// Level 3: Listener Statistics
// ============================================================================

console.log('--- Level 3: Listener Statistics ---');

console.log('Database listener stats:');
console.log('  Per-event:', db.getListenerStats());
console.log('  Total listeners:', db.getTotalListenerCount());
console.log();

// ============================================================================
// Level 4: Manual Cleanup
// ============================================================================

console.log('--- Level 4: Manual Cleanup ---');

console.log('Before destroy:');
console.log('  Total listeners:', db.getTotalListenerCount());
console.log('  Is destroyed:', db.isDestroyed());
console.log();

// Manually destroy (removes all listeners)
db.destroy();

console.log('After destroy:');
console.log('  Total listeners:', db.getTotalListenerCount());
console.log('  Is destroyed:', db.isDestroyed());
console.log();

// ============================================================================
// Level 5: Custom Service with Events
// ============================================================================

console.log('--- Level 5: Custom Service ---');

class DataProcessor extends SafeEventEmitter {
  constructor() {
    super({ verbose: false });
    this.queue = [];
    this.processed = 0;
  }

  add(item) {
    this.queue.push(item);
    this.emit('item:added', item);
  }

  process() {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      this.emit('item:processing', item);

      // Simulate processing
      this.processed++;

      this.emit('item:processed', item);
    }

    this.emit('queue:empty', this.processed);
  }
}

const processor = new DataProcessor();

processor.on('item:added', (item) => {
  console.log(`[Processor] Item added: ${item}`);
});

processor.on('item:processed', (item) => {
  console.log(`[Processor] Item processed: ${item}`);
});

processor.on('queue:empty', (count) => {
  console.log(`[Processor] Queue empty! Processed ${count} items`);
});

processor.add('task-1');
processor.add('task-2');
processor.add('task-3');

processor.process();

console.log('✓ Custom service with multiple event types');
console.log();

// ============================================================================
// Level 6: Comparison - With vs Without SafeEventEmitter
// ============================================================================

console.log('--- Level 6: Comparison ---');
console.log();
console.log('❌ WITHOUT SafeEventEmitter (memory leak):');
console.log('  import EventEmitter from "events";');
console.log('  class Service extends EventEmitter {}');
console.log('  service.on("event", handler);');
console.log('  // nodemon restart → listeners NOT removed → memory leak!');
console.log('  // 10 restarts = 10x listeners still in memory');
console.log();
console.log('✅ WITH SafeEventEmitter (no leak):');
console.log('  import { SafeEventEmitter } from "s3db.js";');
console.log('  class Service extends SafeEventEmitter {}');
console.log('  service.on("event", handler);');
console.log('  // nodemon restart → SIGTERM → auto cleanup!');
console.log('  // 10 restarts = 0 leaked listeners');
console.log();

// ============================================================================
// Level 7: Production Example
// ============================================================================

console.log('--- Level 7: Production Example ---');

class WorkerService extends SafeEventEmitter {
  constructor() {
    super({ verbose: true });
    this.tasks = [];
    this.stats = { completed: 0, failed: 0 };
  }

  async addTask(task) {
    this.tasks.push(task);
    this.emit('task:queued', task);
  }

  async processTask(task) {
    try {
      this.emit('task:started', task);

      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 10));

      this.stats.completed++;
      this.emit('task:completed', task);
    } catch (error) {
      this.stats.failed++;
      this.emit('task:failed', { task, error });
    }
  }

  async start() {
    this.emit('worker:started');

    while (this.tasks.length > 0) {
      const task = this.tasks.shift();
      await this.processTask(task);
    }

    this.emit('worker:completed', this.stats);
  }
}

const worker = new WorkerService();

worker.on('worker:started', () => {
  console.log('[Worker] Started processing tasks');
});

worker.on('task:completed', (task) => {
  console.log(`[Worker] Task completed: ${task.id}`);
});

worker.on('worker:completed', (stats) => {
  console.log(`[Worker] Finished! Completed: ${stats.completed}, Failed: ${stats.failed}`);
});

await worker.addTask({ id: 'task-1', data: 'foo' });
await worker.addTask({ id: 'task-2', data: 'bar' });
await worker.addTask({ id: 'task-3', data: 'baz' });

await worker.start();

console.log('✓ Production worker with event tracking');
console.log();

// ============================================================================
// Summary
// ============================================================================

console.log('='.repeat(80));
console.log('Summary: SafeEventEmitter Benefits');
console.log('='.repeat(80));
console.log();
console.log('✅ Drop-in replacement for EventEmitter');
console.log('✅ Auto-cleanup on SIGTERM/SIGINT/beforeExit');
console.log('✅ Prevents memory leaks from listeners');
console.log('✅ Database class now uses SafeEventEmitter');
console.log('✅ Custom services can extend SafeEventEmitter');
console.log('✅ getListenerStats() for monitoring');
console.log('✅ destroy() for manual cleanup');
console.log();
console.log('Nodemon restarts: 0 leaked listeners! 🎉');
console.log('='.repeat(80));

// Cleanup for demo
processor.destroy();
processor.removeSignalHandlers();
service.destroy();
service.removeSignalHandlers();
worker.destroy();
worker.removeSignalHandlers();

process.exit(0);
