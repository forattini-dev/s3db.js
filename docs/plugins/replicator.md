# 🔄 Replicator Plugin

## ⚡ TLDR

Replicação **real-time CDC** (Change Data Capture) para múltiplos destinos - **cada operação é replicada individualmente** em near real-time.

**1 linha para começar:**
```javascript
await db.usePlugin(new ReplicatorPlugin({ replicators: [{ driver: 's3db', resources: ['users'], config: { connectionString: 's3://...' }}] }));
```

**Principais features:**
- ✅ **Real-Time CDC**: Cada insert/update/delete replicado individualmente (<10ms latency)
- ✅ Multi-target: S3DB, BigQuery, PostgreSQL, MySQL, MariaDB, DynamoDB, MongoDB, SQS, Webhooks
- ✅ Transformação de dados com funções customizadas
- ✅ Retry automático com backoff exponencial
- ✅ Dead letter queue para falhas
- ✅ Event monitoring completo

**Quando usar:**
- 📊 Analytics pipelines em tempo real
- 🔄 Event sourcing / message queues
- 🌍 Multi-destination sync
- 📈 Audit trail contínuo

**Performance & Manutenção:**
```javascript
// ❌ Sem replicator: Cron job manual exportando para PostgreSQL
// - Roda 1x/dia à meia-noite
// - Dados sempre com 24h de atraso
// - Quebra quando schema muda
// - 4 horas/semana de manutenção

// ✅ Com replicator: Sync automático em tempo real
await users.insert({ name: 'John' }); // Replica automaticamente
// - Dados disponíveis em ~2 segundos
// - Zero manutenção
// - Não quebra com mudanças de schema (com transform)
// - Múltiplos destinos simultâneos
```

---

## 🆚 ReplicatorPlugin vs BackupPlugin

**ReplicatorPlugin** provides **real-time CDC** (Change Data Capture):
- ✅ Replicates **each operation** individually (insert/update/delete)
- ✅ Near real-time (<10ms latency per operation)
- ✅ Processes 1 record at a time
- ✅ Multiple destinations: PostgreSQL, MySQL, MariaDB, DynamoDB, MongoDB, BigQuery, SQS, Webhooks
- ✅ Perfect for: analytics pipelines, event sourcing, multi-destination sync

**BackupPlugin** creates **periodic snapshots** (batch):
- ✅ Complete snapshots of ALL resources at specific timestamps
- ✅ Scheduled (cron) or manual (daily/weekly/monthly)
- ✅ Exports entire datasets with streaming (constant ~10KB memory)
- ✅ JSONL.gz format for portability
- ✅ Perfect for: disaster recovery, compliance, point-in-time recovery

| Aspect | ReplicatorPlugin | BackupPlugin |
|--------|-----------------|--------------|
| **Timing** | Every operation | Scheduled (hourly/daily) |
| **Granularity** | 1 record at a time | All resources at once |
| **Latency** | Milliseconds | Minutes/hours |
| **Use Case** | Real-time analytics | Disaster recovery |
| **Destinations** | PostgreSQL, MySQL, DynamoDB, MongoDB, BigQuery, SQS, etc | JSONL.gz files |

**Key Difference:**
```javascript
// ReplicatorPlugin: Every operation is replicated
await users.insert({ name: 'John' });  // → Replicated to all destinations in ~2s
await users.update('1', { name: 'Jane' });  // → Replicated in ~2s
await users.delete('2');  // → Replicated in ~2s

// BackupPlugin: Scheduled snapshots of entire database
await backupPlugin.backup('full');  // → Snapshot of ALL resources at this moment
```

**Use Both Together:**
```javascript
// ReplicatorPlugin for real-time analytics
new ReplicatorPlugin({
  replicators: [{
    driver: 'bigquery',
    resources: ['events', 'users'],
    config: { projectId: 'my-project', dataset: 'analytics' }
  }]
})

// BackupPlugin for disaster recovery
new BackupPlugin({
  driver: 's3',
  config: { bucket: 'backups' },
  schedule: { daily: '0 2 * * *' }  // 2am daily
})
```

📚 See [BackupPlugin docs](./backup.md) for periodic snapshots and disaster recovery.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Usage Journey](#usage-journey) - **Comece aqui para aprender passo-a-passo**
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Replicator Drivers](#replicator-drivers)
  - [S3DB Replicator](#️-s3db-replicator) - Replicate to another S3DB instance
  - [SQS Replicator](#-sqs-replicator) - Send to AWS SQS queues
  - [Webhook Replicator](#-webhook-replicator) - HTTP/HTTPS webhooks
  - [BigQuery Replicator](#-bigquery-replicator) - Google BigQuery integration
  - [MySQL / MariaDB Replicator](#-mysql--mariadb-replicator) - MySQL & MariaDB database integration
  - [DynamoDB Replicator](#-dynamodb-replicator) - AWS DynamoDB integration
  - [MongoDB Replicator](#-mongodb-replicator) - MongoDB database integration
  - [PostgreSQL Replicator](#-postgresql-replicator) - PostgreSQL database integration
- [API Reference](#api-reference)
- [Best Practices](#best-practices)

---

## Overview

The Replicator Plugin provides **enterprise-grade data replication** that synchronizes your s3db data in real-time to multiple targets including other S3DB instances, SQS queues, relational databases (PostgreSQL, MySQL, MariaDB), NoSQL databases (DynamoDB, MongoDB), BigQuery, and more. It features robust error handling, advanced transformation capabilities, and comprehensive monitoring.

### How It Works

1. **Real-time Monitoring**: Listens to all database operations (insert, update, delete)
2. **Near Real-Time CDC**: Replicates each record individually as operations occur (<10ms latency)
3. **Multi-Target Support**: Replicates to multiple destinations simultaneously
4. **Data Transformation**: Transform data before replication using custom functions
5. **Error Resilience**: Automatic retries and comprehensive error reporting
6. **Flexible Configuration**: Multiple resource mapping syntaxes for complex scenarios

> 🔄 **Real-Time CDC**: ReplicatorPlugin provides Change Data Capture - every insert/update/delete is replicated individually in near real-time.

---

## Usage Journey

### Level 1: Simple Backup (S3DB → S3DB)

Comece aqui para backup básico entre buckets:

```javascript
// Step 1: Configure backup para outro bucket
new ReplicatorPlugin({
  replicators: [{
    driver: 's3db',
    resources: ['users'],  // Replica apenas users
    config: {
      connectionString: 's3://KEY:SECRET@backup-bucket/database'
    }
  }]
})

// Step 2: Use normalmente - backup é automático
await users.insert({ name: 'John', email: 'john@example.com' });
// Replicado automaticamente para backup-bucket em ~2s
```

**O que você ganha:** Backup automático em tempo real, zero código adicional.

### Level 2: Add Data Transformation

Quando precisar transformar dados antes de replicar:

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 's3db',
    resources: {
      users: {
        resource: 'users_backup',  // Nome diferente no destino
        transform: (data) => ({
          id: data.id,
          name: data.name,
          email: data.email,
          // Remove campos sensíveis
          // password: OMITIDO
          created_at: new Date().toISOString()
        }),
        actions: ['insert', 'update']  // Não replica deletes
      }
    },
    config: { connectionString: 's3://...' }
  }]
})
```

**O que você ganha:** Controle total sobre o que e como é replicado.

### Level 3: Multi-Destination Replication

Para analytics, webhooks e múltiplos sistemas:

```javascript
new ReplicatorPlugin({
  replicators: [
    // 1. Backup para S3
    {
      driver: 's3db',
      resources: ['users', 'orders'],
      config: { connectionString: 's3://backup-bucket/...' }
    },

    // 2. Analytics no PostgreSQL
    {
      driver: 'postgresql',
      resources: {
        orders: {
          resource: 'analytics_orders',
          transform: (data) => ({
            order_id: data.id,
            total: data.total,
            created_at: data.createdAt,
            // Campos otimizados para analytics
          })
        }
      },
      config: {
        connectionString: process.env.POSTGRES_URL
      }
    },

    // 3. Event stream para SQS
    {
      driver: 'sqs',
      resources: ['orders'],
      config: {
        queueUrl: process.env.SQS_QUEUE_URL,
        region: 'us-east-1'
      }
    },

    // 4. Webhook para CRM externo
    {
      driver: 'webhook',
      resources: {
        users: {
          actions: ['insert'],  // Só novos usuários
          transform: (data) => ({
            user_id: data.id,
            email: data.email,
            name: data.name
          })
        }
      },
      config: {
        url: 'https://crm.example.com/api/users',
        headers: { 'Authorization': `Bearer ${process.env.CRM_TOKEN}` }
      }
    }
  ]
})
```

**O que você ganha:** Um write, quatro destinos. Zero manutenção de scripts ETL.

### Level 4: Error Handling & Monitoring

Adicionar resiliência e observabilidade:

```javascript
new ReplicatorPlugin({
  verbose: true,  // Logs detalhados
  persistReplicatorLog: true,  // Armazena logs no banco
  maxRetries: 3,  // 3 tentativas antes de falhar

  replicators: [{
    driver: 'postgresql',
    resources: ['orders'],
    config: { connectionString: process.env.POSTGRES_URL }
  }]
})

// Monitorar erros
db.on('replicator:error', ({ error, resource, data }) => {
  console.error(`Falha ao replicar ${resource}:`, error.message);
  // Enviar para Sentry/DataDog
  Sentry.captureException(error, { extra: { resource, data } });
});

// Monitorar sucesso
db.on('replicator:success', ({ resource, destination }) => {
  console.log(`✓ ${resource} replicado para ${destination}`);
});

// Ver logs persistidos
const logs = await db.resource('replicator_log');
const errors = await logs.query({ status: 'error' });
console.log(`${errors.length} erros de replicação`);
```

**O que você ganha:** Visibilidade completa, debugging fácil.

### Level 5: Selective Replication with Filters

Controle fino sobre o que replica:

```javascript
new ReplicatorPlugin({
  replicators: [{
    driver: 'postgresql',
    resources: {
      orders: {
        // Só replica orders completos
        shouldReplicate: (data, action) => {
          if (action === 'delete') return false;  // Nunca replica deletes
          if (data.status !== 'completed') return false;  // Só completos
          if (data.total < 100) return false;  // Só pedidos > $100
          return true;
        },

        transform: (data) => ({
          id: data.id,
          total: data.total,
          status: data.status,
          completed_at: new Date().toISOString()
        })
      }
    },
    config: { connectionString: process.env.ANALYTICS_DB }
  }]
})
```

**O que você ganha:** Replica apenas o necessário, economiza storage e processamento.

### Level 6: Production - Multi-Region Sync

Para alta disponibilidade e disaster recovery:

```javascript
new ReplicatorPlugin({
  replicators: [
    // Primary backup (mesma região)
    {
      driver: 's3db',
      resources: ['users', 'orders', 'products'],
      config: {
        connectionString: 's3://us-east-1-backup/...'
      }
    },

    // Secondary backup (região diferente)
    {
      driver: 's3db',
      resources: ['users', 'orders', 'products'],
      config: {
        connectionString: 's3://eu-west-1-backup/...'
      }
    },

    // Analytics (BigQuery)
    {
      driver: 'bigquery',
      resources: {
        orders: {
          resource: 'analytics.orders',
          transform: (data) => ({
            // Schema otimizado para BigQuery
            order_id: data.id,
            total_usd: parseFloat(data.total),
            created_timestamp: new Date(data.createdAt).getTime(),
            customer_id: data.customerId
          })
        }
      },
      config: {
        projectId: process.env.GCP_PROJECT,
        credentials: JSON.parse(process.env.GCP_CREDENTIALS)
      }
    }
  ],

  // Monitor health
  verbose: true,
  persistReplicatorLog: true
})

// Health check endpoint
app.get('/health/replication', async (req, res) => {
  const logs = await db.resource('replicator_log');
  const recentErrors = await logs.query({
    status: 'error',
    timestamp: { $gte: Date.now() - 3600000 }  // Última hora
  });

  if (recentErrors.length > 10) {
    return res.status(500).json({ status: 'unhealthy', errors: recentErrors.length });
  }

  res.json({ status: 'healthy', errors: recentErrors.length });
});
```

**O que você ganha:** Multi-region, multi-destination, production-ready com monitoring.

---

## Installation & Setup

### 📦 Required Dependencies

**Important:** Some replicator drivers require additional dependencies. The s3db.js core package **does not include** these dependencies to keep the package lightweight.

**Install only what you need:**

```bash
# For PostgreSQL replication
pnpm add pg

# For BigQuery replication
pnpm add @google-cloud/bigquery

# For SQS replication
pnpm add @aws-sdk/client-sqs
```

| Driver | Package | Version | Install Command |
|--------|---------|---------|-----------------|
| `postgresql` | `pg` | `^8.0.0` | `pnpm add pg` |
| `bigquery` | `@google-cloud/bigquery` | `^7.0.0` | `pnpm add @google-cloud/bigquery` |
| `sqs` | `@aws-sdk/client-sqs` | `^3.0.0` | `pnpm add @aws-sdk/client-sqs` |
| `s3db` | *(built-in)* | - | No installation needed |
| `webhook` | *(built-in)* | - | No installation needed |
| `csv`, `jsonl`, `parquet`, `excel` | *(built-in)* | - | No installation needed |

**Automatic Validation:** When you use a replicator, s3db.js automatically validates dependencies at runtime. If a dependency is missing, you'll get a clear error message with installation instructions.

**Example Error:**

```bash
Error: PostgreSQL Replicator - Missing dependencies detected!

❌ Missing dependency: pg
   Description: PostgreSQL client for Node.js
   Required: ^8.0.0
   Install: pnpm add pg
```

---

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

### 📡 Webhook Replicator

**HTTP webhook integration** for sending database changes to external APIs and services with comprehensive authentication support.

#### Basic Configuration

```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    method: 'POST',  // Default: POST
    timeout: 5000,    // Request timeout in ms (default: 5000)
    retries: 3,       // Number of retry attempts (default: 3)
  },
  resources: ['users', 'orders']
}
```

#### Authentication Methods

##### 1. Bearer Token Authentication
```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    auth: {
      type: 'bearer',
      token: process.env.WEBHOOK_TOKEN
    }
  }
}
```

##### 2. Basic Authentication
```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    auth: {
      type: 'basic',
      username: 'api_user',
      password: process.env.API_PASSWORD
    }
  }
}
```

##### 3. API Key Authentication
```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    auth: {
      type: 'apikey',
      header: 'X-API-Key',  // Custom header name
      value: process.env.API_KEY
    }
  }
}
```

#### Advanced Configuration

```javascript
{
  driver: 'webhook',
  config: {
    url: 'https://api.example.com/webhook',
    method: 'POST',

    // Custom headers
    headers: {
      'Content-Type': 'application/json',
      'X-Custom-Header': 'value',
      'X-Environment': process.env.NODE_ENV
    },

    // Authentication
    auth: {
      type: 'bearer',
      token: process.env.WEBHOOK_TOKEN
    },

    // Timeout and retry configuration
    timeout: 10000,         // 10 seconds
    retries: 3,             // Retry up to 3 times
    retryDelay: 1000,       // Initial delay between retries (ms)
    retryStrategy: 'exponential',  // 'exponential' or 'fixed'
    retryOnStatus: [429, 500, 502, 503, 504],  // HTTP status codes to retry

    // Batch mode (optional)
    batch: true,            // Send multiple records in one request
    batchSize: 100         // Max records per batch
  },
  resources: {
    users: true,
    orders: {
      transform: (data) => ({
        order_id: data.id,
        customer: data.userId,
        total: data.total,
        items: data.items,
        timestamp: new Date().toISOString(),
        // Add custom fields
        webhook_version: '1.0',
        environment: process.env.NODE_ENV
      })
    }
  }
}
```

#### Webhook Payload Format

The webhook receives a standardized payload:

```json
{
  "resource": "users",
  "action": "insert",
  "timestamp": "2025-10-18T10:30:00.000Z",
  "source": "s3db-webhook-replicator",
  "data": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

For update operations:
```json
{
  "resource": "users",
  "action": "update",
  "timestamp": "2025-10-18T10:30:00.000Z",
  "source": "s3db-webhook-replicator",
  "before": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "data": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john.doe@example.com"
  }
}
```

#### Batch Mode Payload

When `batch: true` is enabled:
```json
{
  "batch": [
    {
      "resource": "users",
      "action": "insert",
      "timestamp": "2025-10-18T10:30:00.000Z",
      "source": "s3db-webhook-replicator",
      "data": { "id": "user_123", "name": "John Doe" }
    },
    {
      "resource": "users",
      "action": "update",
      "timestamp": "2025-10-18T10:30:01.000Z",
      "source": "s3db-webhook-replicator",
      "before": { "id": "user_124", "name": "Jane" },
      "data": { "id": "user_124", "name": "Jane Doe" }
    }
  ]
}
```

#### Retry Strategy

**Exponential Backoff** (default):
- Attempt 1: Immediate
- Attempt 2: 1s delay
- Attempt 3: 2s delay
- Attempt 4: 4s delay

**Fixed Delay**:
- All retries use the same `retryDelay` value

#### Use Cases

**1. Third-party Integrations**
```javascript
// Notify external CRM when users are created/updated
{
  driver: 'webhook',
  config: {
    url: 'https://crm.example.com/api/users/sync',
    auth: { type: 'apikey', header: 'X-API-Key', value: process.env.CRM_API_KEY }
  },
  resources: ['users']
}
```

**2. Slack/Discord Notifications**
```javascript
// Send notifications to Slack
{
  driver: 'webhook',
  config: {
    url: process.env.SLACK_WEBHOOK_URL,
    headers: { 'Content-Type': 'application/json' }
  },
  resources: {
    orders: {
      transform: (data) => ({
        text: `New order #${data.id} - Total: $${data.total}`,
        channel: '#orders',
        username: 's3db-bot'
      })
    }
  }
}
```

**3. Analytics/Monitoring**
```javascript
// Send events to analytics platform
{
  driver: 'webhook',
  config: {
    url: 'https://analytics.example.com/events',
    auth: { type: 'bearer', token: process.env.ANALYTICS_TOKEN },
    batch: true,
    batchSize: 100
  },
  resources: ['users', 'orders', 'events']
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

### 🐬 MySQL / MariaDB Replicator

**Relational database integration** for MySQL and MariaDB with connection pooling and optional replication logging.

**Required Dependency:**
```bash
pnpm add mysql2
```

#### Basic Configuration

```javascript
{
  driver: 'mysql',  // or 'mariadb' (uses same mysql2 driver)
  config: {
    host: 'localhost',
    port: 3306,
    database: 'production_db',
    user: 'replicator_user',
    password: 'secure_password',
    connectionLimit: 10,  // Connection pool size
    ssl: {  // Optional SSL configuration
      rejectUnauthorized: true
    },
    logTable: 'replication_log'  // Optional: log all operations
  },
  resources: {
    users: 'users_table',
    orders: 'orders_table'
  }
}
```

#### Advanced Configuration

```javascript
{
  driver: 'mysql',
  config: {
    host: 'mysql.example.com',
    port: 3306,
    database: 'analytics',
    user: 'replicator',
    password: process.env.MYSQL_PASSWORD,
    connectionLimit: 20,
    ssl: {
      ca: fs.readFileSync('ca-cert.pem'),
      cert: fs.readFileSync('client-cert.pem'),
      key: fs.readFileSync('client-key.pem')
    },
    logTable: 'replication_audit'  // Track all replicated operations
  },
  resources: {
    // Simple mapping
    users: 'users',

    // Multiple actions
    products: [{
      table: 'products',
      actions: ['insert', 'update', 'delete']
    }],

    // Multiple tables for same resource
    orders: [
      { table: 'orders_current', actions: ['insert', 'update'] },
      { table: 'orders_archive', actions: ['insert'] }
    ]
  }
}
```

#### Features

- ✅ **Connection Pooling**: Configurable pool size (default: 10 connections)
- ✅ **SSL/TLS Support**: Secure connections with certificate validation
- ✅ **Replication Logging**: Optional audit table for all operations
- ✅ **Parameterized Queries**: SQL injection protection
- ✅ **Insert, Update, Delete**: Full CRUD operation support
- ✅ **Multi-Table Replication**: Same resource → multiple MySQL tables
- ✅ **MariaDB Compatible**: Use same driver for MariaDB

---

### ⚡ DynamoDB Replicator

**NoSQL database integration** for AWS DynamoDB with support for composite keys and DynamoDB Local.

**Required Dependencies:**
```bash
pnpm add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

#### Basic Configuration

```javascript
{
  driver: 'dynamodb',
  config: {
    region: 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: 'http://localhost:8000'  // Optional: for DynamoDB Local
  },
  resources: {
    users: 'UsersTable',
    sessions: 'SessionsTable'
  }
}
```

#### Advanced Configuration with Composite Keys

```javascript
{
  driver: 'dynamodb',
  config: {
    region: 'us-west-2',
    // Uses AWS SDK default credential chain if not specified
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN  // Optional for temporary credentials
    }
  },
  resources: {
    // Simple mapping (uses default 'id' as primary key)
    users: 'UsersTable',

    // Custom primary key
    products: {
      table: 'ProductsTable',
      primaryKey: 'productId',
      actions: ['insert', 'update', 'delete']
    },

    // Composite key (partition key + sort key)
    orders: {
      table: 'OrdersTable',
      primaryKey: 'customerId',  // Partition key
      sortKey: 'orderId',        // Sort key
      actions: ['insert', 'update', 'delete']
    },

    // Multiple tables
    analytics: [
      { table: 'Analytics_Current', primaryKey: 'eventId', actions: ['insert'] },
      { table: 'Analytics_Archive', primaryKey: 'eventId', actions: ['insert'] }
    ]
  }
}
```

#### DynamoDB Local (Development)

```javascript
{
  driver: 'dynamodb',
  config: {
    region: 'us-east-1',
    endpoint: 'http://localhost:8000',  // DynamoDB Local
    // No credentials needed for local
  },
  resources: {
    users: {
      table: 'Users',
      primaryKey: 'id'
    }
  }
}
```

#### Features

- ✅ **AWS SDK v3**: Latest DynamoDB client with improved performance
- ✅ **Composite Keys**: Support for partition key + sort key tables
- ✅ **Custom Keys**: Configurable primary key field names
- ✅ **DynamoDB Local**: Perfect for local development and testing
- ✅ **Expression Builders**: Safe update expressions with attribute names/values
- ✅ **AWS Credentials**: Supports access keys, IAM roles, session tokens
- ✅ **Multi-Region**: Deploy to any AWS region

---

### 🍃 MongoDB Replicator

**Document database integration** for MongoDB with support for standalone, replica sets, and MongoDB Atlas.

**Required Dependency:**
```bash
pnpm add mongodb
```

#### Basic Configuration

```javascript
{
  driver: 'mongodb',
  config: {
    host: 'localhost',
    port: 27017,
    database: 'production_db',
    username: 'replicator_user',
    password: 'secure_password',
    logCollection: 'replication_log'  // Optional: log all operations
  },
  resources: {
    users: 'users_collection',
    products: 'products_collection'
  }
}
```

#### MongoDB Atlas Configuration

```javascript
{
  driver: 'mongodb',
  config: {
    connectionString: 'mongodb+srv://user:pass@cluster0.mongodb.net/mydb?retryWrites=true&w=majority',
    database: 'production',
    logCollection: 'replication_audit'
  },
  resources: {
    users: 'users',
    orders: 'orders',
    analytics: 'events'
  }
}
```

#### Advanced Configuration

```javascript
{
  driver: 'mongodb',
  config: {
    // Connection string (supports all MongoDB connection formats)
    connectionString: 'mongodb://admin:secret@host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0',

    // Or individual parameters
    host: 'mongodb.example.com',
    port: 27017,
    database: 'analytics',
    username: 'replicator',
    password: process.env.MONGO_PASSWORD,

    // MongoDB client options
    options: {
      useUnifiedTopology: true,
      useNewUrlParser: true,
      maxPoolSize: 50,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    },

    logCollection: 'replication_log'
  },
  resources: {
    // Simple mapping
    users: 'users',

    // Multiple actions
    products: {
      collection: 'products',
      actions: ['insert', 'update', 'delete']
    },

    // Multiple collections
    orders: [
      { collection: 'orders_active', actions: ['insert', 'update'] },
      { collection: 'orders_archive', actions: ['insert'] }
    ]
  }
}
```

#### Replica Set Configuration

```javascript
{
  driver: 'mongodb',
  config: {
    connectionString: 'mongodb://host1:27017,host2:27017,host3:27017/mydb?replicaSet=myReplicaSet&readPreference=primaryPreferred',
    options: {
      w: 'majority',  // Write concern
      j: true,        // Journal acknowledgment
      wtimeout: 5000  // Write timeout
    }
  },
  resources: {
    users: 'users',
    sessions: 'sessions'
  }
}
```

#### Features

- ✅ **Multiple Formats**: Connection string or host/port configuration
- ✅ **MongoDB Atlas**: Full support for cloud-hosted MongoDB
- ✅ **Replica Sets**: Automatic failover and high availability
- ✅ **Replication Logging**: Optional audit collection with indexes
- ✅ **_id Preservation**: Keeps MongoDB _id field intact
- ✅ **Connection Options**: Full MongoDB client options support
- ✅ **Insert, Update, Delete**: Full CRUD operation support
- ✅ **Multi-Collection**: Same resource → multiple MongoDB collections

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

- [BackupPlugin vs ReplicatorPlugin](./BACKUP_VS_REPLICATOR.md) - When to use each plugin
- [BackupPlugin](./backup.md) - Batch snapshots for disaster recovery
- [Plugin Development Guide](./plugin-development.md)
- [Audit Plugin](./audit.md) - Track replication operations
- [Metrics Plugin](./metrics.md) - Monitor replication performance
- [Queue Consumer Plugin](./queue-consumer.md) - Process replicated events
## ❓ FAQ

### Básico

**P: Para que serve o ReplicatorPlugin?**
R: Replica **cada operação** (insert/update/delete) automaticamente em tempo real para outros destinos. Cada record é processado individualmente com latência <10ms.

**P: Qual a diferença entre ReplicatorPlugin e BackupPlugin?**
R:
- **ReplicatorPlugin**: Real-time CDC - replica cada operação individualmente (1 record por vez)
- **BackupPlugin**: Batch snapshots - exporta TODO o database de uma vez em momentos específicos
Ver [comparação completa](./BACKUP_VS_REPLICATOR.md).

**P: Quando usar ReplicatorPlugin vs BackupPlugin?**
R:
- **ReplicatorPlugin**: Analytics em tempo real, event sourcing, sync contínuo
- **BackupPlugin**: Disaster recovery, compliance, point-in-time recovery

**P: Quais drivers estão disponíveis?**
R: `s3db` (outro S3DB), `sqs` (AWS SQS), `webhook` (HTTP/HTTPS), `postgresql`, `bigquery`

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
