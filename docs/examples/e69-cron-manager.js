/**
 * Example 69: CronManager - Centralized Cron Job Management
 *
 * Problem: setInterval creates memory leaks on nodemon restart (SIGTERM).
 * Solution: CronManager auto-stops ALL cron jobs on process signals.
 *
 * Benefits over setInterval:
 * - Cron expressions (more powerful than fixed intervals)
 * - Auto-cleanup on SIGTERM/SIGINT
 * - Named jobs for debugging
 * - Timezone support
 * - No memory leaks!
 *
 * Run: node docs/examples/e69-cron-manager.js
 */

import { getCronManager, CRON_PRESETS, intervalToCron, Database } from '../../src/index.js';

console.log('='.repeat(80));
console.log('Example 69: CronManager - Centralized Cron Job Management');
console.log('='.repeat(80));
console.log();

// ============================================================================
// Level 1: Basic Usage - Replace setInterval with Cron
// ============================================================================

console.log('--- Level 1: Basic Usage ---');

// ❌ OLD WAY (memory leak on nodemon restart):
// const id = setInterval(() => {
//   console.log('Task running...');
// }, 5000);
// Problem: nodemon restart → interval keeps running → memory leak!

// ✅ NEW WAY (auto-cleanup on SIGTERM/SIGINT):
const cronManager = getCronManager({ verbose: true });

await cronManager.scheduleInterval(
  5000, // Every 5 seconds
  () => {
    console.log('[Task] Running every 5 seconds');
  },
  'heartbeat-task'
);

console.log('✓ Task scheduled with auto-cleanup');
console.log();

// ============================================================================
// IMPORTANT: Context Preservation with Arrow Functions
// ============================================================================

console.log('--- IMPORTANT: Context Preservation ---');

class MyPlugin {
  constructor() {
    this.count = 0;
    this.database = { name: 'mydb' };
  }

  // ❌ WRONG: Context (this) will be lost!
  badExample() {
    cronManager.scheduleInterval(
      1000,
      this.incrementCounter,  // ← `this` will be undefined inside incrementCounter!
      'bad-example'
    );
  }

  // ✅ CORRECT: Arrow function preserves context
  goodExample() {
    cronManager.scheduleInterval(
      1000,
      () => this.incrementCounter(),  // ← `this` is preserved! ✅
      'good-example'
    );
  }

  // ✅ ALTERNATIVE: .bind() also works
  alternativeExample() {
    cronManager.scheduleInterval(
      1000,
      this.incrementCounter.bind(this),  // ← `this` is bound! ✅
      'alternative-example'
    );
  }

  incrementCounter() {
    this.count++;  // Works only if `this` is preserved!
    console.log(`Count: ${this.count}, DB: ${this.database.name}`);
  }
}

const plugin = new MyPlugin();

// ✅ ALWAYS use arrow functions when passing class methods
plugin.goodExample();

console.log('✓ Always use arrow functions: () => this.method()');
console.log('✓ Never pass methods directly: this.method');
console.log();

// Stop the example job
cronManager.stop('good-example');

// ============================================================================
// Level 2: Cron Expressions - More Power Than setInterval
// ============================================================================

console.log('--- Level 2: Cron Expressions ---');

// Using cron presets
await cronManager.schedule(
  CRON_PRESETS.EVERY_10_SECONDS,
  () => {
    console.log('[Cron] Every 10 seconds (cron expression)');
  },
  'cron-10s'
);

// Re-scheduling with the same name automatically replaces the previous job.
// Pass { replace: false } if you want the old guard-rail behaviour.
await cronManager.schedule(
  CRON_PRESETS.EVERY_MINUTE,
  () => {
    console.log('[Cron] Every minute - replacement demo');
  },
  'cron-10s'
);

// Explicitly opt-out of replacement to surface duplicates.
try {
  await cronManager.schedule(
    CRON_PRESETS.EVERY_MINUTE,
    () => {},
    'cron-throw',
    { replace: false }
  );
  await cronManager.schedule(
    CRON_PRESETS.EVERY_MINUTE,
    () => {},
    'cron-throw',
    { replace: false }
  );
} catch (error) {
  console.log('Expected duplicate guard:', error.message);
}

// Custom cron expression (every minute at :30 seconds)
await cronManager.schedule(
  '30 * * * * *', // sec min hour day month weekday
  () => {
    console.log('[Cron] Every minute at :30 seconds');
  },
  'cron-custom'
);

console.log('✓ Cron expressions scheduled');
console.log();

// ============================================================================
// Level 3: Database Integration
// ============================================================================

console.log('--- Level 3: Database Integration ---');

const db = new Database({
  connectionString: 'memory://test/db',
  verbose: false
});

await db.connect();

// Database now has CronManager!
db.cronManager.schedule(
  CRON_PRESETS.EVERY_30_SECONDS,
  async () => {
    // Example: cleanup old records every 30 seconds
    console.log('[DB] Running database cleanup task');
  },
  'db-cleanup'
);

console.log('✓ Database integration working');
console.log();

// ============================================================================
// Level 4: Timezone Support
// ============================================================================

console.log('--- Level 4: Timezone Support ---');

// Schedule task for specific timezone
await cronManager.schedule(
  '0 9 * * *', // 9 AM
  () => {
    console.log('[Timezone] Good morning from New York!');
  },
  'morning-ny',
  { timezone: 'America/New_York' }
);

await cronManager.schedule(
  '0 9 * * *', // 9 AM
  () => {
    console.log('[Timezone] Good morning from Tokyo!');
  },
  'morning-tokyo',
  { timezone: 'Asia/Tokyo' }
);

console.log('✓ Timezone-aware jobs scheduled');
console.log();

// ============================================================================
// Level 5: Interval to Cron Conversion
// ============================================================================

console.log('--- Level 5: Interval Conversion ---');

// Helper to convert milliseconds to cron
console.log('Interval conversions:');
console.log('  5 seconds  →', intervalToCron(5000));
console.log('  1 minute   →', intervalToCron(60000));
console.log('  10 minutes →', intervalToCron(600000));
console.log('  1 hour     →', intervalToCron(3600000));
console.log('  1 day      →', intervalToCron(86400000));
console.log();

// ============================================================================
// Level 6: Job Management and Statistics
// ============================================================================

console.log('--- Level 6: Job Management ---');

const stats = cronManager.getStats();
console.log('CronManager stats:');
console.log('  Total jobs:', stats.totalJobs);
console.log('  Job names:', stats.jobs.map(j => j.name).join(', '));
console.log('  Is destroyed:', stats.isDestroyed);
console.log();

// Stop a specific job
console.log('Stopping "cron-10s" job...');
cronManager.stop('cron-10s');
cronManager.stop('cron-throw');

const updatedStats = cronManager.getStats();
console.log('After stopping:');
console.log('  Total jobs:', updatedStats.totalJobs);
console.log();

// ============================================================================
// Level 7: Plugin Integration Pattern
// ============================================================================

console.log('--- Level 7: Plugin Pattern ---');

class MyCustomPlugin {
  constructor() {
    this.name = 'MyCustomPlugin';
    this.cronManager = null;
  }

  async initialize(database) {
    // Get CronManager from database
    this.cronManager = database.cronManager;

    // Schedule plugin tasks
    await this.cronManager.schedule(
      CRON_PRESETS.EVERY_MINUTE,
      () => this.performTask(),
      `${this.name}-task`
    );

    console.log(`[${this.name}] Initialized with cron jobs`);
  }

  performTask() {
    console.log(`[${this.name}] Performing scheduled task`);
  }

  async stop() {
    // Stop plugin jobs
    this.cronManager.stop(`${this.name}-task`);
    console.log(`[${this.name}] Stopped all jobs`);
  }
}

const plugin = new MyCustomPlugin();
await plugin.initialize(db);

console.log('✓ Plugin pattern demonstrated');
console.log();

// ============================================================================
// Level 8: Production Example - Cache Cleanup
// ============================================================================

console.log('--- Level 8: Production Example ---');

class CacheManager {
  constructor(cronManager) {
    this.cronManager = cronManager;
    this.cache = new Map();
    this.stats = { cleaned: 0, total: 0 };
  }

  async start() {
    // Cleanup expired cache every 5 minutes
    await this.cronManager.schedule(
      CRON_PRESETS.EVERY_5_MINUTES,
      () => this.cleanExpired(),
      'cache-cleanup'
    );

    // Generate stats report every hour
    await this.cronManager.schedule(
      CRON_PRESETS.EVERY_HOUR,
      () => this.reportStats(),
      'cache-stats'
    );

    // Full cache reset every day at midnight
    await this.cronManager.schedule(
      CRON_PRESETS.EVERY_DAY,
      () => this.fullReset(),
      'cache-reset'
    );

    console.log('[CacheManager] Started with 3 cron jobs');
  }

  cleanExpired() {
    const before = this.cache.size;
    // Cleanup logic here...
    const after = this.cache.size;
    this.stats.cleaned += (before - after);
    console.log(`[CacheManager] Cleaned ${before - after} expired entries`);
  }

  reportStats() {
    console.log(`[CacheManager] Stats - Total: ${this.stats.total}, Cleaned: ${this.stats.cleaned}`);
  }

  fullReset() {
    this.cache.clear();
    this.stats = { cleaned: 0, total: 0 };
    console.log('[CacheManager] Full cache reset performed');
  }

  async stop() {
    this.cronManager.stop('cache-cleanup');
    this.cronManager.stop('cache-stats');
    this.cronManager.stop('cache-reset');
    console.log('[CacheManager] Stopped all jobs');
  }
}

const cacheManager = new CacheManager(cronManager);
await cacheManager.start();

console.log('✓ Production cache manager example');
console.log();

// ============================================================================
// Level 9: Advanced - Business Hours Scheduling
// ============================================================================

console.log('--- Level 9: Business Hours ---');

// Only run during business hours (9 AM - 5 PM, weekdays)
await cronManager.schedule(
  '0 9-17 * * 1-5', // Every hour from 9-5, Mon-Fri
  () => {
    console.log('[Business] Task running during business hours');
  },
  'business-hours-task'
);

// End of day report (5 PM, weekdays)
await cronManager.schedule(
  CRON_PRESETS.BUSINESS_HOURS_END,
  () => {
    console.log('[Business] End of day report generated');
  },
  'eod-report'
);

console.log('✓ Business hours scheduling configured');
console.log();

// ============================================================================
// Level 10: Comparison - setInterval vs CronManager
// ============================================================================

console.log('--- Level 10: Comparison ---');
console.log();
console.log('❌ WITHOUT CronManager (setInterval):');
console.log('  const id = setInterval(() => { /* task */ }, 5000);');
console.log('  Problem: nodemon restart → interval NOT cleared → memory leak!');
console.log('  10 restarts = 10x intervals still running = BOOM 💥');
console.log();
console.log('✅ WITH CronManager:');
console.log('  await cronManager.scheduleInterval(5000, () => { /* task */ }, "name");');
console.log('  Solution: nodemon restart (SIGTERM) → auto cleanup!');
console.log('  10 restarts = always 1 job running = Happy! 😊');
console.log();
console.log('Bonus benefits:');
console.log('  ✓ Cron expressions (more powerful than intervals)');
console.log('  ✓ Named jobs (better debugging)');
console.log('  ✓ Timezone support');
console.log('  ✓ Centralized management');
console.log('  ✓ Job statistics');
console.log();

// ============================================================================
// Cleanup for Demo
// ============================================================================

console.log('='.repeat(80));
console.log('Cleaning up demo...');
console.log('='.repeat(80));
console.log();

// Stop specific jobs
await plugin.stop();
await cacheManager.stop();

// Get final stats
const finalStats = cronManager.getStats();
console.log('Final stats:');
console.log('  Total jobs remaining:', finalStats.totalJobs);
console.log('  Job names:', finalStats.jobs.map(j => j.name).join(', '));
console.log();

// Cleanup
await db.disconnect();
cronManager.removeSignalHandlers();

console.log('='.repeat(80));
console.log('Summary: CronManager Benefits');
console.log('='.repeat(80));
console.log();
console.log('✅ Cron expressions (more powerful than setInterval)');
console.log('✅ Auto-cleanup on SIGTERM/SIGINT/beforeExit');
console.log('✅ Prevents memory leaks from lingering jobs');
console.log('✅ Named jobs for debugging');
console.log('✅ Timezone support');
console.log('✅ Centralized job management');
console.log('✅ Database class now uses CronManager');
console.log('✅ Plugins can use CronManager via database.cronManager');
console.log('✅ Helper utilities (intervalToCron, CRON_PRESETS)');
console.log();
console.log('Nodemon restarts: 0 leaked jobs! 🎉');
console.log('='.repeat(80));

process.exit(0);
