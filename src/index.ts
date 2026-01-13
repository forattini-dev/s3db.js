// =============================================================================
// Core Classes & Utilities
// =============================================================================

// Main classes (explicit named exports for better tree-shaking)
export { Database as S3db } from './database.class.js';
export { Database } from './database.class.js';
export { S3Client, S3Client as Client } from './clients/s3-client.class.js'; // Assuming S3Client is converted or has types
export { Resource } from './resource.class.js'; // Assuming Resource is converted or has types
export { Schema, type SchemaRegistry } from './schema.class.js'; // Assuming Schema is converted or has types
export { Validator } from './validator.class.js'; // Assuming Validator is converted or has types
export { ConnectionString } from './connection-string.class.js'; // Assuming ConnectionString is converted or has types

// Clients (all implementations)
export * from './clients/index.js'; // Assuming clients/index.js will be converted to .ts and re-export types

// Errors (all custom error classes)
export * from './errors.js'; // Assuming errors.ts exists

// Concerns/Utilities (all helper functions and utilities)
export * from './concerns/index.js'; // Assuming concerns/index.js will be converted to .ts and re-export types

// =============================================================================
// Stream Classes
// =============================================================================

export {
  ResourceReader,
  ResourceWriter,
  ResourceIdsReader,
  ResourceIdsPageReader,
  streamToString
} from './stream/index.js'; // Assuming stream/index.js will be converted to .ts and re-export types

// =============================================================================
// Behaviors
// =============================================================================

export {
  behaviors,
  getBehavior,
  AVAILABLE_BEHAVIORS,
  DEFAULT_BEHAVIOR
} from './behaviors/index.js'; // Assuming behaviors/index.js will be converted to .ts and re-export types

// =============================================================================
// TypeScript Generation
// =============================================================================

export { generateTypes, printTypes } from './concerns/typescript-generator.js'; // Assuming typescript-generator.js will be converted to .ts

// =============================================================================
// Lifecycle Management (prevents memory leaks)
// =============================================================================

export { ProcessManager, getProcessManager, resetProcessManager } from './concerns/process-manager.js'; // Assuming process-manager.js will be converted to .ts
export { SafeEventEmitter, createSafeEventEmitter } from './concerns/safe-event-emitter.js'; // Assuming safe-event-emitter.js will be converted to .ts
export { CronManager, getCronManager, resetCronManager, createCronManager, intervalToCron, CRON_PRESETS } from './concerns/cron-manager.js'; // Assuming cron-manager.js will be converted to .ts

// =============================================================================
// Operations Pool & Task Management
// =============================================================================

export { TaskExecutor } from './concurrency/index.js'; // Assuming concurrency/index.js will be converted to .ts
export { TasksPool } from './tasks/tasks-pool.class.js'; // Assuming tasks/tasks-pool.class.js will be converted to .ts
export { AdaptiveTuning } from './concerns/adaptive-tuning.js'; // Assuming adaptive-tuning.js will be converted to .ts
export { TasksRunner } from './tasks/tasks-runner.class.js'; // Assuming tasks/tasks-runner.class.js will be converted to .ts
export { Benchmark, benchmark } from './concerns/benchmark.js'; // Assuming benchmark.js will be converted to .ts
export { PerformanceMonitor } from './concerns/performance-monitor.js'; // Assuming performance-monitor.js will be converted to .ts

// =============================================================================
// Testing Utilities
// =============================================================================

export { Factory, Seeder } from './testing/index.js'; // Assuming testing/index.js will be converted to .ts

// =============================================================================
// Plugins (Core - no peer dependencies)
// =============================================================================

// Base plugin classes and all core plugins
export * from './plugins/index.js'; // Assuming plugins/index.js will be converted to .ts and re-export types

// =============================================================================
// Plugin Sub-modules & Drivers
// =============================================================================

// Replicators (lazy-loaded drivers and utilities)
export {
  BaseReplicator,
  S3dbReplicator,
  WebhookReplicator,
  SqsReplicator,
  ReplicationError,
  createReplicator,
  validateReplicatorConfig,
  loadBigqueryReplicator,
  loadDynamoDBReplicator,
  loadMongoDBReplicator,
  loadMySQLReplicator,
  loadPlanetScaleReplicator,
  loadPostgresReplicator,
  loadSqsReplicator,
  loadTursoReplicator
} from './plugins/replicators/index.js'; // Assuming plugins/replicators/index.js will be converted to .ts

// Consumers (lazy-loaded queue consumers)
export {
  SqsConsumer,
  RabbitMqConsumer,
  createConsumer,
  loadSqsConsumer,
  loadRabbitMqConsumer
} from './plugins/consumers/index.js'; // Assuming plugins/consumers/index.js will be converted to .ts

// Cache Drivers (all implementations)
export {
  S3Cache,
  MemoryCache,
  FilesystemCache,
  PartitionAwareFilesystemCache
} from './plugins/cache/index.js'; // Assuming plugins/cache/index.js will be converted to .ts

// Backup Drivers (all backup implementations)
export {
  BaseBackupDriver,
  FilesystemBackupDriver,
  S3BackupDriver,
  MultiBackupDriver,
  BACKUP_DRIVERS,
  createBackupDriver,
  validateBackupConfig
} from './plugins/backup/index.js'; // Assuming plugins/backup/index.js will be converted to .ts

// Cloud Inventory Drivers (lazy-loaded cloud drivers)
export {
  BaseCloudDriver
  // REMOVED: All cloud-inventory functions to prevent Rollup from bundling cloud drivers
  // The registry.js contains dynamic imports which Rollup inlines when inlineDynamicImports: true
  // Users should import directly from 's3db.js/src/plugins/cloud-inventory' if needed
} from './plugins/cloud-inventory/index.js'; // Assuming plugins/cloud-inventory/index.js will be converted to .ts

// Importer Plugin (data import from multiple formats)
export {
  ImporterPlugin,
  Transformers
} from './plugins/importer/index.js'; // Assuming plugins/importer/index.js will be converted to .ts

// =============================================================================
// Default Export
// =============================================================================

export { S3db as default } from './database.class.js';
