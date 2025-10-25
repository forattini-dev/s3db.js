# ⏰ Scheduler Plugin

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
- Add distributed locking for multi-instance deployments (see [Configuration Options](#configuration-options))
- Configure timezone-aware schedules (see [Usage Examples](#usage-examples))
- View job history and monitoring (see [API Reference](#api-reference))

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

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

## Installation & Setup

### Basic Setup

```javascript
import { S3db, SchedulerPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [
    new SchedulerPlugin({
      timezone: 'America/Sao_Paulo',
      jobs: {
        daily_cleanup: {
          schedule: '0 3 * * *', // 3 AM daily
          description: 'Clean up expired sessions',
          action: async (database, context) => {
            const expired = await database.resources.sessions.list({
              where: { expiresAt: { $lt: new Date() } }
            });
            
            for (const session of expired) {
              await database.resources.sessions.delete(session.id);
            }
            
            return { deleted: expired.length };
          },
          enabled: true,
          retries: 2,
          timeout: 30000
        },
        
        hourly_metrics: {
          schedule: '@hourly',
          description: 'Collect system metrics',
          action: async (database) => {
            const metrics = {
              timestamp: new Date().toISOString(),
              memory: process.memoryUsage(),
              uptime: process.uptime()
            };
            
            await database.resources.metrics.insert({
              id: `metrics_${Date.now()}`,
              ...metrics
            });
            
            return metrics;
          }
        }
      }
    })
  ]
});

await s3db.connect();
// Jobs will start running according to their schedules
```

### Plugin Resources

The SchedulerPlugin automatically creates internal resources:

| Resource | Purpose | Structure |
|----------|---------|-----------|
| `scheduler_job_locks` | Distributed locking for multi-instance safety | `{ id, jobName, lockedAt, instanceId }` |
| `plg:scheduler:job-executions` | Job execution history (when `persistJobs: true`) | Partitioned by job name and status for fast queries |

> **Automatic Management**: These resources are created automatically when the plugin starts. The lock resource ensures jobs run exactly once across multiple instances, and the history resource tracks all executions with partition-based indexing for optimal query performance.

---

## Configuration Options

### Plugin Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable scheduler globally |
| `timezone` | string | `'UTC'` | Default timezone for job schedules |
| `jobs` | object | `{}` | Job definitions |
| `maxConcurrentJobs` | number | `5` | Maximum concurrent job execution |
| `persistJobs` | boolean | `true` | Store job history in database |
| `historyResource` | string | `'plg:scheduler:job-history'` | Resource name for job execution history |
| `cleanupInterval` | number | `86400000` | Interval to cleanup old job history (24h) |
| `historyRetention` | number | `2592000000` | How long to keep job history (30 days) |

### Job Configuration

```javascript
jobs: {
  [jobName]: {
    schedule: string,              // Cron expression or preset
    description?: string,          // Job description
    action: function,              // Job function to execute
    enabled?: boolean,             // Enable/disable job (default: true)
    timezone?: string,             // Job-specific timezone
    retries?: number,              // Number of retries AFTER initial failure (default: 0)
                                   // e.g., retries: 3 = 4 total attempts (1 initial + 3 retries)
    timeout?: number,              // Timeout in milliseconds (default: 60000)
    runOnStart?: boolean,          // Run immediately on startup (default: false)
    context?: object               // Additional context data
  }
}
```

> **Retry Behavior**: The `retries` parameter specifies the number of retry attempts **after** the initial failure. For example:
> - `retries: 0` → 1 total attempt (no retries)
> - `retries: 3` → 4 total attempts (1 initial + 3 retries)
> - `retries: 5` → 6 total attempts (1 initial + 5 retries)

### Cron Expression Formats

```javascript
// Standard cron format: [second] minute hour day-of-month month day-of-week
'0 0 12 * * *'    // Daily at noon
'0 30 9 * * 1-5'  // Weekdays at 9:30 AM
'0 0 0 1 * *'     // First day of every month at midnight

// Preset expressions
'@yearly'    // Once a year (0 0 1 1 *)
'@monthly'   // Once a month (0 0 1 * *)
'@weekly'    // Once a week (0 0 * * 0)
'@daily'     // Once a day (0 0 * * *)
'@hourly'    // Once an hour (0 * * * *)

// Advanced expressions
'*/15 * * * *'    // Every 15 minutes
'0 0 */2 * *'     // Every other day at midnight
'0 0 9-17 * * 1-5' // Every hour from 9 AM to 5 PM, weekdays only
```

---

## Usage Examples

### Data Maintenance Jobs

```javascript
const maintenanceScheduler = new SchedulerPlugin({
  timezone: 'UTC',
  maxConcurrentJobs: 3,
  persistJobs: true,
  
  jobs: {
    // Daily cleanup at 2 AM
    cleanup_expired_data: {
      schedule: '0 2 * * *',
      description: 'Remove expired data from all resources',
      timeout: 300000, // 5 minutes
      retries: 2,
      action: async (database, context) => {
        const results = {
          sessions: 0,
          temp_files: 0,
          cache_entries: 0
        };
        
        // Clean up expired sessions
        const expiredSessions = await database.resources.sessions.list({
          filter: item => item.expires_at && new Date(item.expires_at) < new Date()
        });
        
        for (const session of expiredSessions) {
          await database.resources.sessions.delete(session.id);
          results.sessions++;
        }
        
        // Clean up temporary files older than 24 hours
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const oldTempFiles = await database.resources.temp_files.list({
          filter: item => new Date(item.created_at) < dayAgo
        });
        
        for (const file of oldTempFiles) {
          await database.resources.temp_files.delete(file.id);
          results.temp_files++;
        }
        
        // Clean up cache entries
        const expiredCache = await database.resources.cache_entries.list({
          filter: item => item.ttl && Date.now() > item.created_at + item.ttl
        });
        
        for (const entry of expiredCache) {
          await database.resources.cache_entries.delete(entry.id);
          results.cache_entries++;
        }
        
        console.log('Cleanup completed:', results);
        return results;
      }
    },
    
    // Weekly database optimization
    optimize_database: {
      schedule: '0 3 * * 0', // Sundays at 3 AM
      description: 'Optimize database performance',
      timeout: 600000, // 10 minutes
      action: async (database, context) => {
        const stats = {
          resources_analyzed: 0,
          indexes_rebuilt: 0,
          partitions_optimized: 0
        };
        
        // Get all resources
        const resources = await database.listResources();
        
        for (const resourceName of resources) {
          const resource = database.resources[resourceName];
          
          // Analyze resource usage
          const count = await resource.count();
          const sampleSize = Math.min(100, count);
          const samples = await resource.list({ limit: sampleSize });
          
          // Calculate average document size
          const totalSize = samples.reduce((sum, doc) => 
            sum + JSON.stringify(doc).length, 0);
          const avgSize = totalSize / sampleSize;
          
          stats.resources_analyzed++;
          
          // If average size is large, suggest optimization
          if (avgSize > 10000) {
            console.log(`Large documents detected in ${resourceName}: ${avgSize} bytes average`);
          }
        }
        
        return stats;
      }
    },
    
    // Hourly metrics collection
    collect_metrics: {
      schedule: '0 * * * *', // Every hour
      description: 'Collect system and application metrics',
      action: async (database, context) => {
        const metrics = {
          timestamp: new Date().toISOString(),
          system: {
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            cpu_usage: process.cpuUsage()
          },
          database: {},
          application: {}
        };
        
        // Collect database metrics
        try {
          const resources = await database.listResources();
          
          for (const resourceName of resources) {
            const resource = database.resources[resourceName];
            const count = await resource.count();
            metrics.database[resourceName] = { count };
          }
        } catch (error) {
          console.error('Error collecting database metrics:', error);
        }
        
        // Store metrics
        await database.resources.system_metrics.insert({
          id: `metrics_${Date.now()}`,
          ...metrics
        });
        
        return metrics;
      }
    }
  }
});
```

### Business Process Automation

```javascript
const businessScheduler = new SchedulerPlugin({
  timezone: 'America/New_York',
  
  jobs: {
    // Daily report generation
    generate_daily_reports: {
      schedule: '0 8 * * 1-5', // Weekdays at 8 AM
      description: 'Generate daily business reports',
      timeout: 180000, // 3 minutes
      retries: 3,
      action: async (database, context) => {
        const reportDate = new Date().toISOString().split('T')[0];
        
        // Sales report
        const orders = await database.resources.orders.list({
          filter: item => item.created_at?.startsWith(reportDate)
        });
        
        const salesReport = {
          date: reportDate,
          total_orders: orders.length,
          total_revenue: orders.reduce((sum, order) => sum + (order.amount || 0), 0),
          avg_order_value: orders.length > 0 ? 
            orders.reduce((sum, order) => sum + (order.amount || 0), 0) / orders.length : 0
        };
        
        // User activity report
        const activeUsers = await database.resources.user_sessions.list({
          filter: item => item.last_activity?.startsWith(reportDate)
        });
        
        const activityReport = {
          date: reportDate,
          active_users: new Set(activeUsers.map(s => s.user_id)).size,
          total_sessions: activeUsers.length
        };
        
        // Store reports
        await database.resources.daily_reports.insert({
          id: `report_${reportDate}`,
          type: 'daily_summary',
          generated_at: new Date().toISOString(),
          sales: salesReport,
          activity: activityReport
        });
        
        return { sales: salesReport, activity: activityReport };
      }
    },
    
    // Monthly subscription billing
    process_monthly_billing: {
      schedule: '0 9 1 * *', // First day of month at 9 AM
      description: 'Process monthly subscription billing',
      timeout: 1800000, // 30 minutes
      retries: 2,
      action: async (database, context) => {
        const billingMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const results = {
          processed: 0,
          failed: 0,
          total_amount: 0
        };
        
        // Get active subscriptions
        const subscriptions = await database.resources.subscriptions.list({
          filter: item => item.status === 'active' && item.billing_cycle === 'monthly'
        });
        
        for (const subscription of subscriptions) {
          try {
            // Check if already billed this month
            const existingBill = await database.resources.billing_records.list({
              filter: item => 
                item.subscription_id === subscription.id &&
                item.billing_period === billingMonth
            });
            
            if (existingBill.length > 0) {
              continue; // Already billed
            }
            
            // Create billing record
            const billingRecord = {
              id: `bill_${subscription.id}_${billingMonth}`,
              subscription_id: subscription.id,
              user_id: subscription.user_id,
              amount: subscription.price,
              billing_period: billingMonth,
              status: 'pending',
              created_at: new Date().toISOString()
            };
            
            await database.resources.billing_records.insert(billingRecord);
            
            // Here you would integrate with payment processor
            // For now, we'll just mark as processed
            billingRecord.status = 'processed';
            billingRecord.processed_at = new Date().toISOString();
            
            await database.resources.billing_records.update(billingRecord.id, billingRecord);
            
            results.processed++;
            results.total_amount += subscription.price;
            
          } catch (error) {
            console.error(`Billing failed for subscription ${subscription.id}:`, error);
            results.failed++;
          }
        }
        
        return results;
      }
    },
    
    // Weekly reminder emails
    send_weekly_reminders: {
      schedule: '0 10 * * 1', // Mondays at 10 AM
      description: 'Send weekly reminder emails',
      action: async (database, context) => {
        const results = { sent: 0, failed: 0 };
        
        // Get users who need reminders
        const users = await database.resources.users.list({
          filter: item => 
            item.email_preferences?.weekly_reminders !== false &&
            item.status === 'active'
        });
        
        for (const user of users) {
          try {
            // Check recent activity
            const recentActivity = await database.resources.user_activity.list({
              filter: item => 
                item.user_id === user.id &&
                new Date(item.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            });
            
            if (recentActivity.length === 0) {
              // Send reminder (integrate with email service)
              console.log(`Sending weekly reminder to ${user.email}`);
              
              // Log the reminder
              await database.resources.email_log.insert({
                id: `reminder_${user.id}_${Date.now()}`,
                user_id: user.id,
                email: user.email,
                type: 'weekly_reminder',
                sent_at: new Date().toISOString()
              });
              
              results.sent++;
            }
          } catch (error) {
            console.error(`Failed to send reminder to ${user.email}:`, error);
            results.failed++;
          }
        }
        
        return results;
      }
    }
  }
});
```

### Dynamic Job Management

```javascript
// Job management class for dynamic scheduling
class JobManager {
  constructor(schedulerPlugin) {
    this.scheduler = schedulerPlugin;
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    this.scheduler.on('plg:scheduler:job-started', (data) => {
      console.log(`🚀 Job started: ${data.jobName} at ${data.startTime}`);
    });
    
    this.scheduler.on('plg:scheduler:job-completed', (data) => {
      console.log(`✅ Job completed: ${data.jobName} in ${data.duration}ms`);
    });
    
    this.scheduler.on('plg:scheduler:job-failed', (data) => {
      console.error(`❌ Job failed: ${data.jobName} - ${data.error}`);
    });
    
    this.scheduler.on('plg:scheduler:job-retry', (data) => {
      console.warn(`🔄 Job retry: ${data.jobName} (attempt ${data.attempt})`);
    });
  }
  
  // Add job dynamically
  async addJob(jobName, jobConfig) {
    await this.scheduler.addJob(jobName, jobConfig);
    console.log(`➕ Added job: ${jobName}`);
  }
  
  // Remove job
  async removeJob(jobName) {
    await this.scheduler.removeJob(jobName);
    console.log(`➖ Removed job: ${jobName}`);
  }
  
  // Update job schedule
  async updateJobSchedule(jobName, newSchedule) {
    await this.scheduler.updateJob(jobName, { schedule: newSchedule });
    console.log(`📅 Updated schedule for ${jobName}: ${newSchedule}`);
  }
  
  // Enable/disable job
  async toggleJob(jobName, enabled) {
    await this.scheduler.updateJob(jobName, { enabled });
    console.log(`${enabled ? '▶️' : '⏸️'} ${enabled ? 'Enabled' : 'Disabled'} job: ${jobName}`);
  }
  
  // Get job execution history
  async getJobHistory(jobName, limit = 10) {
    return await this.scheduler.getJobHistory(jobName, { limit });
  }
  
  // Get job statistics
  async getJobStats(jobName) {
    const history = await this.getJobHistory(jobName, 100);
    
    const stats = {
      total_executions: history.length,
      successful: history.filter(h => h.status === 'completed').length,
      failed: history.filter(h => h.status === 'failed').length,
      avg_duration: 0,
      last_execution: history[0]?.started_at
    };
    
    const completedJobs = history.filter(h => h.status === 'completed' && h.duration);
    if (completedJobs.length > 0) {
      stats.avg_duration = completedJobs.reduce((sum, job) => sum + job.duration, 0) / completedJobs.length;
    }
    
    stats.success_rate = stats.total_executions > 0 ? 
      (stats.successful / stats.total_executions * 100).toFixed(2) + '%' : 'N/A';
    
    return stats;
  }
  
  // Health check for all jobs
  async healthCheck() {
    const jobs = await this.scheduler.listJobs();
    const healthReport = {
      timestamp: new Date().toISOString(),
      total_jobs: jobs.length,
      enabled_jobs: jobs.filter(j => j.enabled).length,
      job_status: {}
    };
    
    for (const job of jobs) {
      const stats = await this.getJobStats(job.name);
      healthReport.job_status[job.name] = {
        enabled: job.enabled,
        last_execution: stats.last_execution,
        success_rate: stats.success_rate,
        health: stats.success_rate === 'N/A' ? 'unknown' : 
                parseFloat(stats.success_rate) >= 95 ? 'healthy' : 
                parseFloat(stats.success_rate) >= 80 ? 'warning' : 'unhealthy'
      };
    }
    
    return healthReport;
  }
}

// Usage
const jobManager = new JobManager(s3db.plugins.scheduler);

// Add a new job dynamically
await jobManager.addJob('custom_backup', {
  schedule: '0 4 * * *', // Daily at 4 AM
  description: 'Custom backup job',
  action: async (database) => {
    // Backup logic here
    return { backup_completed: true };
  }
});

// Get job statistics
const stats = await jobManager.getJobStats('daily_cleanup');
console.log('Job statistics:', stats);

// Health check
const health = await jobManager.healthCheck();
console.log('Scheduler health:', health);
```

---

## API Reference

### Plugin Methods

#### `addJob(jobName, jobConfig)`
Add a new job dynamically.

```javascript
await scheduler.addJob('new_job', {
  schedule: '0 12 * * *',
  description: 'New scheduled job',
  action: async (database) => {
    // Job logic here
    return { success: true };
  }
});
```

#### `removeJob(jobName)`
Remove a job.

```javascript
await scheduler.removeJob('old_job');
```

#### `updateJob(jobName, updates)`
Update job configuration.

```javascript
await scheduler.updateJob('daily_cleanup', {
  schedule: '0 4 * * *', // Change schedule
  enabled: false         // Disable job
});
```

#### `runJob(jobName)`
Run a job immediately.

```javascript
const result = await scheduler.runJob('daily_cleanup');
```

#### `listJobs()`
Get all configured jobs.

```javascript
const jobs = await scheduler.listJobs();
```

#### `getJobHistory(jobName, options?)`
Get execution history for a job. Uses partition-based queries for optimized performance.

```javascript
// Get recent history (uses byJob partition for fast lookup)
const history = await scheduler.getJobHistory('daily_cleanup', {
  limit: 20
});

// Filter by status (uses both byJob and byStatus partitions)
const failures = await scheduler.getJobHistory('daily_cleanup', {
  status: 'failed',
  limit: 10
});

// The method automatically uses partitioned queries instead of filtering
// all history records, making it very efficient even with large history
```

**Options:**
- `limit` (number): Maximum number of records to return (default: 100)
- `status` (string): Filter by status ('success', 'failed', 'timeout', etc.)

### Job Action Function

Job actions receive `(database, context)` parameters:

```javascript
action: async (database, context) => {
  // database: S3db instance
  // context: Job context data including jobName, startTime, etc.
  
  const results = await database.resources.users.count();
  
  // Return data that will be logged in job history
  return { user_count: results };
}
```

### Event System

```javascript
// Job lifecycle events
scheduler.on('plg:scheduler:job-started', (data) => {
  console.log(`Job ${data.jobName} started`);
});

scheduler.on('plg:scheduler:job-completed', (data) => {
  console.log(`Job ${data.jobName} completed in ${data.duration}ms`);
});

scheduler.on('plg:scheduler:job-failed', (data) => {
  console.error(`Job ${data.jobName} failed: ${data.error}`);
});

scheduler.on('plg:scheduler:job-retry', (data) => {
  console.log(`Job ${data.jobName} retry attempt ${data.attempt}`);
});

// Scheduler events
scheduler.on('scheduler_started', () => {
  console.log('Scheduler started');
});

scheduler.on('scheduler_stopped', () => {
  console.log('Scheduler stopped');
});
```

---

## Advanced Patterns

### Conditional Job Execution

```javascript
jobs: {
  conditional_backup: {
    schedule: '0 2 * * *',
    description: 'Backup only if data has changed',
    action: async (database, context) => {
      // Check if backup is needed
      const lastBackup = await database.resources.backup_history.list({
        limit: 1,
        sort: { created_at: -1 }
      });
      
      const lastBackupTime = lastBackup[0]?.created_at || '1970-01-01';
      
      // Check for changes since last backup
      const changes = await database.resources.audit_log.list({
        filter: item => item.timestamp > lastBackupTime
      });
      
      if (changes.length === 0) {
        console.log('No changes since last backup, skipping');
        return { skipped: true, reason: 'no_changes' };
      }
      
      // Perform backup
      const backupId = `backup_${Date.now()}`;
      // ... backup logic ...
      
      await database.resources.backup_history.insert({
        id: backupId,
        changes_count: changes.length,
        created_at: new Date().toISOString()
      });
      
      return { backup_id: backupId, changes_backed_up: changes.length };
    }
  }
}
```

### Job Chains and Dependencies

```javascript
// Job manager with dependency support
class JobChainManager {
  constructor(scheduler) {
    this.scheduler = scheduler;
    this.jobChains = new Map();
  }
  
  // Define job chain with dependencies
  defineChain(chainName, jobs) {
    this.jobChains.set(chainName, jobs);
    
    // Set up dependent jobs
    jobs.forEach((job, index) => {
      if (index === 0) {
        // First job runs on schedule
        this.scheduler.addJob(job.name, job.config);
      } else {
        // Subsequent jobs run when previous completes
        const prevJob = jobs[index - 1];
        
        this.scheduler.on('plg:scheduler:job-completed', async (data) => {
          if (data.jobName === prevJob.name) {
            console.log(`Running dependent job: ${job.name}`);
            await this.scheduler.runJob(job.name);
          }
        });
        
        // Add job but disable scheduling (run only via dependency)
        this.scheduler.addJob(job.name, {
          ...job.config,
          schedule: null, // Disable automatic scheduling
          enabled: true
        });
      }
    });
  }
  
  // Run entire chain
  async runChain(chainName) {
    const chain = this.jobChains.get(chainName);
    if (!chain) throw new Error(`Chain ${chainName} not found`);
    
    // Run first job, others will follow via dependencies
    await this.scheduler.runJob(chain[0].name);
  }
}

// Usage
const chainManager = new JobChainManager(s3db.plugins.scheduler);

chainManager.defineChain('daily_processing', [
  {
    name: 'extract_data',
    config: {
      schedule: '0 1 * * *',
      description: 'Extract data from external sources',
      action: async (database) => {
        // Extract data
        return { extracted_records: 1000 };
      }
    }
  },
  {
    name: 'transform_data',
    config: {
      description: 'Transform extracted data',
      action: async (database) => {
        // Transform data
        return { transformed_records: 950 };
      }
    }
  },
  {
    name: 'load_data',
    config: {
      description: 'Load transformed data',
      action: async (database) => {
        // Load data
        return { loaded_records: 950 };
      }
    }
  }
]);
```

### Resource-Aware Scheduling

```javascript
// Schedule jobs based on resource usage
jobs: {
  adaptive_cleanup: {
    schedule: '@hourly',
    description: 'Clean up based on resource usage',
    action: async (database, context) => {
      const memoryUsage = process.memoryUsage();
      const memoryUsagePercent = memoryUsage.heapUsed / memoryUsage.heapTotal;
      
      let cleanupLevel = 'light';
      
      if (memoryUsagePercent > 0.8) {
        cleanupLevel = 'aggressive';
      } else if (memoryUsagePercent > 0.6) {
        cleanupLevel = 'moderate';
      }
      
      const results = { level: cleanupLevel, cleaned: 0 };
      
      // Adjust cleanup based on resource usage
      if (cleanupLevel === 'aggressive') {
        // Aggressive cleanup
        const allTemp = await database.resources.temp_data.list();
        for (const item of allTemp) {
          await database.resources.temp_data.delete(item.id);
          results.cleaned++;
        }
      } else if (cleanupLevel === 'moderate') {
        // Moderate cleanup - only old temp data
        const oldTemp = await database.resources.temp_data.list({
          filter: item => {
            const age = Date.now() - new Date(item.created_at).getTime();
            return age > 60 * 60 * 1000; // Older than 1 hour
          }
        });
        
        for (const item of oldTemp) {
          await database.resources.temp_data.delete(item.id);
          results.cleaned++;
        }
      }
      // Light cleanup - let normal expiration handle it
      
      return results;
    }
  }
}
```

---

## Best Practices

### 1. Use Appropriate Cron Expressions

```javascript
// Good: Specific times to avoid resource conflicts
{
  schedule: '0 2 * * *',  // 2 AM daily
  schedule: '0 30 3 * * 0' // 3:30 AM Sundays
}

// Avoid: Resource-intensive jobs at peak times
{
  schedule: '0 9 * * 1-5'  // 9 AM weekdays - high traffic time
}
```

### 2. Implement Proper Error Handling

```javascript
action: async (database, context) => {
  try {
    const result = await performComplexOperation();
    return { success: true, result };
  } catch (error) {
    console.error(`Job ${context.jobName} failed:`, error);
    
    // Determine if error is retryable
    if (error.code === 'TEMPORARY_FAILURE') {
      throw error; // Will trigger retry
    } else {
      // Log permanent failure and don't retry
      await database.resources.job_errors.insert({
        job_name: context.jobName,
        error: error.message,
        timestamp: new Date().toISOString(),
        retryable: false
      });
      
      return { success: false, error: error.message };
    }
  }
}
```

### 3. Monitor Job Performance

```javascript
// Track job performance metrics
action: async (database, context) => {
  const startTime = Date.now();
  
  try {
    const result = await performJobLogic();
    
    const duration = Date.now() - startTime;
    
    // Log performance metrics
    await database.resources.job_metrics.insert({
      job_name: context.jobName,
      duration,
      memory_used: process.memoryUsage().heapUsed,
      success: true,
      timestamp: new Date().toISOString()
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    await database.resources.job_metrics.insert({
      job_name: context.jobName,
      duration,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
}
```

### 4. Use Timezone-Aware Scheduling

```javascript
// Configure timezone for business-critical jobs
{
  timezone: 'America/New_York',
  jobs: {
    business_day_report: {
      schedule: '0 17 * * 1-5', // 5 PM weekdays in NY timezone
      timezone: 'America/New_York', // Override plugin timezone
      action: async (database) => {
        // Generate end-of-business-day report
      }
    }
  }
}
```

### 5. Multi-Instance Deployment

```javascript
// The SchedulerPlugin automatically handles distributed locking
// across multiple instances - no manual locking needed!

// Instance 1 (server-1)
const scheduler1 = new SchedulerPlugin({
  jobs: {
    daily_cleanup: {
      schedule: '0 2 * * *',
      action: async (database) => {
        // This job will only run on ONE instance
        console.log('Running cleanup on instance 1');
        // ... cleanup logic ...
      }
    }
  }
});

// Instance 2 (server-2) - same configuration
const scheduler2 = new SchedulerPlugin({
  jobs: {
    daily_cleanup: {
      schedule: '0 2 * * *',
      action: async (database) => {
        // When instance 1 is running this job, instance 2 will skip it
        console.log('Running cleanup on instance 2');
        // ... cleanup logic ...
      }
    }
  }
});

// Built-in distributed locking ensures only ONE instance executes each job
// The lock is automatically acquired before execution and released after
// If a job is already running, other instances skip silently
```

> **Multi-Instance Safety**: The scheduler automatically uses a `scheduler_job_locks` resource to prevent concurrent execution across multiple instances. Locks are acquired before job execution and always released (even on errors), ensuring your jobs run exactly once per schedule.

### 6. Graceful Shutdown

```javascript
// Handle graceful shutdown
class GracefulScheduler {
  constructor(schedulerPlugin) {
    this.scheduler = schedulerPlugin;
    this.runningJobs = new Set();
    this.setupShutdownHandlers();
  }
  
  setupShutdownHandlers() {
    this.scheduler.on('plg:scheduler:job-started', (data) => {
      this.runningJobs.add(data.jobName);
    });
    
    this.scheduler.on('plg:scheduler:job-completed', (data) => {
      this.runningJobs.delete(data.jobName);
    });
    
    this.scheduler.on('plg:scheduler:job-failed', (data) => {
      this.runningJobs.delete(data.jobName);
    });
    
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }
  
  async shutdown(signal) {
    console.log(`📅 Received ${signal}, stopping scheduler...`);
    
    // Stop accepting new jobs
    await this.scheduler.stop();
    
    // Wait for running jobs to complete
    while (this.runningJobs.size > 0) {
      console.log(`⏳ Waiting for ${this.runningJobs.size} jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('✅ Scheduler shutdown completed');
    process.exit(0);
  }
}

// Usage
const gracefulScheduler = new GracefulScheduler(s3db.plugins.scheduler);
```

---

## 🚨 Error Handling

The Scheduler Plugin uses standardized error classes with comprehensive context and recovery guidance:

### SchedulerError

All scheduler operations throw `SchedulerError` instances with detailed context:

```javascript
try {
  await schedulerPlugin.addJob('test_job', {
    schedule: 'invalid cron',
    action: async () => {}
  });
} catch (error) {
  console.error(error.name);        // 'SchedulerError'
  console.error(error.message);     // Brief error summary
  console.error(error.description); // Detailed explanation with guidance
  console.error(error.context);     // Job name, schedule, etc.
}
```

### Common Errors

#### Invalid Cron Expression

**When**: Job configured with invalid cron expression
**Error**: `Job '{jobName}' has invalid cron expression: {schedule}`
**Recovery**:
```javascript
// Bad
new SchedulerPlugin({
  jobs: {
    test: {
      schedule: 'invalid cron',  // Throws SchedulerError
      action: async () => {}
    }
  }
})

// Good - Use valid cron expressions
new SchedulerPlugin({
  jobs: {
    test: {
      schedule: '0 3 * * *',     // Daily at 3 AM
      action: async () => {}
    }
  }
})

// Good - Use preset expressions
new SchedulerPlugin({
  jobs: {
    test: {
      schedule: '@daily',        // Preset
      action: async () => {}
    }
  }
})
```

#### Job Not Found

**When**: Operating on non-existent job
**Error**: `Job not found: {jobName}`
**Recovery**:
```javascript
// Bad
await schedulerPlugin.runJob('nonexistent-job');  // Throws SchedulerError

// Good - Check job exists first
const jobs = schedulerPlugin.getAllJobsStatus();
if (jobs['my-job']) {
  await schedulerPlugin.runJob('my-job');
}

// Good - List available jobs
const allJobs = await schedulerPlugin.listJobs();
console.log('Available jobs:', allJobs.map(j => j.name));
```

#### Job Already Exists

**When**: Adding job with duplicate name
**Error**: `Job already exists: {jobName}`
**Recovery**:
```javascript
// Bad
await schedulerPlugin.addJob('cleanup', { schedule: '0 2 * * *', action: async () => {} });
await schedulerPlugin.addJob('cleanup', { schedule: '0 3 * * *', action: async () => {} }); // Throws

// Good - Update existing job
await schedulerPlugin.updateJob('cleanup', { schedule: '0 3 * * *' });

// Good - Remove first, then add
await schedulerPlugin.removeJob('cleanup');
await schedulerPlugin.addJob('cleanup', { schedule: '0 3 * * *', action: async () => {} });
```

#### Job Execution Errors

**When**: Job action throws error
**Error**: Job errors are caught and logged, retried according to retry policy
**Recovery**:
```javascript
// Job with error handling
new SchedulerPlugin({
  jobs: {
    risky_job: {
      schedule: '@hourly',
      retries: 3,  // Retry 3 times after initial failure (4 total attempts)
      timeout: 30000,
      action: async (database, context) => {
        try {
          // Risky operation
          const result = await performRiskyOperation();
          return { success: true, result };
        } catch (error) {
          // Log error context
          console.error(`Job ${context.jobName} failed:`, error);

          // Determine if retryable
          if (error.code === 'TEMPORARY_ERROR') {
            throw error;  // Will trigger retry
          } else {
            // Permanent error - don't retry
            return { success: false, error: error.message };
          }
        }
      }
    }
  }
})

// Monitor job failures
schedulerPlugin.on('plg:scheduler:job-failed', (data) => {
  console.error(`Job failed: ${data.jobName}`, data.error);

  // Alert on repeated failures
  if (data.attempt >= 3) {
    sendAlert(`Job ${data.jobName} failed ${data.attempt} times`);
  }
});
```

#### Job Timeout

**When**: Job exceeds configured timeout
**Error**: Job is terminated, logged as timeout
**Recovery**:
```javascript
// Configure appropriate timeouts
new SchedulerPlugin({
  jobs: {
    quick_job: {
      schedule: '@hourly',
      timeout: 30000,  // 30 seconds for quick jobs
      action: async () => { /* fast operation */ }
    },

    slow_job: {
      schedule: '@daily',
      timeout: 600000,  // 10 minutes for slow jobs
      action: async () => { /* long operation */ }
    }
  }
})

// Monitor timeouts
schedulerPlugin.on('plg:scheduler:job-timeout', (data) => {
  console.warn(`Job ${data.jobName} timed out after ${data.timeout}ms`);

  // Increase timeout for this job
  await schedulerPlugin.updateJob(data.jobName, {
    timeout: data.timeout * 2  // Double the timeout
  });
});
```

### Error Recovery Patterns

#### Graceful Degradation

Handle job errors without stopping scheduler:
```javascript
new SchedulerPlugin({
  jobs: {
    optional_task: {
      schedule: '@daily',
      action: async (database) => {
        try {
          await performTask();
          return { success: true };
        } catch (error) {
          // Log error but don't throw (prevents retry)
          console.error('Optional task failed, will retry tomorrow:', error);
          return { success: false, error: error.message };
        }
      }
    }
  }
})
```

#### Retry with Exponential Backoff

Automatic retries with increasing delays:
```javascript
new SchedulerPlugin({
  jobs: {
    external_api_sync: {
      schedule: '@hourly',
      retries: 5,  // Will try 6 times total (1 + 5 retries)
      action: async () => {
        // External API call
        const response = await fetch('https://api.example.com/data');
        if (!response.ok) throw new Error('API request failed');
        return await response.json();
      }
    }
  }
})

// Monitor retries
schedulerPlugin.on('plg:scheduler:job-retry', (data) => {
  console.log(`Retrying ${data.jobName} (attempt ${data.attempt})`);
});
```

#### Circuit Breaker Pattern

Disable failing jobs automatically:
```javascript
const failureCounts = new Map();
const MAX_FAILURES = 5;

schedulerPlugin.on('plg:scheduler:job-failed', async (data) => {
  const count = (failureCounts.get(data.jobName) || 0) + 1;
  failureCounts.set(data.jobName, count);

  if (count >= MAX_FAILURES) {
    console.error(`Disabling ${data.jobName} after ${count} failures`);
    schedulerPlugin.disableJob(data.jobName);

    // Alert operations team
    await sendAlert({
      subject: `Job ${data.jobName} disabled due to failures`,
      body: `Job has failed ${count} times and has been disabled.`
    });
  }
});

// Reset counter on success
schedulerPlugin.on('plg:scheduler:job-completed', (data) => {
  failureCounts.delete(data.jobName);
});
```

#### Job Lock Errors

**When**: Distributed lock errors in multi-instance deployments
**Error**: Job skipped if lock cannot be acquired
**Recovery**:
```javascript
// Monitor lock failures
schedulerPlugin.on('plg:scheduler:job-lock_failed', (data) => {
  console.log(`Could not acquire lock for ${data.jobName} - already running on another instance`);
});

// Ensure lock cleanup on shutdown
process.on('SIGTERM', async () => {
  await schedulerPlugin.stop();  // Automatically releases all locks
  process.exit(0);
});
```

---

## Troubleshooting

### Issue: Jobs not executing at scheduled times
**Solution**: Check timezone settings, verify cron expressions, and ensure the scheduler is started.

### Issue: Jobs timing out frequently
**Solution**: Increase timeout values, optimize job logic, or break large jobs into smaller chunks.

### Issue: High memory usage during job execution
**Solution**: Process data in batches, implement cleanup within jobs, and monitor memory usage.

### Issue: Jobs failing silently
**Solution**: Implement proper error handling and logging within job actions.

### Issue: Concurrent job execution conflicts
**Solution**: Implement job locking mechanisms or adjust job scheduling to avoid conflicts.

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [State Machine Plugin](./state-machine.md) - Schedule state machine operations
- [Backup Plugin](./backup.md) - Schedule automated backups
- [Metrics Plugin](./metrics.md) - Monitor scheduler performance
## ❓ FAQ

### Básico

**P: O que o SchedulerPlugin faz?**
R: Executa tarefas agendadas com expressões cron, com suporte a retries, timeouts, histórico e locking distribuído.

**P: Quais formatos de schedule são suportados?**
R: Expressões cron padrão (5 campos) e atalhos (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`).

**Q: How does distributed locking work?**
R: Usa `PluginStorage` com TTL para garantir que apenas uma instância execute o job por vez em ambientes distribuídos.

### Configuração

**P: Como configurar um job básico?**
R:
```javascript
new SchedulerPlugin({
  jobs: {
    cleanup: {
      schedule: '0 3 * * *',  // Todo dia às 3 AM
      description: 'Clean expired records',
      action: async (database, context) => {
        // Sua lógica aqui
        return { deleted: 10 };
      },
      enabled: true,
      retries: 3,
      timeout: 300000  // 5 minutos
    }
  }
})
```

**P: Como configurar timezone?**
R: Use a opção `timezone`:
```javascript
new SchedulerPlugin({
  timezone: 'America/Sao_Paulo',
  jobs: {...}
})
```

**P: Como configurar hooks globais?**
R:
```javascript
new SchedulerPlugin({
  onJobStart: (jobName, context) => console.log(`Starting ${jobName}`),
  onJobComplete: (jobName, result, duration) => console.log(`Done in ${duration}ms`),
  onJobError: (jobName, error) => console.error(`Failed: ${error.message}`),
  jobs: {...}
})
```

### Operações

**P: Como executar um job manualmente?**
R: Use `runJob`:
```javascript
await schedulerPlugin.runJob('cleanup');
```

**P: Como pausar/resumir um job?**
R: Use `disableJob` e `enableJob`:
```javascript
schedulerPlugin.disableJob('cleanup');
schedulerPlugin.enableJob('cleanup');
```

**P: Como adicionar um job em runtime?**
R: Use `addJob`:
```javascript
schedulerPlugin.addJob('new-job', {
  schedule: '*/5 * * * *',  // A cada 5 minutos
  action: async (db) => { /* ... */ }
});
```

**P: Como remover um job?**
R: Use `removeJob`:
```javascript
schedulerPlugin.removeJob('cleanup');
```

### Monitoramento

**P: Como obter status de um job?**
R: Use `getJobStatus`:
```javascript
const status = schedulerPlugin.getJobStatus('cleanup');
// Retorna: name, enabled, schedule, lastRun, nextRun, isRunning, statistics
```

**P: Como consultar histórico de execuções?**
R: Use `getJobHistory`:
```javascript
const history = await schedulerPlugin.getJobHistory('cleanup', {
  limit: 50,
  status: 'error'  // null, 'success', 'error', 'timeout'
});
```

**P: Como obter status de todos os jobs?**
R: Use `getAllJobsStatus`:
```javascript
const allStatus = schedulerPlugin.getAllJobsStatus();
```

### Troubleshooting

**P: Job não está executando?**
R: Verifique:
1. `enabled: true`
2. Expressão cron válida
3. `nextRun` está no futuro
4. Não há erros no último run

**P: Job está travando?**
R: Configure um `timeout` adequado:
```javascript
{
  schedule: '...',
  action: async (db) => { /* ... */ },
  timeout: 60000  // 1 minuto
}
```

**P: Como evitar execução duplicada em cluster?**
R: O plugin usa distributed locking automaticamente via `PluginStorage`.

---
