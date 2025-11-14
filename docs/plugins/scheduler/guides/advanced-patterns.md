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
import { SchedulerError } from 's3db.js';

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
    if (!chain) {
      throw new SchedulerError(`Chain ${chainName} not found`, {
        statusCode: 404,
        retriable: false,
        suggestion: 'Define the chain via defineChain() before invoking runChain.',
        operation: 'runChain',
        metadata: { chainName, availableChains: Array.from(this.jobChains.keys()) }
      });
    }
    
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
