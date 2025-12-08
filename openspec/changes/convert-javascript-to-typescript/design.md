# Technical Design: JavaScript to TypeScript Migration

## Overview

This document details the technical architecture and decisions for migrating s3db.js from JavaScript to TypeScript. It covers type patterns, migration strategies, and specific solutions for complex scenarios.

## Current Architecture Analysis

### File Structure (Pre-Migration)

```
src/
├── index.js                    # Main exports
├── database.class.js           # Database class (2,182 lines)
├── resource.class.js           # Resource class (1,916 lines)
├── schema.class.js             # Schema class (1,630 lines)
├── connection-string.class.js  # Connection parsing
├── errors.js                   # Custom error classes
├── s3db.d.ts                   # Manual type definitions (1,704 lines)
├── core/                       # 12 resource modules
├── behaviors/                  # 5 behavior implementations
├── clients/                    # S3, Memory, FileSystem clients
├── concerns/                   # 37 utility modules
├── plugins/                    # 347 plugin files across 22 subdirs
│   ├── index.js                # Lazy plugin loaders
│   ├── plugin.class.js         # Base plugin class
│   ├── api/                    # 82 files - REST API
│   ├── identity/               # 38 files - Auth/OAuth2
│   ├── recon/                  # 33 files - Reconnaissance
│   ├── cloud-inventory/        # 15 files - Multi-cloud
│   ├── replicators/            # Database sync targets
│   ├── consumers/              # Queue consumers
│   └── ...                     # 16 more plugin directories
├── stream/                     # Streaming utilities
├── tasks/                      # Task runner
├── cli/                        # CLI command handlers
└── mcp/                        # MCP server integration
```

### Build Pipeline (Current)

```
src/*.js ──► Rollup + esbuild ──► dist/s3db.es.js (ESM)
                              ──► dist/s3db.cjs (CommonJS)

src/s3db.d.ts ──► copy ──► dist/s3db.d.ts
```

### Critical Patterns to Preserve

#### 1. Lazy Loading (MANDATORY)

The entire plugin system depends on dynamic imports for optional dependencies:

```javascript
// Current pattern - MUST be preserved
const PLUGIN_LOADERS = {
  api: () => import('./api.plugin.js').then(m => m.ApiPlugin),
  cache: () => import('./cache.plugin.js').then(m => m.CachePlugin),
  identity: () => import('./identity/index.js').then(m => m.IdentityPlugin),
};

export async function lazyLoadPlugin(name) {
  const loader = PLUGIN_LOADERS[name];
  return await loader();
}
```

**Why critical:**
- Plugins have optional peer dependencies (pg, ioredis, puppeteer, etc.)
- Without lazy loading, users would need to install ALL dependencies
- Startup time: ~50ms vs ~500ms+ if all plugins loaded eagerly

#### 2. EventEmitter Pattern

Throughout the codebase, SafeEventEmitter provides error isolation:

```javascript
class Database extends SafeEventEmitter {
  emit(event, ...args) {
    // Catches handler errors to prevent crashes
  }
  on(event, handler) { /* ... */ }
}
```

#### 3. Schema Validation (fastest-validator)

Dynamic schema generation from attributes string syntax:

```javascript
attributes: {
  email: 'string|required|email',
  age: 'number|min:0|max:150',
  profile: {
    bio: 'string',
    avatar: 'string|optional'
  }
}
```

#### 4. Facade Pattern (Resource Class)

Resource delegates to specialized modules:

```javascript
class Resource {
  constructor() {
    this._persistence = new ResourcePersistence(this);
    this._query = new ResourceQuery(this);
    this._partitions = new ResourcePartitions(this);
    // ... 9 more modules
  }
}
```

## Target Architecture

### File Structure (Post-Migration)

```
src/
├── index.ts                    # Main exports with types
├── types/                      # Centralized type definitions
│   ├── index.ts                # Re-exports all types
│   ├── common.types.ts         # Shared utilities (DeepPartial, etc.)
│   ├── database.types.ts       # Database interfaces
│   ├── resource.types.ts       # Resource interfaces
│   ├── schema.types.ts         # Schema/attribute types
│   ├── plugin.types.ts         # Plugin interfaces
│   ├── config.types.ts         # Configuration types
│   ├── events.types.ts         # Event payload types
│   ├── client.types.ts         # S3 client interfaces
│   ├── api.types.ts            # API plugin types
│   └── identity.types.ts       # Identity plugin types
├── database.class.ts           # Database class
├── resource.class.ts           # Resource class
├── schema.class.ts             # Schema class
├── connection-string.class.ts  # Connection parsing
├── errors.ts                   # Typed error classes
├── core/                       # Typed core modules
├── behaviors/                  # Typed behaviors
├── clients/                    # Typed clients
├── concerns/                   # Typed utilities
├── plugins/                    # Typed plugins
├── stream/                     # Typed streams
├── tasks/                      # Typed task runner
├── cli/                        # CLI (may remain JS)
└── mcp/                        # Typed MCP server
```

### Build Pipeline (Target)

```
src/*.ts ──► tsc ──► dist/esm/*.js + dist/esm/*.d.ts (ESM)
                 ──► Rollup ──► dist/s3db.es.js (bundled ESM)
                            ──► dist/s3db.cjs (bundled CJS)
                            ──► dist/s3db.d.ts (rolled-up types)
```

## TypeScript Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    // Module System
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022"],

    // Output
    "outDir": "./dist/esm",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "rootDir": "./src",

    // Strict Mode (all enabled)
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,

    // Additional Checks
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": false,

    // Interop
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,

    // Skip type checking of node_modules
    "skipLibCheck": true,

    // Paths (preserve existing structure)
    "baseUrl": ".",
    "paths": {
      "#src/*": ["./src/*"],
      "#tests/*": ["./tests/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests", "docs"]
}
```

### tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationDir": "./dist/types",
    "emitDeclarationOnly": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}
```

## Type Architecture

### Core Type Definitions

#### 1. Common Types (`src/types/common.types.ts`)

```typescript
/** Deep partial utility */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Make specific keys optional */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Make specific keys required */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/** Extract string keys */
export type StringKeys<T> = Extract<keyof T, string>;

/** Async or sync function */
export type MaybeAsync<T> = T | Promise<T>;

/** Constructor type */
export type Constructor<T = object> = new (...args: any[]) => T;

/** JSON-serializable value */
export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

/** Log levels */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
```

#### 2. Database Types (`src/types/database.types.ts`)

```typescript
import type { S3Client as AwsS3Client } from '@aws-sdk/client-s3';
import type { Client as MemoryClient } from '../clients/memory-client.class.js';
import type { Client as FileSystemClient } from '../clients/filesystem-client.class.js';

export type S3ClientType = AwsS3Client | MemoryClient | FileSystemClient;

export interface ExecutorPoolConfig {
  /** Maximum concurrent operations (default: 100, or 'auto' for adaptive) */
  concurrency?: number | 'auto';
  /** Maximum retry attempts (default: 3) */
  retries?: number;
  /** Base retry delay in ms (default: 1000) */
  retryDelay?: number;
  /** Operation timeout in ms (default: 30000) */
  timeout?: number;
  /** Error types that trigger retry */
  retryableErrors?: string[];
  /** Adaptive tuning configuration */
  autotune?: AutotuneConfig;
  /** Monitoring configuration */
  monitoring?: MonitoringConfig;
}

export interface AutotuneConfig {
  enabled?: boolean;
  targetLatency?: number;
  minConcurrency?: number;
  maxConcurrency?: number;
  targetMemoryPercent?: number;
  adjustmentInterval?: number;
}

export interface MonitoringConfig {
  enabled?: boolean;
  collectMetrics?: boolean;
  sampleRate?: number;
}

export interface HttpClientOptions {
  keepAlive?: boolean;
  keepAliveMsecs?: number;
  maxSockets?: number;
  maxFreeSockets?: number;
  timeout?: number;
}

export interface DatabaseConfig {
  // Connection
  connectionString?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;

  // Credentials (prefer connectionString)
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;

  // Options
  forcePathStyle?: boolean;
  keyPrefix?: string;
  verbose?: boolean;

  // Performance
  parallelism?: number | string;
  executorPool?: ExecutorPoolConfig;
  /** @deprecated Use executorPool */
  operationsPool?: ExecutorPoolConfig;

  // Features
  passphrase?: string;
  versioningEnabled?: boolean;
  persistHooks?: boolean;
  cache?: CacheConfig | boolean;
  logLevel?: LogLevel;
  loggerOptions?: LoggerOptions;

  // Plugins
  plugins?: PluginDefinition[];

  // Advanced
  client?: S3ClientType;
  httpClientOptions?: HttpClientOptions;
}

export interface DatabaseEventMap {
  'connected': Date;
  'disconnected': Date;
  'metadataUploaded': SavedMetadata;
  'resourceDefinitionsChanged': {
    changes: DefinitionChangeEvent[];
    metadata: SavedMetadata;
  };
  's3db.resourceCreated': string;
  's3db.resourceUpdated': string;
  'error': Error;
}
```

#### 3. Resource Types (`src/types/resource.types.ts`)

```typescript
export type BehaviorName = 'body-overflow' | 'body-only' | 'truncate-data' | 'enforce-limits' | 'user-managed';

export type IdGenerator =
  | 'uuid'
  | 'nanoid'
  | 'ulid'
  | 'incremental'
  | `incremental:${number}`
  | `incremental:${string}`
  | ((data: Record<string, unknown>) => string)
  | ((data: Record<string, unknown>) => Promise<string>);

export interface PartitionConfig {
  field: string;
  transform?: (value: unknown) => string;
  required?: boolean;
}

export interface HookConfig {
  beforeInsert?: HookFunction[];
  afterInsert?: HookFunction[];
  beforeUpdate?: HookFunction[];
  afterUpdate?: HookFunction[];
  beforeDelete?: HookFunction[];
  afterDelete?: HookFunction[];
  beforeGet?: HookFunction[];
  afterGet?: HookFunction[];
}

export type HookFunction = (context: HookContext) => MaybeAsync<void | boolean | HookResult>;

export interface HookContext {
  operation: string;
  id?: string;
  data?: Record<string, unknown>;
  previousData?: Record<string, unknown>;
  resource: Resource;
  abort: (reason?: string) => never;
}

export interface ResourceConfig<T extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  client: S3ClientType;
  database?: Database;
  version?: string;

  // Schema
  attributes: SchemaAttributes;
  behavior?: BehaviorName;

  // Options
  timestamps?: boolean;
  paranoid?: boolean;
  autoDecrypt?: boolean;
  allNestedObjectsOptional?: boolean;

  // Performance
  parallelism?: number;
  asyncPartitions?: boolean;

  // Features
  passphrase?: string;
  versioningEnabled?: boolean;
  idGenerator?: IdGenerator;
  idSize?: number;

  // Partitions
  partitions?: Record<string, PartitionConfig>;

  // Hooks & Events
  hooks?: HookConfig;
  events?: EventListenerConfig;

  // API Configuration
  api?: ApiResourceConfig;

  // Caching
  cache?: boolean | CacheConfig;
  observers?: Observer[];

  // Version mapping
  map?: VersionMapping;
}

export interface ResourceEventMap {
  'inserted': { id: string; data: unknown };
  'updated': { id: string; data: unknown; previous: unknown };
  'deleted': { id: string };
  'exceedsLimit': ExceedsLimitEvent;
  'truncate': TruncateEvent;
  'overflow': OverflowEvent;
  'error': Error;
}
```

#### 4. Plugin Types (`src/types/plugin.types.ts`)

```typescript
export interface PluginInterface {
  readonly name: string;

  // Lifecycle
  setup?(database: Database): MaybeAsync<void>;
  start?(): MaybeAsync<void>;
  stop?(): MaybeAsync<void>;

  // Lifecycle hooks
  beforeSetup?(): MaybeAsync<void>;
  afterSetup?(): MaybeAsync<void>;
  beforeStart?(): MaybeAsync<void>;
  afterStart?(): MaybeAsync<void>;
  beforeStop?(): MaybeAsync<void>;
  afterStop?(): MaybeAsync<void>;
}

export interface PluginConfig {
  enabled?: boolean;
  logLevel?: LogLevel;
}

export type PluginFactory = (database: Database) => MaybeAsync<PluginInterface>;

export type PluginDefinition =
  | PluginInterface
  | PluginFactory
  | [string, PluginConfig]  // [pluginName, config]
  | string;                  // pluginName

// Plugin-specific configs
export interface CachePluginConfig extends PluginConfig {
  driver?: 'memory' | 'redis' | 's3' | 'filesystem';
  ttl?: number;
  maxSize?: number;
  redis?: RedisOptions;
}

export interface AuditPluginConfig extends PluginConfig {
  resource?: string;
  includeData?: boolean;
  includePrevious?: boolean;
  retention?: number;
}

export interface TtlPluginConfig extends PluginConfig {
  defaultTtl?: number;
  checkInterval?: number;
  batchSize?: number;
}

// Plugin registry for type-safe lazy loading
export interface PluginRegistry {
  api: typeof ApiPlugin;
  cache: typeof CachePlugin;
  audit: typeof AuditPlugin;
  ttl: typeof TtlPlugin;
  metrics: typeof MetricsPlugin;
  scheduler: typeof SchedulerPlugin;
  replicator: typeof ReplicatorPlugin;
  stateMachine: typeof StateMachinePlugin;
  fulltext: typeof FulltextPlugin;
  geo: typeof GeoPlugin;
  vector: typeof VectorPlugin;
  graph: typeof GraphPlugin;
  identity: typeof IdentityPlugin;
  puppeteer: typeof PuppeteerPlugin;
  // ... more plugins
}

export type PluginName = keyof PluginRegistry;
```

### Generic Resource Types

```typescript
/**
 * Typed resource for compile-time safety
 */
export interface TypedResource<T extends Record<string, unknown>> {
  insert(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T & { id: string }>;
  insertMany(data: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Array<T & { id: string }>>;

  get(id: string): Promise<T | null>;
  getMany(ids: string[]): Promise<Array<T | null>>;

  update(id: string, data: Partial<T>): Promise<T>;
  patch(id: string, data: Partial<T>): Promise<T>;
  replace(id: string, data: T): Promise<T>;

  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;

  list(options?: ListOptions): Promise<T[]>;
  query(filter: Partial<T>, options?: QueryOptions): Promise<T[]>;
  page(options: PageOptions): Promise<PageResult<T>>;

  count(filter?: Partial<T>): Promise<number>;
  exists(id: string): Promise<boolean>;
}

// Usage example:
interface User {
  id: string;
  email: string;
  name: string;
  age?: number;
  profile: {
    bio?: string;
    avatar?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const users = await db.createResource<User>({
  name: 'users',
  attributes: {
    email: 'string|required|email',
    name: 'string|required',
    age: 'number|optional',
    profile: {
      bio: 'string|optional',
      avatar: 'string|optional'
    }
  },
  timestamps: true
});

// Type-safe operations
const user = await users.insert({
  email: 'alice@example.com',
  name: 'Alice',
  profile: {}
});
// Result type: User & { id: string }

const found = await users.get(user.id);
// Result type: User | null

const updated = await users.update(user.id, { age: 30 });
// Result type: User
```

### Lazy Loading in TypeScript

#### Dynamic Import Pattern

```typescript
// src/plugins/index.ts

type PluginConstructor<T extends PluginInterface = PluginInterface> =
  new (config?: any) => T;

type PluginLoader<T extends PluginInterface = PluginInterface> =
  () => Promise<PluginConstructor<T>>;

const PLUGIN_LOADERS: Record<string, PluginLoader> = {
  // Core plugins
  api: () => import('./api.plugin.js').then(m => m.ApiPlugin),
  cache: () => import('./cache.plugin.js').then(m => m.CachePlugin),
  audit: () => import('./audit.plugin.js').then(m => m.AuditPlugin),
  ttl: () => import('./ttl.plugin.js').then(m => m.TtlPlugin),
  metrics: () => import('./metrics.plugin.js').then(m => m.MetricsPlugin),

  // Data plugins
  replicator: () => import('./replicator.plugin.js').then(m => m.ReplicatorPlugin),
  stateMachine: () => import('./state-machine.plugin.js').then(m => m.StateMachinePlugin),
  scheduler: () => import('./scheduler.plugin.js').then(m => m.SchedulerPlugin),

  // Complex plugins (with subdirectories)
  identity: () => import('./identity/index.js').then(m => m.IdentityPlugin),
  cloudInventory: () => import('./cloud-inventory.plugin.js').then(m => m.CloudInventoryPlugin),
  recon: () => import('./recon.plugin.js').then(m => m.ReconPlugin),
  spider: () => import('./spider.plugin.js').then(m => m.SpiderPlugin),
};

/**
 * Load a plugin by name with type safety
 */
export async function lazyLoadPlugin<K extends PluginName>(
  name: K
): Promise<PluginRegistry[K]> {
  const loader = PLUGIN_LOADERS[name];
  if (!loader) {
    throw new Error(`Unknown plugin: ${name}`);
  }
  return (await loader()) as PluginRegistry[K];
}

/**
 * Check if a plugin is available without loading it
 */
export function hasPlugin(name: string): name is PluginName {
  return name in PLUGIN_LOADERS;
}
```

#### Replicator Pattern (Conditional Dependencies)

```typescript
// src/plugins/replicators/index.ts

export type ReplicatorType = 's3db' | 'postgres' | 'bigquery' | 'sqs' | 'webhook';

type ReplicatorLoader = () => Promise<typeof BaseReplicator>;

const REPLICATOR_LOADERS: Record<ReplicatorType, ReplicatorLoader> = {
  s3db: () => import('./s3db-replicator.class.js').then(m => m.S3DBReplicator),
  postgres: () => import('./postgres-replicator.class.js').then(m => m.PostgresReplicator),
  bigquery: () => import('./bigquery-replicator.class.js').then(m => m.BigQueryReplicator),
  sqs: () => import('./sqs-replicator.class.js').then(m => m.SQSReplicator),
  webhook: () => import('./webhook-replicator.class.js').then(m => m.WebhookReplicator),
};

export async function createReplicator(
  type: ReplicatorType,
  config: ReplicatorConfig
): Promise<BaseReplicator> {
  const loader = REPLICATOR_LOADERS[type];
  if (!loader) {
    throw new Error(`Unknown replicator: ${type}`);
  }

  const ReplicatorClass = await loader();
  return new ReplicatorClass(config);
}
```

### Error Handling Types

```typescript
// src/errors.ts

export interface ErrorContext {
  bucket?: string;
  key?: string;
  resourceName?: string;
  id?: string;
  operation?: string;
  code?: string;
  statusCode?: number;
  requestId?: string;
  original?: Error;
  suggestion?: string;
  retriable?: boolean;
  metadata?: Record<string, unknown>;
}

export class BaseError extends Error {
  readonly thrownAt: Date;
  readonly code?: string;
  readonly statusCode: number;
  readonly retriable: boolean;
  readonly bucket?: string;
  readonly key?: string;
  readonly original?: Error;
  readonly suggestion?: string;

  constructor(message: string, context: ErrorContext = {}) {
    super(message);
    this.name = this.constructor.name;
    this.thrownAt = new Date();
    this.statusCode = context.statusCode ?? 500;
    this.retriable = context.retriable ?? false;
    this.code = context.code;
    this.bucket = context.bucket;
    this.key = context.key;
    this.original = context.original;
    this.suggestion = context.suggestion;

    // Maintain prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      bucket: this.bucket,
      key: this.key,
      retriable: this.retriable,
      suggestion: this.suggestion,
      thrownAt: this.thrownAt.toISOString(),
      stack: this.stack,
    };
  }
}

// Specific error classes
export class ResourceNotFound extends BaseError {
  readonly resourceName: string;
  readonly id: string;

  constructor(config: { resourceName: string; id: string; bucket?: string }) {
    super(`Resource ${config.resourceName} with id ${config.id} not found`, {
      statusCode: 404,
      retriable: false,
      ...config,
    });
    this.resourceName = config.resourceName;
    this.id = config.id;
  }
}

export class ValidationError extends BaseError {
  readonly errors: ValidationErrorItem[];

  constructor(message: string, errors: ValidationErrorItem[]) {
    super(message, { statusCode: 400, retriable: false });
    this.errors = errors;
  }
}

export class ConfigurationError extends BaseError {
  constructor(message: string) {
    super(message, { statusCode: 500, retriable: false });
  }
}

export class S3Error extends BaseError {
  constructor(message: string, context: ErrorContext) {
    super(message, context);
  }
}
```

### Event Types

```typescript
// src/types/events.types.ts

import type { EventEmitter } from 'events';

/**
 * Type-safe event emitter interface
 */
export interface TypedEventEmitter<TEvents extends Record<string, unknown>> {
  on<K extends keyof TEvents>(event: K, handler: (payload: TEvents[K]) => void): this;
  off<K extends keyof TEvents>(event: K, handler: (payload: TEvents[K]) => void): this;
  once<K extends keyof TEvents>(event: K, handler: (payload: TEvents[K]) => void): this;
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): boolean;

  addListener<K extends keyof TEvents>(event: K, handler: (payload: TEvents[K]) => void): this;
  removeListener<K extends keyof TEvents>(event: K, handler: (payload: TEvents[K]) => void): this;
  removeAllListeners<K extends keyof TEvents>(event?: K): this;
  listeners<K extends keyof TEvents>(event: K): Array<(payload: TEvents[K]) => void>;
  listenerCount<K extends keyof TEvents>(event: K): number;
}

/**
 * Create a typed event emitter from EventEmitter
 */
export function createTypedEmitter<TEvents extends Record<string, unknown>>(
  emitter: EventEmitter
): TypedEventEmitter<TEvents> {
  return emitter as unknown as TypedEventEmitter<TEvents>;
}

// Event payloads
export interface InsertedEvent<T = unknown> {
  id: string;
  data: T;
  timestamp: Date;
}

export interface UpdatedEvent<T = unknown> {
  id: string;
  data: T;
  previous: T;
  changes: Partial<T>;
  timestamp: Date;
}

export interface DeletedEvent {
  id: string;
  timestamp: Date;
}

export interface ExceedsLimitEvent {
  actualSize: number;
  limit: number;
  data: unknown;
  strategy: BehaviorName;
}
```

## Complex Pattern Solutions

### 1. Schema Attribute Typing

The schema system uses string-based attribute definitions:

```typescript
// src/types/schema.types.ts

/** Field type strings */
export type FieldTypeString =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'email'
  | 'url'
  | 'uuid'
  | 'object'
  | 'array'
  | 'any'
  | 'secret'
  | `embedding:${number}`
  | 'ip4'
  | 'ip6'
  | 'money'
  | 'binary'
  | 'json';

/** Field modifier strings */
export type FieldModifier =
  | 'required'
  | 'optional'
  | `min:${number}`
  | `max:${number}`
  | `length:${number}`
  | `pattern:${string}`
  | 'lowercase'
  | 'uppercase'
  | 'trim';

/** Full field definition string */
export type FieldDefinition = FieldTypeString | `${FieldTypeString}|${string}`;

/** Nested object attribute */
export interface NestedAttributes {
  [key: string]: FieldDefinition | NestedAttributes;
}

/** Top-level attributes definition */
export type SchemaAttributes = Record<string, FieldDefinition | NestedAttributes>;

/** Parsed field info */
export interface ParsedField {
  type: FieldTypeString;
  required: boolean;
  modifiers: Record<string, unknown>;
  nested?: Record<string, ParsedField>;
}

// Type inference from attributes (advanced)
type InferFieldType<T extends FieldDefinition> =
  T extends `string${string}` ? string :
  T extends `number${string}` ? number :
  T extends `boolean${string}` ? boolean :
  T extends `date${string}` ? Date :
  T extends `secret${string}` ? string :
  T extends `embedding:${number}` ? number[] :
  unknown;

type InferOptional<T extends FieldDefinition> =
  T extends `${string}|required${string}` ? false :
  T extends `${string}|optional${string}` ? true :
  false;
```

### 2. Plugin Configuration Inference

```typescript
// src/plugins/api.plugin.ts

export interface ApiPluginConfig extends PluginConfig {
  port?: number;
  host?: string;
  prefix?: string;
  cors?: CorsConfig | boolean;
  rateLimit?: RateLimitConfig | boolean;
  auth?: AuthConfig;
  openapi?: OpenApiConfig;
  guards?: GuardConfig[];
  routes?: RouteConfig[];
}

export interface ApiPlugin extends PluginInterface {
  readonly config: Required<ApiPluginConfig>;
  readonly app: HonoApp;
  readonly server: Server | null;

  setup(database: Database): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;

  // API-specific methods
  addRoute(route: RouteConfig): void;
  addGuard(guard: GuardConfig): void;
  getOpenApiSpec(): OpenApiDocument;
}

// Factory with config inference
export function createApiPlugin<C extends ApiPluginConfig>(
  config?: C
): ApiPlugin {
  return new ApiPluginImpl(config);
}
```

### 3. Cloud Inventory Driver Pattern

```typescript
// src/plugins/cloud-inventory/drivers/base-driver.ts

export interface CloudResource {
  id: string;
  type: string;
  region: string;
  provider: CloudProvider;
  name?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CloudProvider = 'aws' | 'azure' | 'gcp' | 'vultr' | 'digitalocean';

export interface DriverConfig {
  credentials?: Record<string, string>;
  regions?: string[];
  resourceTypes?: string[];
  batchSize?: number;
  timeout?: number;
}

export abstract class BaseInventoryDriver<
  TConfig extends DriverConfig = DriverConfig
> {
  protected config: TConfig;
  protected logger: Logger;

  constructor(config: TConfig) {
    this.config = config;
    this.logger = createLogger({ name: `driver-${this.provider}` });
  }

  abstract readonly provider: CloudProvider;
  abstract readonly supportedResourceTypes: string[];

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract listResources(type: string, region?: string): AsyncIterable<CloudResource>;
  abstract getResource(type: string, id: string): Promise<CloudResource | null>;

  protected validateResourceType(type: string): void {
    if (!this.supportedResourceTypes.includes(type)) {
      throw new ConfigurationError(
        `Resource type '${type}' not supported by ${this.provider} driver`
      );
    }
  }
}

// Specific driver
export class AwsInventoryDriver extends BaseInventoryDriver<AwsDriverConfig> {
  readonly provider = 'aws' as const;
  readonly supportedResourceTypes = [
    'ec2:instance',
    'ec2:vpc',
    's3:bucket',
    'rds:instance',
    'lambda:function',
    // ... 50+ more
  ];

  async *listResources(type: string, region?: string): AsyncIterable<CloudResource> {
    this.validateResourceType(type);
    // Implementation
  }
}
```

### 4. State Machine Typing

```typescript
// src/plugins/state-machine.plugin.ts

export interface StateConfig<TState extends string = string> {
  initial: TState;
  states: Record<TState, StateDefinition<TState>>;
}

export interface StateDefinition<TState extends string> {
  on?: Record<string, TState | TransitionConfig<TState>>;
  entry?: ActionFunction[];
  exit?: ActionFunction[];
  meta?: Record<string, unknown>;
}

export interface TransitionConfig<TState extends string> {
  target: TState;
  guard?: GuardFunction;
  actions?: ActionFunction[];
}

export type ActionFunction = (context: ActionContext) => MaybeAsync<void>;
export type GuardFunction = (context: GuardContext) => MaybeAsync<boolean>;

// Type-safe state machine
export interface StateMachine<
  TState extends string,
  TEvent extends string,
  TContext extends Record<string, unknown> = Record<string, unknown>
> {
  readonly currentState: TState;
  readonly context: TContext;

  send(event: TEvent, payload?: unknown): Promise<TState>;
  can(event: TEvent): boolean;
  matches(state: TState): boolean;
  getSnapshot(): MachineSnapshot<TState, TContext>;
}

// Usage
type OrderState = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
type OrderEvent = 'PAY' | 'SHIP' | 'DELIVER' | 'CANCEL';

const orderMachine: StateMachine<OrderState, OrderEvent> = await stateMachinePlugin
  .createMachine<OrderState, OrderEvent>({
    initial: 'pending',
    states: {
      pending: { on: { PAY: 'paid', CANCEL: 'cancelled' } },
      paid: { on: { SHIP: 'shipped', CANCEL: 'cancelled' } },
      shipped: { on: { DELIVER: 'delivered' } },
      delivered: {},
      cancelled: {},
    },
  });
```

## Migration Approach

### Phase 1: Parallel Type System

During migration, both systems coexist:

```
src/
├── types/              # NEW: TypeScript types
│   └── index.ts
├── database.class.js   # EXISTING: JavaScript
├── database.class.ts   # NEW: TypeScript version (initially copy)
└── s3db.d.ts           # EXISTING: Manual types (deprecated)
```

### Phase 2: File-by-File Conversion

For each file:

1. **Rename**: `file.js` -> `file.ts`
2. **Add types**: Import types, add return types, type parameters
3. **Fix errors**: Resolve TypeScript errors
4. **Update imports**: Ensure all imports use `.js` extension
5. **Test**: Run tests to verify functionality
6. **Remove old**: Delete backup if keeping one

### Conversion Script

```bash
#!/bin/bash
# convert-file.sh <source.js>

SOURCE="$1"
TARGET="${SOURCE%.js}.ts"

# Create backup
cp "$SOURCE" "${SOURCE}.bak"

# Rename
mv "$SOURCE" "$TARGET"

# Run TypeScript check
npx tsc --noEmit "$TARGET"

echo "Converted $SOURCE to $TARGET"
echo "Run tests: pnpm test -- --grep $(basename $SOURCE .js)"
```

### Phase 3: Type Declaration Rollup

Final build generates a single `.d.ts`:

```typescript
// rollup.config.ts
import dts from 'rollup-plugin-dts';
import typescript from '@rollup/plugin-typescript';

export default [
  // JavaScript bundles
  {
    input: 'src/index.ts',
    output: [
      { file: 'dist/s3db.es.js', format: 'es', sourcemap: true },
      { file: 'dist/s3db.cjs', format: 'cjs', sourcemap: true },
    ],
    plugins: [
      typescript({ tsconfig: './tsconfig.build.json' }),
    ],
    external: [/node_modules/],
  },
  // Type declaration bundle
  {
    input: 'dist/esm/index.d.ts',
    output: { file: 'dist/s3db.d.ts', format: 'es' },
    plugins: [dts()],
  },
];
```

## Testing Strategy

### JavaScript Tests Remain Unchanged

```javascript
// tests/core/classes/database.class.test.js
import { describe, it, expect } from 'vitest';
import { Database } from '#src/database.class.js';

describe('Database', () => {
  it('should connect', async () => {
    const db = new Database({ connectionString: 'memory://test' });
    await db.connect();
    expect(db.isConnected()).toBe(true);
  });
});
```

### Type Tests (New)

```typescript
// tests/typescript/types.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  Database,
  Resource,
  DatabaseConfig,
  ResourceConfig,
  TypedResource
} from 's3db.js';

describe('Type Definitions', () => {
  it('DatabaseConfig should have connectionString', () => {
    expectTypeOf<DatabaseConfig>().toHaveProperty('connectionString');
  });

  it('Resource.insert should return typed object', () => {
    type InsertResult = Awaited<ReturnType<Resource['insert']>>;
    expectTypeOf<InsertResult>().toMatchTypeOf<{ id: string }>();
  });

  it('TypedResource should infer types correctly', () => {
    interface User {
      id: string;
      email: string;
      name: string;
    }

    type UserResource = TypedResource<User>;
    type InsertData = Parameters<UserResource['insert']>[0];

    expectTypeOf<InsertData>().toMatchTypeOf<{ email: string; name: string }>();
  });
});
```

## Performance Considerations

### Build Time

| Phase | Current | After Migration | Delta |
|-------|---------|-----------------|-------|
| TypeScript compile | N/A | ~15s | +15s |
| Rollup bundle | ~5s | ~5s | 0 |
| Type declaration rollup | N/A | ~3s | +3s |
| **Total** | ~5s | ~23s | +18s |

### Runtime Performance

- **No impact**: TypeScript compiles to JavaScript
- **Identical output**: Same code patterns, same performance
- **Potential improvement**: Better dead code elimination with strict types

### Bundle Size

| Output | Current | After Migration | Delta |
|--------|---------|-----------------|-------|
| s3db.es.js | ~450KB | ~460KB | +2% |
| s3db.cjs | ~480KB | ~490KB | +2% |
| s3db.d.ts | ~80KB | ~120KB | +50% |

Type declarations grow but runtime bundle unchanged.

## Rollback Plan

### Per-File Rollback

```bash
# Revert single file
git checkout HEAD~1 -- src/path/to/file.ts
mv src/path/to/file.ts src/path/to/file.js
```

### Per-Phase Rollback

Each phase has a git tag:
- `ts-phase-0-prep`
- `ts-phase-1-foundation`
- `ts-phase-2-core`
- `ts-phase-3-infra`
- `ts-phase-4-plugins`
- `ts-phase-5-large-plugins`
- `ts-phase-6-final`

```bash
git checkout ts-phase-2-core
```

### Full Rollback

```bash
git checkout v18.x  # Last JS-only version
```

## Dependencies

### New Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.9.0",
    "rollup-plugin-dts": "^6.0.0",
    "@rollup/plugin-typescript": "^11.0.0",
    "type-coverage": "^2.27.0",
    "@arethetypeswrong/cli": "^0.15.0"
  }
}
```

### Type Dependencies (Peer)

No new peer dependencies. Existing packages with types:
- `@aws-sdk/client-s3` - includes types
- `ioredis` - includes types
- `pg` - needs `@types/pg`
- `puppeteer` - includes types

## Success Metrics

| Metric | Target | Tool |
|--------|--------|------|
| Type coverage | > 95% | `type-coverage` |
| Build success | 100% | CI/CD |
| Test pass rate | 100% | Vitest |
| Bundle size increase | < 15% | size-limit |
| Build time increase | < 3x | CI timing |
| Are the types wrong? | Pass | `@arethetypeswrong/cli` |
