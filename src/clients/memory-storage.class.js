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
import { MetadataLimitError, ResourceError, ValidationError } from '../errors.js';
import { createLogger } from '../concerns/logger.js';

export class MemoryStorage {
  constructor(config = {}) {
    /**
     * Main storage: Map<key, ObjectData>
     * ObjectData: { body, metadata, contentType, etag, lastModified, size, contentEncoding, contentLength }
     */
    this.objects = new Map();

    // Configuration
    this.bucket = config.bucket || 's3db';
    this.enforceLimits = Boolean(config.enforceLimits);
    this.metadataLimit = config.metadataLimit ?? 2048; // 2KB like S3
    this.maxObjectSize = config.maxObjectSize ?? 5 * 1024 * 1024 * 1024; // 5GB
    this.persistPath = config.persistPath;
    this.autoPersist = Boolean(config.autoPersist);
    this.verbose = Boolean(config.verbose);

    // 🪵 Logger initialization
    if (config.logger) {
      this.logger = config.logger;
    } else {
      const logLevel = this.verbose ? 'debug' : 'info';
      this.logger = createLogger({ name: 'MemoryStorage', level: logLevel });
    }
  }

  /**
   * Generate ETag (MD5 hash) for object body
   */
  _generateETag(body) {
    const buffer = this._toBuffer(body);
    return createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Convert arbitrary body input to Buffer without triggering coverage-opaque branches
   */
  _toBuffer(body) {
    if (Buffer.isBuffer(body)) {
      return body;
    }

    if (body === undefined || body === null) {
      return Buffer.alloc(0);
    }

    return Buffer.from(body);
  }

  /**
   * Ensure ETag matches AWS quoting
   */
  _formatEtag(etag) {
    return `"${etag}"`;
  }

  /**
   * Normalize ETag header value into array of hashes (quotes removed)
   */
  _normalizeEtagHeader(headerValue) {
    if (headerValue === undefined || headerValue === null) {
      return [];
    }

    return String(headerValue)
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => value.replace(/^W\//i, '').replace(/^['"]|['"]$/g, ''));
  }

  /**
   * Encode continuation token (base64) to mimic AWS opaque tokens
   */
  _encodeContinuationToken(key) {
    return Buffer.from(String(key), 'utf8').toString('base64');
  }

  /**
   * Decode continuation token, throwing ValidationError on malformed input
   */
  _decodeContinuationToken(token) {
    try {
      const normalized = String(token).trim();
      const decoded = Buffer.from(normalized, 'base64').toString('utf8');
      const reencoded = Buffer.from(decoded, 'utf8').toString('base64').replace(/=+$/, '');
      const normalizedNoPad = normalized.replace(/=+$/, '');

      if (!decoded || reencoded !== normalizedNoPad) {
        throw new Error('Invalid continuation token format');
      }

      return decoded;
    } catch (error) {
      throw new ValidationError('Invalid continuation token', {
        field: 'ContinuationToken',
        retriable: false,
        suggestion: 'Use the NextContinuationToken returned by a previous ListObjectsV2 response.',
        original: error
      });
    }
  }

  /**
   * Identify common prefix grouping when delimiter is provided
   */
  _extractCommonPrefix(prefix, delimiter, key) {
    /* c8 ignore next -- guard clause */
    if (!delimiter) return null;

    const hasPrefix = Boolean(prefix);
    if (hasPrefix && !key.startsWith(prefix)) {
      return null;
    }

    const remainder = hasPrefix ? key.slice(prefix.length) : key;
    const index = remainder.indexOf(delimiter);

    if (index === -1) {
      return null;
    }

    const baseLength = hasPrefix ? prefix.length : 0;
    return key.slice(0, baseLength + index + delimiter.length);
  }

  /**
   * Calculate metadata size in bytes
   */
  _calculateMetadataSize(metadata) {
    /* c8 ignore next -- guard clause */
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
  /* c8 ignore start */
  _validateLimits(body, metadata) {
    /* c8 ignore next -- limits opt-in */
    if (!this.enforceLimits) return;

    // Check metadata size
    const metadataSize = this._calculateMetadataSize(metadata);
    if (metadataSize > this.metadataLimit) {
      throw new MetadataLimitError('Metadata limit exceeded in memory storage', {
        bucket: this.bucket,
        totalSize: metadataSize,
        effectiveLimit: this.metadataLimit,
        operation: 'put',
        retriable: false,
        suggestion: 'Reduce metadata size or disable enforceLimits in MemoryClient configuration.'
      });
    }

    // Check object size
    const bodySize = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body || '', 'utf8');
    if (bodySize > this.maxObjectSize) {
      throw new ResourceError('Object size exceeds in-memory limit', {
        bucket: this.bucket,
        operation: 'put',
        size: bodySize,
        maxObjectSize: this.maxObjectSize,
        statusCode: 413,
        retriable: false,
        suggestion: 'Store smaller objects or increase maxObjectSize when instantiating MemoryClient.'
      });
    }
  }
  /* c8 ignore end */

  /**
   * Store an object
   */
  async put(key, { body, metadata, contentType, contentEncoding, contentLength, ifMatch, ifNoneMatch }) {
    // Validate limits
    this._validateLimits(body, metadata);

    // Check ifMatch (conditional put)
    const existing = this.objects.get(key);
    if (ifMatch !== undefined) {
      const expectedEtags = this._normalizeEtagHeader(ifMatch);
      const currentEtag = existing ? existing.etag : null;
      const matches = expectedEtags.length > 0 && currentEtag ? expectedEtags.includes(currentEtag) : false;

      if (!existing || !matches) {
        throw new ResourceError(`Precondition failed: ETag mismatch for key "${key}"`, {
          bucket: this.bucket,
          key,
          code: 'PreconditionFailed',
          statusCode: 412,
          retriable: false,
          suggestion: 'Fetch the latest object and retry with the current ETag in options.ifMatch.'
        });
      }
    }

    if (ifNoneMatch !== undefined) {
      const normalized = this._normalizeEtagHeader(ifNoneMatch);
      const targetValue = existing ? existing.etag : null;
      const shouldFail =
        (ifNoneMatch === '*' && Boolean(existing)) ||
        (normalized.length > 0 && existing && normalized.includes(targetValue));

      if (shouldFail) {
        throw new ResourceError(`Precondition failed: object already exists for key "${key}"`, {
          bucket: this.bucket,
          key,
          code: 'PreconditionFailed',
          statusCode: 412,
          retriable: false,
          suggestion: 'Use ifNoneMatch: "*" only when the object should not exist or remove the conditional header.'
        });
      }
    }

    const buffer = this._toBuffer(body);
    const etag = this._generateETag(buffer);
    const lastModified = new Date().toISOString();
    const size = buffer.length;

    const objectData = {
      body: buffer,
      /* c8 ignore next */
      metadata: metadata ? { ...metadata } : {},
      contentType: contentType || 'application/octet-stream',
      etag,
      lastModified,
      size,
      contentEncoding,
      /* c8 ignore next */
      contentLength: typeof contentLength === 'number' ? contentLength : size
    };

    this.objects.set(key, objectData);

    // 🪵 Debug: PUT operation
    this.logger.debug({ key, size, etag }, `PUT ${key} (${size} bytes, etag: ${etag})`);

    // Auto-persist if enabled
    /* c8 ignore next -- persistence optional */
    if (this.autoPersist && this.persistPath) {
      await this.saveToDisk();
    }

    return {
      ETag: this._formatEtag(etag),
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
      const error = new ResourceError(`Object not found: ${key}`, {
        bucket: this.bucket,
        key,
        code: 'NoSuchKey',
        statusCode: 404,
        retriable: false,
        suggestion: 'Ensure the key exists before attempting to read it.'
      });
      // Set error name to 'NoSuchKey' for S3 compatibility
      error.name = 'NoSuchKey';
      throw error;
    }

    // 🪵 Debug: GET operation
    this.logger.debug({ key, size: obj.size }, `GET ${key} (${obj.size} bytes)`);

    // Convert Buffer to Readable stream (same as real S3 Client)
    const bodyStream = Readable.from(obj.body);

    // Add AWS SDK compatible transformToString() method
    // This mimics the AWS SDK's SdkStreamMixin behavior
    bodyStream.transformToString = async (encoding = 'utf-8') => {
      const chunks = [];
      for await (const chunk of bodyStream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString(encoding);
    };

    // Add AWS SDK compatible transformToByteArray() method
    bodyStream.transformToByteArray = async () => {
      const chunks = [];
      for await (const chunk of bodyStream) {
        chunks.push(chunk);
      }
      return new Uint8Array(Buffer.concat(chunks));
    };

    // Add AWS SDK compatible transformToWebStream() method
    bodyStream.transformToWebStream = () => {
      return Readable.toWeb(bodyStream);
    };

    return {
      Body: bodyStream,
      Metadata: { ...obj.metadata },
      ContentType: obj.contentType,
      ContentLength: obj.size,
      ETag: this._formatEtag(obj.etag),
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
      const error = new ResourceError(`Object not found: ${key}`, {
        bucket: this.bucket,
        key,
        code: 'NoSuchKey',
        statusCode: 404,
        retriable: false,
        suggestion: 'Ensure the key exists before attempting to read it.'
      });
      // Set error name to 'NoSuchKey' for S3 compatibility
      error.name = 'NoSuchKey';
      throw error;
    }

    // 🪵 Debug: HEAD operation
    this.logger.debug({ key }, `HEAD ${key}`);

    return {
      Metadata: { ...obj.metadata },
      ContentType: obj.contentType,
      ContentLength: obj.size,
      ETag: this._formatEtag(obj.etag),
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
      throw new ResourceError(`Source object not found: ${from}`, {
        bucket: this.bucket,
        key: from,
        code: 'NoSuchKey',
        statusCode: 404,
        retriable: false,
        suggestion: 'Copy requires an existing source object. Verify the source key before retrying.'
      });
    }

    // Determine final metadata based on directive
    let finalMetadata = { ...source.metadata };
    if (metadataDirective === 'REPLACE' && metadata) {
      finalMetadata = metadata;
    } else if (metadata) {
      finalMetadata = { ...finalMetadata, ...metadata };
    }

    // Copy the object
    await this.put(to, {
      body: source.body,
      metadata: finalMetadata,
      contentType: contentType || source.contentType,
      contentEncoding: source.contentEncoding
    });

    // 🪵 Debug: COPY operation
    this.logger.debug({ from, to }, `COPY ${from} → ${to}`);

    const destination = this.objects.get(to);
    return {
      CopyObjectResult: {
        ETag: this._formatEtag(destination.etag),
        LastModified: new Date(destination.lastModified).toISOString()
      },
      BucketKeyEnabled: false,
      VersionId: null,
      ServerSideEncryption: null
    };
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

    // 🪵 Debug: DELETE operation
    this.logger.debug({ key, existed }, `DELETE ${key} (existed: ${existed})`);

    // Auto-persist if enabled
    /* c8 ignore next -- persistence optional */
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

    // 🪵 Debug: DELETE BATCH operation
    this.logger.debug({ deletedCount: deleted.length, errorCount: errors.length }, `DELETE BATCH (${deleted.length} deleted, ${errors.length} errors)`);

    return { Deleted: deleted, Errors: errors };
  }

  /**
   * List objects with prefix/delimiter support
   */
  async list({ prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null }) {
    const sortedKeys = Array.from(this.objects.keys()).sort();
    const prefixFilter = prefix || '';

    let filteredKeys = prefixFilter
      ? sortedKeys.filter(key => key.startsWith(prefixFilter))
      : sortedKeys;

    let startAfterKey = null;
    if (continuationToken) {
      startAfterKey = this._decodeContinuationToken(continuationToken);
    } else if (startAfter) {
      startAfterKey = startAfter;
    }

    if (startAfterKey) {
      filteredKeys = filteredKeys.filter(key => key > startAfterKey);
    }

    const contents = [];
    const commonPrefixes = new Set();
    let processed = 0;
    let lastKeyInPage = null;

    for (const key of filteredKeys) {
      if (processed >= maxKeys) {
        break;
      }

      const prefixEntry = delimiter ? this._extractCommonPrefix(prefixFilter, delimiter, key) : null;
      if (prefixEntry) {
        if (!commonPrefixes.has(prefixEntry)) {
          commonPrefixes.add(prefixEntry);
        }
        continue;
      }

      const obj = this.objects.get(key);
      contents.push({
        Key: key,
        Size: obj.size,
        LastModified: new Date(obj.lastModified),
        ETag: this._formatEtag(obj.etag),
        StorageClass: 'STANDARD'
      });
      processed++;
      lastKeyInPage = key;
    }

    const hasMoreKeys = filteredKeys.length > contents.length;
    const nextContinuationToken = hasMoreKeys && lastKeyInPage
      ? this._encodeContinuationToken(lastKeyInPage)
      : null;

    // 🪵 Debug: LIST operation
    this.logger.debug({ prefix, objectCount: contents.length, prefixCount: commonPrefixes.size, truncated: Boolean(nextContinuationToken) }, `LIST prefix="${prefix}" (${contents.length} objects, ${commonPrefixes.size} prefixes, truncated=${Boolean(nextContinuationToken)})`);

    return {
      Contents: contents,
      CommonPrefixes: Array.from(commonPrefixes).map(commonPrefix => ({ Prefix: commonPrefix })),
      IsTruncated: Boolean(nextContinuationToken),
      ContinuationToken: continuationToken || undefined,
      NextContinuationToken: nextContinuationToken,
      KeyCount: contents.length,
      MaxKeys: maxKeys,
      Prefix: prefix || undefined,
      Delimiter: delimiter || undefined,
      StartAfter: startAfter || undefined
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
      throw new ValidationError('Invalid snapshot format', {
        field: 'snapshot',
        retriable: false,
        suggestion: 'Provide the snapshot returned by MemoryStorage.snapshot() before calling restore().'
      });
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

    // 🪵 Debug: snapshot restored
    this.logger.debug({ objectCount: this.objects.size }, `Restored snapshot with ${this.objects.size} objects`);
  }

  /**
   * Save current state to disk
   */
  async saveToDisk(customPath) {
    const path = customPath || this.persistPath;
    if (!path) {
      throw new ValidationError('No persist path configured', {
        field: 'persistPath',
        retriable: false,
        suggestion: 'Provide a persistPath when creating MemoryClient or pass a custom path to saveToDisk().'
      });
    }

    const snapshot = this.snapshot();
    const json = JSON.stringify(snapshot, null, 2);

    const [ok, err] = await tryFn(() => writeFile(path, json, 'utf-8'));

    if (!ok) {
      throw new ResourceError(`Failed to save to disk: ${err.message}`, {
        bucket: this.bucket,
        operation: 'saveToDisk',
        statusCode: 500,
        retriable: false,
        suggestion: 'Check filesystem permissions and available disk space, then retry.',
        original: err
      });
    }

    // 🪵 Debug: saved to disk
    this.logger.debug({ objectCount: this.objects.size, path }, `Saved ${this.objects.size} objects to ${path}`);

    return path;
  }

  /**
   * Load state from disk
   */
  async loadFromDisk(customPath) {
    const path = customPath || this.persistPath;
    if (!path) {
      throw new ValidationError('No persist path configured', {
        field: 'persistPath',
        retriable: false,
        suggestion: 'Provide a persistPath when creating MemoryClient or pass a custom path to loadFromDisk().'
      });
    }

    const [ok, err, json] = await tryFn(() => readFile(path, 'utf-8'));

    if (!ok) {
      throw new ResourceError(`Failed to load from disk: ${err.message}`, {
        bucket: this.bucket,
        operation: 'loadFromDisk',
        statusCode: 500,
        retriable: false,
        suggestion: 'Verify the file exists and is readable, then retry.',
        original: err
      });
    }

    const snapshot = JSON.parse(json);
    this.restore(snapshot);

    // 🪵 Debug: loaded from disk
    this.logger.debug({ objectCount: this.objects.size, path }, `Loaded ${this.objects.size} objects from ${path}`);

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
    // 🪵 Debug: cleared all objects
    this.logger.debug('Cleared all objects');
  }
}

export default MemoryStorage;
