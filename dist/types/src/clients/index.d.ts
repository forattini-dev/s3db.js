/**
 * S3DB Clients
 *
 * Provides different client implementations for S3DB:
 * - S3Client: Production client for AWS S3, MinIO, LocalStack
 * - MemoryClient: Ultra-fast in-memory client for testing
 * - FileSystemClient: Persistent filesystem-based client for local development
 */
export { S3Client } from './s3-client.class.js';
export { MemoryClient } from './memory-client.class.js';
export { MemoryStorage } from './memory-storage.class.js';
export { FileSystemClient } from './filesystem-client.class.js';
export { FileSystemStorage } from './filesystem-storage.class.js';
export { ReckerHttpHandler } from './recker-http-handler.js';
export type { Client, ClientConfig, S3ClientConfig, MemoryClientConfig, FileSystemClientConfig, S3Object, PutObjectParams, PutObjectResponse, CopyObjectParams, ListObjectsParams, // Renamed from ListObjectsOptions
ListObjectsResponse, StorageObjectData, // Renamed from StoredObject?
StoragePutParams, MemoryStorageStats, FileSystemStorageStats, FileSystemStorageConfig, MemoryStorageConfig, ReckerHttpHandlerOptions, // Renamed from ReckerHttpHandlerConfig
HandleOptions, } from './types.js';
//# sourceMappingURL=index.d.ts.map