// Placeholder for MCP tool argument types
export interface DbConnectArgs {
  connectionString: string;
  verbose?: boolean;
  parallelism?: number;
  passphrase?: string;
  versioningEnabled?: boolean;
  enableCache?: boolean;
  enableCosts?: boolean;
  cacheDriver?: 'memory' | 'filesystem';
  cacheMaxSize?: number;
  cacheTtl?: number;
  cacheDirectory?: string;
  cachePrefix?: string;
}

export interface DbCreateResourceArgs {
  name: string;
  attributes: Record<string, any>;
  behavior?: 'user-managed' | 'body-only' | 'body-overflow' | 'enforce-limits' | 'truncate-data';
  timestamps?: boolean;
  partitions?: Record<string, any>;
  paranoid?: boolean;
}

export interface ResourceInsertArgs {
  resourceName: string;
  data: Record<string, any>;
}

export interface ResourceGetArgs {
  resourceName: string;
  id: string;
  partition?: string;
  partitionValues?: Record<string, any>;
}

export interface ResourceListArgs {
  resourceName: string;
  limit?: number;
  offset?: number;
  partition?: string;
  partitionValues?: Record<string, any>;
}

export interface ResourceCountArgs {
  resourceName: string;
  partition?: string;
  partitionValues?: Record<string, any>;
}

export interface ResourceUpdateArgs {
  resourceName: string;
  id: string;
  data: Record<string, any>;
}

export interface ResourceUpsertArgs {
  resourceName: string;
  data: Record<string, any>;
}

export interface ResourceDeleteArgs {
  resourceName: string;
  id: string;
}

export interface ResourceUpdateManyArgs {
  resourceName: string;
  filters: Record<string, any>;
  updates: Record<string, any>;
  limit?: number;
}

export interface ResourceBulkUpsertArgs {
  resourceName: string;
  data: Record<string, any>[];
}

export interface ResourceExportArgs {
  resourceName: string;
  format?: 'json' | 'ndjson' | 'csv';
  filters?: Record<string, any>;
  fields?: string[];
  limit?: number;
}

export interface ResourceImportArgs {
  resourceName: string;
  data: Record<string, any>[];
  mode?: 'insert' | 'upsert' | 'replace';
  batchSize?: number;
}

export interface ResourceGetStatsArgs {
  resourceName: string;
  includePartitionStats?: boolean;
}

export interface CacheGetStatsArgs {
  resourceName?: string;
}

export interface DbBackupMetadataArgs {
  timestamp?: boolean;
}

export interface DbHealthCheckArgs {
  includeOrphanedPartitions?: boolean;
}

export interface DbInspectResourceArgs {
  resourceName: string;
}

export interface DbGetRawArgs {
  resourceName: string;
  id: string;
}

export interface S3dbSearchDocsArgs {
  query: string;
  limit?: number;
  maxResults?: number; // Legacy
}

export interface S3dbListTopicsArgs {} // For list topics

export interface TransportArgs {
  transport: string;
  host: string;
  port: number;
}

// =============================================================================
// MCP Resources Types
// =============================================================================

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
}

// =============================================================================
// MCP Prompts Types
// =============================================================================

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  };
}

export interface MCPPromptResult {
  description?: string;
  messages: MCPPromptMessage[];
}

// =============================================================================
// MCP Completions Types
// =============================================================================

export interface MCPCompletionRef {
  type: 'ref/prompt' | 'ref/resource';
  name?: string;
  uri?: string;
}

export interface MCPCompletionArgument {
  name: string;
  value: string;
}

export interface MCPCompletionRequest {
  ref: MCPCompletionRef;
  argument: MCPCompletionArgument;
}

export interface MCPCompletionResult {
  values: string[];
  total?: number;
  hasMore?: boolean;
}

// =============================================================================
// Documentation Types
// =============================================================================

export interface ConfigOption {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description: string;
}

export interface MethodDoc {
  name: string;
  signature: string;
  description: string;
}

export interface PluginDoc {
  name: string;
  category: 'core' | 'data' | 'storage' | 'integration' | 'utility' | 'specialized';
  description: string;
  configOptions: ConfigOption[];
  methods: MethodDoc[];
  examples: string[];
  relatedPlugins?: string[];
}

export interface FieldTypeDoc {
  name: string;
  syntax: string;
  compression: string;
  description: string;
  examples: string[];
  validators: string[];
}

export interface BehaviorDoc {
  name: string;
  safety: string;
  performance: string;
  dataIntegrity: string;
  useCase: string;
  description: string;
  example: string;
}

export interface GuideDoc {
  topic: string;
  title: string;
  description: string;
  sections: string[];
}

export interface ExampleDoc {
  id: string;
  category: string;
  title: string;
  description: string;
  filePath: string;
}

export interface ClientDoc {
  name: string;
  description: string;
  connectionString: string;
  useCase: string;
  performance: string;
  dependencies: string[];
}

