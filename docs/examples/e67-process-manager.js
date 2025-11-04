/**
 * Example 67: ProcessManager - Prevent Memory Leaks with Centralized Lifecycle Management
 *
 * Problem: setInterval/setTimeout without cleanup causes memory leaks in long-running servers.
 * Solution: Use ProcessManager to track and auto-cleanup ALL async operations on process exit.
 *
 * Run: node docs/examples/e67-process-manager.js
 */

import { ProcessManager, getProcessManager } from '../../src/concerns/process-manager.js';

console.log('='.repeat(80));
console.log('Example 67: ProcessManager - Prevent Memory Leaks');
console.log('='.repeat(80));
console.log();

// ============================================================================
// Level 1: Basic Usage - Intervals with Auto-Cleanup
// ============================================================================

console.log('--- Level 1: Basic Intervals ---');

const pm = new ProcessManager({ verbose: true });

// ❌ OLD WAY (memory leak on nodemon restart):
// setInterval(() => console.log('Health check'), 5000);

// ✅ NEW WAY (auto-cleanup on SIGTERM/SIGINT):
pm.setInterval(() => {
  console.log(`[${new Date().toISOString()}] Health check - All systems operational`);
}, 5000, 'health-check');

console.log('✓ Health check interval registered (auto-cleanup on exit)');
console.log();

// ============================================================================
// Level 2: Timeouts
// ============================================================================

console.log('--- Level 2: Timeouts ---');

// ❌ OLD WAY:
// setTimeout(() => console.log('Delayed task'), 10000);

// ✅ NEW WAY:
pm.setTimeout(() => {
  console.log('Delayed task executed!');
}, 10000, 'delayed-task');

console.log('✓ Timeout registered (auto-cleanup on exit)');
console.log();

// ============================================================================
// Level 3: Cleanup Functions (Workers, Database Connections, etc.)
// ============================================================================

console.log('--- Level 3: Cleanup Functions ---');

// Simulate a worker
const mockWorker = {
  isRunning: true,
  async stop() {
    console.log('  → Stopping worker...');
    await new Promise(resolve => setTimeout(resolve, 100));
    this.isRunning = false;
    console.log('  ✓ Worker stopped');
  }
};

// Simulate a database connection
const mockDb = {
  isConnected: true,
  async disconnect() {
    console.log('  → Disconnecting database...');
    await new Promise(resolve => setTimeout(resolve, 50));
    this.isConnected = false;
    console.log('  ✓ Database disconnected');
  }
};

// Register cleanups (run on shutdown)
pm.registerCleanup(async () => {
  await mockWorker.stop();
}, 'sqs-worker');

pm.registerCleanup(async () => {
  await mockDb.disconnect();
}, 'database');

console.log('✓ Cleanup functions registered');
console.log();

// ============================================================================
// Level 4: Status Reporting
// ============================================================================

console.log('--- Level 4: Status Reporting ---');

const status = pm.getStatus();
console.log('Current Status:');
console.log('  Intervals:', status.intervals.join(', '));
console.log('  Timeouts:', status.timeouts.join(', '));
console.log('  Cleanups:', status.cleanups.join(', '));
console.log('  Is Shutting Down:', status.isShuttingDown);
console.log();

// ============================================================================
// Level 5: Real-World Server Example
// ============================================================================

console.log('--- Level 5: Real-World Server Example ---');

// Simulate a server with multiple async operations
class MyServer {
  constructor() {
    this.pm = new ProcessManager({ verbose: true });
    this.requestCount = 0;
  }

  async start() {
    console.log('Server starting...');

    // Health check every 5 seconds
    this.pm.setInterval(() => {
      console.log(`Health: ${this.requestCount} requests processed`);
    }, 5000, 'server-health');

    // Metrics reporting every 10 seconds
    this.pm.setInterval(() => {
      console.log(`Metrics: ${this.requestCount} requests, ${process.memoryUsage().heapUsed / 1024 / 1024} MB RAM`);
    }, 10000, 'metrics-reporting');

    // Register cleanup for graceful shutdown
    this.pm.registerCleanup(async () => {
      console.log('  → Finishing in-flight requests...');
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('  ✓ All requests completed');
    }, 'finish-requests');

    console.log('Server started!');
    console.log();
  }

  async stop() {
    console.log('Server stopping...');
    await this.pm.shutdown();
    console.log('Server stopped!');
  }
}

const server = new MyServer();
await server.start();

console.log('✓ Server running with ProcessManager');
console.log('  Press Ctrl+C to trigger graceful shutdown');
console.log();

// ============================================================================
// Level 6: Singleton Pattern (Global Process Manager)
// ============================================================================

console.log('--- Level 6: Singleton Pattern ---');

// Get global instance (shared across modules)
const globalPm = getProcessManager({ verbose: false });

globalPm.setInterval(() => {
  console.log('[Global] Background task');
}, 15000, 'global-task');

console.log('✓ Global ProcessManager used (shared across modules)');
console.log();

// ============================================================================
// Level 7: Manual Shutdown (Testing)
// ============================================================================

console.log('--- Level 7: Manual Shutdown (Demo) ---');

// Simulate shutdown after 8 seconds
setTimeout(async () => {
  console.log();
  console.log('='.repeat(80));
  console.log('Triggering manual shutdown (simulating Ctrl+C)...');
  console.log('='.repeat(80));
  console.log();

  await server.stop();

  console.log();
  console.log('='.repeat(80));
  console.log('Shutdown complete! No memory leaks.');
  console.log('='.repeat(80));

  process.exit(0);
}, 8000);

// ============================================================================
// COMPARISON: With vs Without ProcessManager
// ============================================================================

console.log('--- Comparison ---');
console.log();
console.log('❌ WITHOUT ProcessManager (memory leak):');
console.log('  setInterval(() => healthCheck(), 5000);');
console.log('  // nodemon restart → old interval still running!');
console.log('  // 10 restarts → 10 intervals → memory leak!');
console.log();
console.log('✅ WITH ProcessManager (no leak):');
console.log('  pm.setInterval(() => healthCheck(), 5000, "health");');
console.log('  // nodemon restart → SIGTERM → auto cleanup');
console.log('  // 10 restarts → 0 leaked intervals → no leak!');
console.log();

console.log('='.repeat(80));
console.log('Server running... waiting for shutdown demo...');
console.log('='.repeat(80));
console.log();
