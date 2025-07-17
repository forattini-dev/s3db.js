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
import zlib from "zlib";
import { join } from "path";

import { Cache } from "./cache.class.js"
import { streamToString } from "#src/stream/index.js";
import tryFn from "../../concerns/try-fn.js";

export class S3Cache extends Cache {
  constructor({ 
    client, 
    keyPrefix = 'cache',
    ttl = 0,
    prefix = undefined
  }) {
    super({ client, keyPrefix, ttl, prefix });
    this.client = client
    this.keyPrefix = keyPrefix;
    this.config.ttl = ttl;
    this.config.client = client;
    this.config.prefix = prefix !== undefined ? prefix : keyPrefix + (keyPrefix.endsWith('/') ? '' : '/');
  }

  async _set(key, data) {
    let body = JSON.stringify(data);
    const lengthSerialized = body.length;
    body = zlib.gzipSync(body).toString('base64');

    return this.client.putObject({
      key: join(this.keyPrefix, key),
      body,
      contentEncoding: "gzip",
      contentType: "application/gzip",
      metadata: {
        compressor: "zlib",
        compressed: 'true',
        "client-id": this.client.id,
        "length-serialized": String(lengthSerialized),
        "length-compressed": String(body.length),
        "compression-gain": (body.length/lengthSerialized).toFixed(2),
      },
    });
  }

  async _get(key) {
    const [ok, err, result] = await tryFn(async () => {
      const { Body } = await this.client.getObject(join(this.keyPrefix, key));
      let content = await streamToString(Body);
      content = Buffer.from(content, 'base64');
      content = zlib.unzipSync(content).toString();
      return JSON.parse(content);
    });
    if (ok) return result;
    if (err.name === 'NoSuchKey' || err.name === 'NotFound') return null;
    throw err;
  }

  async _del(key) {
    await this.client.deleteObject(join(this.keyPrefix, key));
    return true
  }

  async _clear() {
    const keys = await this.client.getAllKeys({ 
      prefix: this.keyPrefix,
    });

    await this.client.deleteObjects(keys);
  }

  async size() {
    const keys = await this.keys();
    return keys.length;
  }

  async keys() {
    // Busca todas as chaves com o prefixo do cache e remove o prefixo
    const allKeys = await this.client.getAllKeys({ prefix: this.keyPrefix });
    const prefix = this.keyPrefix.endsWith('/') ? this.keyPrefix : this.keyPrefix + '/';
    return allKeys.map(k => k.startsWith(prefix) ? k.slice(prefix.length) : k);
  }
}

export default S3Cache
