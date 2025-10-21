# 🔄 Replicator Plugin

## ⚡ TLDR

Replicação **real-time** para múltiplos destinos (S3DB, BigQuery, PostgreSQL, SQS, Webhooks) com transformação de dados.

**1 linha para começar:**
```javascript
await db.usePlugin(new ReplicatorPlugin({ replicators: [{ driver: 's3db', resources: ['users'], config: { connectionString: 's3://...' }}] }));
```

**Principais features:**
- ✅ Multi-target: S3DB, BigQuery, PostgreSQL, SQS, Webhooks
- ✅ Transformação de dados com funções customizadas
- ✅ Retry automático com backoff exponencial
- ✅ Dead letter queue para falhas
- ✅ Event monitoring completo

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
  - [CSV Replicator](#-csv-replicator) - Export to CSV format
  - [JSONL Replicator](#-jsonl-replicator) - Export to JSON Lines
  - [Parquet Replicator](#-parquet-replicator) - Export to Apache Parquet
  - [Excel Replicator](#-excel-replicator) - Export to Excel (.xlsx)
  - [Multi-Format Export](#-multi-format-export) - Export to multiple formats
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

### 📁 CSV Replicator

Export data to CSV (Comma-Separated Values) format for Excel and business users.

**S3 Default (PluginStorage):**
```javascript
{
  driver: 'csv',
  resources: ['users', 'orders'],
  config: {
    output: {
      driver: 's3',                  // Uses database's PluginStorage
      path: 'exports/csv'            // Relative to plugin storage
    },
    delimiter: ',',                  // ',', ';', '\t', '|'
    mode: 'append',                  // 'append' or 'overwrite'
    rotateBy: 'date',                // 'date', 'size', or null
    rotateSize: 100 * 1024 * 1024   // Rotate at 100MB
  }
}
```

**S3 Custom (External Bucket):**
```javascript
{
  driver: 'csv',
  resources: ['users', 'orders'],
  config: {
    output: {
      driver: 's3',
      connectionString: 's3://KEY:SECRET@analytics-bucket/csv-exports',
      path: 'daily'
    },
    delimiter: ','
  }
}
```

**Filesystem:**
```javascript
{
  driver: 'csv',
  resources: ['users', 'orders'],
  config: {
    output: {
      driver: 'filesystem',
      path: './exports/csv'
    },
    delimiter: ','
  }
}
```

**Features:**
- ✅ Export to S3 (default/custom) or filesystem
- ✅ Quoted fields with proper CSV escaping
- ✅ Custom delimiters (comma, semicolon, tab, pipe)
- ✅ File rotation by date or size
- ✅ Append or overwrite modes

**Use Cases:** Business reporting, Excel analysis, data sharing

---

### 📋 JSONL Replicator

Export data to JSON Lines (JSONL/NDJSON) format for analytics and log processing.

**S3 Default (PluginStorage):**
```javascript
{
  driver: 'jsonl',
  resources: ['events', 'logs'],
  config: {
    output: {
      driver: 's3',
      path: 'exports/jsonl'
    },
    mode: 'append',
    rotateBy: 'date',
    compress: false                  // Enable gzip compression
  }
}
```

**S3 Custom (BigQuery Import):**
```javascript
{
  driver: 'jsonl',
  resources: ['events'],
  config: {
    output: {
      driver: 's3',
      connectionString: 's3://KEY:SECRET@analytics/bigquery-import'
    },
    compress: true
  }
}
```

**Filesystem:**
```javascript
{
  driver: 'jsonl',
  resources: ['logs'],
  config: {
    output: {
      driver: 'filesystem',
      path: './logs'
    }
  }
}
```

**Features:**
- ✅ Export to S3 (default/custom) or filesystem
- ✅ One JSON object per line
- ✅ Streaming writes (memory-efficient)
- ✅ Optional gzip compression
- ✅ BigQuery/Athena compatible

**Use Cases:** Log processing, BigQuery import, streaming analytics

---

### 📦 Parquet Replicator

Export data to Apache Parquet format for data warehouses (10-100x faster queries, 90% compression).

**Required Dependency:**
```bash
pnpm add parquetjs
```

**S3 Default (PluginStorage):**
```javascript
{
  driver: 'parquet',
  resources: ['events', 'analytics'],
  config: {
    output: {
      driver: 's3',
      path: 'exports/parquet'
    },
    compression: 'snappy',           // 'snappy', 'gzip', 'lz4'
    rowGroupSize: 5000,
    rotateBy: 'date'
  }
}
```

**S3 Custom (Data Warehouse):**
```javascript
{
  driver: 'parquet',
  resources: ['events'],
  config: {
    output: {
      driver: 's3',
      connectionString: 's3://KEY:SECRET@analytics-bucket/parquet-exports'
    },
    compression: 'gzip'
  }
}
```

**Filesystem:**
```javascript
{
  driver: 'parquet',
  resources: ['events'],
  config: {
    output: {
      driver: 'filesystem',
      path: './exports/parquet'
    }
  }
}
```

**Features:**
- ✅ Export to S3 (default/custom) or filesystem
- ✅ Columnar storage format
- ✅ High compression (90% vs CSV)
- ✅ 10-100x faster queries
- ✅ Schema inference

**Use Cases:** Snowflake, AWS Athena, Apache Spark, ML pipelines

**Performance:**
- Query Speed: ~0.5s (vs CSV: ~45s = **90x faster**)
- File Size: ~45MB (vs CSV: ~450MB = **90% reduction**)

---

### 📊 Excel Replicator

Export data to Excel (.xlsx) format for business reporting.

**Required Dependency:**
```bash
pnpm add exceljs
```

**S3 Default (PluginStorage):**
```javascript
{
  driver: 'excel',
  resources: ['users', 'orders'],
  config: {
    output: {
      driver: 's3',
      path: 'exports/excel'
    },
    filename: 'export.xlsx',
    freezeHeaders: true,
    autoFilter: true
  }
}
```

**S3 Custom (Business Reports):**
```javascript
{
  driver: 'excel',
  resources: ['users', 'orders'],
  config: {
    output: {
      driver: 's3',
      connectionString: 's3://KEY:SECRET@analytics-bucket/excel-exports'
    },
    filename: 'daily-report.xlsx'
  }
}
```

**Filesystem:**
```javascript
{
  driver: 'excel',
  resources: ['users', 'orders'],
  config: {
    output: {
      driver: 'filesystem',
      path: './exports/excel'
    },
    filename: 'export.xlsx'
  }
}
```

**Features:**
- ✅ Export to S3 (default/custom) or filesystem
- ✅ Multiple worksheets support (one per resource)
- ✅ Auto-formatting (headers, filters, freeze panes)
- ✅ Styled headers
- ✅ Business-ready output

**Use Cases:** Executive reports, dashboards, business presentations

---

### 🔀 Multi-Format Export

Export to multiple formats simultaneously:

```javascript
const replicator = new ReplicatorPlugin({
  replicators: [
    { driver: 'csv', config: { outputPath: './exports' } },
    { driver: 'jsonl', config: { outputPath: './exports' } },
    { driver: 'parquet', config: { outputPath: './exports' } },
    { driver: 'excel', config: { outputPath: './exports', filename: 'report.xlsx' } }
  ]
});

await db.usePlugin(replicator);

// Single insert creates 4 files!
await users.insert({ id: 'u1', name: 'Alice', email: 'alice@example.com' });
// Files created:
// - ./exports/users_2025-10-20.csv
// - ./exports/users_2025-10-20.jsonl
// - ./exports/users_2025-10-20.parquet
// - ./exports/report_2025-10-20.xlsx
```

**Export Format Comparison:**

| Format | Best For | File Size | Query Speed | Compression |
|--------|----------|-----------|-------------|-------------|
| CSV | Excel, Business Users | Large | Slow | None |
| JSONL | Log Processing, BigQuery | Medium | Medium | Optional |
| **Parquet** | Data Warehouses | **Smallest** | **Fastest** | **90%** |
| Excel | Business Reporting | Large | Slow | None |

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
