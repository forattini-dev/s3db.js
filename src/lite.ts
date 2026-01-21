/**
 * s3db.js/lite - Minimal bundle for CLIs and standalone binaries
 *
 * This entry point excludes all plugins with peer dependencies, making it
 * suitable for bundling with pkg, esbuild, or other tools that create
 * standalone executables.
 *
 * Includes:
 * - Core classes (Database, Resource, Schema, Validator)
 * - All storage clients (S3, MinIO, R2, Memory, FileSystem)
 * - Encryption (AES-256-GCM for secret fields)
 * - All field types and behaviors
 * - Streams and concurrency utilities
 *
 * Excludes:
 * - All plugins (API, TTL, Scheduler, Cache, etc.)
 * - Replicators (Postgres, MySQL, BigQuery, etc.)
 * - Consumers (SQS, RabbitMQ)
 * - Cloud Inventory drivers
 * - Spider/Puppeteer utilities
 * - Testing utilities (Factory, Seeder)
 *
 * Usage:
 * ```typescript
 * import { S3db, Schema } from 's3db.js/lite';
 *
 * const db = new S3db({ connectionString: 's3://...' });
 * ```
 */

// =============================================================================
// Core Classes
// =============================================================================

export { Database as S3db } from './database.class.js';
export { Database } from './database.class.js';
export { S3Client, S3Client as Client } from './clients/s3-client.class.js';
export { Resource } from './resource.class.js';
export { Schema, type SchemaRegistry } from './schema.class.js';
export { Validator } from './validator.class.js';
export { ConnectionString } from './connection-string.class.js';

// =============================================================================
// Storage Clients (no peer dependencies)
// =============================================================================

export { MemoryClient } from './clients/memory-client.class.js';
export { FileSystemClient } from './clients/filesystem-client.class.js';

// =============================================================================
// Errors
// =============================================================================

export * from './errors.js';

// =============================================================================
// Concerns/Utilities (core only)
// =============================================================================

// Logger
export { createLogger, type LogLevel } from './concerns/logger.js';

// Error handling
export { tryFn, tryFnSync, type TryResult } from './concerns/try-fn.js';

// Crypto
export { encrypt, decrypt } from './concerns/crypto.js';

// ID generation
export { idGenerator, passwordGenerator, createCustomGenerator } from './concerns/id.js';

// Base62 encoding
export { encode, decode, encodeDecimal, decodeDecimal } from './concerns/base62.js';

// Binary encoding
export { encodeBuffer, decodeBuffer, encodeBits, decodeBits } from './concerns/binary.js';

// Lifecycle management
export { ProcessManager, getProcessManager, resetProcessManager } from './concerns/process-manager.js';
export { SafeEventEmitter, createSafeEventEmitter } from './concerns/safe-event-emitter.js';

// Map utilities
export { mapWithConcurrency } from './concerns/map-with-concurrency.js';

// =============================================================================
// Streams
// =============================================================================

export {
  ResourceReader,
  ResourceWriter,
  ResourceIdsReader,
  ResourceIdsPageReader,
  streamToString
} from './stream/index.js';

// =============================================================================
// Behaviors
// =============================================================================

export {
  behaviors,
  getBehavior,
  AVAILABLE_BEHAVIORS,
  DEFAULT_BEHAVIOR
} from './behaviors/index.js';

// =============================================================================
// Concurrency & Tasks
// =============================================================================

export { TaskExecutor } from './concurrency/index.js';
export { TasksPool } from './tasks/tasks-pool.class.js';
export { TasksRunner } from './tasks/tasks-runner.class.js';
export { AdaptiveTuning } from './concerns/adaptive-tuning.js';
export { Benchmark, benchmark } from './concerns/benchmark.js';
export { PerformanceMonitor } from './concerns/performance-monitor.js';

// =============================================================================
// Default Export
// =============================================================================

export { S3db as default } from './database.class.js';
