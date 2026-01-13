import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const docsDir = join(__dirname, '../../docs');

export const resources = [
  {
    uri: 's3db:///core-docs',
    name: 'Core Documentation',
    description: 'S3DB core concepts: database, resources, schema, behaviors, events, partitions, encryption, streaming',
    mimeType: 'application/json'
  },
  {
    uri: 's3db:///plugins',
    name: 'Plugin Catalog',
    description: 'Complete catalog of S3DB plugins with configuration schemas and usage examples',
    mimeType: 'application/json'
  },
  {
    uri: 's3db:///examples',
    name: 'Examples Index',
    description: 'Searchable index of 60+ S3DB examples covering all features',
    mimeType: 'application/json'
  },
  {
    uri: 's3db:///field-types',
    name: 'Field Types Reference',
    description: 'All 30+ supported field types with encoding details, compression ratios, and usage',
    mimeType: 'application/json'
  },
  {
    uri: 's3db:///benchmarks',
    name: 'Performance Benchmarks',
    description: 'Performance benchmark data comparing operations, strategies, and configurations',
    mimeType: 'application/json'
  }
];

const coreDocsContent = {
  overview: 'S3DB transforms AWS S3 into a powerful document database with ORM-like interface',
  sections: [
    {
      name: 'S3db Instance',
      path: 'core/database.md',
      summary: 'Main database class for connecting to S3 and managing resources'
    },
    {
      name: 'Resource',
      path: 'core/resource.md',
      summary: 'Data container with CRUD operations, validation, and hooks'
    },
    {
      name: 'Schema & Validation',
      path: 'core/schema.md',
      summary: 'fastest-validator based schema with 30+ field types and schema registry for stable attribute mapping'
    },
    {
      name: 'Behaviors',
      path: 'core/behaviors.md',
      summary: 'Strategies for handling S3 2KB metadata limit: body-overflow, body-only, truncate-data, enforce-limits, user-managed'
    },
    {
      name: 'Events',
      path: 'core/events.md',
      summary: 'Lifecycle events: beforeInsert, afterInsert, beforeUpdate, afterUpdate, beforeDelete, afterDelete'
    },
    {
      name: 'Partitions',
      path: 'core/partitions.md',
      summary: 'O(1) query optimization through field-based partitioning'
    },
    {
      name: 'Encryption',
      path: 'core/encryption.md',
      summary: 'AES-256-GCM encryption for sensitive fields using "secret" type'
    },
    {
      name: 'Streaming',
      path: 'core/streaming.md',
      summary: 'Memory-efficient streaming API for large datasets'
    }
  ],
  internals: [
    {
      name: 'Distributed Lock',
      path: 'core/internals/distributed-lock.md',
      summary: 'S3-based distributed locking for coordination'
    },
    {
      name: 'Distributed Sequence',
      path: 'core/internals/distributed-sequence.md',
      summary: 'Atomic sequence generation across instances'
    },
    {
      name: 'JSON Recovery',
      path: 'core/internals/json-recovery.md',
      summary: 'Automatic recovery from corrupted JSON data'
    },
    {
      name: 'Global Coordinator',
      path: 'core/internals/global-coordinator.md',
      summary: 'Leader election, circuit breaker, contention detection'
    }
  ]
};

const pluginCatalog = {
  count: 40,
  categories: {
    performance: [
      { name: 'CachePlugin', description: 'Multi-layer caching (memory, filesystem, S3)', config: { storage: 'memory|filesystem|s3', ttl: 'number' } },
      { name: 'EventualConsistencyPlugin', description: 'Async operations with read-your-writes', config: { maxLag: 'number', conflictResolution: 'last-write-wins|merge' } },
      { name: 'TTLPlugin', description: 'Auto-cleanup with O(1) partition-based expiration', config: { field: 'string', cleanup: { interval: 'number' } } }
    ],
    dataReplication: [
      { name: 'ReplicatorPlugin', description: 'Sync to PostgreSQL, BigQuery, SQS, and more', config: { targets: 'array', batchSize: 'number' } },
      { name: 'BackupPlugin', description: 'Incremental and full backups', config: { destination: 'string', schedule: 'cron' } },
      { name: 'AuditPlugin', description: 'Track all data changes with actor info', config: { resourceName: 'string', actorField: 'string' } }
    ],
    searchML: [
      { name: 'VectorPlugin', description: 'Vector similarity search (k-NN)', config: { dimensions: 'number', metric: 'cosine|euclidean' } },
      { name: 'FulltextPlugin', description: 'Full-text search with ranking', config: { fields: 'array', language: 'string' } },
      { name: 'MLPlugin', description: 'Machine learning integration', config: { model: 'string', backend: 'tensorflow|onnx' } },
      { name: 'GeoPlugin', description: 'Geospatial queries', config: { latField: 'string', lngField: 'string' } },
      { name: 'GraphPlugin', description: 'Graph relationships and traversal', config: { nodeField: 'string', edgeResource: 'string' } }
    ],
    queuesScheduling: [
      { name: 'S3QueuePlugin', description: 'S3-backed message queue', config: { prefix: 'string', visibility: 'number' } },
      { name: 'SchedulerPlugin', description: 'Cron-based task scheduling', config: { timezone: 'string' } },
      { name: 'QueueConsumerPlugin', description: 'Queue processing workers', config: { concurrency: 'number', retries: 'number' } },
      { name: 'StateMachinePlugin', description: 'State transitions with history', config: { states: 'object', transitions: 'object' } }
    ],
    webScraping: [
      { name: 'PuppeteerPlugin', description: 'Browser automation for scraping', config: { headless: 'boolean', timeout: 'number' } },
      { name: 'SpiderPlugin', description: 'Web crawling with robots.txt respect', config: { userAgent: 'string', maxDepth: 'number' } },
      { name: 'CookieFarmPlugin', description: 'Cookie session management', config: { rotationInterval: 'number' } }
    ],
    devops: [
      { name: 'KubernetesInventoryPlugin', description: 'K8s resource inventory', config: { cluster: 'string', namespaces: 'array' } },
      { name: 'TFStatePlugin', description: 'Terraform state management', config: { bucket: 'string' } },
      { name: 'CostsPlugin', description: 'S3 cost tracking and estimation', config: { region: 'string' } }
    ],
    megaPlugins: [
      { name: 'ApiPlugin', description: 'REST API with guards, OpenAPI docs, rate limiting', config: { port: 'number', auth: 'object' } },
      { name: 'IdentityPlugin', description: 'OIDC authentication and authorization', config: { issuer: 'string', clientId: 'string' } },
      { name: 'ReconPlugin', description: 'Security reconnaissance and OSINT', config: { targets: 'array', depth: 'number' } },
      { name: 'CloudInventoryPlugin', description: 'Multi-cloud resource inventory', config: { providers: 'array' } }
    ],
    other: [
      { name: 'MetricsPlugin', description: 'Performance metrics and monitoring', config: { prefix: 'string', exporters: 'array' } },
      { name: 'SMTPPlugin', description: 'Email sending capabilities', config: { host: 'string', port: 'number' } },
      { name: 'TournamentPlugin', description: 'Tournament and ranking systems', config: { type: 'elimination|round-robin' } },
      { name: 'TreePlugin', description: 'Hierarchical data structures', config: { parentField: 'string' } },
      { name: 'WebSocketPlugin', description: 'Real-time updates', config: { port: 'number', path: 'string' } }
    ]
  }
};

const fieldTypes = {
  count: 30,
  types: [
    { name: 'string', encoding: 'utf8', compression: 'none', example: "'string|required'" },
    { name: 'number', encoding: 'numeric', compression: 'none', example: "'number|min:0'" },
    { name: 'boolean', encoding: 'bit', compression: 'none', example: "'boolean|default:true'" },
    { name: 'date', encoding: 'ISO8601', compression: 'none', example: "'date'" },
    { name: 'email', encoding: 'utf8', compression: 'none', example: "'email'" },
    { name: 'url', encoding: 'utf8', compression: 'none', example: "'url'" },
    { name: 'uuid', encoding: 'utf8', compression: 'none', example: "'uuid'" },
    { name: 'object', encoding: 'JSON', compression: 'optional', example: "{ nested: 'string' }" },
    { name: 'array', encoding: 'JSON', compression: 'optional', example: "{ type: 'array', items: 'string' }" },
    { name: 'secret', encoding: 'AES-256-GCM', compression: 'encrypted', example: "'secret'" },
    { name: 'embedding:N', encoding: 'float32', compression: '77% (quantized)', example: "'embedding:1536'" },
    { name: 'ip4', encoding: 'uint32', compression: '44%', example: "'ip4'" },
    { name: 'ip6', encoding: 'uint128', compression: '47%', example: "'ip6'" },
    { name: 'cidr', encoding: 'binary', compression: '40-50%', example: "'cidr'" },
    { name: 'mac', encoding: 'uint48', compression: '65%', example: "'mac'" },
    { name: 'port', encoding: 'uint16', compression: '60%', example: "'port'" },
    { name: 'timestamp', encoding: 'uint64', compression: '40%', example: "'timestamp'" },
    { name: 'duration', encoding: 'ms', compression: 'none', example: "'duration'" },
    { name: 'json', encoding: 'JSON', compression: 'gzip', example: "'json'" },
    { name: 'binary', encoding: 'base64', compression: 'optional', example: "'binary'" },
    { name: 'enum', encoding: 'index', compression: '90%', example: "{ type: 'enum', values: ['a','b','c'] }" },
    { name: 'any', encoding: 'JSON', compression: 'none', example: "'any'" },
    { name: 'custom', encoding: 'user-defined', compression: 'user-defined', example: "{ type: 'custom', ... }" }
  ],
  specialFeatures: {
    secret: 'Automatic AES-256-GCM encryption with key derivation',
    embedding: '77% compression via quantization, preserves 99.9% accuracy',
    ip4: 'Stored as 32-bit integer, 44% smaller than string representation',
    ip6: 'Stored as 128-bit binary, 47% smaller than string representation'
  }
};

const examplesIndex = {
  count: 60,
  categories: [
    {
      name: 'Getting Started',
      examples: [
        { id: 'e01', name: 'Basic CRUD', file: 'e01-basic-crud.js' },
        { id: 'e02', name: 'Schema Validation', file: 'e02-schema-validation.js' },
        { id: 'e03', name: 'Connection Strings', file: 'e03-connection-strings.js' }
      ]
    },
    {
      name: 'Advanced Features',
      examples: [
        { id: 'e10', name: 'Partitioning', file: 'e10-partitioning.js' },
        { id: 'e11', name: 'Encryption', file: 'e11-encryption.js' },
        { id: 'e12', name: 'Streaming', file: 'e12-streaming.js' },
        { id: 'e13', name: 'Hooks and Guards', file: 'e13-hooks-guards.js' }
      ]
    },
    {
      name: 'Plugins',
      examples: [
        { id: 'e20', name: 'Cache Plugin', file: 'e20-cache-plugin.js' },
        { id: 'e21', name: 'TTL Plugin', file: 'e21-ttl-plugin.js' },
        { id: 'e22', name: 'Audit Plugin', file: 'e22-audit-plugin.js' },
        { id: 'e23', name: 'Vector Search', file: 'e23-vector-search.js' },
        { id: 'e24', name: 'Full-text Search', file: 'e24-fulltext-search.js' }
      ]
    },
    {
      name: 'Real-World Use Cases',
      examples: [
        { id: 'e40', name: 'E-commerce Catalog', file: 'e40-ecommerce.js' },
        { id: 'e41', name: 'User Sessions', file: 'e41-sessions.js' },
        { id: 'e42', name: 'IoT Sensor Data', file: 'e42-iot.js' },
        { id: 'e43', name: 'Multi-tenant SaaS', file: 'e43-multitenancy.js' }
      ]
    }
  ]
};

const benchmarksData = {
  lastUpdated: '2024-12-01',
  environment: {
    region: 'us-east-1',
    s3Class: 'STANDARD',
    nodeVersion: '20.x'
  },
  operations: {
    insert: {
      single: { p50: '45ms', p95: '120ms', p99: '250ms' },
      batch100: { p50: '180ms', p95: '350ms', p99: '600ms' },
      batch1000: { p50: '1.2s', p95: '2.5s', p99: '4s' }
    },
    get: {
      byId: { p50: '25ms', p95: '80ms', p99: '150ms' },
      byPartition: { p50: '35ms', p95: '100ms', p99: '200ms' }
    },
    update: {
      standard: { p50: '85ms', p95: '200ms', p99: '400ms', note: 'GET+PUT' },
      patch: { p50: '45ms', p95: '120ms', p99: '250ms', note: 'HEAD+COPY, 40-60% faster' },
      replace: { p50: '55ms', p95: '140ms', p99: '280ms', note: 'PUT only, 30-40% faster' }
    },
    list: {
      noPartition100: { p50: '350ms', p95: '800ms', p99: '1.5s' },
      withPartition100: { p50: '85ms', p95: '180ms', p99: '350ms' }
    }
  },
  compression: {
    embedding1536: { original: '6KB', compressed: '1.4KB', ratio: '77%' },
    ip4: { original: '15B', compressed: '4B', ratio: '73%' },
    ip6: { original: '39B', compressed: '16B', ratio: '59%' }
  },
  costs: {
    storage: '$0.023/GB/month',
    putRequest: '$0.005/1000',
    getRequest: '$0.0004/1000',
    example: {
      scenario: '1M records, 2KB avg, 100k reads/day, 10k writes/day',
      monthly: '$3.50'
    }
  }
};

export function getResourceContent(uri: string): { uri: string; mimeType: string; text: string } {
  switch (uri) {
    case 's3db:///core-docs':
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(coreDocsContent, null, 2)
      };

    case 's3db:///plugins':
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(pluginCatalog, null, 2)
      };

    case 's3db:///examples':
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(examplesIndex, null, 2)
      };

    case 's3db:///field-types':
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(fieldTypes, null, 2)
      };

    case 's3db:///benchmarks':
      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(benchmarksData, null, 2)
      };

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}
