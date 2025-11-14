// =============================================================================
// Core Classes & Utilities
// =============================================================================

// Main classes (explicit named exports for better tree-shaking)
export { Database as S3db } from './database.class.js'
export { Database } from './database.class.js'
export { S3Client } from './clients/s3-client.class.js'
export { Resource } from './resource.class.js'
export { Schema } from './schema.class.js'
export { Validator } from './validator.class.js'
export { ConnectionString } from './connection-string.class.js'

// Clients (all implementations)
export * from './clients/index.js'

// Errors (all custom error classes)
export * from './errors.js'

// Concerns/Utilities (all helper functions and utilities)
export * from './concerns/index.js'

// =============================================================================
// Stream Classes
// =============================================================================

export {
  ResourceReader,
  ResourceWriter,
  ResourceIdsReader,
  ResourceIdsPageReader,
  streamToString
} from './stream/index.js'

// =============================================================================
// Behaviors
// =============================================================================

export {
  behaviors,
  getBehavior,
  AVAILABLE_BEHAVIORS,
  DEFAULT_BEHAVIOR
} from './behaviors/index.js'

// =============================================================================
// TypeScript Generation
// =============================================================================

export { generateTypes, printTypes } from './concerns/typescript-generator.js'

// =============================================================================
// Lifecycle Management (prevents memory leaks)
// =============================================================================

export { ProcessManager, getProcessManager, resetProcessManager } from './concerns/process-manager.js'
export { SafeEventEmitter, createSafeEventEmitter } from './concerns/safe-event-emitter.js'
export { CronManager, getCronManager, resetCronManager, createCronManager, intervalToCron, CRON_PRESETS } from './concerns/cron-manager.js'

// =============================================================================
// Operations Pool & Task Management
// =============================================================================

export { TaskExecutor } from './concurrency/index.js'
export { TasksPool } from './tasks-pool.class.js'
export { AdaptiveTuning } from './concerns/adaptive-tuning.js'
export { TasksRunner } from './tasks-runner.class.js'
export { Benchmark, benchmark } from './concerns/benchmark.js'
export { PerformanceMonitor } from './concerns/performance-monitor.js'

// =============================================================================
// Testing Utilities
// =============================================================================

export { Factory, Seeder } from './testing/index.js'

// =============================================================================
// Plugins (Core - no peer dependencies)
// =============================================================================

// Base plugin classes and all core plugins
export * from './plugins/index.js'

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
} from './plugins/replicators/index.js'

// Consumers (lazy-loaded queue consumers)
export {
  SqsConsumer,
  RabbitMqConsumer,
  createConsumer,
  loadSqsConsumer,
  loadRabbitMqConsumer
} from './plugins/consumers/index.js'

// Cache Drivers (all cache implementations)
export {
  S3Cache,
  MemoryCache,
  FilesystemCache,
  PartitionAwareFilesystemCache
} from './plugins/cache/index.js'

// Backup Drivers (all backup implementations)
export {
  BaseBackupDriver,
  FilesystemBackupDriver,
  S3BackupDriver,
  MultiBackupDriver,
  BACKUP_DRIVERS,
  createBackupDriver,
  validateBackupConfig
} from './plugins/backup/index.js'

// Cloud Inventory Drivers (lazy-loaded cloud drivers)
export {
  registerCloudDriver,
  createCloudDriver,
  listCloudDrivers,
  validateCloudDefinition,
  BaseCloudDriver,
  loadCloudDriver,
  loadAwsInventoryDriver,
  loadGcpInventoryDriver,
  loadAzureInventoryDriver,
  loadDigitalOceanInventoryDriver,
  loadOracleInventoryDriver,
  loadVultrInventoryDriver,
  loadLinodeInventoryDriver,
  loadHetznerInventoryDriver,
  loadAlibabaInventoryDriver,
  loadCloudflareInventoryDriver,
  loadMongoDBAtlasInventoryDriver
} from './plugins/cloud-inventory/index.js'

// Importer Plugin (data import from multiple formats)
export {
  ImporterPlugin,
  Transformers
} from './plugins/importer/index.js'

// =============================================================================
// Default Export
// =============================================================================

export { S3db as default } from './database.class.js'
