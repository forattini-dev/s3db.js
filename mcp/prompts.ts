/**
 * MCP Prompts for s3db.js
 *
 * 16 pre-defined prompt templates organized in categories:
 * - Creation: Resource, plugin, partition, API setup
 * - Migration: MongoDB, DynamoDB, Prisma to s3db
 * - Debug & Optimization: Connection, query, costs
 * - Learning: Behaviors, partitions, clients, plugins
 * - Integration: Vector RAG, replication
 */

import type { MCPPrompt, MCPPromptArgument, MCPPromptResult } from './types/index.js';
import { plugins, fieldTypes, behaviors, clients, guides } from './docs-data.js';

// =============================================================================
// Prompt Definitions
// =============================================================================

export const prompts: MCPPrompt[] = [
  // ---------------------------------------------------------------------------
  // Creation Category
  // ---------------------------------------------------------------------------
  {
    name: 'create_resource',
    description: 'Generate a complete s3db resource definition with schema, partitions, and behaviors',
    arguments: [
      { name: 'name', description: 'Resource name (e.g., users, orders, products)', required: true },
      { name: 'fields', description: 'Comma-separated field definitions (e.g., "name:string, email:string|email, age:number")', required: true },
      { name: 'behavior', description: 'Data behavior strategy', required: false },
      { name: 'partitionBy', description: 'Partition key field for O(1) queries', required: false },
      { name: 'timestamps', description: 'Include createdAt/updatedAt (true/false)', required: false },
    ],
  },
  {
    name: 'setup_plugin',
    description: 'Configure a specific s3db plugin with best practices and examples',
    arguments: [
      { name: 'plugin', description: 'Plugin name (e.g., cache, api, audit, ttl, vector)', required: true },
      { name: 'useCase', description: 'Your specific use case to optimize configuration', required: false },
    ],
  },
  {
    name: 'create_partition_strategy',
    description: 'Design an optimal partition strategy for your data access patterns',
    arguments: [
      { name: 'resourceName', description: 'Name of the resource to partition', required: true },
      { name: 'queryPatterns', description: 'Common query patterns (e.g., "by user", "by date range", "by status")', required: true },
      { name: 'dataVolume', description: 'Expected data volume (small/medium/large/huge)', required: false },
    ],
  },
  {
    name: 'create_api_server',
    description: 'Generate a complete REST API server with authentication and OpenAPI docs',
    arguments: [
      { name: 'resources', description: 'Comma-separated resource names to expose', required: true },
      { name: 'authType', description: 'Authentication type (apikey/bearer/basic/oauth2/oidc)', required: false },
      { name: 'features', description: 'Additional features (rate-limit, audit, cache)', required: false },
    ],
  },

  // ---------------------------------------------------------------------------
  // Migration Category
  // ---------------------------------------------------------------------------
  {
    name: 'migrate_from_mongodb',
    description: 'Convert MongoDB/Mongoose schemas and queries to s3db equivalents',
    arguments: [
      { name: 'schema', description: 'MongoDB/Mongoose schema definition to convert', required: true },
      { name: 'queries', description: 'Sample MongoDB queries to translate', required: false },
    ],
  },
  {
    name: 'migrate_from_dynamodb',
    description: 'Convert DynamoDB table definitions and access patterns to s3db',
    arguments: [
      { name: 'tableDefinition', description: 'DynamoDB table definition (JSON or description)', required: true },
      { name: 'accessPatterns', description: 'GSI/LSI access patterns to preserve', required: false },
    ],
  },
  {
    name: 'migrate_from_prisma',
    description: 'Convert Prisma schema models to s3db resource definitions',
    arguments: [
      { name: 'schema', description: 'Prisma schema model definition', required: true },
      { name: 'relations', description: 'Include relation handling strategy (true/false)', required: false },
    ],
  },

  // ---------------------------------------------------------------------------
  // Debug & Optimization Category
  // ---------------------------------------------------------------------------
  {
    name: 'debug_connection',
    description: 'Troubleshoot S3 connection issues with step-by-step diagnostics',
    arguments: [
      { name: 'connectionString', description: 'Your connection string (credentials will be redacted)', required: true },
      { name: 'errorMessage', description: 'Error message you are seeing', required: false },
    ],
  },
  {
    name: 'debug_query_performance',
    description: 'Analyze and optimize slow queries with partition and index recommendations',
    arguments: [
      { name: 'resourceName', description: 'Resource being queried', required: true },
      { name: 'queryCode', description: 'The slow query code', required: true },
      { name: 'dataSize', description: 'Approximate number of records', required: false },
    ],
  },
  {
    name: 'optimize_costs',
    description: 'Reduce AWS S3 costs with storage class, lifecycle, and access pattern optimizations',
    arguments: [
      { name: 'currentUsage', description: 'Current monthly S3 costs or request volume', required: false },
      { name: 'accessPatterns', description: 'Read/write ratio and frequency', required: false },
    ],
  },

  // ---------------------------------------------------------------------------
  // Learning Category
  // ---------------------------------------------------------------------------
  {
    name: 'explain_behavior',
    description: 'Understand s3db behaviors and the 2KB S3 metadata limit',
    arguments: [
      { name: 'behavior', description: 'Specific behavior to explain (body-overflow, body-only, enforce-limits, truncate-data, user-managed)', required: false },
      { name: 'scenario', description: 'Your specific scenario to get tailored advice', required: false },
    ],
  },
  {
    name: 'explain_partitions',
    description: 'Learn when and how to use partitions for O(1) query performance',
    arguments: [
      { name: 'useCase', description: 'Your use case for partition recommendations', required: false },
    ],
  },
  {
    name: 'compare_clients',
    description: 'Compare S3, Memory, and FileSystem clients for different use cases',
    arguments: [
      { name: 'environment', description: 'Target environment (production/development/testing/ci)', required: false },
    ],
  },
  {
    name: 'explain_plugin',
    description: 'Get detailed documentation and examples for a specific plugin',
    arguments: [
      { name: 'plugin', description: 'Plugin name to explain', required: true },
    ],
  },

  // ---------------------------------------------------------------------------
  // Integration Category
  // ---------------------------------------------------------------------------
  {
    name: 'setup_vector_rag',
    description: 'Configure vector embeddings and RAG (Retrieval Augmented Generation) pipeline',
    arguments: [
      { name: 'embeddingProvider', description: 'Embedding provider (openai/cohere/local)', required: false },
      { name: 'dimensions', description: 'Embedding dimensions (e.g., 1536 for OpenAI)', required: false },
      { name: 'useCase', description: 'RAG use case (semantic-search/qa/recommendations)', required: false },
    ],
  },
  {
    name: 'setup_replication',
    description: 'Configure data replication to PostgreSQL, BigQuery, or SQS',
    arguments: [
      { name: 'target', description: 'Replication target (postgresql/bigquery/sqs/webhook)', required: true },
      { name: 'resources', description: 'Resources to replicate (comma-separated or "all")', required: false },
      { name: 'mode', description: 'Replication mode (realtime/batch)', required: false },
    ],
  },
];

// =============================================================================
// Prompt Handlers
// =============================================================================

export function getPrompt(name: string, args: Record<string, string>): MCPPromptResult | null {
  const prompt = prompts.find((p) => p.name === name);
  if (!prompt) return null;

  switch (name) {
    case 'create_resource':
      return generateCreateResourcePrompt(args);
    case 'setup_plugin':
      return generateSetupPluginPrompt(args);
    case 'create_partition_strategy':
      return generatePartitionStrategyPrompt(args);
    case 'create_api_server':
      return generateApiServerPrompt(args);
    case 'migrate_from_mongodb':
      return generateMongoMigrationPrompt(args);
    case 'migrate_from_dynamodb':
      return generateDynamoMigrationPrompt(args);
    case 'migrate_from_prisma':
      return generatePrismaMigrationPrompt(args);
    case 'debug_connection':
      return generateDebugConnectionPrompt(args);
    case 'debug_query_performance':
      return generateDebugQueryPrompt(args);
    case 'optimize_costs':
      return generateOptimizeCostsPrompt(args);
    case 'explain_behavior':
      return generateExplainBehaviorPrompt(args);
    case 'explain_partitions':
      return generateExplainPartitionsPrompt(args);
    case 'compare_clients':
      return generateCompareClientsPrompt(args);
    case 'explain_plugin':
      return generateExplainPluginPrompt(args);
    case 'setup_vector_rag':
      return generateVectorRagPrompt(args);
    case 'setup_replication':
      return generateReplicationPrompt(args);
    default:
      return null;
  }
}

// =============================================================================
// Prompt Generators
// =============================================================================

function generateCreateResourcePrompt(args: Record<string, string>): MCPPromptResult {
  const { name, fields, behavior = 'body-overflow', partitionBy, timestamps = 'true' } = args;

  const behaviorDoc = behaviors.find((b) => b.name === behavior);
  const behaviorInfo = behaviorDoc
    ? `\n\nSelected behavior "${behavior}":\n- Safety: ${behaviorDoc.safety}\n- Performance: ${behaviorDoc.performance}\n- Use case: ${behaviorDoc.useCase}`
    : '';

  return {
    description: `Create a ${name} resource with the specified schema`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Create an s3db resource definition for "${name}" with these requirements:

**Fields:** ${fields}
**Behavior:** ${behavior}
**Partition Key:** ${partitionBy || 'none'}
**Timestamps:** ${timestamps}
${behaviorInfo}

## s3db Resource Guidelines

### Field Type Syntax
- Basic: \`fieldName: 'type'\`
- With validators: \`fieldName: 'type|validator1|validator2'\`
- Required: \`fieldName: 'type|required'\`

### Available Field Types
${fieldTypes.map((ft) => `- **${ft.name}**: ${ft.description}`).join('\n')}

### Behavior Options
${behaviors.map((b) => `- **${b.name}**: ${b.useCase}`).join('\n')}

### Partition Strategy
Partitions enable O(1) queries instead of O(n) scans. Use for high-cardinality lookup fields.

Please generate:
1. Complete resource definition with \`database.createResource()\`
2. Example insert, query, and update operations
3. Any recommended indexes or partition adjustments
4. TypeScript types if applicable`,
        },
      },
    ],
  };
}

function generateSetupPluginPrompt(args: Record<string, string>): MCPPromptResult {
  const { plugin, useCase } = args;
  const pluginDoc = plugins.find((p) => p.name.toLowerCase().replace('plugin', '') === plugin.toLowerCase());

  let pluginInfo = '';
  if (pluginDoc) {
    pluginInfo = `
## Plugin Documentation: ${pluginDoc.name}

**Category:** ${pluginDoc.category}
**Description:** ${pluginDoc.description}

### Configuration Options
${pluginDoc.configOptions.map((opt) => `- **${opt.name}** (${opt.type}${opt.required ? ', required' : ''}): ${opt.description}${opt.default ? ` [default: ${opt.default}]` : ''}`).join('\n')}

### Available Methods
${pluginDoc.methods.map((m) => `- \`${m.signature}\`: ${m.description}`).join('\n')}

### Example Files
${pluginDoc.examples.map((e) => `- docs/examples/${e}`).join('\n')}

### Related Plugins
${pluginDoc.relatedPlugins?.join(', ') || 'None'}`;
  }

  return {
    description: `Configure the ${plugin} plugin for s3db`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me configure the **${plugin}** plugin for s3db.
${useCase ? `\n**My use case:** ${useCase}` : ''}
${pluginInfo}

Please provide:
1. Step-by-step setup instructions
2. Recommended configuration for ${useCase || 'general use'}
3. Complete code example with error handling
4. Common pitfalls to avoid
5. Performance considerations`,
        },
      },
    ],
  };
}

function generatePartitionStrategyPrompt(args: Record<string, string>): MCPPromptResult {
  const { resourceName, queryPatterns, dataVolume = 'medium' } = args;

  return {
    description: `Design partition strategy for ${resourceName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Design an optimal partition strategy for the "${resourceName}" resource.

**Query Patterns:** ${queryPatterns}
**Data Volume:** ${dataVolume}

## s3db Partitioning Concepts

### Why Partition?
- Without partitions: O(n) scan of all objects
- With partitions: O(1) direct lookup by partition key

### Partition Types
1. **Simple Partition:** Single field (e.g., \`userId\`)
2. **Composite Partition:** Multiple fields (e.g., \`tenantId/year/month\`)
3. **Range Partition:** Date-based ranges

### Syntax
\`\`\`javascript
database.createResource('orders', {
  attributes: { ... },
  partitions: {
    byUser: { key: 'userId' },
    byDate: { key: 'createdAt', type: 'date', granularity: 'day' },
    byTenant: { key: ['tenantId', 'status'] }
  }
});

// Query with partition (O(1))
await orders.query({ userId: '123' }, { partition: 'byUser' });
\`\`\`

### Data Volume Guidelines
- **Small** (<10K records): Partitions optional
- **Medium** (10K-100K records): Partition by primary lookup field
- **Large** (100K-1M records): Composite partitions recommended
- **Huge** (>1M records): Multiple partition strategies required

Please provide:
1. Recommended partition key(s) based on query patterns
2. Partition definition code
3. Query examples using each partition
4. Trade-offs and considerations
5. Migration strategy if adding to existing resource`,
        },
      },
    ],
  };
}

function generateApiServerPrompt(args: Record<string, string>): MCPPromptResult {
  const { resources, authType = 'bearer', features = '' } = args;
  const resourceList = resources.split(',').map((r) => r.trim());
  const featureList = features
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  const apiPlugin = plugins.find((p) => p.name === 'ApiPlugin');

  return {
    description: `Generate REST API server for ${resourceList.join(', ')}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Generate a complete REST API server with s3db for these resources: **${resourceList.join(', ')}**

**Authentication:** ${authType}
**Additional Features:** ${featureList.length > 0 ? featureList.join(', ') : 'none'}

## ApiPlugin Overview
${apiPlugin?.description || 'REST API with guards, rate limiting, and OpenAPI docs'}

### Authentication Options
- **apikey**: X-API-Key header validation
- **bearer**: JWT token validation
- **basic**: Username/password
- **oauth2**: OAuth2 client credentials
- **oidc**: OpenID Connect with discovery

### Available Guards
- \`requireAuth\`: Require authentication
- \`requireRole(roles)\`: Role-based access
- \`rateLimit(opts)\`: Rate limiting
- \`validateBody(schema)\`: Request validation

### OpenAPI Integration
Auto-generates Swagger documentation at \`/docs\`

Please generate:
1. Complete server setup with database connection
2. Resource definitions for each entity
3. API routes with CRUD operations
4. Authentication middleware configuration
5. Guard setup for protected routes
6. OpenAPI/Swagger configuration
7. Error handling middleware
8. Health check endpoint
9. Example .env configuration
10. Docker setup for deployment`,
        },
      },
    ],
  };
}

function generateMongoMigrationPrompt(args: Record<string, string>): MCPPromptResult {
  const { schema, queries } = args;

  return {
    description: 'Migrate MongoDB schema to s3db',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me migrate from MongoDB/Mongoose to s3db.

**MongoDB Schema:**
\`\`\`javascript
${schema}
\`\`\`
${queries ? `\n**Queries to translate:**\n\`\`\`javascript\n${queries}\n\`\`\`` : ''}

## Migration Guide: MongoDB → s3db

### Schema Mapping
| MongoDB | s3db |
|---------|------|
| \`String\` | \`'string'\` |
| \`Number\` | \`'number'\` |
| \`Boolean\` | \`'boolean'\` |
| \`Date\` | \`'date'\` |
| \`ObjectId\` | \`'string'\` (or \`'uuid'\`) |
| \`Mixed\` | \`'object'\` |
| \`[Type]\` | \`'array'\` |
| \`Buffer\` | \`'binary'\` |

### Validator Mapping
| Mongoose | s3db |
|----------|------|
| \`required: true\` | \`'type\\|required'\` |
| \`unique: true\` | Use partitions + uniqueness checks |
| \`enum: [...]\` | \`'string\\|enum:a,b,c'\` |
| \`min/max\` | \`'number\\|min:X\\|max:Y'\` |
| \`match: regex\` | \`'string\\|pattern:regex'\` |

### Query Mapping
| MongoDB | s3db |
|---------|------|
| \`find()\` | \`query()\` or \`list()\` |
| \`findOne()\` | \`get()\` or \`query({}, { limit: 1 })\` |
| \`findById()\` | \`get(id)\` |
| \`updateOne()\` | \`update()\` or \`patch()\` |
| \`deleteOne()\` | \`delete()\` |
| \`aggregate()\` | Client-side processing |

### Key Differences
1. No joins - denormalize or use Relations plugin
2. No indexes - use partitions for query optimization
3. No transactions - use eventual consistency patterns
4. 2KB metadata limit - choose appropriate behavior

Please provide:
1. Equivalent s3db resource definition
2. Translated queries with s3db syntax
3. Partition recommendations based on query patterns
4. Data migration script
5. Breaking changes and workarounds`,
        },
      },
    ],
  };
}

function generateDynamoMigrationPrompt(args: Record<string, string>): MCPPromptResult {
  const { tableDefinition, accessPatterns } = args;

  return {
    description: 'Migrate DynamoDB table to s3db',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me migrate from DynamoDB to s3db.

**DynamoDB Table Definition:**
\`\`\`json
${tableDefinition}
\`\`\`
${accessPatterns ? `\n**Access Patterns (GSI/LSI):**\n${accessPatterns}` : ''}

## Migration Guide: DynamoDB → s3db

### Key Mapping
| DynamoDB | s3db |
|----------|------|
| Partition Key (PK) | Partition definition |
| Sort Key (SK) | Composite partition or field |
| GSI | Additional partition |
| LSI | Query with sorting |

### Type Mapping
| DynamoDB | s3db |
|----------|------|
| \`S\` (String) | \`'string'\` |
| \`N\` (Number) | \`'number'\` |
| \`B\` (Binary) | \`'binary'\` |
| \`BOOL\` | \`'boolean'\` |
| \`L\` (List) | \`'array'\` |
| \`M\` (Map) | \`'object'\` |
| \`SS/NS/BS\` (Sets) | \`'array'\` |

### Single-Table Design → s3db
DynamoDB single-table patterns can be split into:
1. Multiple resources (cleaner)
2. Single resource with type field (preserve pattern)

### Cost Comparison
- DynamoDB: Pay per request (RCU/WCU)
- s3db: Pay per S3 operation (~$0.0004/1000 requests)

Please provide:
1. Equivalent s3db resource definition(s)
2. Partition strategy matching access patterns
3. Query translations for each GSI/LSI pattern
4. Data migration approach
5. Cost comparison estimate`,
        },
      },
    ],
  };
}

function generatePrismaMigrationPrompt(args: Record<string, string>): MCPPromptResult {
  const { schema, relations } = args;

  return {
    description: 'Migrate Prisma schema to s3db',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me migrate from Prisma to s3db.

**Prisma Schema:**
\`\`\`prisma
${schema}
\`\`\`
${relations === 'true' ? '\n**Include relation handling strategy**' : ''}

## Migration Guide: Prisma → s3db

### Type Mapping
| Prisma | s3db |
|--------|------|
| \`String\` | \`'string'\` |
| \`Int\` | \`'number\\|integer'\` |
| \`Float\` | \`'number'\` |
| \`Boolean\` | \`'boolean'\` |
| \`DateTime\` | \`'date'\` |
| \`Json\` | \`'object'\` |
| \`Bytes\` | \`'binary'\` |
| \`BigInt\` | \`'bigint'\` |
| \`Decimal\` | \`'decimal'\` |

### Attribute Mapping
| Prisma | s3db |
|--------|------|
| \`@id\` | Auto-generated id field |
| \`@unique\` | Partition + unique check |
| \`@default()\` | \`default\` in attribute |
| \`@updatedAt\` | \`timestamps: true\` |
| \`@@index()\` | Partition definition |
| \`@@unique()\` | Composite partition |

### Relation Handling
s3db doesn't have native relations like Prisma. Options:
1. **Denormalization**: Embed related data
2. **RelationsPlugin**: Manage foreign keys
3. **Manual joins**: Query and merge in application

Please provide:
1. Equivalent s3db resource definition(s)
2. Relation handling strategy ${relations === 'true' ? 'with RelationsPlugin setup' : ''}
3. Query translations (findUnique, findMany, include, select)
4. Migration script from existing PostgreSQL data
5. Key behavioral differences to watch for`,
        },
      },
    ],
  };
}

function generateDebugConnectionPrompt(args: Record<string, string>): MCPPromptResult {
  const { connectionString, errorMessage } = args;

  // Redact credentials in connection string
  const redactedString = connectionString.replace(
    /([a-zA-Z0-9_-]+):([^@]+)@/,
    '***:***@'
  );

  return {
    description: 'Debug S3 connection issues',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me debug my s3db connection issue.

**Connection String (redacted):** \`${redactedString}\`
${errorMessage ? `**Error Message:** ${errorMessage}` : ''}

## Connection Troubleshooting Guide

### Connection String Formats
\`\`\`
# AWS S3
s3://ACCESS_KEY:SECRET_KEY@bucket-name?region=us-east-1

# MinIO
http://ACCESS_KEY:SECRET_KEY@localhost:9000/bucket-name

# Memory (testing)
memory://bucket/path

# FileSystem (testing)
file:///tmp/s3db
\`\`\`

### Common Issues

#### 1. Invalid Credentials
- Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
- Verify IAM permissions: s3:GetObject, s3:PutObject, s3:DeleteObject, s3:ListBucket
- URL-encode special characters in credentials

#### 2. Bucket Issues
- Bucket must exist before connecting
- Check bucket region matches connection string
- Verify bucket policy allows access

#### 3. Network Issues
- Check VPC/firewall rules
- Verify S3 endpoint accessibility
- Try with different region endpoint

#### 4. MinIO Specific
- Ensure forcePathStyle: true for MinIO
- Check MinIO is running and accessible
- Verify bucket exists in MinIO

### Diagnostic Steps
1. Test raw S3 access with AWS CLI
2. Check CloudWatch logs for S3 errors
3. Verify network connectivity to S3 endpoint
4. Test with minimal permissions first

Please analyze:
1. Parse the connection string format
2. Identify potential issues based on error
3. Suggest diagnostic commands to run
4. Provide corrected connection string if needed
5. Recommend IAM policy if permission issue`,
        },
      },
    ],
  };
}

function generateDebugQueryPrompt(args: Record<string, string>): MCPPromptResult {
  const { resourceName, queryCode, dataSize } = args;

  return {
    description: `Debug slow query on ${resourceName}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me optimize a slow query on the "${resourceName}" resource.

**Query Code:**
\`\`\`javascript
${queryCode}
\`\`\`
${dataSize ? `**Approximate Record Count:** ${dataSize}` : ''}

## Query Performance Guide

### Understanding s3db Query Performance

#### Without Partitions (O(n))
- Lists ALL objects in bucket prefix
- Downloads and filters each object
- Scales linearly with data size

#### With Partitions (O(1))
- Directly accesses partition prefix
- No scanning required
- Constant time regardless of total size

### Performance Optimization Strategies

#### 1. Add Partitions
\`\`\`javascript
// Before: O(n) scan
await users.query({ status: 'active' });

// After: O(1) with partition
await users.query({ status: 'active' }, { partition: 'byStatus' });
\`\`\`

#### 2. Use Pagination
\`\`\`javascript
// Avoid loading all records
const results = await users.list({ limit: 100, offset: 0 });
\`\`\`

#### 3. Enable Caching
\`\`\`javascript
database.use(new CachePlugin({
  driver: 'memory',
  ttl: 60000, // 1 minute
}));
\`\`\`

#### 4. Use Streaming for Large Results
\`\`\`javascript
const stream = users.stream({ status: 'active' });
for await (const user of stream) {
  // Process one at a time
}
\`\`\`

#### 5. Optimize Field Selection
\`\`\`javascript
// Only fetch needed fields
await users.query({ status: 'active' }, { fields: ['id', 'name'] });
\`\`\`

Please analyze:
1. Identify why the query is slow
2. Suggest partition strategy if applicable
3. Recommend query rewrites
4. Provide caching strategy
5. Estimate performance improvement`,
        },
      },
    ],
  };
}

function generateOptimizeCostsPrompt(args: Record<string, string>): MCPPromptResult {
  const { currentUsage, accessPatterns } = args;

  return {
    description: 'Optimize AWS S3 costs',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me optimize my s3db AWS costs.
${currentUsage ? `\n**Current Usage:** ${currentUsage}` : ''}
${accessPatterns ? `\n**Access Patterns:** ${accessPatterns}` : ''}

## AWS S3 Cost Optimization Guide

### s3db Cost Structure
| Operation | S3 Cost | Frequency |
|-----------|---------|-----------|
| PUT (insert/update) | $0.005/1000 | Writes |
| GET (get/query) | $0.0004/1000 | Reads |
| LIST (query/list) | $0.005/1000 | Scans |
| Storage | $0.023/GB | Monthly |

### Optimization Strategies

#### 1. Use Partitions (Reduce LIST operations)
- Without: 1 LIST + N GETs per query
- With: Direct GET operations only

#### 2. Enable Caching
\`\`\`javascript
database.use(new CachePlugin({
  driver: 'memory',    // No S3 costs
  ttl: 300000,         // 5 minutes
  maxSize: 1000,       // Items in cache
}));
\`\`\`

#### 3. Use patch() Instead of update()
- \`update()\`: GET + PUT (2 operations)
- \`patch()\`: HEAD + COPY (cheaper, same result)

#### 4. Batch Operations
\`\`\`javascript
// Instead of multiple inserts
await resource.bulkInsert(items);
\`\`\`

#### 5. Storage Class Optimization
\`\`\`javascript
// For infrequently accessed data
client.setStorageClass('STANDARD_IA');

// For archival
client.setStorageClass('GLACIER');
\`\`\`

#### 6. Lifecycle Rules
Set up S3 lifecycle rules for:
- Transition to cheaper storage after X days
- Delete old versions/tombstones
- Expire soft-deleted records

#### 7. CostsPlugin Monitoring
\`\`\`javascript
database.use(new CostsPlugin({
  trackByResource: true,
  alertThreshold: 100, // Alert at $100
}));

const costs = await database.getCostReport();
\`\`\`

Please provide:
1. Cost analysis based on current usage
2. Top 3 optimization recommendations
3. Estimated savings for each recommendation
4. Implementation code for optimizations
5. Monitoring setup to track improvements`,
        },
      },
    ],
  };
}

function generateExplainBehaviorPrompt(args: Record<string, string>): MCPPromptResult {
  const { behavior, scenario } = args;

  const behaviorDocs = behavior
    ? behaviors.filter((b) => b.name === behavior)
    : behaviors;

  return {
    description: 'Explain s3db behaviors and 2KB limit',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Explain s3db behaviors${behavior ? ` (specifically "${behavior}")` : ''}.
${scenario ? `\n**My scenario:** ${scenario}` : ''}

## The 2KB S3 Metadata Limit

### Why It Exists
AWS S3 limits object metadata to 2KB. s3db stores document data in metadata for:
- Single-request reads (no body download)
- Atomic updates via COPY operation
- Better performance for small documents

### What Happens When Data Exceeds 2KB
This is where **behaviors** come in - they define how s3db handles overflow.

## Available Behaviors

${behaviorDocs
  .map(
    (b) => `### ${b.name}
**Safety:** ${b.safety}
**Performance:** ${b.performance}
**Data Integrity:** ${b.dataIntegrity}
**Use Case:** ${b.useCase}

${b.description}

\`\`\`javascript
${b.example}
\`\`\``
  )
  .join('\n\n')}

## Decision Tree

\`\`\`
Is your data always < 2KB?
├─ Yes → Use enforce-limits (fastest, safest)
└─ No → Is data loss acceptable?
         ├─ Yes → Use truncate-data (fastest)
         └─ No → Is most data < 2KB?
                  ├─ Yes → Use body-overflow (balanced)
                  └─ No → Is all data large?
                           ├─ Yes → Use body-only (simplest)
                           └─ No → Use user-managed (full control)
\`\`\`

Please explain:
1. How the selected behavior works internally
2. Performance implications
3. When to use vs avoid
4. Configuration example
5. ${scenario ? 'Recommendation for your specific scenario' : 'Common use cases'}`,
        },
      },
    ],
  };
}

function generateExplainPartitionsPrompt(args: Record<string, string>): MCPPromptResult {
  const { useCase } = args;

  return {
    description: 'Explain s3db partitions',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Explain s3db partitions and when to use them.
${useCase ? `\n**My use case:** ${useCase}` : ''}

## Partitioning in s3db

### The Problem: O(n) Queries
Without partitions, every query must:
1. LIST all objects in the bucket prefix
2. Download each object's metadata
3. Filter in memory

For 10,000 records, that's 10,000+ S3 operations!

### The Solution: O(1) Lookups
Partitions organize data into prefixes based on field values:

\`\`\`
# Without partitions
s3://bucket/users/abc-123.json
s3://bucket/users/def-456.json
s3://bucket/users/ghi-789.json

# With partition by status
s3://bucket/users/_partitions/status=active/abc-123.json
s3://bucket/users/_partitions/status=active/def-456.json
s3://bucket/users/_partitions/status=inactive/ghi-789.json
\`\`\`

### Partition Types

#### 1. Simple Partition
\`\`\`javascript
partitions: {
  byStatus: { key: 'status' }
}
// Query: O(1) for status lookups
await users.query({ status: 'active' }, { partition: 'byStatus' });
\`\`\`

#### 2. Composite Partition
\`\`\`javascript
partitions: {
  byTenantStatus: { key: ['tenantId', 'status'] }
}
// Query: O(1) for tenant + status lookups
await users.query(
  { tenantId: 't1', status: 'active' },
  { partition: 'byTenantStatus' }
);
\`\`\`

#### 3. Date Partition
\`\`\`javascript
partitions: {
  byDate: { key: 'createdAt', type: 'date', granularity: 'day' }
}
// Query: O(1) for date range lookups
await logs.query(
  { createdAt: { $gte: '2024-01-01' } },
  { partition: 'byDate' }
);
\`\`\`

### When to Use Partitions

| Scenario | Recommendation |
|----------|----------------|
| < 1,000 records | Usually not needed |
| 1,000 - 10,000 records | One primary partition |
| 10,000 - 100,000 records | Multiple partitions |
| > 100,000 records | Composite partitions |
| Multi-tenant | Always partition by tenant |
| Time-series | Date partitions |
| Status workflows | Status partition |

### Trade-offs
- **Pros**: O(1) queries, lower costs, better performance
- **Cons**: Write overhead, storage duplication, migration complexity

Please explain:
1. How partitions work internally
2. Best practices for partition key selection
3. ${useCase ? 'Specific recommendation for your use case' : 'Common partition patterns'}
4. How to add partitions to existing resources
5. Monitoring partition performance`,
        },
      },
    ],
  };
}

function generateCompareClientsPrompt(args: Record<string, string>): MCPPromptResult {
  const { environment = 'all' } = args;

  return {
    description: 'Compare s3db storage clients',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Compare s3db storage clients${environment !== 'all' ? ` for ${environment} environment` : ''}.

## Storage Clients Comparison

${clients
  .map(
    (c) => `### ${c.name}
**Description:** ${c.description}
**Connection:** \`${c.connectionString}\`
**Use Case:** ${c.useCase}
**Performance:** ${c.performance}
**Dependencies:** ${c.dependencies.length > 0 ? c.dependencies.join(', ') : 'None'}
`
  )
  .join('\n')}

## Detailed Comparison

| Feature | S3Client | MemoryClient | FileSystemClient |
|---------|----------|--------------|------------------|
| Persistence | ✅ Durable | ❌ Lost on restart | ✅ Durable |
| Performance | ~50-100ms | ~0.1ms | ~1-5ms |
| Cost | Pay per use | Free | Free |
| Scalability | Unlimited | RAM limited | Disk limited |
| Multi-process | ✅ Safe | ❌ No sharing | ⚠️ Careful |
| Testing | Integration | Unit tests | Unit/Integration |
| Production | ✅ Yes | ❌ No | ⚠️ Dev only |

## Environment Recommendations

### Production
\`\`\`javascript
const db = createDatabase('s3://KEY:SECRET@bucket?region=us-east-1');
\`\`\`

### Development
\`\`\`javascript
// Local MinIO
const db = createDatabase('http://minioadmin:minioadmin@localhost:9000/dev');

// Or FileSystem for simplicity
const db = createDatabase('file:///tmp/s3db-dev');
\`\`\`

### Testing (Unit Tests)
\`\`\`javascript
// Memory for isolated, fast tests
const db = createDatabase('memory://test');
\`\`\`

### Testing (Integration)
\`\`\`javascript
// FileSystem for realistic behavior
const db = createDatabase('file:///tmp/s3db-test-' + Date.now());
\`\`\`

### CI/CD
\`\`\`javascript
// FileSystem with unique paths per test run
const db = createDatabase(\`file:///tmp/ci-\${process.env.CI_JOB_ID}\`);
\`\`\`

Please explain:
1. Detailed comparison for ${environment !== 'all' ? environment : 'each environment'}
2. Code examples for switching between clients
3. Configuration best practices
4. Performance benchmarks
5. Common pitfalls and solutions`,
        },
      },
    ],
  };
}

function generateExplainPluginPrompt(args: Record<string, string>): MCPPromptResult {
  const { plugin } = args;
  const pluginDoc = plugins.find(
    (p) =>
      p.name.toLowerCase() === plugin.toLowerCase() ||
      p.name.toLowerCase().replace('plugin', '') === plugin.toLowerCase()
  );

  if (!pluginDoc) {
    return {
      description: `Plugin "${plugin}" not found`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `The plugin "${plugin}" was not found. Available plugins:\n\n${plugins.map((p) => `- **${p.name}**: ${p.description.slice(0, 80)}...`).join('\n')}\n\nPlease specify a valid plugin name.`,
          },
        },
      ],
    };
  }

  return {
    description: `Explain ${pluginDoc.name}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Provide detailed documentation for **${pluginDoc.name}**.

## Plugin Overview

**Name:** ${pluginDoc.name}
**Category:** ${pluginDoc.category}
**Description:** ${pluginDoc.description}

## Configuration Options

${pluginDoc.configOptions.map((opt) => `### ${opt.name}
- **Type:** \`${opt.type}\`
- **Required:** ${opt.required ? 'Yes' : 'No'}
${opt.default ? `- **Default:** \`${opt.default}\`` : ''}
- **Description:** ${opt.description}
`).join('\n')}

## Available Methods

${pluginDoc.methods.map((m) => `### \`${m.signature}\`
${m.description}
`).join('\n')}

## Example Files
${pluginDoc.examples.map((e) => `- \`docs/examples/${e}\``).join('\n')}

## Related Plugins
${pluginDoc.relatedPlugins?.map((rp) => `- ${rp}`).join('\n') || 'None'}

Please provide:
1. Step-by-step setup guide
2. Complete working example
3. Common configuration patterns
4. Integration with other plugins
5. Troubleshooting common issues
6. Performance considerations
7. Best practices`,
        },
      },
    ],
  };
}

function generateVectorRagPrompt(args: Record<string, string>): MCPPromptResult {
  const { embeddingProvider = 'openai', dimensions = '1536', useCase = 'semantic-search' } = args;

  const vectorPlugin = plugins.find((p) => p.name === 'VectorPlugin');

  return {
    description: 'Setup vector embeddings and RAG',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me set up vector embeddings and RAG with s3db.

**Embedding Provider:** ${embeddingProvider}
**Dimensions:** ${dimensions}
**Use Case:** ${useCase}

## VectorPlugin Overview
${vectorPlugin?.description || 'Vector similarity search with embedding support'}

## Embedding Field Type

The \`embedding:N\` field type stores vectors with 77% compression:

\`\`\`javascript
database.createResource('documents', {
  attributes: {
    content: 'string',
    embedding: 'embedding:${dimensions}', // ${dimensions}-dimensional vector
  }
});
\`\`\`

## Embedding Providers

### OpenAI (Recommended)
\`\`\`javascript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embed(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}
\`\`\`

### Cohere
\`\`\`javascript
import { CohereClient } from 'cohere-ai';

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

async function embed(text) {
  const response = await cohere.embed({
    texts: [text],
    model: 'embed-english-v3.0',
    inputType: 'search_document',
  });
  return response.embeddings[0];
}
\`\`\`

### Local (fastembed)
\`\`\`javascript
import { embed } from 'fastembed';

async function embedLocal(text) {
  return await embed(text, { model: 'all-MiniLM-L6-v2' });
}
\`\`\`

## RAG Pipeline

### 1. Index Documents
\`\`\`javascript
async function indexDocument(doc) {
  const embedding = await embed(doc.content);
  await documents.insert({
    content: doc.content,
    embedding,
    metadata: doc.metadata,
  });
}
\`\`\`

### 2. Search Similar
\`\`\`javascript
database.use(new VectorPlugin());

async function search(query, limit = 5) {
  const queryEmbedding = await embed(query);
  return await documents.vectorSearch({
    field: 'embedding',
    vector: queryEmbedding,
    limit,
    minSimilarity: 0.7,
  });
}
\`\`\`

### 3. RAG with LLM
\`\`\`javascript
async function rag(question) {
  const relevantDocs = await search(question);
  const context = relevantDocs.map(d => d.content).join('\\n\\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: \`Answer based on this context:\\n\${context}\` },
      { role: 'user', content: question },
    ],
  });

  return response.choices[0].message.content;
}
\`\`\`

## Use Case Configurations

### Semantic Search
- Dimensions: 1536 (OpenAI) or 384 (MiniLM)
- Min similarity: 0.7
- Index: All searchable content

### Q&A System
- Chunk documents into ~500 token segments
- Store chunk + source reference
- Return top 3-5 chunks for context

### Recommendations
- Store user preference embeddings
- Compute similarity with item embeddings
- Threshold: 0.6 for broader recommendations

Please provide:
1. Complete setup for ${embeddingProvider} provider
2. Document indexing pipeline
3. Search implementation for ${useCase}
4. RAG integration example
5. Performance optimization tips
6. Cost estimation`,
        },
      },
    ],
  };
}

function generateReplicationPrompt(args: Record<string, string>): MCPPromptResult {
  const { target, resources = 'all', mode = 'realtime' } = args;

  const replicatorPlugin = plugins.find((p) => p.name === 'ReplicatorPlugin');

  return {
    description: `Setup replication to ${target}`,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Help me set up data replication from s3db to ${target}.

**Target:** ${target}
**Resources:** ${resources}
**Mode:** ${mode}

## ReplicatorPlugin Overview
${replicatorPlugin?.description || 'Sync data to external systems'}

## Available Replication Targets

### PostgreSQL
\`\`\`javascript
database.use(new ReplicatorPlugin({
  driver: 'postgresql',
  connectionString: process.env.DATABASE_URL,
  resources: ${resources === 'all' ? "'*'" : `['${resources.split(',').join("', '")}']`},
  mode: '${mode}',
  batchSize: 100,
  retryAttempts: 3,
}));
\`\`\`

### BigQuery
\`\`\`javascript
database.use(new ReplicatorPlugin({
  driver: 'bigquery',
  projectId: process.env.GCP_PROJECT,
  dataset: 's3db_replica',
  resources: ${resources === 'all' ? "'*'" : `['${resources.split(',').join("', '")}']`},
  mode: '${mode}',
}));
\`\`\`

### SQS (Event Streaming)
\`\`\`javascript
database.use(new ReplicatorPlugin({
  driver: 'sqs',
  queueUrl: process.env.SQS_QUEUE_URL,
  resources: ${resources === 'all' ? "'*'" : `['${resources.split(',').join("', '")}']`},
  eventTypes: ['insert', 'update', 'delete'],
}));
\`\`\`

### Webhook
\`\`\`javascript
database.use(new ReplicatorPlugin({
  driver: 'webhook',
  url: 'https://your-api.com/webhook',
  headers: { 'X-API-Key': process.env.WEBHOOK_KEY },
  resources: ${resources === 'all' ? "'*'" : `['${resources.split(',').join("', '")}']`},
  retryAttempts: 5,
  retryDelay: 1000,
}));
\`\`\`

## Replication Modes

### Realtime
- Events sent immediately after write
- Low latency, higher load
- Best for: Critical data, notifications

### Batch
- Events batched and sent periodically
- Lower load, eventual consistency
- Best for: Analytics, reporting

## Schema Mapping

s3db types map to target schemas:
| s3db | PostgreSQL | BigQuery |
|------|------------|----------|
| string | TEXT | STRING |
| number | NUMERIC | FLOAT64 |
| boolean | BOOLEAN | BOOL |
| date | TIMESTAMP | TIMESTAMP |
| object | JSONB | JSON |
| array | JSONB | ARRAY |

## Error Handling

\`\`\`javascript
database.on('replication:error', (error, event) => {
  console.error('Replication failed:', error);
  // Dead letter queue or manual retry
});

database.on('replication:success', (event) => {
  console.log('Replicated:', event.resourceName, event.operation);
});
\`\`\`

Please provide:
1. Complete ${target} setup with connection configuration
2. Schema creation/migration for ${resources}
3. ${mode} mode configuration
4. Error handling and retry strategy
5. Monitoring and alerting setup
6. Backfill strategy for existing data
7. Cost and performance considerations`,
        },
      },
    ],
  };
}
