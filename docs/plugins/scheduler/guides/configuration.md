
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
