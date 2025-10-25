/**
 * S3DB Clients
 *
 * Provides different client implementations for S3DB:
 * - S3Client: Production client for AWS S3, MinIO, LocalStack
 * - MemoryClient: Ultra-fast in-memory client for testing
 */

export { S3Client } from './s3-client.class.js';
export { MemoryClient } from './memory-client.class.js';
export { MemoryStorage } from './memory-storage.class.js';

// Default export is S3Client for backward compatibility
export { S3Client as default } from './s3-client.class.js';
