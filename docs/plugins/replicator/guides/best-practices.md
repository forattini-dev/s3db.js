# ✅ Best Practices & Troubleshooting

**Prev:** [← Usage Patterns](./usage-patterns.md)
**Main:** [← Replicator Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - 6 essential best practices with code examples
> - Error handling strategies
> - Performance optimization
> - Common issues and solutions
> - 30+ FAQ entries

**Time to read:** 25 minutes
**Difficulty:** Advanced

---

## 6 Essential Best Practices

### Practice 1: Design Robust Transform Functions

Transform functions are where most replication issues occur. Handle edge cases:

```javascript
// ❌ Wrong - Assumes all fields exist
transform: (data) => ({
  id: data.id,
  fullName: `${data.firstName} ${data.lastName}`,  // Crashes if undefined
  email: data.email.toLowerCase()                  // Crashes if null
})

// ✅ Correct - Defensive programming
transform: (data) => {
  // Validate required fields
  if (!data.id || !data.email) return null;  // Skip if invalid

  // Safe property access
  const firstName = data.firstName?.trim() || '';
  const lastName = data.lastName?.trim() || '';
  const fullName = firstName && lastName
    ? `${firstName} ${lastName}`
    : firstName || lastName || 'Unknown';

  return {
    id: data.id,
    fullName,
    email: data.email.toLowerCase(),
    processed_at: new Date().toISOString(),
    // Add validation flag
    validated: true
  };
}
```

### Practice 2: Implement Selective Replication

Replicate only what's needed - saves storage, bandwidth, and processing:

```javascript
// Replicate only specific operations
{
  resources: {
    users: {
      resource: 'user_archive',
      actions: ['inserted', 'updated'],  // Skip deletes
      shouldReplicate: (data) => {
        // Only active users
        return data.active === true;
      },
      transform: (data) => ({
        ...data,
        archived_at: new Date().toISOString()
      })
    },

    logs: {
      actions: []  // Don't replicate logs at all
    },

    sensitive_data: {
      shouldReplicate: () => false  // Never replicate
    }
  }
}
```

### Practice 3: Monitor Replication Health

Set up comprehensive monitoring:

```javascript
const metrics = {
  successful: 0,
  failed: 0,
  skipped: 0,
  duration: 0
};

// Track success
replicatorPlugin.on('plg:replicator:replicated', (event) => {
  metrics.successful++;
  metrics.duration += event.duration;

  // Log every 100th success
  if (metrics.successful % 100 === 0) {
    const avgDuration = metrics.duration / metrics.successful;
    console.log(`✅ ${metrics.successful} replications, avg ${avgDuration}ms`);
  }
});

// Track failures
replicatorPlugin.on('plg:replicator:error', (error) => {
  metrics.failed++;

  // Alert on repeated failures
  if (metrics.failed > 10) {
    const errorRate = metrics.failed / (metrics.successful + metrics.failed);
    if (errorRate > 0.05) {
      alerting.critical({
        title: 'High replication error rate',
        details: `${(errorRate * 100).toFixed(1)}% errors`
      });
    }
  }
});

// Health endpoint
app.get('/health/replication', async (req, res) => {
  const total = metrics.successful + metrics.failed;
  if (total === 0) {
    return res.json({ status: 'no-data' });
  }

  const errorRate = metrics.failed / total;
  const status = errorRate < 0.01 ? 'healthy' : 'degraded';
  const httpStatus = errorRate < 0.1 ? 200 : 503;

  res.status(httpStatus).json({
    status,
    successful: metrics.successful,
    failed: metrics.failed,
    error_rate: (errorRate * 100).toFixed(2) + '%',
    avg_duration: (metrics.duration / total).toFixed(0) + 'ms'
  });
});
```

### Practice 4: Use Environment-Specific Configuration

Different configurations for different environments:

```javascript
const getReplicatorConfig = (env = process.env.NODE_ENV) => {
  // Development - no replication
  if (env === 'development') {
    return {
      replicators: [{
        driver: 's3db',
        resources: [],  // Replicate nothing
        config: { connectionString: 's3://dev-backup' }
      }]
    };
  }

  // Staging - safe replication
  if (env === 'staging') {
    return {
      logLevel: 'debug',
      persistReplicatorLog: true,
      replicators: [{
        driver: 's3db',
        resources: ['users', 'orders'],  // Limited scope
        config: { connectionString: 's3://staging-backup' }
      }]
    };
  }

  // Production - full replication with monitoring
  if (env === 'production') {
    return {
      logLevel: 'silent',
      persistReplicatorLog: true,
      maxRetries: 5,
      replicators: [
        // Backup
        {
          driver: 's3db',
          resources: ['users', 'orders', 'products'],
          config: { connectionString: 's3://prod-backup' }
        },
        // Analytics
        {
          driver: 'bigquery',
          resources: ['orders'],
          config: { projectId: 'prod-analytics', dataset: 'data' }
        },
        // Events
        {
          driver: 'sqs',
          resources: ['orders'],
          config: { queueUrl: process.env.SQS_URL, region: 'us-east-1' }
        }
      ]
    };
  }

  throw new Error(`Unknown environment: ${env}`);
};

// Usage
const config = getReplicatorConfig();
const plugin = new ReplicatorPlugin(config);
await db.usePlugin(plugin);
```

### Practice 5: Handle Sensitive Data

Never replicate sensitive information:

```javascript
// ❌ Wrong - Replicates everything
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string',
    email: 'string',
    password: 'secret',        // ⚠️ Sensitive!
    ssn: 'string',             // ⚠️ PII!
    creditCard: 'string'       // ⚠️ Payment data!
  }
});

// ✅ Correct - Strip sensitive fields
{
  resources: {
    users: {
      resource: 'user_profiles',
      transform: (data) => {
        // Destructure to remove sensitive fields
        const { password, ssn, creditCard, ...safeData } = data;

        // If needed for analytics, hash them
        return {
          ...safeData,
          email_domain: data.email.split('@')[1],
          email_hash: crypto.createHash('sha256')
            .update(data.email)
            .digest('hex'),
          has_payment: !!creditCard,  // Flag only
          processed_at: new Date().toISOString()
        };
      }
    }
  }
}
```

### Practice 6: Optimize for Performance

For high-volume data:

```javascript
new ReplicatorPlugin({
  // Batch configuration
  batchSize: 500,        // Default: 100, increase for throughput
  maxRetries: 5,         // More retries for transient failures
  timeout: 60000,        // Longer timeout for large batches

  // Concurrency control
  replicatorConcurrency: 20,  // Process 20 replicators in parallel

  replicators: [
    {
      driver: 'bigquery',
      resources: {
        orders: {
          resource: 'analytics.orders',

          // Filter to reduce volume
          shouldReplicate: (data) => {
            // Only completed orders over $100
            return data.status === 'completed' && data.total > 100;
          },

          // Optimize transform for BigQuery
          transform: (data) => ({
            order_id: data.id,
            total_usd: parseFloat(data.total),
            status: data.status,
            created_timestamp: new Date(data.createdAt).getTime()
            // Skip heavy fields if not needed
          })
        }
      },
      config: {
        projectId: 'my-project',
        dataset: 'analytics'
      }
    }
  ]
})
```

---

## Error Handling Strategies

### Retry Configuration

```javascript
// Default: 3 retries with exponential backoff
new ReplicatorPlugin({
  maxRetries: 3,
  timeout: 30000  // 30 second timeout
})

// For transient failures (network), increase retries
new ReplicatorPlugin({
  maxRetries: 5  // Retry up to 5 times
})

// For strict systems, fewer retries
new ReplicatorPlugin({
  maxRetries: 1  // Fail fast
})
```

### Event-Based Error Handling

```javascript
const failedOps = [];

replicatorPlugin.on('plg:replicator:error', (error) => {
  // Store for retry
  failedOps.push({
    resource: error.resource,
    recordId: error.recordId,
    operation: error.operation,
    error: error.message,
    timestamp: Date.now(),
    retryCount: error.retryCount
  });

  // Alert on permanent failure
  if (error.retryCount >= maxRetries) {
    console.error(`❌ Permanent failure: ${error.resource}/${error.recordId}`);
    alerting.error(`Replication failed: ${error.message}`);
  }
});

// Retry failed operations
async function retryFailed() {
  const failed = [...failedOps];
  failedOps.length = 0;  // Clear

  for (const op of failed) {
    try {
      const resource = await db.getResource(op.resource);
      const record = await resource.get(op.recordId);

      // Re-trigger replication
      if (op.operation === 'inserted') {
        await resource.insert(record);
      } else if (op.operation === 'updated') {
        await resource.update(op.recordId, record);
      }

      console.log(`✅ Retry successful: ${op.resource}/${op.recordId}`);
    } catch (error) {
      // Put back in queue if still failing
      failedOps.push(op);
    }
  }
}

// Retry every minute
setInterval(retryFailed, 60000);
```

### Database Logging

```javascript
const plugin = new ReplicatorPlugin({
  persistReplicatorLog: true,  // Store in database
  logLevel: 'silent'
});

await db.usePlugin(plugin);

// Query logs
const logs = await db.resources.plg_replicator_logs;

// Get errors from last hour
const errors = await logs.query({
  status: 'failed',
  timestamp: { $gte: Date.now() - 3600000 }
});

// Errors by resource
const userErrors = errors.filter(e => e.resource === 'users');
console.log(`Users: ${userErrors.length} errors`);

// Get most recent errors
const recent = await logs.query(
  { status: 'failed' },
  { limit: 10, sort: { timestamp: -1 } }
);

recent.forEach(err => {
  console.log(`${err.timestamp}: ${err.resource} - ${err.error}`);
});
```

---

## Common Issues & Solutions

### ❌ Issue 1: Transform Function Throws Error

**Symptom:** Replication fails with "transform function error"

**Cause:** Transform function crashes on unexpected data

**Solution:**
```javascript
// Add try-catch in transform
transform: (data) => {
  try {
    return {
      id: data.id,
      name: data.name?.toUpperCase() || 'UNKNOWN'
    };
  } catch (err) {
    console.error('Transform error:', err);
    return null;  // Skip this record
  }
}
```

### ❌ Issue 2: Connection Timeout

**Symptom:** "Timeout waiting for response"

**Cause:** Database is slow or unreachable

**Solution:**
```javascript
// Increase timeout
new ReplicatorPlugin({
  timeout: 60000  // 60 seconds (default: 30s)
})

// Or check destination:
// 1. Is PostgreSQL running?
// 2. Can s3db.js reach it?
// 3. Are credentials correct?
```

### ❌ Issue 3: High Memory Usage

**Symptom:** Process uses lots of memory during replication

**Cause:** Large batch size

**Solution:**
```javascript
new ReplicatorPlugin({
  batchSize: 50  // Reduce from default 100
})
```

### ❌ Issue 4: Schema Mismatch

**Symptom:** "Column XXX does not exist"

**Cause:** S3DB schema changed, database schema wasn't updated

**Solution:**
```javascript
// Option 1: Auto-sync schema
{
  driver: 'postgresql',
  config: {
    connectionString: '...',
    schemaSync: {
      enabled: true,
      strategy: 'alter'  // Auto-add columns
    }
  }
}

// Option 2: Manual fix
// ALTER TABLE orders ADD COLUMN new_field TEXT;
```

### ❌ Issue 5: Webhook Failures

**Symptom:** "HTTP 401 Unauthorized" or "Connection refused"

**Cause:** Wrong credentials or webhook endpoint down

**Solution:**
```javascript
// Test webhook first
const testPayload = {
  operation: 'test',
  resource: 'test',
  recordId: 'test-123',
  data: {}
};

const response = await fetch('https://api.example.com/webhook', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(testPayload)
});

console.log('Webhook test:', response.status, response.statusText);
```

---

## FAQ

### General

<details>
<summary><strong>Q: What's the difference between Replicator and Backup plugins?</strong></summary>

**Replicator:**
- Real-time CDC (every operation replicated immediately)
- Multiple destinations (PostgreSQL, BigQuery, SQS, webhooks)
- Near real-time (<10ms latency per operation)
- Perfect for: analytics, event streams, webhooks

**Backup:**
- Periodic snapshots (scheduled backup)
- Single destination (JSONL.gz files)
- Can restore point-in-time (daily/weekly backup)
- Perfect for: disaster recovery, compliance

See [Replicator vs Backup comparison](../README.md#-tldr) for details.
</details>

<details>
<summary><strong>Q: Can I replicate to multiple PostgreSQL databases?</strong></summary>

Yes, use multiple replicator configs:

```javascript
new ReplicatorPlugin({
  replicators: [
    {
      driver: 'postgresql',
      resources: ['orders'],
      config: { connectionString: 'postgres://db1' }
    },
    {
      driver: 'postgresql',
      resources: ['orders'],
      config: { connectionString: 'postgres://db2' }
    }
  ]
})
```
</details>

<details>
<summary><strong>Q: How do I skip certain records?</strong></summary>

Use `shouldReplicate`:

```javascript
{
  resources: {
    orders: {
      shouldReplicate: (data, action) => {
        // Skip deletes
        if (action === 'deleted') return false;
        // Skip test orders
        if (data.isTest) return false;
        // Skip small orders
        if (data.total < 100) return false;
        return true;
      }
    }
  }
}
```
</details>

<details>
<summary><strong>Q: What's the performance impact?</strong></summary>

Minimal. Replication is asynchronous:
- Insert/update/delete returns immediately
- Replication happens in background
- Latency: <10ms to start, 1-5 seconds to complete
- No blocking of database operations
</details>

<details>
<summary><strong>Q: Can I transform JSON fields?</strong></summary>

Yes:

```javascript
transform: (data) => ({
  id: data.id,
  metadata: JSON.stringify(data.metadata),  // Convert to string
  tags: data.tags?.join(',')               // Convert array to CSV
})
```
</details>

### Configuration

<details>
<summary><strong>Q: How do I test replication before production?</strong></summary>

Use staging environment:
1. Same schema as production
2. Replicate to test database
3. Run for 24h, verify data
4. Check error logs
5. Then enable production
</details>

<details>
<summary><strong>Q: Can I change target database without losing data?</strong></summary>

Yes:
1. Keep old replicator running
2. Add new replicator pointing to new database
3. Run both for sync period
4. Verify new database is complete
5. Remove old replicator
</details>

<details>
<summary><strong>Q: How do I disable replication temporarily?</strong></summary>

Set `enabled: false`:

```javascript
new ReplicatorPlugin({
  enabled: process.env.REPLICATION_ENABLED === 'true',
  replicators: [...]
})
```

Or via environment variable.
</details>

### Performance

<details>
<summary><strong>Q: How much storage does replication use?</strong></summary>

Depends on:
- Number of resources
- Number of records
- Record size
- Destination (BigQuery is compressed, PostgreSQL is native)

Example: 1M users (1KB each) = 1GB per destination.
</details>

<details>
<summary><strong>Q: Can I batch operations?</strong></summary>

Yes, replication is already batched:
- Default batch size: 100
- Configure: `batchSize: 500` for larger batches

Larger batches = better throughput, more memory usage.
</details>

<details>
<summary><strong>Q: How do I handle high-volume inserts?</strong></summary>

Optimize configuration:

```javascript
new ReplicatorPlugin({
  batchSize: 500,           // Larger batches
  replicatorConcurrency: 20, // More parallel replicators
  timeout: 60000            // Longer timeout
})
```

Also use `shouldReplicate` to filter unnecessary records.
</details>

### Troubleshooting

<details>
<summary><strong>Q: Replication is slow. How do I debug?</strong></summary>

1. **Enable debug logging:**
   ```javascript
   new ReplicatorPlugin({
     logLevel: 'debug',
     persistReplicatorLog: true
   })
   ```

2. **Check logs:**
   ```javascript
   const logs = await db.resources.plg_replicator_logs;
   const slowOps = await logs.query({});
   slowOps.forEach(log => {
     if (log.duration > 1000) console.log('Slow:', log);
   });
   ```

3. **Check destination:**
   - Is database running?
   - Is network stable?
   - Are there locks/locks in destination?
</details>

<details>
<summary><strong>Q: Getting "Column XXX does not exist" error?</strong></summary>

S3DB schema changed. Options:
1. **Auto-sync (recommended):**
   ```javascript
   schemaSync: { enabled: true, strategy: 'alter' }
   ```

2. **Manual sync:**
   ```sql
   ALTER TABLE orders ADD COLUMN new_column TEXT;
   ```

3. **Recreate (dangerous, loses data):**
   ```sql
   DROP TABLE orders;
   -- Replication will recreate it
   ```
</details>

<details>
<summary><strong>Q: Webhook failing with 401 Unauthorized?</strong></summary>

Check authentication:
```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    auth: {
      type: 'bearer',
      token: process.env.WEBHOOK_TOKEN  // Make sure this is set
    }
  }
}
```

Test with curl:
```bash
curl -X POST https://api.example.com/webhook \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```
</details>

---

## Production Deployment Checklist

- ✅ Test all replicators work
- ✅ Verify transforms handle edge cases
- ✅ Enable `persistReplicatorLog` for debugging
- ✅ Set `logLevel: 'silent'` (set log level to silent logs)
- ✅ Configure appropriate `maxRetries`
- ✅ Set `batchSize` based on data volume
- ✅ Test schema sync if using SQL
- ✅ Setup monitoring/alerting on errors
- ✅ Plan recovery for failed operations
- ✅ Document which resources replicate where
- ✅ Test failover/failure scenarios
- ✅ Load test with expected data volume
- ✅ Monitor replication lag
- ✅ Setup health check endpoint

---

**Prev:** [← Usage Patterns](./usage-patterns.md)
**Main:** [← Replicator Plugin](../README.md)
