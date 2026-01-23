import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import type {
  MCPResource,
  MCPResourceTemplate,
  MCPResourceContent,
} from './types/index.js';

import {
  plugins,
  fieldTypes,
  behaviors,
  clients,
  guides,
  exampleCategories,
  getPluginByName,
  getFieldTypeByName,
  getBehaviorByName,
  getClientByName,
  getGuideByTopic,
  getExamplesByCategory,
} from './docs-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../');
const DOCS_ROOT = join(PROJECT_ROOT, 'docs');

// =============================================================================
// Resource Templates
// =============================================================================

export const resourceTemplates: MCPResourceTemplate[] = [
  {
    uriTemplate: 's3db://core/{topic}',
    name: 'Core Documentation',
    description: 'Core s3db.js concepts: database, schema, resource, behaviors, partitions, encryption, streaming, events',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://client/{name}',
    name: 'Storage Client',
    description: 'Storage client documentation: s3, memory, filesystem',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://plugin/{name}',
    name: 'Plugin Documentation',
    description: 'Plugin documentation: cache, api, audit, ttl, vector, geo, replicator, metrics, backup, queue, etc.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://guide/{topic}',
    name: 'Guide',
    description: 'Usage guides: getting-started, performance, typescript, testing, multi-tenancy, security',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://example/{category}',
    name: 'Examples',
    description: 'Example code by category: crud, bulk, partitioning, caching, vector-rag, auth, streaming, hooks',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://reference/{topic}',
    name: 'Reference',
    description: 'Reference documentation: cli, mcp, errors, connection-strings',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://field-type/{type}',
    name: 'Field Type',
    description: 'Field type documentation: string, number, secret, embedding, ip4, object, array, etc.',
    mimeType: 'text/markdown',
  },
  {
    uriTemplate: 's3db://behavior/{name}',
    name: 'Behavior',
    description: 'Behavior documentation: body-overflow, body-only, truncate-data, enforce-limits, user-managed',
    mimeType: 'text/markdown',
  },
];

// =============================================================================
// Static Resources (always available)
// =============================================================================

export const staticResources: MCPResource[] = [
  {
    uri: 's3db://overview',
    name: 'S3DB Overview',
    description: 'Complete overview of s3db.js capabilities and architecture',
    mimeType: 'text/markdown',
  },
  {
    uri: 's3db://quick-reference',
    name: 'Quick Reference',
    description: 'Quick reference card for common operations',
    mimeType: 'text/markdown',
  },
  {
    uri: 's3db://api-summary',
    name: 'API Summary',
    description: 'Summary of all available methods and their signatures',
    mimeType: 'text/markdown',
  },
];

// =============================================================================
// URI Parsing
// =============================================================================

interface ParsedUri {
  scheme: string;
  type: string;
  name: string;
}

function parseResourceUri(uri: string): ParsedUri | null {
  const match = uri.match(/^(\w+):\/\/([^/]+)(?:\/(.+))?$/);
  if (!match) return null;

  return {
    scheme: match[1],
    type: match[2],
    name: match[3] || '',
  };
}

// =============================================================================
// Resource Handlers
// =============================================================================

export function readResource(uri: string): MCPResourceContent | null {
  const parsed = parseResourceUri(uri);
  if (!parsed) return null;

  const { scheme, type, name } = parsed;
  if (scheme !== 's3db') return null;

  try {
    let text: string;

    switch (type) {
      case 'overview':
        text = generateOverview();
        break;

      case 'quick-reference':
        text = generateQuickReference();
        break;

      case 'api-summary':
        text = generateApiSummary();
        break;

      case 'core':
        text = readCoreDoc(name);
        break;

      case 'client':
        text = generateClientDoc(name);
        break;

      case 'plugin':
        text = generatePluginDoc(name);
        break;

      case 'guide':
        text = readGuideDoc(name);
        break;

      case 'example':
        text = generateExamplesDoc(name);
        break;

      case 'reference':
        text = readReferenceDoc(name);
        break;

      case 'field-type':
        text = generateFieldTypeDoc(name);
        break;

      case 'behavior':
        text = generateBehaviorDoc(name);
        break;

      default:
        return null;
    }

    return {
      uri,
      mimeType: 'text/markdown',
      text,
    };
  } catch (err) {
    return null;
  }
}

// =============================================================================
// Content Generators
// =============================================================================

function generateOverview(): string {
  return `# S3DB.js Overview

Transform AWS S3 into a powerful document database with ORM-like interface.

## Key Features

- **Zero-cost storage**: Pay only for S3 usage
- **30+ field types**: With automatic encoding/compression
- **5 behavior strategies**: Handle the 2KB metadata limit
- **Partitioning**: O(1) queries instead of O(n) scans
- **Built-in encryption**: AES-256-GCM for secret fields
- **26+ plugins**: Cache, API, Audit, TTL, Vector, Geo, etc.

## Core API

| Method | Description | Performance |
|--------|-------------|-------------|
| \`insert()\` | Insert document | Baseline |
| \`get()\` | Get by ID | Fastest |
| \`update()\` | GET+PUT merge | Baseline |
| \`patch()\` | HEAD+COPY merge | 40-60% faster |
| \`replace()\` | PUT only | 30-40% faster |
| \`list()\` | List with pagination | O(n) or O(1) with partitions |
| \`query()\` | Query with filters | O(n) or O(1) with partitions |

## Connection Strings

\`\`\`
s3://KEY:SECRET@bucket?region=us-east-1     # AWS S3
http://KEY:SECRET@localhost:9000/bucket     # MinIO
memory://bucket/path                        # MemoryClient (testing)
file:///tmp/s3db                            # FileSystemClient (testing)
\`\`\`

## Quick Example

\`\`\`javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://KEY:SECRET@my-bucket?region=us-east-1'
});

await db.connect();

const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',
    name: 'string|required',
    bio: 'string',
  },
  behavior: 'body-overflow',
});

await users.insert({ email: 'john@example.com', name: 'John Doe' });
const user = await users.get('user-id');
\`\`\`

## Available Plugins

${plugins.map(p => `- **${p.name}**: ${p.description}`).join('\n')}
`;
}

function generateQuickReference(): string {
  return `# S3DB Quick Reference

## Connection

\`\`\`javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://KEY:SECRET@bucket?region=us-east-1'
});
await db.connect();
\`\`\`

## Resource Creation

\`\`\`javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',
    name: 'string'
  },
  behavior: 'body-overflow',  // handle 2KB limit
  partitions: {
    byStatus: { fields: { status: 'string' } }
  }
});
\`\`\`

## CRUD Operations

\`\`\`javascript
// Create
const user = await users.insert({ email: 'john@example.com' });

// Read
const user = await users.get(id);
const all = await users.list({ limit: 100 });

// Update
await users.update(id, { name: 'John' });  // GET+PUT
await users.patch(id, { name: 'John' });   // HEAD+COPY (faster)
await users.replace(id, fullData);         // PUT only (fastest)

// Delete
await users.delete(id);

// Query
const active = await users.query({ status: 'active' });
\`\`\`

## Partitions (O(1) queries)

\`\`\`javascript
// Instead of O(n) query scan:
const active = await users.query({ status: 'active' }); // SLOW

// Use O(1) partition lookup:
const active = await users.listPartition('byStatus', { status: 'active' }); // FAST
\`\`\`

## Field Types

| Type | Example |
|------|---------|
| string | \`'string|required|min:3'\` |
| number | \`'number|min:0|max:100'\` |
| email | \`'email|required'\` |
| secret | \`'secret'\` (encrypted) |
| embedding | \`'embedding:1536'\` (77% compression) |
| ip4/ip6 | \`'ip4'\` (44% compression) |
| object | \`{ nested: 'string' }\` |

## Behaviors (2KB limit)

| Behavior | Use Case |
|----------|----------|
| body-overflow | Default - small in metadata, large in body |
| body-only | Always in body (large docs) |
| enforce-limits | Fail if >2KB (strict schema) |
| truncate-data | Accept data loss (logs, previews) |
`;
}

function generateApiSummary(): string {
  return `# S3DB API Summary

## Database Class

\`\`\`typescript
class Database {
  constructor(options: DatabaseOptions)
  connect(): Promise<void>
  disconnect(): Promise<void>
  createResource(config: ResourceConfig): Promise<Resource>
  getResource(name: string): Resource
  use(plugin: Plugin): void
  isConnected(): boolean
}
\`\`\`

## Resource Class

\`\`\`typescript
class Resource {
  // CRUD
  insert(data: object): Promise<object>
  get(id: string): Promise<object | null>
  update(id: string, data: object): Promise<object>
  patch(id: string, data: object): Promise<object>  // HEAD+COPY (faster)
  replace(id: string, data: object): Promise<object>  // PUT only (fastest)
  delete(id: string): Promise<void>
  upsert(data: object): Promise<object>

  // Query
  list(options?: ListOptions): Promise<object[]>
  query(filters: object, options?: QueryOptions): Promise<object[]>
  count(): Promise<number>

  // Partitions
  listPartition(name: string, values: object): Promise<object[]>
  getFromPartition(name: string, values: object, id: string): Promise<object>

  // Bulk
  bulkInsert(items: object[]): Promise<object[]>
  bulkUpdate(filters: object, updates: object): Promise<number>
  bulkDelete(filters: object): Promise<number>

  // Streaming
  stream(options?: StreamOptions): AsyncIterable<object>
  writeStream(): WritableStream

  // Hooks
  beforeInsert(hook: HookFn): void
  afterInsert(hook: HookFn): void
  beforeUpdate(hook: HookFn): void
  afterUpdate(hook: HookFn): void
  beforeDelete(hook: HookFn): void
  afterDelete(hook: HookFn): void
}
\`\`\`

## Options Types

\`\`\`typescript
interface ListOptions {
  limit?: number
  offset?: number
  sort?: { field: string, order: 'asc' | 'desc' }
}

interface QueryOptions extends ListOptions {
  filters?: Record<string, any>
}

interface ResourceConfig {
  name: string
  attributes: Record<string, string | object>
  behavior?: 'body-overflow' | 'body-only' | 'enforce-limits' | 'truncate-data' | 'user-managed'
  partitions?: Record<string, PartitionConfig>
  timestamps?: boolean
  paranoid?: boolean  // soft delete
}

interface PartitionConfig {
  fields: Record<string, string>
}
\`\`\`
`;
}

function readCoreDoc(topic: string): string {
  const topicMap: Record<string, string> = {
    database: 'core/database.md',
    schema: 'schema.md',
    resource: 'core/resource.md',
    behaviors: 'core/behaviors.md',
    partitions: 'core/partitions.md',
    encryption: 'core/encryption.md',
    streaming: 'core/streaming.md',
    events: 'core/events.md',
    hooks: 'core/events.md',
  };

  const filePath = topicMap[topic];
  if (!filePath) {
    const availableTopics = Object.keys(topicMap).join(', ');
    return `# Core: ${topic}\n\nTopic not found. Available topics: ${availableTopics}`;
  }

  try {
    return readFileSync(join(DOCS_ROOT, filePath), 'utf-8');
  } catch {
    return generateCoreFallback(topic);
  }
}

function generateCoreFallback(topic: string): string {
  const fallbacks: Record<string, string> = {
    database: `# Database

The Database class is the main entry point for s3db.js.

## Connection

\`\`\`javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://KEY:SECRET@bucket?region=us-east-1',
  passphrase: 'encryption-key',  // optional, for secret fields
});

await db.connect();
\`\`\`

## Creating Resources

\`\`\`javascript
const users = await db.createResource({
  name: 'users',
  attributes: {
    email: 'email|required',
    name: 'string',
  },
});
\`\`\`

## Using Plugins

\`\`\`javascript
import { CachePlugin } from 's3db.js';

db.use(new CachePlugin({ driver: 'memory' }));
\`\`\`
`,
    behaviors: `# Behaviors

S3 has a hard 2KB limit for user-defined metadata. Behaviors define how s3db.js handles this limit.

## Available Behaviors

| Behavior | Description |
|----------|-------------|
| \`body-overflow\` | **Default.** Tries metadata first, overflows to body if >2KB |
| \`body-only\` | Always stores in body. No size limit. |
| \`enforce-limits\` | Throws error if >2KB. Guarantees metadata-only. |
| \`truncate-data\` | Truncates data >2KB. DATA LOSS. |
| \`user-managed\` | No checking. You handle it. |

## Usage

\`\`\`javascript
const resource = await db.createResource({
  name: 'logs',
  attributes: { message: 'string' },
  behavior: 'truncate-data',  // Accept data loss for logs
});
\`\`\`
`,
    partitions: `# Partitions

S3 has no indexes. Without partitions, every query scans ALL objects (O(n)).
With partitions, queries become O(1) lookups.

## How It Works

Partitions create additional S3 keys as "pointers" to records.

## Creating Partitions

\`\`\`javascript
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    status: 'string',
    customerId: 'string',
  },
  partitions: {
    byStatus: { fields: { status: 'string' } },
    byCustomer: { fields: { customerId: 'string' } },
  },
});
\`\`\`

## Using Partitions

\`\`\`javascript
// O(1) lookup instead of O(n) scan
const pending = await orders.listPartition('byStatus', { status: 'pending' });
const customerOrders = await orders.listPartition('byCustomer', { customerId: 'cust-123' });
\`\`\`
`,
  };

  return fallbacks[topic] || `# Core: ${topic}\n\nDocumentation for this topic is not yet available.`;
}

function generateClientDoc(name: string): string {
  const client = getClientByName(name);
  if (!client) {
    const availableClients = clients.map(c => c.name.replace('Client', '').toLowerCase()).join(', ');
    return `# Client: ${name}\n\nClient not found. Available clients: ${availableClients}`;
  }

  return `# ${client.name}

${client.description}

## Connection String

\`\`\`
${client.connectionString}
\`\`\`

## Use Case

${client.useCase}

## Performance

${client.performance}

## Dependencies

${client.dependencies.length > 0 ? client.dependencies.map(d => `- \`${d}\``).join('\n') : 'None (zero dependencies)'}

## Example

\`\`\`javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: '${client.connectionString}'
});

await db.connect();
\`\`\`
`;
}

function generatePluginDoc(name: string): string {
  const plugin = getPluginByName(name);
  if (!plugin) {
    const availablePlugins = plugins.map(p => p.name.replace('Plugin', '').toLowerCase()).join(', ');
    return `# Plugin: ${name}\n\nPlugin not found. Available plugins: ${availablePlugins}`;
  }

  const configTable = plugin.configOptions.length > 0
    ? `## Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
${plugin.configOptions.map(o => `| \`${o.name}\` | \`${o.type}\` | ${o.required ? 'Yes' : 'No'} | ${o.default || '-'} | ${o.description} |`).join('\n')}
`
    : '';

  const methodsSection = plugin.methods.length > 0
    ? `## Methods

${plugin.methods.map(m => `### \`${m.name}\`

\`\`\`typescript
${m.signature}
\`\`\`

${m.description}
`).join('\n')}
`
    : '';

  return `# ${plugin.name}

**Category:** ${plugin.category}

${plugin.description}

${configTable}

## Basic Usage

\`\`\`javascript
import { Database } from 's3db.js';
import { ${plugin.name} } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });
db.use(new ${plugin.name}({
  // configuration options here
}));

await db.connect();
\`\`\`

${methodsSection}

## Examples

${plugin.examples.length > 0 ? plugin.examples.map(e => `- \`docs/examples/${e}\``).join('\n') : 'No examples available.'}

## Related Plugins

${plugin.relatedPlugins && plugin.relatedPlugins.length > 0 ? plugin.relatedPlugins.map(p => `- ${p}`).join('\n') : 'None'}
`;
}

function readGuideDoc(topic: string): string {
  const guide = getGuideByTopic(topic);
  if (!guide) {
    const availableGuides = guides.map(g => g.topic).join(', ');
    return `# Guide: ${topic}\n\nGuide not found. Available guides: ${availableGuides}`;
  }

  const topicMap: Record<string, string> = {
    'getting-started': 'README.md',
    'performance-tuning': 'guides/performance-tuning.md',
    typescript: 'guides/typescript.md',
    testing: 'guides/testing.md',
    'multi-tenancy': 'guides/multi-tenancy.md',
    security: 'guides/security-best-practices.md',
  };

  const filePath = topicMap[topic];
  if (filePath) {
    try {
      return readFileSync(join(DOCS_ROOT, filePath), 'utf-8');
    } catch {
      // Fall through to generated content
    }
  }

  return `# ${guide.title}

${guide.description}

## Sections

${guide.sections.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;
}

function generateExamplesDoc(category: string): string {
  const examples = getExamplesByCategory(category);
  if (examples.length === 0) {
    const availableCategories = Object.keys(exampleCategories).join(', ');
    return `# Examples: ${category}\n\nCategory not found. Available categories: ${availableCategories}`;
  }

  return `# Examples: ${category}

## Available Examples

${examples.map(e => `- \`docs/examples/${e}\``).join('\n')}

## Usage

All examples are in \`docs/examples/\` directory and can be run with:

\`\`\`bash
node docs/examples/${examples[0]}
\`\`\`

## Category Description

${getCategoryDescription(category)}
`;
}

function getCategoryDescription(category: string): string {
  const descriptions: Record<string, string> = {
    crud: 'Basic CRUD operations: insert, get, update, delete, list, query.',
    bulk: 'Bulk operations for high-throughput data processing.',
    partitioning: 'Partitioning strategies for O(1) query performance.',
    caching: 'Caching patterns to reduce S3 API calls and costs.',
    'vector-rag': 'Vector embeddings and RAG (Retrieval Augmented Generation) for AI applications.',
    auth: 'Authentication patterns with JWT, Basic Auth, OIDC.',
    streaming: 'Streaming large datasets for memory-efficient processing.',
    hooks: 'Lifecycle hooks for validation, timestamps, versioning.',
    replication: 'Data replication to PostgreSQL, BigQuery, SQS.',
    testing: 'Testing patterns with MemoryClient and FilesystemClient.',
  };

  return descriptions[category] || 'Examples for this category.';
}

function readReferenceDoc(topic: string): string {
  const topicMap: Record<string, string> = {
    cli: 'reference/cli.md',
    mcp: 'mcp.md',
    errors: 'reference/errors.md',
    'connection-strings': 'reference/connection-strings.md',
  };

  const filePath = topicMap[topic];
  if (!filePath) {
    const availableTopics = Object.keys(topicMap).join(', ');
    return `# Reference: ${topic}\n\nTopic not found. Available topics: ${availableTopics}`;
  }

  try {
    return readFileSync(join(DOCS_ROOT, filePath), 'utf-8');
  } catch {
    return `# Reference: ${topic}\n\nDocumentation file not found: ${filePath}`;
  }
}

function generateFieldTypeDoc(type: string): string {
  const fieldType = getFieldTypeByName(type);
  if (!fieldType) {
    const availableTypes = fieldTypes.map(f => f.name).join(', ');
    return `# Field Type: ${type}\n\nType not found. Available types: ${availableTypes}`;
  }

  return `# Field Type: ${fieldType.name}

## Syntax

\`\`\`
${fieldType.syntax}
\`\`\`

## Compression

${fieldType.compression}

## Description

${fieldType.description}

## Examples

\`\`\`javascript
const resource = await db.createResource({
  name: 'example',
  attributes: {
    ${fieldType.examples.join(',\n    ')}
  }
});
\`\`\`

## Available Validators

${fieldType.validators.length > 0 ? fieldType.validators.map(v => `- \`${v}\``).join('\n') : 'None'}
`;
}

function generateBehaviorDoc(name: string): string {
  const behavior = getBehaviorByName(name);
  if (!behavior) {
    const availableBehaviors = behaviors.map(b => b.name).join(', ');
    return `# Behavior: ${name}\n\nBehavior not found. Available behaviors: ${availableBehaviors}`;
  }

  return `# Behavior: ${behavior.name}

## Overview

| Property | Value |
|----------|-------|
| Safety | ${behavior.safety} |
| Performance | ${behavior.performance} |
| Data Integrity | ${behavior.dataIntegrity} |
| Use Case | ${behavior.useCase} |

## Description

${behavior.description}

## Example

\`\`\`javascript
const resource = await db.createResource({
  name: 'items',
  attributes: { data: 'any' },
  ${behavior.example}
});
\`\`\`

## When to Use

${behavior.useCase}

## Comparison with Other Behaviors

${behaviors.filter(b => b.name !== behavior.name).map(b => `- **${b.name}**: ${b.useCase}`).join('\n')}
`;
}

// =============================================================================
// List Resources
// =============================================================================

export function listResources(): MCPResource[] {
  // Return static resources plus dynamically generated ones
  const dynamicResources: MCPResource[] = [];

  // Add all plugins as resources
  plugins.forEach((plugin) => {
    dynamicResources.push({
      uri: `s3db://plugin/${plugin.name.replace('Plugin', '').toLowerCase()}`,
      name: plugin.name,
      description: plugin.description,
      mimeType: 'text/markdown',
    });
  });

  // Add all field types as resources
  fieldTypes.forEach((ft) => {
    dynamicResources.push({
      uri: `s3db://field-type/${ft.name}`,
      name: `Field Type: ${ft.name}`,
      description: ft.description,
      mimeType: 'text/markdown',
    });
  });

  // Add all behaviors as resources
  behaviors.forEach((b) => {
    dynamicResources.push({
      uri: `s3db://behavior/${b.name}`,
      name: `Behavior: ${b.name}`,
      description: b.useCase,
      mimeType: 'text/markdown',
    });
  });

  // Add all clients as resources
  clients.forEach((c) => {
    dynamicResources.push({
      uri: `s3db://client/${c.name.replace('Client', '').toLowerCase()}`,
      name: c.name,
      description: c.description,
      mimeType: 'text/markdown',
    });
  });

  // Add all guides as resources
  guides.forEach((g) => {
    dynamicResources.push({
      uri: `s3db://guide/${g.topic}`,
      name: g.title,
      description: g.description,
      mimeType: 'text/markdown',
    });
  });

  return [...staticResources, ...dynamicResources];
}

export default {
  resourceTemplates,
  staticResources,
  readResource,
  listResources,
};
