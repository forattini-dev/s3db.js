# 🔄 Replicator Plugin

## ⚡ TLDR

Replicação **real-time** para múltiplos destinos (S3DB, BigQuery, PostgreSQL, SQS) com transformação de dados.

**1 linha para começar:**
```javascript
await db.usePlugin(new ReplicatorPlugin({ replicators: [{ driver: 's3db', resources: ['users'], config: { connectionString: 's3://...' }}] }));
```

**Principais features:**
- ✅ Multi-target: S3DB, BigQuery, PostgreSQL, SQS
- ✅ Transformação de dados com funções customizadas
- ✅ Retry automático com backoff exponencial
- ✅ Dead letter queue para falhas
- ✅ Event monitoring completo

**Quando usar:**
- 🔄 Backup para outra instância S3DB
- 📊 Data warehouse (BigQuery/PostgreSQL)
- 📡 Event streaming (SQS)
- 🌍 Multi-region sync

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Replicator Drivers](#replicator-drivers)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)

---

## Overview

The Replicator Plugin provides **enterprise-grade data replication** that synchronizes your s3db data in real-time to multiple targets including other S3DB instances, SQS queues, BigQuery, PostgreSQL databases, and more. It features robust error handling, advanced transformation capabilities, and comprehensive monitoring.

### How It Works

1. **Real-time Monitoring**: Listens to all database operations (insert, update, delete)
2. **Multi-Target Support**: Replicates to multiple destinations simultaneously
3. **Data Transformation**: Transform data before replication using custom functions
4. **Error Resilience**: Automatic retries and comprehensive error reporting
5. **Flexible Configuration**: Multiple resource mapping syntaxes for complex scenarios

> 🔄 **Enterprise Ready**: Perfect for backup strategies, data warehousing, event streaming, and multi-environment synchronization.

---

## Key Features

### 🎯 Core Features
- **Real-time Replication**: Automatic data synchronization on insert, update, and delete operations
- **Multi-Target Support**: Replicate to S3DB, BigQuery, PostgreSQL, SQS, and custom targets
- **Advanced Transformations**: Transform data with custom functions before replication
- **Error Resilience**: Automatic retries, detailed error reporting, and dead letter queue support
- **Performance Monitoring**: Built-in metrics, performance tracking, and health monitoring

### 🔧 Technical Features
- **Flexible Configuration**: Multiple resource mapping syntaxes for complex scenarios
- **Selective Replication**: Choose which operations and resources to replicate
- **Batch Processing**: Efficient bulk replication operations
- **Event System**: Comprehensive event monitoring and debugging capabilities
- **Conditional Logic**: Skip replication based on custom conditions

---

## Installation & Setup

### Basic Setup

```javascript
import { S3db, ReplicatorPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new ReplicatorPlugin({
    verbose: true, // Enable detailed logging for debugging
    replicators: [
      {
        driver: 's3db',
        resources: ['users'],
        config: {
          connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
        }
      }
    ]
  })]
});

await s3db.connect();

// Data is automatically replicated with detailed error reporting
const users = s3db.resource('users');
await users.insert({ name: 'John', email: 'john@example.com' });
// This insert is automatically replicated to the backup database
```

---

## Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable replication globally |
| `replicators` | array | `[]` | Array of replicator configurations (required) |
| `verbose` | boolean | `false` | Enable detailed console logging for debugging |
| `persistReplicatorLog` | boolean | `false` | Store replication logs in database resource |
| `replicatorLogResource` | string | `'replicator_log'` | Name of log resource for persistence |
| `logErrors` | boolean | `true` | Log errors to replication log resource |
| `batchSize` | number | `100` | Batch size for bulk replication operations |
| `maxRetries` | number | `3` | Maximum retry attempts for failed replications |
| `timeout` | number | `30000` | Timeout for replication operations (ms) |

---

## Replicator Drivers

### 🗃️ S3DB Replicator

Replicate to another S3DB instance with **advanced resource mapping and transformation capabilities**. Supports multiple configuration syntaxes for maximum flexibility.

#### Basic Configuration

```javascript
{
  driver: 's3db',
  config: {
    connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
  },
  resources: {
    // Simple resource mapping (replicate to same name)
    users: 'users',
    
    // Map source → destination resource name
    products: 'backup_products',
    
    // Advanced mapping with transform function
    orders: {
      resource: 'order_backup',
      transform: (data) => ({
        ...data,
        backup_timestamp: new Date().toISOString(),
        original_source: 'production',
        migrated_at: new Date().toISOString()
      }),
      actions: ['insert', 'update', 'delete']
    }
  }
}
```

#### Resource Configuration Syntaxes

The S3DB replicator supports **multiple configuration syntaxes** for maximum flexibility:

##### 1. Array of Resource Names
**Use case**: Simple backup/clone scenarios
```javascript
resources: ['users', 'products', 'orders']
// Replicates each resource to itself in the destination database
```

##### 2. Simple Object Mapping
**Use case**: Rename resources during replication
```javascript
resources: { 
  users: 'people',           // users → people
  products: 'items',         // products → items  
  orders: 'order_history'    // orders → order_history
}
```

##### 3. Object with Transform Function
**Use case**: Data transformation during replication (RECOMMENDED)
```javascript
resources: { 
  users: { 
    resource: 'people',     // Destination resource name
    transform: (data) => ({  // Data transformation function
      ...data, 
      fullName: `${data.firstName} ${data.lastName}`,
      migrated_at: new Date().toISOString(),
      source_system: 'production'
    }),
    actions: ['insert', 'update', 'delete']  // Optional: which operations to replicate
  }
}
```

##### 4. Function-Only Transformation
**Use case**: Transform data without changing resource name
```javascript
resources: { 
  users: (data) => ({ 
    ...data, 
    processed: true,
    backup_date: new Date().toISOString(),
    hash: crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
  })
}
```

##### 5. Multi-Destination Replication
**Use case**: Send data to multiple targets with different transformations
```javascript
resources: { 
  users: [
    'people',                    // Simple copy to 'people'
    { 
      resource: 'user_analytics', 
      transform: (data) => ({    // Transformed copy to 'user_analytics'
        id: data.id,
        signup_date: data.createdAt,
        user_type: data.role || 'standard',
        last_activity: new Date().toISOString()
      })
    },
    {
      resource: 'audit_trail',
      transform: (data) => ({    // Audit copy to 'audit_trail'
        user_id: data.id,
        action: 'user_replicated',
        timestamp: new Date().toISOString(),
        data_hash: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
      })
    }
  ]
}
```

### 📬 SQS Replicator

**Real-time event streaming** to AWS SQS queues for microservices integration and event-driven architectures.

**Required Dependency:**
```bash
pnpm add @aws-sdk/client-sqs
```

#### Basic Configuration

```javascript
{
  driver: 'sqs',
  resources: ['orders', 'users'],
  config: {
    region: 'us-east-1',
    queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/events.fifo',
    messageGroupId: 's3db-events',
    deduplicationId: true
  }
}
```

#### Advanced Configuration

```javascript
{
  driver: 'sqs',
  config: {
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    },
    
    // Resource-specific queue URLs
    queues: {
      orders: 'https://sqs.us-east-1.amazonaws.com/123456789012/order-events.fifo',
      users: 'https://sqs.us-east-1.amazonaws.com/123456789012/user-events.fifo',
      payments: 'https://sqs.us-east-1.amazonaws.com/123456789012/payment-events.fifo'
    },
    
    // Default queue for resources not specifically mapped
    defaultQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/general-events.fifo',
    
    // FIFO queue settings
    messageGroupId: 's3db-replicator',
    deduplicationId: true,
    
    // Message attributes (applied to all messages)
    messageAttributes: {
      source: { StringValue: 'production-db', DataType: 'String' },
      version: { StringValue: '1.0', DataType: 'String' },
      environment: { StringValue: process.env.NODE_ENV || 'development', DataType: 'String' }
    }
  },
  resources: {
    orders: true,
    users: true,
    payments: {
      transform: (data) => ({
        payment_id: data.id,
        amount: data.amount,
        currency: data.currency || 'USD',
        customer_id: data.userId,
        payment_method: data.method,
        status: data.status,
        timestamp: new Date().toISOString(),
        amount_usd: data.currency === 'USD' ? data.amount : data.amount * (data.exchange_rate || 1),
        is_large_payment: data.amount > 1000,
        risk_score: data.amount > 5000 ? 'high' : data.amount > 1000 ? 'medium' : 'low'
      })
    }
  }
}
```

### 📊 BigQuery Replicator

**Data warehouse integration** for Google BigQuery with advanced transformation capabilities.

**Required Dependency:**
```bash
pnpm add @google-cloud/bigquery
```

#### Basic Configuration

```javascript
{
  driver: 'bigquery',
  config: {
    projectId: 'my-analytics-project',
    datasetId: 'production_data',
    location: 'US',
    credentials: {
      // Service account key or application default credentials
    }
  },
  resources: {
    users: 'user_profiles',
    orders: 'order_history'
  }
}
```

---

## Usage Examples

### Multi-Target Replication Setup

```javascript
const replicatorPlugin = new ReplicatorPlugin({
  verbose: true,
  persistReplicatorLog: true,
  replicators: [
    // Backup to another S3DB
    {
      driver: 's3db',
      resources: ['users', 'products', 'orders'],
      config: {
        connectionString: "s3://BACKUP_KEY:BACKUP_SECRET@BACKUP_BUCKET/backup"
      }
    },
    
    // Stream events to SQS
    {
      driver: 'sqs',
      resources: {
        orders: {
          transform: (data) => ({
            order_id: data.id,
            customer_id: data.userId,
            amount: data.amount,
            status: data.status,
            event_timestamp: new Date().toISOString()
          })
        }
      },
      config: {
        region: 'us-east-1',
        queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/order-events.fifo',
        messageGroupId: 'order-events'
      }
    },
    
    // Analytics to BigQuery
    {
      driver: 'bigquery',
      resources: {
        users: {
          resource: 'user_analytics',
          transform: (data) => ({
            user_id: data.id,
            signup_date: data.createdAt,
            user_type: data.role || 'standard',
            email_domain: data.email?.split('@')[1] || 'unknown',
            created_timestamp: new Date().toISOString()
          })
        }
      },
      config: {
        projectId: 'analytics-project',
        datasetId: 'user_data',
        location: 'US'
      }
    }
  ]
});
```

### Advanced Data Transformations

```javascript
// Complex transformation examples
const transformationExamples = {
  // Field mapping and enrichment
  users: {
    resource: 'customer_profiles',
    transform: (data) => ({
      id: data.id,
      customer_name: `${data.firstName} ${data.lastName}`,
      email_domain: data.email?.split('@')[1] || 'unknown',
      created_timestamp: Date.now(),
      source: 'production-db'
    })
  },
  
  // Conditional logic
  orders: {
    resource: 'processed_orders',
    transform: (data) => {
      if (data.type === 'premium') {
        return { ...data, priority: 'high', sla: '4hours' };
      }
      return { ...data, priority: 'normal', sla: '24hours' };
    }
  },
  
  // Data validation and filtering
  products: {
    resource: 'validated_products',
    transform: (data) => {
      // Skip replication for invalid data
      if (!data.name || !data.price) return null;
      
      return {
        ...data,
        name: data.name.trim(),
        price: parseFloat(data.price),
        validated: true
      };
    }
  },
  
  // Computed fields
  customer_analytics: {
    resource: 'customer_insights',
    transform: (data) => ({
      ...data,
      age: data.birthDate ? 
        Math.floor((Date.now() - new Date(data.birthDate)) / (1000 * 60 * 60 * 24 * 365)) : null,
      account_value: (data.orders || []).reduce((sum, order) => sum + order.amount, 0),
      last_activity: new Date().toISOString()
    })
  }
};
```

### Event Monitoring and Debugging

```javascript
// Event system for monitoring and debugging
const replicatorPlugin = s3db.plugins.find(p => p.constructor.name === 'ReplicatorPlugin');

// Success events
replicatorPlugin.on('replicated', (data) => {
  console.log(`✅ Replicated: ${data.operation} on ${data.resourceName} to ${data.replicator}`);
});

// Error events
replicatorPlugin.on('replicator_error', (data) => {
  console.error(`❌ Replication failed: ${data.error} (${data.resourceName})`);
});

// Log resource errors
replicatorPlugin.on('replicator_log_error', (data) => {
  console.warn(`⚠️ Failed to log replication: ${data.logError}`);
});

// Setup errors
replicatorPlugin.on('replicator_log_resource_creation_error', (data) => {
  console.error(`🚨 Log resource creation failed: ${data.error}`);
});

// Cleanup errors
replicatorPlugin.on('replicator_cleanup_error', (data) => {
  console.warn(`🧹 Cleanup failed for ${data.replicator}: ${data.error}`);
});
```

---

## API Reference

### Plugin Constructor

```javascript
new ReplicatorPlugin({
  enabled?: boolean,
  replicators: ReplicatorConfig[],
  verbose?: boolean,
  persistReplicatorLog?: boolean,
  replicatorLogResource?: string,
  logErrors?: boolean,
  batchSize?: number,
  maxRetries?: number,
  timeout?: number
})
```

### Replicator Configuration

```javascript
interface ReplicatorConfig {
  driver: 's3db' | 'sqs' | 'bigquery' | 'postgresql' | string;
  resources: ResourceMapping;
  config: DriverConfig;
  enabled?: boolean;
}
```

### Transform Function Features

Transform functions provide powerful data manipulation capabilities:

```javascript
// Return null to skip replication
transform: (data) => {
  if (data.status === 'deleted') return null;
  return data;
}

// Preserve the id field unless mapping to different field
transform: (data) => ({
  id: data.id,
  customer_id: data.id, // Map to different field name
  ...data
})

// Handle edge cases
transform: (data) => ({
  ...data,
  name: data.name?.trim() || 'Unknown',
  email: data.email?.toLowerCase() || null,
  age: data.birthDate ? calculateAge(data.birthDate) : null
})

// Add metadata fields
transform: (data) => ({
  ...data,
  replicated_at: new Date().toISOString(),
  source_system: 'production',
  version: '1.0'
})
```

---

## Best Practices

### 1. Design Robust Transform Functions

```javascript
// Good: Handle edge cases and validation
transform: (data) => {
  // Validation
  if (!data.id || !data.email) return null;
  
  // Safe property access
  const firstName = data.firstName?.trim() || '';
  const lastName = data.lastName?.trim() || '';
  
  // Computed fields with fallbacks
  const fullName = firstName && lastName ? 
    `${firstName} ${lastName}` : 
    firstName || lastName || 'Unknown';
  
  return {
    ...data,
    fullName,
    email: data.email.toLowerCase(),
    processed_at: new Date().toISOString()
  };
}
```

### 2. Implement Selective Replication

```javascript
// Replicate only specific operations
{
  resources: {
    users: {
      resource: 'user_backup',
      actions: ['insert', 'update'], // Skip deletes
      transform: (data) => ({ ...data, backup_timestamp: Date.now() })
    }
  }
}
```

### 3. Monitor Replication Health

```javascript
// Set up comprehensive monitoring
const replicationMetrics = {
  successful: 0,
  failed: 0,
  skipped: 0,
  startTime: Date.now()
};

replicatorPlugin.on('replicated', () => {
  replicationMetrics.successful++;
});

replicatorPlugin.on('replicator_error', (data) => {
  replicationMetrics.failed++;
  
  // Alert on high error rates
  const totalAttempts = replicationMetrics.successful + replicationMetrics.failed;
  const errorRate = replicationMetrics.failed / totalAttempts;
  
  if (errorRate > 0.1 && totalAttempts > 10) {
    console.error(`🚨 High replication error rate: ${(errorRate * 100).toFixed(1)}%`);
  }
});

// Periodic health check
setInterval(() => {
  const uptime = Date.now() - replicationMetrics.startTime;
  const successRate = replicationMetrics.successful / 
    (replicationMetrics.successful + replicationMetrics.failed) * 100;
  
  console.log(`Replication health: ${successRate.toFixed(1)}% success rate over ${Math.round(uptime / 60000)} minutes`);
}, 300000); // Every 5 minutes
```

### 4. Use Environment-Specific Configuration

```javascript
// Different configurations per environment
const getReplicatorConfig = () => {
  const env = process.env.NODE_ENV;
  
  if (env === 'production') {
    return {
      replicators: [
        // Production backup
        { driver: 's3db', resources: ['users', 'orders'], config: { ... } },
        // Analytics pipeline
        { driver: 'bigquery', resources: { orders: 'order_analytics' }, config: { ... } },
        // Event streaming
        { driver: 'sqs', resources: ['orders'], config: { ... } }
      ]
    };
  }
  
  if (env === 'staging') {
    return {
      replicators: [
        // Staging backup only
        { driver: 's3db', resources: ['users'], config: { ... } }
      ]
    };
  }
  
  // Development - no replication
  return { enabled: false };
};
```

### 5. Handle Sensitive Data

```javascript
// Strip sensitive data before replication
{
  resources: {
    users: {
      resource: 'user_profiles',
      transform: (data) => {
        const { password, ssn, creditCard, ...safeData } = data;
        
        return {
          ...safeData,
          // Hash sensitive fields if needed for analytics
          email_hash: crypto.createHash('sha256').update(data.email).digest('hex'),
          has_payment_method: !!creditCard,
          processed_at: new Date().toISOString()
        };
      }
    }
  }
}
```

### 6. Optimize for Performance

```javascript
// Batch configuration for high-volume scenarios
{
  batchSize: 500,        // Larger batches for better throughput
  maxRetries: 5,         // More retries for transient failures
  timeout: 60000,        // Longer timeout for batch operations
  
  replicators: [
    {
      driver: 'bigquery',
      resources: ['orders'],
      config: {
        // BigQuery-specific optimizations
        insertMethod: 'streaming', // or 'batch'
        ignoreUnknownValues: true,
        maxRetries: 3
      }
    }
  ]
}
```

---

## 🚨 Error Handling

The Replicator Plugin uses standardized error classes with comprehensive context and recovery guidance:

### ReplicatorError

All replication operations throw `ReplicatorError` instances with detailed context:

```javascript
try {
  await replicatorPlugin.replicateBatch('users', records);
} catch (error) {
  console.error(error.name);        // 'ReplicatorError'
  console.error(error.message);     // Brief error summary
  console.error(error.description); // Detailed explanation with guidance
  console.error(error.context);     // Replicator, resource, operation details
}
```

### Common Errors

#### Replicator Not Found

**When**: Referencing non-existent replicator ID
**Error**: `Replicator not found: {replicatorId}`
**Recovery**:
```javascript
// Bad
await replicatorPlugin.syncAllData('nonexistent-id');  // Throws

// Good - List available replicators
const replicators = await replicatorPlugin.listReplicators();
console.log('Available replicators:', replicators.map(r => r.id));

// Good - Check replicator exists
if (replicators.find(r => r.id === 'my-replicator')) {
  await replicatorPlugin.syncAllData('my-replicator');
}
```

#### Transform Function Errors

**When**: Transform function throws or returns invalid data
**Error**: `Transform function failed for resource '{resourceName}': {errorMessage}`
**Recovery**:
```javascript
// Robust transform functions
resources: {
  users: {
    resource: 'user_profiles',
    transform: (data) => {
      try {
        // Validate required fields
        if (!data.id || !data.email) {
          console.warn(`Skipping invalid user:`, data);
          return null;  // Skip this record
        }

        // Safe transformations
        return {
          id: data.id,
          name: data.name?.trim() || 'Unknown',
          email: data.email.toLowerCase(),
          created_at: new Date().toISOString()
        };
      } catch (error) {
        console.error(`Transform error for user ${data.id}:`, error);
        return null;  // Skip on error
      }
    }
  }
}

// Monitor transform failures
replicatorPlugin.on('replicator_error', (data) => {
  if (data.error.includes('Transform function failed')) {
    console.error(`Transform failed for ${data.resourceName}:`, data.error);
    // Log to external monitoring
  }
});
```

#### Destination Connection Errors

**When**: Cannot connect to replication target
**Error**: `Failed to replicate to {driver}: Connection failed`
**Recovery**:
```javascript
// Monitor connection errors
replicatorPlugin.on('replicator_error', async (data) => {
  if (data.error.includes('Connection failed')) {
    console.error(`Replicator ${data.replicator} connection failed`);

    // Implement circuit breaker
    const failureCount = (connectionFailures.get(data.replicator) || 0) + 1;
    connectionFailures.set(data.replicator, failureCount);

    if (failureCount >= 5) {
      console.error(`Disabling replicator ${data.replicator} after ${failureCount} failures`);
      await replicatorPlugin.disableReplicator(data.replicator);

      // Alert operations team
      await sendAlert({
        title: 'Replicator Disabled',
        message: `Replicator ${data.replicator} disabled due to connection failures`
      });
    }
  }
});
```

#### Batch Replication Errors

**When**: Batch operation fails
**Error**: `replicateBatch() method must be implemented by subclass`
**Recovery**:
```javascript
// Fallback to individual operations
async function safeReplicateBatch(replicator, resourceName, records) {
  try {
    return await replicator.replicateBatch(resourceName, records);
  } catch (error) {
    if (error.message.includes('must be implemented')) {
      // Fallback to individual replication
      console.warn('Batch not supported, using individual operations');

      const results = [];
      for (const record of records) {
        try {
          await replicator.replicate(resourceName, 'insert', record, record.id);
          results.push({ success: true, id: record.id });
        } catch (err) {
          results.push({ success: false, id: record.id, error: err.message });
        }
      }
      return results;
    }
    throw error;
  }
}
```

### Error Recovery Patterns

#### Dead Letter Queue

Handle persistent failures:
```javascript
// Create dead letter resource for failed replications
await database.createResource({
  name: 'replication_dlq',
  attributes: {
    resource: 'string|required',
    operation: 'string|required',
    data: 'object|required',
    error: 'string|required',
    attempts: 'number',
    failed_at: 'string|required'
  }
});

// Monitor replication errors
replicatorPlugin.on('replicator_error', async (data) => {
  const attempts = (errorAttempts.get(data.recordId) || 0) + 1;
  errorAttempts.set(data.recordId, attempts);

  if (attempts >= 3) {
    // Move to dead letter queue
    await database.resource('replication_dlq').insert({
      id: `dlq_${Date.now()}_${data.recordId}`,
      resource: data.resourceName,
      operation: data.operation,
      data: data.record,
      error: data.error,
      attempts,
      failed_at: new Date().toISOString()
    });

    console.error(`Moved ${data.recordId} to DLQ after ${attempts} attempts`);
    errorAttempts.delete(data.recordId);
  }
});
```

#### Graceful Degradation

Continue operations despite failures:
```javascript
// Wrap replicators in try-catch to prevent cascading failures
const safeReplicators = replicators.map(replicator => ({
  ...replicator,
  replicate: async (resource, operation, data, id) => {
    try {
      return await replicator.replicate(resource, operation, data, id);
    } catch (error) {
      console.error(`Replicator ${replicator.id} failed:`, error);
      // Don't throw - allow other replicators to continue
      return { success: false, error: error.message };
    }
  }
}));
```

#### Retry with Backoff

Implement exponential backoff for transient failures:
```javascript
async function replicateWithRetry(replicator, resource, operation, data, id, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await replicator.replicate(resource, operation, data, id);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      const delay = Math.pow(2, attempt) * 1000;  // Exponential backoff
      console.log(`Retry ${attempt}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## Troubleshooting

### Issue: Replication failing with timeout errors
**Solution**: Increase timeout values, reduce batch sizes, or check network connectivity to target systems.

### Issue: Transform functions causing errors
**Solution**: Add proper error handling and validation in transform functions. Return null to skip problematic records.

### Issue: High memory usage during replication
**Solution**: Reduce batch sizes, implement backpressure controls, or use streaming for large datasets.

### Issue: SQS messages not appearing
**Solution**: Verify queue URLs, check IAM permissions, and ensure correct region configuration.

### Issue: Data inconsistencies in replicated targets
**Solution**: Implement transaction logs, add data validation checks, and consider eventual consistency patterns.

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Audit Plugin](./audit.md) - Track replication operations
- [Metrics Plugin](./metrics.md) - Monitor replication performance
- [Queue Consumer Plugin](./queue-consumer.md) - Process replicated events
## ❓ FAQ

### Básico

**P: Para que serve o ReplicatorPlugin?**
R: Replica dados automaticamente para outros bancos de dados (S3DB, PostgreSQL, BigQuery), filas (SQS) ou outro destino quando há insert/update/delete.

**P: Quais drivers estão disponíveis?**
R: `s3db` (outro bucket S3DB), `sqs` (AWS SQS), `postgresql`, `bigquery`, `s3` (S3 puro).

**P: Como funciona o mapeamento de recursos?**
R: Você pode mapear recursos 1:1, renomear ou transformar dados:
```javascript
resources: {
  users: 'people',  // Renomeia
  orders: { 
    resource: 'pedidos', 
    transform: (data) => ({ ...data, status: 'novo' }) 
  }
}
```

### Configuração

**P: Como replicar para múltiplos destinos?**
R: Use um array de replicadores:
```javascript
new ReplicatorPlugin({
  replicators: [
    { driver: 's3db', config: {...}, resources: ['users'] },
    { driver: 'sqs', config: {...}, resources: ['events'] }
  ]
})
```

**P: Como configurar retries?**
R: Use `maxRetries`:
```javascript
new ReplicatorPlugin({
  maxRetries: 5,
  timeout: 60000,
  replicators: [...]
})
```

**P: Como persistir logs de replicação?**
R: Configure `persistReplicatorLog: true`:
```javascript
new ReplicatorPlugin({
  persistReplicatorLog: true,
  replicatorLogResource: 'replicator_logs',
  replicators: [...]
})
```

### Operações

**P: Como forçar sync completo dos dados?**
R: A replicação é automática e em tempo real via eventos. Para sincronização manual ou inicial, você pode iterar sobre os recursos e replicar manualmente.

**P: Como obter estatísticas de replicação?**
R: Monitore eventos:
```javascript
replicatorPlugin.on('replicated', (data) => {
  console.log(`Replicated: ${data.operation} on ${data.resourceName}`);
});

replicatorPlugin.on('replicator_error', (data) => {
  console.error(`Failed: ${data.error}`);
});
```

**P: Como skip replicação para operações específicas?**
R: Use a opção `actions`:
```javascript
resources: {
  users: {
    resource: 'users_backup',
    actions: ['insert', 'update']  // Skip deletes
  }
}
```

### Transformação

**P: Como transformar dados antes de replicar?**
R: Use a função `transform`:
```javascript
resources: {
  users: {
    resource: 'customer_profiles',
    transform: (data) => ({
      id: data.id,
      name: `${data.firstName} ${data.lastName}`,
      email_domain: data.email?.split('@')[1],
      created_timestamp: Date.now()
    })
  }
}
```

**P: Como skip replicação para registros específicos?**
R: Retorne `null` na função transform:
```javascript
transform: (data) => {
  if (data.status === 'draft') return null;  // Skip drafts
  return data;
}
```

### Troubleshooting

**P: Replicações estão falhando?**
R: Verifique:
1. Credenciais corretas para o destino
2. Recurso de destino existe
3. Função transform não tem erros
4. Use `verbose: true` para logs detalhados

**P: Como reprocessar replicações falhadas?**
R: Se `persistReplicatorLog: true`, consulte os logs e republique manualmente:
```javascript
const failedLogs = await database.resource('replicator_logs').query({
  where: { status: 'error' }
});
```

**P: A replicação está muito lenta?**
R: Aumente `batchSize` e verifique o `timeout`:
```javascript
new ReplicatorPlugin({
  batchSize: 200,
  timeout: 120000  // 2 minutos
})
```

---
