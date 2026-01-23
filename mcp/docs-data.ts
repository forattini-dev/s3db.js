import type {
  PluginDoc,
  FieldTypeDoc,
  BehaviorDoc,
  GuideDoc,
  ClientDoc,
} from './types/index.js';

// =============================================================================
// Plugin Documentation
// =============================================================================

export const plugins: PluginDoc[] = [
  {
    name: 'CachePlugin',
    category: 'core',
    description: 'Multi-driver caching with memory, filesystem, and S3 backends. Reduces S3 API calls by caching GET/HEAD results.',
    configOptions: [
      { name: 'driver', type: "'memory' | 'filesystem' | FilesystemCache", required: false, default: 'memory', description: 'Cache backend driver' },
      { name: 'includePartitions', type: 'boolean', required: false, default: 'true', description: 'Cache partition lookups' },
      { name: 'memoryOptions.maxSize', type: 'number', required: false, default: '1000', description: 'Max items in memory cache' },
      { name: 'memoryOptions.ttl', type: 'number', required: false, default: '300000', description: 'TTL in milliseconds' },
    ],
    methods: [
      { name: 'invalidate', signature: '(resourceName: string, id?: string) => Promise<void>', description: 'Invalidate cache entries' },
      { name: 'getStats', signature: '() => CacheStats', description: 'Get cache hit/miss statistics' },
    ],
    examples: ['e32-improved-caching.js', 'e37-cache-plugin-drivers.js'],
    relatedPlugins: ['CostsPlugin', 'MetricsPlugin'],
  },
  {
    name: 'AuditPlugin',
    category: 'core',
    description: 'Track all CRUD operations with timestamps, user info, and change diffs. Essential for compliance and debugging.',
    configOptions: [
      { name: 'resource', type: 'Resource', required: true, description: 'Resource to store audit logs' },
      { name: 'includeOldValue', type: 'boolean', required: false, default: 'false', description: 'Store previous values on update' },
      { name: 'includeNewValue', type: 'boolean', required: false, default: 'true', description: 'Store new values' },
    ],
    methods: [
      { name: 'getAuditLog', signature: '(resourceName: string, id: string) => Promise<AuditEntry[]>', description: 'Get audit history for a record' },
    ],
    examples: ['e30-middleware-auth-audit.js'],
    relatedPlugins: ['MetricsPlugin'],
  },
  {
    name: 'ApiPlugin',
    category: 'integration',
    description: 'REST API with guards, OpenAPI docs, authentication drivers (JWT, Basic, OIDC). Built on Hono framework.',
    configOptions: [
      { name: 'port', type: 'number', required: false, default: '3000', description: 'Server port' },
      { name: 'prefix', type: 'string', required: false, default: "''", description: 'API prefix (e.g., /api/v1)' },
      { name: 'auth', type: 'AuthConfig', required: false, description: 'Authentication configuration' },
      { name: 'guards', type: 'GuardConfig[]', required: false, description: 'Resource-level access control' },
      { name: 'openapi', type: 'boolean', required: false, default: 'true', description: 'Enable OpenAPI documentation' },
    ],
    methods: [
      { name: 'start', signature: '() => Promise<void>', description: 'Start the API server' },
      { name: 'stop', signature: '() => Promise<void>', description: 'Stop the API server' },
      { name: 'getHonoApp', signature: '() => Hono', description: 'Get underlying Hono instance for custom routes' },
    ],
    examples: ['e47-api-plugin-basic.js', 'e49-api-plugin-complete.js', 'e100-api-demo-server.js'],
    relatedPlugins: ['CachePlugin', 'MetricsPlugin', 'AuditPlugin'],
  },
  {
    name: 'TTLPlugin',
    category: 'utility',
    description: 'Auto-cleanup with O(1) partition-based expiration. Records are automatically deleted after TTL expires.',
    configOptions: [
      { name: 'field', type: 'string', required: true, description: 'Field containing expiration timestamp' },
      { name: 'interval', type: 'number', required: false, default: '60000', description: 'Cleanup check interval (ms)' },
      { name: 'batchSize', type: 'number', required: false, default: '100', description: 'Records per cleanup batch' },
    ],
    methods: [
      { name: 'cleanup', signature: '() => Promise<number>', description: 'Manually trigger cleanup, returns deleted count' },
    ],
    examples: [],
    relatedPlugins: ['SchedulerPlugin'],
  },
  {
    name: 'VectorPlugin',
    category: 'data',
    description: 'Vector embeddings with 77% compression, similarity search, RAG support. Optimized for AI/ML workloads.',
    configOptions: [
      { name: 'dimensions', type: 'number', required: true, description: 'Vector dimensions (e.g., 1536 for OpenAI)' },
      { name: 'metric', type: "'cosine' | 'euclidean' | 'dot'", required: false, default: 'cosine', description: 'Similarity metric' },
    ],
    methods: [
      { name: 'search', signature: '(vector: number[], limit?: number) => Promise<SearchResult[]>', description: 'Find similar vectors' },
      { name: 'addEmbedding', signature: '(id: string, vector: number[]) => Promise<void>', description: 'Store embedding' },
    ],
    examples: ['e41-vector-rag-chatbot.js', 'e42-vector-integrations.js'],
    relatedPlugins: ['FulltextPlugin'],
  },
  {
    name: 'GeoPlugin',
    category: 'data',
    description: 'Geospatial queries, bounding box, radius search, geohash clustering. Location-based applications.',
    configOptions: [
      { name: 'latField', type: 'string', required: true, description: 'Latitude field name' },
      { name: 'lonField', type: 'string', required: true, description: 'Longitude field name' },
      { name: 'precision', type: 'number', required: false, default: '6', description: 'Geohash precision' },
    ],
    methods: [
      { name: 'nearBy', signature: '(lat: number, lon: number, radiusKm: number) => Promise<Result[]>', description: 'Find points within radius' },
      { name: 'boundingBox', signature: '(sw: LatLon, ne: LatLon) => Promise<Result[]>', description: 'Find points in bounding box' },
    ],
    examples: [],
    relatedPlugins: ['VectorPlugin'],
  },
  {
    name: 'ReplicatorPlugin',
    category: 'integration',
    description: 'Sync to PostgreSQL, BigQuery, SQS, or custom destinations. Real-time data replication.',
    configOptions: [
      { name: 'driver', type: 'ReplicatorDriver', required: true, description: 'Replication destination driver' },
      { name: 'resources', type: 'string[]', required: false, description: 'Resources to replicate (all if not specified)' },
      { name: 'batchSize', type: 'number', required: false, default: '100', description: 'Batch size for sync' },
    ],
    methods: [
      { name: 'sync', signature: '(resourceName: string) => Promise<SyncResult>', description: 'Trigger manual sync' },
      { name: 'getStatus', signature: '() => ReplicatorStatus', description: 'Get replication status' },
    ],
    examples: ['e23-replicators.js', 'e24-bigquery-replicator.js', 'e26-postgres-replicator.js'],
    relatedPlugins: ['S3QueuePlugin'],
  },
  {
    name: 'MetricsPlugin',
    category: 'utility',
    description: 'Prometheus-compatible metrics, latency percentiles, operation counts. Observability for production.',
    configOptions: [
      { name: 'prefix', type: 'string', required: false, default: 's3db', description: 'Metrics prefix' },
      { name: 'labels', type: 'Record<string, string>', required: false, description: 'Default labels' },
    ],
    methods: [
      { name: 'getMetrics', signature: '() => string', description: 'Get Prometheus-format metrics' },
      { name: 'getStats', signature: '() => MetricsStats', description: 'Get structured stats object' },
    ],
    examples: ['e48-metrics-prometheus.js'],
    relatedPlugins: ['CachePlugin', 'CostsPlugin'],
  },
  {
    name: 'BackupPlugin',
    category: 'utility',
    description: 'Full and incremental backups to S3, restore points. Disaster recovery.',
    configOptions: [
      { name: 'destination', type: 'string', required: true, description: 'Backup destination path/bucket' },
      { name: 'schedule', type: 'string', required: false, description: 'Cron expression for automatic backups' },
      { name: 'retention', type: 'number', required: false, default: '7', description: 'Days to keep backups' },
    ],
    methods: [
      { name: 'backup', signature: '() => Promise<BackupResult>', description: 'Create backup' },
      { name: 'restore', signature: '(backupId: string) => Promise<void>', description: 'Restore from backup' },
      { name: 'listBackups', signature: '() => Promise<BackupInfo[]>', description: 'List available backups' },
    ],
    examples: [],
    relatedPlugins: ['SchedulerPlugin'],
  },
  {
    name: 'SchedulerPlugin',
    category: 'utility',
    description: 'Cron-based job scheduling with distributed locking. Background tasks.',
    configOptions: [
      { name: 'namespace', type: 'string', required: false, default: 'default', description: 'Scheduler namespace for multi-instance' },
    ],
    methods: [
      { name: 'schedule', signature: '(name: string, cron: string, handler: Function) => void', description: 'Schedule a job' },
      { name: 'unschedule', signature: '(name: string) => void', description: 'Remove scheduled job' },
    ],
    examples: [],
    relatedPlugins: ['TTLPlugin', 'BackupPlugin'],
  },
  {
    name: 'FulltextPlugin',
    category: 'data',
    description: 'Full-text search with stemming, tokenization, relevance ranking. Search functionality.',
    configOptions: [
      { name: 'fields', type: 'string[]', required: true, description: 'Fields to index' },
      { name: 'language', type: 'string', required: false, default: 'english', description: 'Stemmer language' },
    ],
    methods: [
      { name: 'search', signature: '(query: string, options?: SearchOptions) => Promise<SearchResult[]>', description: 'Full-text search' },
      { name: 'reindex', signature: '() => Promise<void>', description: 'Rebuild search index' },
    ],
    examples: [],
    relatedPlugins: ['VectorPlugin'],
  },
  {
    name: 'S3QueuePlugin',
    category: 'integration',
    description: 'Distributed job queue using S3 as backend, with retries and DLQ. Task processing.',
    configOptions: [
      { name: 'namespace', type: 'string', required: true, description: 'Queue namespace' },
      { name: 'visibilityTimeout', type: 'number', required: false, default: '30000', description: 'Message visibility timeout (ms)' },
      { name: 'maxRetries', type: 'number', required: false, default: '3', description: 'Max retry attempts' },
    ],
    methods: [
      { name: 'enqueue', signature: '(message: any) => Promise<string>', description: 'Add message to queue' },
      { name: 'process', signature: '(handler: MessageHandler) => void', description: 'Start processing messages' },
    ],
    examples: ['e31-s3-queue.js'],
    relatedPlugins: ['ReplicatorPlugin'],
  },
  {
    name: 'EventualConsistencyPlugin',
    category: 'core',
    description: 'Eventually consistent reads for high-throughput scenarios. Transaction-based counters.',
    configOptions: [
      { name: 'syncInterval', type: 'number', required: false, default: '5000', description: 'Sync check interval (ms)' },
    ],
    methods: [
      { name: 'waitForConsistency', signature: '(id: string) => Promise<void>', description: 'Wait until record is consistent' },
    ],
    examples: ['e50-eventual-consistency-simple.js', 'e51-eventual-consistency-url-shortener.js'],
    relatedPlugins: ['CachePlugin'],
  },
  {
    name: 'WebsocketPlugin',
    category: 'integration',
    description: 'Real-time subscriptions, channels, presence. Live updates.',
    configOptions: [
      { name: 'port', type: 'number', required: false, default: '3001', description: 'WebSocket server port' },
      { name: 'path', type: 'string', required: false, default: '/ws', description: 'WebSocket endpoint path' },
    ],
    methods: [
      { name: 'broadcast', signature: '(channel: string, message: any) => void', description: 'Broadcast to channel' },
      { name: 'subscribe', signature: '(resourceName: string, handler: ChangeHandler) => void', description: 'Subscribe to resource changes' },
    ],
    examples: [],
    relatedPlugins: ['ApiPlugin'],
  },
  {
    name: 'GraphPlugin',
    category: 'data',
    description: 'Graph relationships, traversals, shortest path. Social networks, recommendations.',
    configOptions: [
      { name: 'nodeResource', type: 'string', required: true, description: 'Resource for graph nodes' },
      { name: 'edgeResource', type: 'string', required: true, description: 'Resource for graph edges' },
    ],
    methods: [
      { name: 'addEdge', signature: '(from: string, to: string, type: string) => Promise<void>', description: 'Create edge' },
      { name: 'traverse', signature: '(startId: string, depth: number) => Promise<Node[]>', description: 'Traverse graph' },
      { name: 'shortestPath', signature: '(fromId: string, toId: string) => Promise<Path>', description: 'Find shortest path' },
    ],
    examples: [],
    relatedPlugins: ['VectorPlugin'],
  },
  {
    name: 'StateMachinePlugin',
    category: 'specialized',
    description: 'FSM for workflow management with guards, actions, and auto-cleanup. Order status, approval flows.',
    configOptions: [
      { name: 'states', type: 'StateConfig[]', required: true, description: 'State definitions with transitions' },
      { name: 'resource', type: 'string', required: false, description: 'Resource to attach state machine to' },
      { name: 'stateField', type: 'string', required: false, description: 'Field that stores the state' },
      { name: 'autoCleanup', type: 'boolean', required: false, default: 'true', description: 'Auto-delete state/history when record is deleted' },
    ],
    methods: [
      { name: 'send', signature: '(id: string, event: string, data?: object) => Promise<TransitionResult>', description: 'Trigger state transition' },
      { name: 'getState', signature: '(id: string) => Promise<string>', description: 'Get current state' },
      { name: 'canTransition', signature: '(id: string, event: string) => Promise<boolean>', description: 'Check if transition is allowed' },
      { name: 'getValidEvents', signature: '(id: string) => Promise<string[]>', description: 'Get valid events for current state' },
      { name: 'deleteEntity', signature: '(id: string) => Promise<void>', description: 'Delete entity state and transition history' },
      { name: 'initializeEntity', signature: '(id: string, context?: object) => Promise<string>', description: 'Initialize entity with initial state' },
    ],
    examples: ['e51-state-machine-event-triggers.js', 'e52-state-machine-resource-api.js'],
    relatedPlugins: ['AuditPlugin'],
  },
  {
    name: 'MLPlugin',
    category: 'specialized',
    description: 'Machine learning: regression, classification, time-series forecasting. Predictions.',
    configOptions: [
      { name: 'modelType', type: "'regression' | 'classification' | 'timeseries'", required: true, description: 'ML model type' },
      { name: 'features', type: 'string[]', required: true, description: 'Feature field names' },
      { name: 'target', type: 'string', required: true, description: 'Target field name' },
    ],
    methods: [
      { name: 'train', signature: '() => Promise<ModelStats>', description: 'Train model on current data' },
      { name: 'predict', signature: '(input: any) => Promise<Prediction>', description: 'Make prediction' },
    ],
    examples: ['e66-ml-plugin-regression.js', 'e67-ml-plugin-classification.js', 'e68-ml-plugin-timeseries.js'],
    relatedPlugins: ['VectorPlugin'],
  },
  {
    name: 'PuppeteerPlugin',
    category: 'specialized',
    description: 'Browser automation, cookie farming, stealth mode. Web scraping.',
    configOptions: [
      { name: 'headless', type: 'boolean', required: false, default: 'true', description: 'Run in headless mode' },
      { name: 'stealth', type: 'boolean', required: false, default: 'true', description: 'Enable stealth plugins' },
    ],
    methods: [
      { name: 'launch', signature: '() => Promise<Browser>', description: 'Launch browser' },
      { name: 'screenshot', signature: '(url: string) => Promise<Buffer>', description: 'Capture screenshot' },
    ],
    examples: ['e91-puppeteer-basic.js', 'e92-puppeteer-cookie-farming.js'],
    relatedPlugins: ['SpiderPlugin'],
  },
  {
    name: 'SpiderPlugin',
    category: 'specialized',
    description: 'Web crawling, sitemap parsing, robots.txt, deep discovery. Crawlers.',
    configOptions: [
      { name: 'userAgent', type: 'string', required: false, description: 'Custom user agent' },
      { name: 'concurrency', type: 'number', required: false, default: '5', description: 'Concurrent requests' },
      { name: 'respectRobots', type: 'boolean', required: false, default: 'true', description: 'Respect robots.txt' },
    ],
    methods: [
      { name: 'crawl', signature: '(startUrl: string, options?: CrawlOptions) => Promise<CrawlResult[]>', description: 'Crawl website' },
      { name: 'parseSitemap', signature: '(url: string) => Promise<string[]>', description: 'Parse sitemap.xml' },
    ],
    examples: ['e104-spider-pattern-matching.js', 'e105-deep-discovery.js'],
    relatedPlugins: ['PuppeteerPlugin'],
  },
  {
    name: 'CostsPlugin',
    category: 'utility',
    description: 'Track S3 API costs by operation type. Budget monitoring.',
    configOptions: [
      { name: 'region', type: 'string', required: false, default: 'us-east-1', description: 'AWS region for pricing' },
    ],
    methods: [
      { name: 'getCosts', signature: '() => CostBreakdown', description: 'Get cost breakdown' },
      { name: 'reset', signature: '() => void', description: 'Reset cost counters' },
    ],
    examples: ['e18-plugin-costs.js'],
    relatedPlugins: ['MetricsPlugin'],
  },
  {
    name: 'SMTPPlugin',
    category: 'integration',
    description: 'SMTP server and relay, email templates, webhooks. Email handling.',
    configOptions: [
      { name: 'port', type: 'number', required: false, default: '25', description: 'SMTP port' },
      { name: 'secure', type: 'boolean', required: false, default: 'false', description: 'Enable TLS' },
    ],
    methods: [
      { name: 'send', signature: '(options: EmailOptions) => Promise<void>', description: 'Send email' },
      { name: 'onReceive', signature: '(handler: EmailHandler) => void', description: 'Handle incoming emails' },
    ],
    examples: ['e50-smtp-relay.js', 'e51-smtp-server.js', 'e52-smtp-templates.js'],
    relatedPlugins: [],
  },
  {
    name: 'CloudInventoryPlugin',
    category: 'specialized',
    description: 'Cloud resource inventory: AWS, GCP, Azure discovery. CMDB.',
    configOptions: [
      { name: 'providers', type: 'ProviderConfig[]', required: true, description: 'Cloud provider configurations' },
      { name: 'schedule', type: 'string', required: false, description: 'Sync schedule (cron)' },
    ],
    methods: [
      { name: 'sync', signature: '(provider?: string) => Promise<SyncResult>', description: 'Sync cloud resources' },
      { name: 'query', signature: '(filters: ResourceFilters) => Promise<CloudResource[]>', description: 'Query inventory' },
    ],
    examples: ['e70-cloud-inventory-terraform-export.js'],
    relatedPlugins: ['KubernetesInventoryPlugin'],
  },
  {
    name: 'KubernetesInventoryPlugin',
    category: 'specialized',
    description: 'Kubernetes resource tracking, multi-cluster support. K8s CMDB.',
    configOptions: [
      { name: 'contexts', type: 'string[]', required: false, description: 'K8s contexts to track' },
      { name: 'namespaces', type: 'string[]', required: false, description: 'Namespaces to track' },
    ],
    methods: [
      { name: 'sync', signature: '(context?: string) => Promise<SyncResult>', description: 'Sync K8s resources' },
      { name: 'getResources', signature: '(kind: string) => Promise<K8sResource[]>', description: 'Get resources by kind' },
    ],
    examples: ['e72-kubernetes-inventory-basic.js', 'e73-kubernetes-inventory-multi-cluster.js'],
    relatedPlugins: ['CloudInventoryPlugin'],
  },
  {
    name: 'IdentityPlugin',
    category: 'integration',
    description: 'User authentication, registration, password reset, MFA. Auth system.',
    configOptions: [
      { name: 'userResource', type: 'string', required: true, description: 'Resource for user storage' },
      { name: 'sessionTtl', type: 'number', required: false, default: '3600000', description: 'Session TTL (ms)' },
    ],
    methods: [
      { name: 'register', signature: '(email: string, password: string) => Promise<User>', description: 'Register user' },
      { name: 'authenticate', signature: '(email: string, password: string) => Promise<Session>', description: 'Authenticate user' },
    ],
    examples: ['e85-identity-whitelabel.js', 'e87-identity-no-registration.js'],
    relatedPlugins: ['ApiPlugin'],
  },
  {
    name: 'TreePlugin',
    category: 'data',
    description: 'Hierarchical data structures, materialized paths, nested sets. Categories, org charts.',
    configOptions: [
      { name: 'strategy', type: "'materialized-path' | 'nested-sets' | 'adjacency'", required: false, default: 'materialized-path', description: 'Tree storage strategy' },
    ],
    methods: [
      { name: 'getChildren', signature: '(id: string) => Promise<Node[]>', description: 'Get child nodes' },
      { name: 'getAncestors', signature: '(id: string) => Promise<Node[]>', description: 'Get ancestor nodes' },
      { name: 'move', signature: '(id: string, newParentId: string) => Promise<void>', description: 'Move node' },
    ],
    examples: [],
    relatedPlugins: ['GraphPlugin'],
  },
];

// =============================================================================
// Field Types Documentation
// =============================================================================

export const fieldTypes: FieldTypeDoc[] = [
  {
    name: 'string',
    syntax: "'string' | 'string|required' | 'string|min:5|max:100'",
    compression: 'None',
    description: 'Basic string field with optional validators',
    examples: ["name: 'string|required'", "bio: 'string|max:500'"],
    validators: ['required', 'min', 'max', 'pattern', 'enum', 'lowercase', 'uppercase'],
  },
  {
    name: 'number',
    syntax: "'number' | 'number|min:0|max:100'",
    compression: 'None',
    description: 'Numeric field (integer or float)',
    examples: ["age: 'number|min:0|max:150'", "price: 'number|positive'"],
    validators: ['required', 'min', 'max', 'positive', 'negative', 'integer'],
  },
  {
    name: 'boolean',
    syntax: "'boolean'",
    compression: 'None',
    description: 'Boolean true/false field',
    examples: ["active: 'boolean'", "verified: 'boolean|default:false'"],
    validators: ['required', 'default'],
  },
  {
    name: 'date',
    syntax: "'date'",
    compression: 'None',
    description: 'Date field (ISO 8601)',
    examples: ["createdAt: 'date'", "birthDate: 'date|convert:true'"],
    validators: ['required', 'convert', 'min', 'max'],
  },
  {
    name: 'email',
    syntax: "'email'",
    compression: 'None',
    description: 'Email address with validation',
    examples: ["email: 'email|required'"],
    validators: ['required', 'normalize', 'mode:precise'],
  },
  {
    name: 'url',
    syntax: "'url'",
    compression: 'None',
    description: 'URL with validation',
    examples: ["website: 'url'", "avatar: 'url|optional'"],
    validators: ['required', 'empty'],
  },
  {
    name: 'uuid',
    syntax: "'uuid'",
    compression: 'None',
    description: 'UUID v4 field',
    examples: ["externalId: 'uuid'"],
    validators: ['required', 'version'],
  },
  {
    name: 'secret',
    syntax: "'secret'",
    compression: 'AES-256-GCM encrypted',
    description: 'Encrypted field using database passphrase. Automatically encrypted at rest.',
    examples: ["password: 'secret'", "apiKey: 'secret'"],
    validators: ['required'],
  },
  {
    name: 'embedding',
    syntax: "'embedding:N' where N is dimensions",
    compression: '77% compression via float32 quantization',
    description: 'Vector embedding field for ML/AI. Highly compressed for efficient storage.',
    examples: ["vector: 'embedding:1536'", "embedding: 'embedding:384'"],
    validators: ['required'],
  },
  {
    name: 'ip4',
    syntax: "'ip4'",
    compression: '44% compression (12 chars to 8)',
    description: 'IPv4 address with compression',
    examples: ["clientIp: 'ip4'"],
    validators: ['required'],
  },
  {
    name: 'ip6',
    syntax: "'ip6'",
    compression: '47% compression',
    description: 'IPv6 address with compression',
    examples: ["serverIp: 'ip6'"],
    validators: ['required'],
  },
  {
    name: 'object',
    syntax: "{ field: 'type' } (auto-detected)",
    compression: 'None',
    description: 'Nested object - auto-detected by fastest-validator, no $$type needed',
    examples: ["profile: { bio: 'string', age: 'number' }"],
    validators: ['required', 'strict'],
  },
  {
    name: 'array',
    syntax: "'array' | { type: 'array', items: 'string' }",
    compression: 'None',
    description: 'Array field with optional item type',
    examples: ["tags: { type: 'array', items: 'string' }", "scores: { type: 'array', items: 'number' }"],
    validators: ['required', 'min', 'max', 'unique', 'contains'],
  },
  {
    name: 'enum',
    syntax: "{ type: 'enum', values: [...] }",
    compression: 'None',
    description: 'Enumeration field',
    examples: ["status: { type: 'enum', values: ['active', 'inactive', 'pending'] }"],
    validators: ['required'],
  },
  {
    name: 'any',
    syntax: "'any'",
    compression: 'None',
    description: 'Any type - no validation',
    examples: ["metadata: 'any'"],
    validators: [],
  },
];

// =============================================================================
// Behaviors Documentation
// =============================================================================

export const behaviors: BehaviorDoc[] = [
  {
    name: 'body-overflow',
    safety: 'High',
    performance: 'Fast',
    dataIntegrity: 'Guaranteed',
    useCase: 'Recommended Default',
    description: 'Attempts metadata first, seamlessly overflows to body if >2KB. Best of both worlds - fast reads for small data, reliable storage for large data.',
    example: "behavior: 'body-overflow'",
  },
  {
    name: 'body-only',
    safety: 'High',
    performance: 'Slower',
    dataIntegrity: 'Guaranteed',
    useCase: 'Large documents, BLOBs, JSON dumps',
    description: 'Stores everything in S3 body. No size limits (up to 5TB). list() requires full GET for each object.',
    example: "behavior: 'body-only'",
  },
  {
    name: 'enforce-limits',
    safety: 'High',
    performance: 'Fastest',
    dataIntegrity: 'Guaranteed',
    useCase: 'Strict schema, IDs, tags, small records',
    description: 'Throws error if data exceeds 2KB. Guarantees all data in metadata for fastest HEAD reads.',
    example: "behavior: 'enforce-limits'",
  },
  {
    name: 'truncate-data',
    safety: 'Medium',
    performance: 'Fastest',
    dataIntegrity: 'Partial',
    useCase: 'Logs, descriptions, search previews',
    description: 'Truncates data that exceeds 2KB. Adds _truncated: true flag. WARNING: DATA LOSS.',
    example: "behavior: 'truncate-data'",
  },
  {
    name: 'user-managed',
    safety: 'Low',
    performance: 'Fastest',
    dataIntegrity: 'Possible Loss',
    useCase: 'Development, testing, custom handling',
    description: 'No checking. You handle the 2KB limit via hooks or external logic.',
    example: "behavior: 'user-managed'",
  },
];

// =============================================================================
// Clients Documentation
// =============================================================================

export const clients: ClientDoc[] = [
  {
    name: 'S3Client',
    description: 'Production client for AWS S3 and S3-compatible storage (MinIO, R2, DigitalOcean Spaces)',
    connectionString: 's3://ACCESS_KEY:SECRET_KEY@bucket?region=us-east-1',
    useCase: 'Production with AWS S3, MinIO, R2, DigitalOcean Spaces',
    performance: 'Standard - network latency applies',
    dependencies: ['@aws-sdk/client-s3'],
  },
  {
    name: 'MemoryClient',
    description: 'In-memory storage for blazing-fast tests. Data lost on process exit.',
    connectionString: 'memory://bucket/prefix',
    useCase: 'Unit tests, single-file tests (WARNING: risky for parallel tests)',
    performance: '100-1000x faster than S3',
    dependencies: [],
  },
  {
    name: 'FilesystemClient',
    description: 'Local filesystem storage. Data persisted to disk.',
    connectionString: 'file:///path/to/data',
    useCase: 'Local development, edge deployments, parallel test isolation',
    performance: 'Fast, safe for parallel tests',
    dependencies: [],
  },
];

// =============================================================================
// Guides Documentation
// =============================================================================

export const guides: GuideDoc[] = [
  {
    topic: 'getting-started',
    title: 'Getting Started with s3db.js',
    description: 'Quick start guide covering installation, connection, and basic CRUD operations',
    sections: ['Installation', 'Connection', 'Creating Resources', 'CRUD Operations', 'Next Steps'],
  },
  {
    topic: 'schema-registry',
    title: 'Schema Registry & Attribute Mapping',
    description: 'Stable attribute mapping stored in s3db.json to prevent data corruption when schemas change',
    sections: ['Stable Mapping', 'Burned Indices', 'Plugin Registry Keys', 'Legacy Map Migration'],
  },
  {
    topic: 'performance-tuning',
    title: 'Performance Tuning Guide',
    description: 'Optimize s3db.js for your workload with partitions, caching, and batch operations',
    sections: ['Partitioning Strategy', 'Caching', 'Batch Operations', 'Connection Pooling', 'Compression'],
  },
  {
    topic: 'typescript',
    title: 'TypeScript Integration',
    description: 'Full TypeScript support and type generation for s3db.js resources',
    sections: ['Setup', 'Type Generation', 'Generic Resources', 'Type-safe Queries'],
  },
  {
    topic: 'testing',
    title: 'Testing Strategies',
    description: 'Best practices for testing s3db.js applications',
    sections: ['MemoryClient', 'FilesystemClient', 'Mocking', 'Fixtures', 'Parallel Tests'],
  },
  {
    topic: 'multi-tenancy',
    title: 'Multi-Tenancy Patterns',
    description: 'Strategies for multi-tenant applications with s3db.js',
    sections: ['Database per Tenant', 'Prefix per Tenant', 'Partitions', 'Security'],
  },
  {
    topic: 'security',
    title: 'Security Best Practices',
    description: 'Security considerations for s3db.js applications',
    sections: ['Encryption', 'Access Control', 'Secrets Management', 'Audit Logging'],
  },
];

// =============================================================================
// Example Categories
// =============================================================================

export const exampleCategories: Record<string, string[]> = {
  crud: ['e01-bulk-insert.js', 'e16-full-crud.js', 'e15-pagination.js'],
  bulk: ['e01-bulk-insert.js', 'e27-queue-consumer.js'],
  partitioning: ['e09-partitioning.js', 'e10-partition-validation.js', 'e11-utm-partitioning.js'],
  caching: ['e32-improved-caching.js', 'e37-cache-plugin-drivers.js', 'e56-memory-cache-limits.js'],
  'vector-rag': ['e41-vector-rag-chatbot.js', 'e42-vector-integrations.js', 'e43-vector-benchmarks.js'],
  auth: ['e47-api-plugin-basic.js', 'e49-api-plugin-complete.js', 'e78-api-driver-auth-jwt.js'],
  streaming: ['e02-read-stream.js', 'e05-write-stream.js'],
  hooks: ['e13-versioning-hooks.js', 'e14-timestamp-hooks.js', 'e35-persist-hooks.js'],
  replication: ['e23-replicators.js', 'e24-bigquery-replicator.js', 'e26-postgres-replicator.js'],
  testing: ['e38-testing-isolated-plugin.js', 'e39-testing-partial-schema.js', 'e40-testing-mock-database.js'],
};

// =============================================================================
// Category Mappings
// =============================================================================

export const categories = {
  plugins: plugins.map(p => p.name),
  fieldTypes: fieldTypes.map(f => f.name),
  behaviors: behaviors.map(b => b.name),
  clients: clients.map(c => c.name),
  guides: guides.map(g => g.topic),
  examples: Object.keys(exampleCategories),
};

// =============================================================================
// Lookup Functions
// =============================================================================

export function getPluginByName(name: string): PluginDoc | undefined {
  const normalized = name.toLowerCase().replace('plugin', '');
  return plugins.find(p => p.name.toLowerCase().replace('plugin', '') === normalized);
}

export function getFieldTypeByName(name: string): FieldTypeDoc | undefined {
  return fieldTypes.find(f => f.name.toLowerCase() === name.toLowerCase());
}

export function getBehaviorByName(name: string): BehaviorDoc | undefined {
  return behaviors.find(b => b.name.toLowerCase() === name.toLowerCase());
}

export function getClientByName(name: string): ClientDoc | undefined {
  const normalized = name.toLowerCase().replace('client', '');
  return clients.find(c => c.name.toLowerCase().replace('client', '') === normalized);
}

export function getGuideByTopic(topic: string): GuideDoc | undefined {
  return guides.find(g => g.topic.toLowerCase() === topic.toLowerCase());
}

export function getExamplesByCategory(category: string): string[] {
  return exampleCategories[category as keyof typeof exampleCategories] || [];
}

export default {
  plugins,
  fieldTypes,
  behaviors,
  clients,
  guides,
  exampleCategories,
  categories,
  getPluginByName,
  getFieldTypeByName,
  getBehaviorByName,
  getClientByName,
  getGuideByTopic,
  getExamplesByCategory,
};
