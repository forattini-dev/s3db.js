/**
 * S3 Cache Configuration Documentation
 * 
 * This cache implementation stores data in Amazon S3, providing persistent storage
 * that survives process restarts and can be shared across multiple instances.
 * It's suitable for large datasets and distributed caching scenarios.
 * 
 * @typedef {Object} S3CacheConfig
 * @property {string} bucket - The name of the S3 bucket to use for cache storage
 * @property {string} [region='us-east-1'] - AWS region where the S3 bucket is located
 * @property {string} [accessKeyId] - AWS access key ID (if not using IAM roles)
 * @property {string} [secretAccessKey] - AWS secret access key (if not using IAM roles)
 * @property {string} [sessionToken] - AWS session token for temporary credentials
 * @property {string} [prefix='cache/'] - S3 key prefix for all cache objects
 * @property {number} [ttl=3600000] - Time to live in milliseconds (1 hour default)
 * @property {boolean} [enableCompression=true] - Whether to compress cache values using gzip
 * @property {number} [compressionThreshold=1024] - Minimum size in bytes to trigger compression
 * @property {string} [storageClass='STANDARD'] - S3 storage class: 'STANDARD', 'STANDARD_IA', 'ONEZONE_IA', 'GLACIER', 'DEEP_ARCHIVE'
 * @property {boolean} [enableEncryption=true] - Whether to use S3 server-side encryption (AES256)
 * @property {string} [encryptionAlgorithm='AES256'] - Encryption algorithm: 'AES256' or 'aws:kms'
 * @property {string} [kmsKeyId] - KMS key ID for encryption (if using aws:kms)
 * @property {number} [maxConcurrency=10] - Maximum number of concurrent S3 operations
 * @property {number} [retryAttempts=3] - Number of retry attempts for failed S3 operations
 * @property {number} [retryDelay=1000] - Delay in milliseconds between retry attempts
 * @property {boolean} [logOperations=false] - Whether to log S3 operations to console for debugging
 * @property {Object} [metadata] - Additional metadata to include with all cache objects
 *   - Key: metadata name (e.g., 'environment', 'version')
 *   - Value: metadata value (e.g., 'production', '1.0.0')
 * @property {string} [contentType='application/json'] - Content type for cache objects
 * @property {boolean} [enableVersioning=false] - Whether to enable S3 object versioning for cache objects
 * @property {number} [maxKeys=1000] - Maximum number of keys to retrieve in list operations
 * @property {boolean} [enableCacheControl=false] - Whether to set Cache-Control headers on S3 objects
 * @property {string} [cacheControl='max-age=3600'] - Cache-Control header value for S3 objects
 * @property {Object} [s3ClientOptions] - Additional options to pass to the S3 client constructor
 * @property {boolean} [enableLocalCache=false] - Whether to use local memory cache as a layer on top of S3
 * @property {number} [localCacheSize=100] - Size of local memory cache when enabled
 * @property {number} [localCacheTtl=300000] - TTL for local memory cache in milliseconds (5 minutes default)
 * 
 * @example
 * // Basic configuration with compression and encryption
 * {
 *   bucket: 'my-cache-bucket',
 *   region: 'us-west-2',
 *   accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
 *   secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
 *   prefix: 'app-cache/',
 *   ttl: 7200000, // 2 hours
 *   enableCompression: true,
 *   enableEncryption: true,
 *   storageClass: 'STANDARD_IA'
 * }
 * 
 * @example
 * // Configuration with KMS encryption and local caching
 * {
 *   bucket: 'secure-cache-bucket',
 *   region: 'eu-west-1',
 *   prefix: 'encrypted-cache/',
 *   enableEncryption: true,
 *   encryptionAlgorithm: 'aws:kms',
 *   kmsKeyId: 'arn:aws:kms:eu-west-1:123456789012:key/abcd1234-5678-90ef-ghij-klmnopqrstuv',
 *   enableLocalCache: true,
 *   localCacheSize: 500,
 *   localCacheTtl: 600000, // 10 minutes
 *   metadata: {
 *     'environment': 'production',
 *     'cache_type': 's3'
 *   }
 * }
 * 
 * @example
 * // Configuration with cost optimization
 * {
 *   bucket: 'cost-optimized-cache',
 *   region: 'us-east-1',
 *   prefix: 'cache/',
 *   storageClass: 'STANDARD_IA',
 *   ttl: 86400000, // 24 hours
 *   enableCompression: true,
 *   compressionThreshold: 512,
 *   maxConcurrency: 5,
 *   enableCacheControl: true,
 *   cacheControl: 'max-age=86400, public'
 * }
 * 
 * @example
 * // Minimal configuration using IAM roles
 * {
 *   bucket: 'my-cache-bucket',
 *   region: 'us-east-1'
 * }
 * 
 * @notes
 * - Requires AWS credentials with S3 read/write permissions
 * - S3 storage costs depend on storage class and data transfer
 * - Compression reduces storage costs but increases CPU usage
 * - Encryption provides security but may impact performance
 * - Local cache layer improves performance for frequently accessed data
 * - Storage class affects cost, availability, and retrieval time
 * - Versioning allows recovery of deleted cache objects
 * - Cache-Control headers help with CDN integration
 * - Retry mechanism handles temporary S3 service issues
 * - Concurrent operations improve performance but may hit rate limits
 * - Metadata is useful for cache management and monitoring
 * - TTL is enforced by checking object creation time
 */
import zlib from "node:zlib";
import { PluginStorage } from "../../concerns/plugin-storage.js";
import { Cache } from "./cache.class.js";

export class S3Cache extends Cache {
  constructor({
    client,
    keyPrefix = 'cache',
    ttl = 0,
    prefix = undefined,
    enableCompression = true,
    compressionThreshold = 1024
  }) {
    super();
    this.client = client;
    this.keyPrefix = keyPrefix;
    this.ttlMs = typeof ttl === 'number' && ttl > 0 ? ttl : 0;
    this.ttlSeconds = this.ttlMs > 0 ? Math.ceil(this.ttlMs / 1000) : 0;
    this.config.ttl = this.ttlMs;
    this.config.client = client;
    this.config.prefix = prefix !== undefined ? prefix : keyPrefix + (keyPrefix.endsWith('/') ? '' : '/');
    this.config.enableCompression = enableCompression;
    this.config.compressionThreshold = compressionThreshold;

    // Create PluginStorage instance for consistent storage operations with TTL support
    this.storage = new PluginStorage(client, 'cache');
  }

  /**
   * Compress data if enabled and above threshold
   * @private
   */
  _compressData(data) {
    const jsonString = JSON.stringify(data);

    // Don't compress if disabled or below threshold
    if (!this.config.enableCompression || jsonString.length < this.config.compressionThreshold) {
      return {
        data: jsonString,
        compressed: false,
        originalSize: jsonString.length
      };
    }

    // Compress with gzip
    const compressed = zlib.gzipSync(jsonString).toString('base64');
    return {
      data: compressed,
      compressed: true,
      originalSize: jsonString.length,
      compressedSize: compressed.length,
      compressionRatio: (compressed.length / jsonString.length).toFixed(2)
    };
  }

  /**
   * Decompress data if needed
   * @private
   */
  _decompressData(storedData) {
    if (!storedData || !storedData.compressed) {
      // Not compressed - parse JSON directly
      return storedData && storedData.data ? JSON.parse(storedData.data) : null;
    }

    // Decompress gzip data
    const buffer = Buffer.from(storedData.data, 'base64');
    const decompressed = zlib.unzipSync(buffer).toString();
    return JSON.parse(decompressed);
  }

  async _set(key, data) {
    const compressed = this._compressData(data);

    // Use PluginStorage with body-only behavior (compressed data doesn't benefit from metadata encoding)
    // TTL is handled automatically by PluginStorage
    return this.storage.set(
      this.storage.getPluginKey(null, this.keyPrefix, key),
      compressed,
      {
        ttl: this.ttlSeconds,
        behavior: 'body-only', // Compressed data is already optimized, skip metadata encoding
        contentType: compressed.compressed ? 'application/gzip' : 'application/json'
      }
    );
  }

  async _get(key) {
    // PluginStorage automatically checks TTL and deletes expired items
    const storedData = await this.storage.get(
      this.storage.getPluginKey(null, this.keyPrefix, key)
    );

    if (!storedData) return null;

    return this._decompressData(storedData);
  }

  async _del(key) {
    await this.storage.delete(
      this.storage.getPluginKey(null, this.keyPrefix, key)
    );
    return true;
  }

  async _clear(prefix) {
    const basePrefix = `plugin=cache/${this.keyPrefix}`;
    const listPrefix = prefix
      ? `${basePrefix}/${prefix}`
      : basePrefix;

    const allKeys = await this.client.getAllKeys({ prefix: listPrefix });

    for (const key of allKeys) {
      // When listing without prefix, filter manually if prefix supplied (defensive)
      if (!prefix || key.startsWith(`${basePrefix}/${prefix}`)) {
        await this.storage.delete(key);
      }
    }

    return true;
  }

  async size() {
    const keys = await this.keys();
    return keys.length;
  }

  async keys() {
    // Get all keys with the cache plugin prefix
    const pluginPrefix = `plugin=cache/${this.keyPrefix}`;
    const allKeys = await this.client.getAllKeys({ prefix: pluginPrefix });

    // Remove the plugin prefix to return just the cache keys
    const prefixToRemove = `plugin=cache/${this.keyPrefix}/`;
    return allKeys.map(k => k.startsWith(prefixToRemove) ? k.slice(prefixToRemove.length) : k);
  }
}

export default S3Cache
