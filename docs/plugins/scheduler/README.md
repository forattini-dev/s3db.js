# ⏰ Scheduler Plugin

> **Cron-based job orchestration with retries, distributed locks, and job history.**
>
> **Navigation:** [← Plugin Index](../README.md) | [Guides ↓](#-documentation-index) | [FAQ ↓](./guides/best-practices.md#-faq)

---

## 📋 Documentation Index

Complete documentation organized by topic. Start here to find what you need.

### Quick Start
- [⚡ TLDR](#-tldr) - 30-second overview
- [⚡ Quick Start](#-quick-start) - Get running in minutes
- [📦 Dependencies](#-dependencies) - What you need

### By Guide

| Guide | Focus |
|-------|-------|
| **[Configuration](./guides/configuration.md)** | Plugin options & usage examples |
| **[Advanced Patterns](./guides/advanced-patterns.md)** | Job chains, dynamic scheduling, custom logic |
| **[Best Practices](./guides/best-practices.md)** | Error handling, monitoring, FAQ, troubleshooting |

### Getting Help

1. **Quick questions?** Check [FAQ](./guides/best-practices.md#-faq)
2. **Configuration help?** See [Configuration Guide](./guides/configuration.md)
3. **Advanced workflows?** See [Advanced Patterns Guide](./guides/advanced-patterns.md)
4. **Troubleshooting?** See [Best Practices Guide](./guides/best-practices.md#troubleshooting)

---

## 📦 Dependencies

The Scheduler Plugin has **zero external dependencies** - it's built directly into s3db.js core.

**Peer Dependencies:** None required

**What's Included:**
- ✅ Cron parser (built-in)
- ✅ Job executor engine (built-in)
- ✅ Distributed locking via PluginStorage (built-in)
- ✅ Retry logic with exponential backoff (built-in)
- ✅ Timezone support (built-in)
- ✅ Event system (built-in)

**Installation:**
```javascript
import { Database, SchedulerPlugin } from 's3db.js';

await db.usePlugin(new SchedulerPlugin({
  jobs: {
    daily_cleanup: {
      schedule: '0 3 * * *',  // Daily at 3 AM
      action: async (db) => {
        // Your job logic
      }
    }
  }
}));
```

**No Additional Packages Needed:**
All scheduling functionality is built into the core package. Just configure your jobs and start scheduling!

---

## ⚡ TLDR

**Scheduled** jobs with cron expressions, automatic retry, and distributed locking for multi-instance deployments.

**Get started in 1 line:**
```javascript
await db.usePlugin(new SchedulerPlugin({ jobs: { daily_cleanup: { schedule: '0 3 * * *', action: async (db) => { /* cleanup */ } }}}));
```

**Key features:**
- ✅ Cron expressions with timezone support
- ✅ Automatic retry with exponential backoff
- ✅ Distributed locking (multi-instance safe)
- ✅ Job history with optimized partitions
- ✅ Complete event system

**When to use:**
- 🧹 Cleanup expired data
- 📊 Generate periodic reports
- 💰 Monthly/weekly billing
- 📧 Reminder emails
- 🔄 Data synchronization

---

## ⚡ Quick Start

Schedule your first job in under 2 minutes:

```javascript
import { Database, SchedulerPlugin } from 's3db.js';

// Step 1: Create database
const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

// Step 2: Create a resource to track (example: sessions)
const sessions = await db.createResource({
  name: 'sessions',
  attributes: {
    userId: 'string|required',
    expiresAt: 'number|required',
    active: 'boolean'
  }
});

// Step 3: Configure scheduler
const schedulerPlugin = new SchedulerPlugin({
  jobs: {
    // Clean up expired sessions every hour
    cleanup_sessions: {
      schedule: '0 * * * *',     // Every hour at minute 0
      action: async (db) => {
        const now = Date.now();
        const sessions = db.resources.sessions;

        // Find expired sessions
        const expired = await sessions.query({
          expiresAt: { $lt: now },
          active: true
        });

        console.log(`Found ${expired.length} expired sessions to clean up`);

        // Mark as inactive
        for (const session of expired) {
          await sessions.update(session.id, { active: false });
        }

        return { cleaned: expired.length };
      },
      retries: 3,
      timeout: 30000  // 30 seconds
    },

    // Daily report at 8am
    daily_report: {
      schedule: '0 8 * * *',     // Every day at 8am
      timezone: 'America/New_York',
      action: async (db) => {
        const sessions = db.resources.sessions;
        const count = await sessions.count();

        console.log(`Daily Report: ${count} total sessions`);

        return { totalSessions: count };
      }
    }
  }
});

await db.usePlugin(schedulerPlugin);

// Step 4: Start the scheduler
await schedulerPlugin.start();
console.log('Scheduler started! Jobs will run on schedule.');

// Jobs run automatically based on schedule!
// cleanup_sessions → runs every hour
// daily_report     → runs every day at 8am EST

// Step 5: Monitor job execution
schedulerPlugin.on('jobStarted', ({ jobName, scheduledTime }) => {
  console.log(`Job ${jobName} started at ${new Date(scheduledTime)}`);
});

schedulerPlugin.on('jobCompleted', ({ jobName, result, duration }) => {
  console.log(`Job ${jobName} completed in ${duration}ms:`, result);
});

schedulerPlugin.on('jobFailed', ({ jobName, error, attempts }) => {
  console.error(`Job ${jobName} failed (attempt ${attempts}):`, error.message);
});

// Step 6: Manually trigger a job (optional)
await schedulerPlugin.runJob('cleanup_sessions');
console.log('Manual job execution completed');

// Step 7: Stop scheduler when done (optional)
// await schedulerPlugin.stop();
```

**What just happened:**
1. ✅ Scheduler configured with 2 jobs (hourly cleanup + daily report)
2. ✅ Jobs run automatically based on cron schedule
3. ✅ Automatic retry on failure (3 attempts)
4. ✅ Job history tracked in database

**Next steps:**
- Configure timezone-aware schedules (see [Configuration Guide](./guides/configuration.md))
- View job history and monitoring (see [Configuration Guide](./guides/configuration.md#api-reference))
- Learn about coordinator mode for multi-instance deployments (see below)

---

## 🔀 Coordinator Mode

### Why Coordinator Mode?

In multi-pod/multi-instance deployments, we need **exactly one instance** to run scheduled jobs to avoid:
- ❌ Duplicate job execution
- ❌ Race conditions when checking job schedules
- ❌ Wasted resources from redundant cron evaluations

**Coordinator Mode solves this** by automatically electing one instance as the "coordinator" responsible for running all scheduled jobs. All other instances remain idle for scheduling (but can be used for other work).

### Key Benefits

- ✅ **Automatic Election**: No manual configuration, works out-of-the-box
- ✅ **Fault Tolerance**: If coordinator dies, new one is elected automatically
- ✅ **Zero Duplication**: Only coordinator runs scheduled jobs
- ✅ **Scalable**: Add/remove instances without breaking job scheduling
- ✅ **Resource Efficient**: No wasted cron evaluation across instances

### Quick Example

```javascript
// Multi-instance deployment - NO changes needed!
// Instance 1
const schedulerA = new SchedulerPlugin({
  jobs: {
    daily_cleanup: {
      schedule: '0 3 * * *',
      action: async (db) => { /* cleanup */ }
    }
  },
  enableCoordinator: true  // Enabled by default
});

// Instance 2 (same config)
const schedulerB = new SchedulerPlugin({
  jobs: {
    daily_cleanup: {
      schedule: '0 3 * * *',
      action: async (db) => { /* cleanup */ }
    }
  },
  enableCoordinator: true
});

// Result: Only ONE instance runs the jobs
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableCoordinator` | boolean | `true` | Enable coordinator mode |
| `heartbeatInterval` | number | `30000` | Heartbeat frequency (ms) |
| `coldStartObservationWindow` | number | `15000` | Observation phase duration (ms) |
| `skipColdStart` | boolean | `false` | Skip cold start (testing only!) |

### Coordinator Events

```javascript
scheduler.on('plg:scheduler:coordinator-elected', ({ workerId, epoch }) => {
  console.log(`New coordinator: ${workerId}`);
});

scheduler.on('plg:scheduler:coordinator-promoted', ({ workerId }) => {
  console.log(`This worker is now coordinator`);
});

scheduler.on('plg:scheduler:job-started', ({ jobName }) => {
  console.log(`Coordinator started job: ${jobName}`);
});
```

### Learn More

📚 **[Full Coordinator Documentation →](../coordinator.md)**

Comprehensive guide covering:
- Election algorithm (lexicographic ordering)
- Epoch system (guaranteed leadership terms)
- Cold start phases (prevents race conditions)
- Troubleshooting multi-instance issues
- Implementation details for plugin developers

---

## Overview

The Scheduler Plugin provides robust job scheduling capabilities using cron expressions, retry logic, and comprehensive monitoring. It allows you to automate recurring tasks, maintenance operations, and time-based business processes within your s3db application.

### How It Works

1. **Cron-Based Scheduling**: Uses standard cron expressions for flexible scheduling
2. **Job Management**: Define jobs with actions, timeouts, and retry policies
3. **Automatic Execution**: Jobs run automatically based on their schedules
4. **Error Handling**: Built-in retry logic with exponential backoff
5. **Monitoring**: Track job execution, success rates, and performance

> ⏰ **Automated Operations**: Perfect for cleanup tasks, report generation, data synchronization, and any recurring operations.

---

## Key Features

### 🎯 Core Features
- **Cron Scheduling**: Standard cron expressions with timezone support
- **Job Management**: Enable/disable jobs, update schedules dynamically
- **Retry Logic**: Configurable retry attempts with exponential backoff
- **Timeout Handling**: Prevent long-running jobs from blocking the system
- **Job History**: Complete execution history with success/failure tracking
- **Distributed Locking**: Automatic prevention of concurrent execution across multiple instances

### 🔧 Technical Features
- **Timezone Support**: Schedule jobs in specific timezones
- **Job Concurrency**: Control concurrent job execution
- **Event System**: Monitor job execution through events
- **Job Persistence**: Store job configurations in the database
- **Performance Monitoring**: Track execution times and success rates
- **Multi-Instance Safe**: Built-in distributed locking prevents duplicate job execution
- **Optimized Queries**: Partition-based history queries for fast lookups

---

## See Also

- [Configuration Guide](./guides/configuration.md) - Complete options reference
- [Advanced Patterns Guide](./guides/advanced-patterns.md) - Complex workflows
- [Best Practices Guide](./guides/best-practices.md) - Production deployment
- [Coordinator Mode Documentation](../coordinator.md) - Multi-instance coordination
- [Plugin Development Guide](../plugin-development.md) - Extend functionality
