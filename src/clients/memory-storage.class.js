/**
 * MemoryStorage - Internal Storage Engine for Memory Client
 *
 * Simulates S3 object storage in memory using Map data structure.
 * Supports snapshot/restore, persistence, and configurable limits.
 */

import { createHash } from 'crypto';
import { writeFile, readFile } from 'fs/promises';
import { Readable } from 'stream';
import tryFn from '../concerns/try-fn.js';

export class MemoryStorage {
  constructor(config = {}) {
    /**
     * Main storage: Map<key, ObjectData>
     * ObjectData: { body, metadata, contentType, etag, lastModified, size, contentEncoding, contentLength }
     */
    this.objects = new Map();

    // Configuration
    this.bucket = config.bucket || 's3db';
    this.enforceLimits = config.enforceLimits || false;
    this.metadataLimit = config.metadataLimit || 2048; // 2KB like S3
    this.maxObjectSize = config.maxObjectSize || 5 * 1024 * 1024 * 1024; // 5GB
    this.persistPath = config.persistPath;
    this.autoPersist = config.autoPersist || false;
    this.verbose = config.verbose || false;
  }

  /**
   * Generate ETag (MD5 hash) for object body
   */
  _generateETag(body) {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
    return createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Calculate metadata size in bytes
   */
  _calculateMetadataSize(metadata) {
    if (!metadata) return 0;

    let size = 0;
    for (const [key, value] of Object.entries(metadata)) {
      // S3 counts key + value in UTF-8 bytes
      size += Buffer.byteLength(key, 'utf8');
      size += Buffer.byteLength(String(value), 'utf8');
    }
    return size;
  }

  /**
   * Validate limits if enforceLimits is enabled
   */
  _validateLimits(body, metadata) {
    if (!this.enforceLimits) return;

    // Check metadata size
    const metadataSize = this._calculateMetadataSize(metadata);
    if (metadataSize > this.metadataLimit) {
      throw new Error(
        `Metadata size (${metadataSize} bytes) exceeds limit of ${this.metadataLimit} bytes`
      );
    }

    // Check object size
    const bodySize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body || '', 'utf8');
    if (bodySize > this.maxObjectSize) {
      throw new Error(
        `Object size (${bodySize} bytes) exceeds limit of ${this.maxObjectSize} bytes`
      );
    }
  }

  /**
   * Store an object
   */
  async put(key, { body, metadata, contentType, contentEncoding, contentLength, ifMatch }) {
    // Validate limits
    this._validateLimits(body, metadata);

    // Check ifMatch (conditional put)
    if (ifMatch !== undefined) {
      const existing = this.objects.get(key);
      if (existing && existing.etag !== ifMatch) {
        throw new Error(`Precondition failed: ETag mismatch for key "${key}"`);
      }
    }

    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
    const etag = this._generateETag(buffer);
    const lastModified = new Date().toISOString();
    const size = buffer.length;

    const objectData = {
      body: buffer,
      metadata: metadata || {},
      contentType: contentType || 'application/octet-stream',
      etag,
      lastModified,
      size,
      contentEncoding,
      contentLength: contentLength || size
    };

    this.objects.set(key, objectData);

    if (this.verbose) {
      console.log(`[MemoryStorage] PUT ${key} (${size} bytes, etag: ${etag})`);
    }

    // Auto-persist if enabled
    if (this.autoPersist && this.persistPath) {
      await this.saveToDisk();
    }

    return {
      ETag: etag,
      VersionId: null, // Memory storage doesn't support versioning
      ServerSideEncryption: null,
      Location: `/${this.bucket}/${key}`
    };
  }

  /**
   * Retrieve an object
   */
  async get(key) {
    const obj = this.objects.get(key);

    if (!obj) {
      const error = new Error(`Object not found: ${key}`);
      error.name = 'NoSuchKey';
      error.$metadata = {
        httpStatusCode: 404,
        requestId: 'memory-' + Date.now(),
        attempts: 1,
        totalRetryDelay: 0
      };
      throw error;
    }

    if (this.verbose) {
      console.log(`[MemoryStorage] GET ${key} (${obj.size} bytes)`);
    }

    // Convert Buffer to Readable stream (same as real S3 Client)
    const bodyStream = Readable.from(obj.body);

    return {
      Body: bodyStream,
      Metadata: { ...obj.metadata },
      ContentType: obj.contentType,
      ContentLength: obj.size,
      ETag: obj.etag,
      LastModified: new Date(obj.lastModified),
      ContentEncoding: obj.contentEncoding
    };
  }

  /**
   * Get object metadata only (like S3 HeadObject)
   */
  async head(key) {
    const obj = this.objects.get(key);

    if (!obj) {
      const error = new Error(`Object not found: ${key}`);
      error.name = 'NoSuchKey';
      error.$metadata = {
        httpStatusCode: 404,
        requestId: 'memory-' + Date.now(),
        attempts: 1,
        totalRetryDelay: 0
      };
      throw error;
    }

    if (this.verbose) {
      console.log(`[MemoryStorage] HEAD ${key}`);
    }

    return {
      Metadata: { ...obj.metadata },
      ContentType: obj.contentType,
      ContentLength: obj.size,
      ETag: obj.etag,
      LastModified: new Date(obj.lastModified),
      ContentEncoding: obj.contentEncoding
    };
  }

  /**
   * Copy an object
   */
  async copy(from, to, { metadata, metadataDirective, contentType }) {
    const source = this.objects.get(from);

    if (!source) {
      const error = new Error(`Source object not found: ${from}`);
      error.name = 'NoSuchKey';
      throw error;
    }

    // Determine final metadata based on directive
    let finalMetadata = { ...source.metadata };
    if (metadataDirective === 'REPLACE' && metadata) {
      finalMetadata = metadata;
    } else if (metadata) {
      finalMetadata = { ...finalMetadata, ...metadata };
    }

    // Copy the object
    const result = await this.put(to, {
      body: source.body,
      metadata: finalMetadata,
      contentType: contentType || source.contentType,
      contentEncoding: source.contentEncoding
    });

    if (this.verbose) {
      console.log(`[MemoryStorage] COPY ${from} → ${to}`);
    }

    return result;
  }

  /**
   * Check if object exists
   */
  exists(key) {
    return this.objects.has(key);
  }

  /**
   * Delete an object
   */
  async delete(key) {
    const existed = this.objects.has(key);
    this.objects.delete(key);

    if (this.verbose) {
      console.log(`[MemoryStorage] DELETE ${key} (existed: ${existed})`);
    }

    // Auto-persist if enabled
    if (this.autoPersist && this.persistPath) {
      await this.saveToDisk();
    }

    return {
      DeleteMarker: false,
      VersionId: null
    };
  }

  /**
   * Delete multiple objects (batch)
   */
  async deleteMultiple(keys) {
    const deleted = [];
    const errors = [];

    for (const key of keys) {
      try {
        await this.delete(key);
        deleted.push({ Key: key });
      } catch (error) {
        errors.push({
          Key: key,
          Code: error.name || 'InternalError',
          Message: error.message
        });
      }
    }

    if (this.verbose) {
      console.log(`[MemoryStorage] DELETE BATCH (${deleted.length} deleted, ${errors.length} errors)`);
    }

    return { Deleted: deleted, Errors: errors };
  }

  /**
   * List objects with prefix/delimiter support
   */
  async list({ prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null }) {
    const allKeys = Array.from(this.objects.keys());

    // Filter by prefix
    let filteredKeys = prefix
      ? allKeys.filter(key => key.startsWith(prefix))
      : allKeys;

    // Sort keys
    filteredKeys.sort();

    // Handle continuation token (simple offset-based pagination)
    let startIndex = 0;
    if (continuationToken) {
      startIndex = parseInt(continuationToken) || 0;
    }

    // Apply pagination
    const paginatedKeys = filteredKeys.slice(startIndex, startIndex + maxKeys);
    const isTruncated = startIndex + maxKeys < filteredKeys.length;
    const nextContinuationToken = isTruncated ? String(startIndex + maxKeys) : null;

    // Group by common prefixes if delimiter is set
    const commonPrefixes = new Set();
    const contents = [];

    for (const key of paginatedKeys) {
      if (delimiter && prefix) {
        // Find the next delimiter after prefix
        const suffix = key.substring(prefix.length);
        const delimiterIndex = suffix.indexOf(delimiter);

        if (delimiterIndex !== -1) {
          // This key has a delimiter - add to common prefixes
          const commonPrefix = prefix + suffix.substring(0, delimiterIndex + 1);
          commonPrefixes.add(commonPrefix);
          continue;
        }
      }

      // Add to contents
      const obj = this.objects.get(key);
      contents.push({
        Key: key,
        Size: obj.size,
        LastModified: new Date(obj.lastModified),
        ETag: obj.etag,
        StorageClass: 'STANDARD'
      });
    }

    if (this.verbose) {
      console.log(`[MemoryStorage] LIST prefix="${prefix}" (${contents.length} objects, ${commonPrefixes.size} prefixes)`);
    }

    return {
      Contents: contents,
      CommonPrefixes: Array.from(commonPrefixes).map(prefix => ({ Prefix: prefix })),
      IsTruncated: isTruncated,
      NextContinuationToken: nextContinuationToken,
      KeyCount: contents.length + commonPrefixes.size,
      MaxKeys: maxKeys,
      Prefix: prefix,
      Delimiter: delimiter
    };
  }

  /**
   * Create a snapshot of current state
   */
  snapshot() {
    const snapshot = {
      timestamp: new Date().toISOString(),
      bucket: this.bucket,
      objectCount: this.objects.size,
      objects: {}
    };

    for (const [key, obj] of this.objects.entries()) {
      snapshot.objects[key] = {
        body: obj.body.toString('base64'),
        metadata: obj.metadata,
        contentType: obj.contentType,
        etag: obj.etag,
        lastModified: obj.lastModified,
        size: obj.size,
        contentEncoding: obj.contentEncoding,
        contentLength: obj.contentLength
      };
    }

    return snapshot;
  }

  /**
   * Restore from a snapshot
   */
  restore(snapshot) {
    if (!snapshot || !snapshot.objects) {
      throw new Error('Invalid snapshot format');
    }

    this.objects.clear();

    for (const [key, obj] of Object.entries(snapshot.objects)) {
      this.objects.set(key, {
        body: Buffer.from(obj.body, 'base64'),
        metadata: obj.metadata,
        contentType: obj.contentType,
        etag: obj.etag,
        lastModified: obj.lastModified,
        size: obj.size,
        contentEncoding: obj.contentEncoding,
        contentLength: obj.contentLength
      });
    }

    if (this.verbose) {
      console.log(`[MemoryStorage] Restored snapshot with ${this.objects.size} objects`);
    }
  }

  /**
   * Save current state to disk
   */
  async saveToDisk(customPath) {
    const path = customPath || this.persistPath;
    if (!path) {
      throw new Error('No persist path configured');
    }

    const snapshot = this.snapshot();
    const json = JSON.stringify(snapshot, null, 2);

    const [ok, err] = await tryFn(() => writeFile(path, json, 'utf-8'));

    if (!ok) {
      throw new Error(`Failed to save to disk: ${err.message}`);
    }

    if (this.verbose) {
      console.log(`[MemoryStorage] Saved ${this.objects.size} objects to ${path}`);
    }

    return path;
  }

  /**
   * Load state from disk
   */
  async loadFromDisk(customPath) {
    const path = customPath || this.persistPath;
    if (!path) {
      throw new Error('No persist path configured');
    }

    const [ok, err, json] = await tryFn(() => readFile(path, 'utf-8'));

    if (!ok) {
      throw new Error(`Failed to load from disk: ${err.message}`);
    }

    const snapshot = JSON.parse(json);
    this.restore(snapshot);

    if (this.verbose) {
      console.log(`[MemoryStorage] Loaded ${this.objects.size} objects from ${path}`);
    }

    return snapshot;
  }

  /**
   * Get storage statistics
   */
  getStats() {
    let totalSize = 0;
    const keys = [];

    for (const [key, obj] of this.objects.entries()) {
      totalSize += obj.size;
      keys.push(key);
    }

    return {
      objectCount: this.objects.size,
      totalSize,
      totalSizeFormatted: this._formatBytes(totalSize),
      keys: keys.sort(),
      bucket: this.bucket
    };
  }

  /**
   * Format bytes for human reading
   */
  _formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Clear all objects
   */
  clear() {
    this.objects.clear();
    if (this.verbose) {
      console.log(`[MemoryStorage] Cleared all objects`);
    }
  }
}

export default MemoryStorage;
