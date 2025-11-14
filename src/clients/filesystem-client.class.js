/**
 * FileSystemClient - Filesystem-based S3 Client Implementation
 *
 * Drop-in replacement for the standard S3 Client that stores everything on the local filesystem.
 * Implements the complete Client interface including all AWS SDK commands.
 * Uses hierarchical directory structure and .meta.json sidecar files for metadata.
 */

import path from 'path';
import EventEmitter from 'events';
import { chunk } from 'lodash-es';

import tryFn from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { mapAwsError, DatabaseError, BaseError } from '../errors.js';
import { TaskManager } from '../task-manager.class.js';
import { FileSystemStorage } from './filesystem-storage.class.js';

const pathPosix = path.posix;

// Global storage registry - share storage between FileSystemClient instances with same basePath
// This allows reconnection to work properly (simulates S3 persistence)
const globalStorageRegistry = new Map();

export class FileSystemClient extends EventEmitter {
  constructor(config = {}) {
    super();

    // Client configuration
    this.id = config.id || idGenerator(77);
    this.verbose = Boolean(config.verbose);

    // TaskManager for batch operations (FileSystemClient analog to OperationsPool)
    this.taskManager = new TaskManager({
      concurrency: config.concurrency || 5,
      retries: config.retries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      timeout: config.timeout ?? 30000,
      retryableErrors: config.retryableErrors || []
    });

    // Storage configuration
    this.basePath = config.basePath || './s3db-data';
    this.bucket = config.bucket || 's3db';
    this.keyPrefix = config.keyPrefix || '';
    this.region = config.region || 'local';
    this._keyPrefixForStrip = this.keyPrefix ? pathPosix.join(this.keyPrefix, '') : '';

    // Normalize basePath to absolute path
    this.basePath = path.resolve(this.basePath);

    // Get or create shared storage for this basePath
    // This allows multiple FileSystemClient instances to share the same data (simulating S3 persistence)
    if (!globalStorageRegistry.has(this.basePath)) {
      globalStorageRegistry.set(this.basePath, new FileSystemStorage({
        basePath: this.basePath,
        bucket: this.bucket,
        enforceLimits: config.enforceLimits || false,
        metadataLimit: config.metadataLimit || 2048,
        maxObjectSize: config.maxObjectSize || 5 * 1024 * 1024 * 1024,
        verbose: this.verbose,
        // ✨ Enhanced features (verticalizado only - v16+)
        compression: config.compression,
        ttl: config.ttl,
        locking: config.locking,
        backup: config.backup,
        journal: config.journal,
        stats: config.stats
      }));
    }

    this.storage = globalStorageRegistry.get(this.basePath);

    // Mock config object (for compatibility with Client interface)
    this.config = {
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      region: this.region,
      basePath: this.basePath,
      endpoint: `file://${this.basePath}`,
      forcePathStyle: true
    };

    if (this.verbose) {
      console.log(`[FileSystemClient] Initialized (id: ${this.id}, basePath: ${this.basePath}, bucket: ${this.bucket})`);
    }
  }

  /**
   * Simulate sendCommand from AWS SDK
   * Used by Database/Resource to send AWS SDK commands
   */
  async sendCommand(command) {
    const commandName = command.constructor.name;
    const input = command.input || {};

    this.emit('cl:request', commandName, input);
    this.emit('command.request', commandName, input);

    let response;

    try {
      // Route to appropriate handler based on command type
      switch (commandName) {
        case 'PutObjectCommand':
          response = await this._handlePutObject(input);
          break;
        case 'GetObjectCommand':
          response = await this._handleGetObject(input);
          break;
        case 'HeadObjectCommand':
          response = await this._handleHeadObject(input);
          break;
        case 'CopyObjectCommand':
          response = await this._handleCopyObject(input);
          break;
        case 'DeleteObjectCommand':
          response = await this._handleDeleteObject(input);
          break;
        case 'DeleteObjectsCommand':
          response = await this._handleDeleteObjects(input);
          break;
        case 'ListObjectsV2Command':
          response = await this._handleListObjects(input);
          break;
        default:
          throw new DatabaseError(`Unsupported command: ${commandName}`, {
            operation: 'sendCommand',
            statusCode: 400,
            retriable: false,
            suggestion: 'Use one of the supported commands: PutObject, GetObject, HeadObject, CopyObject, DeleteObject, DeleteObjects, or ListObjectsV2.'
          });
      }

      this.emit('cl:response', commandName, response, input);
      this.emit('command.response', commandName, response, input);
      return response;

    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }
      // Map errors to AWS SDK format
      const mappedError = mapAwsError(error, {
        bucket: this.bucket,
        key: input.Key,
        commandName,
        commandInput: input
      });
      throw mappedError;
    }
  }

  /**
   * PutObjectCommand handler
   */
  async _handlePutObject(input) {
    const key = this._applyKeyPrefix(input.Key);
    const metadata = this._encodeMetadata(input.Metadata || {});
    const contentType = input.ContentType;
    const body = input.Body;
    const contentEncoding = input.ContentEncoding;
    const contentLength = input.ContentLength;
    const ifMatch = input.IfMatch;
    const ifNoneMatch = input.IfNoneMatch;

    return await this.storage.put(key, {
      body,
      metadata,
      contentType,
      contentEncoding,
      contentLength,
      ifMatch,
      ifNoneMatch
    });
  }

  /**
   * GetObjectCommand handler
   */
  async _handleGetObject(input) {
    const key = this._applyKeyPrefix(input.Key);
    const response = await this.storage.get(key);
    return this._decodeMetadataResponse(response);
  }

  /**
   * HeadObjectCommand handler
   */
  async _handleHeadObject(input) {
    const key = this._applyKeyPrefix(input.Key);
    const response = await this.storage.head(key);
    return this._decodeMetadataResponse(response);
  }

  /**
   * CopyObjectCommand handler
   */
  async _handleCopyObject(input) {
    const { sourceBucket, sourceKey } = this._parseCopySource(input.CopySource);

    if (sourceBucket !== this.bucket) {
      throw new DatabaseError(`Cross-bucket copy is not supported in FileSystemClient (requested ${sourceBucket} → ${this.bucket})`, {
        operation: 'CopyObject',
        retriable: false,
        suggestion: 'Instantiate a FileSystemClient with the desired bucket or copy within the same bucket.'
      });
    }

    const destinationKey = this._applyKeyPrefix(input.Key);
    const encodedMetadata = this._encodeMetadata(input.Metadata);

    return await this.storage.copy(sourceKey, destinationKey, {
      metadata: encodedMetadata,
      metadataDirective: input.MetadataDirective,
      contentType: input.ContentType
    });
  }

  /**
   * DeleteObjectCommand handler
   */
  async _handleDeleteObject(input) {
    const key = this._applyKeyPrefix(input.Key);
    return await this.storage.delete(key);
  }

  /**
   * DeleteObjectsCommand handler
   */
  async _handleDeleteObjects(input) {
    const objects = input.Delete?.Objects || [];
    const keys = objects.map(obj => this._applyKeyPrefix(obj.Key));
    return await this.storage.deleteMultiple(keys);
  }

  /**
   * ListObjectsV2Command handler
   */
  async _handleListObjects(input) {
    const fullPrefix = this._applyKeyPrefix(input.Prefix || '');
    const params = {
      prefix: fullPrefix,
      delimiter: input.Delimiter,
      maxKeys: input.MaxKeys,
      continuationToken: input.ContinuationToken
    };

    if (input.StartAfter) {
      params.startAfter = this._applyKeyPrefix(input.StartAfter);
    }

    const response = await this.storage.list(params);
    return this._normalizeListResponse(response);
  }

  /**
   * Put an object (Client interface method)
   */
  async putObject({ key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch }) {
    const fullKey = this._applyKeyPrefix(key);
    const stringMetadata = this._encodeMetadata(metadata) || {};

    const input = { Key: key, Metadata: metadata, ContentType: contentType, Body: body, ContentEncoding: contentEncoding, ContentLength: contentLength, IfMatch: ifMatch, IfNoneMatch: ifNoneMatch };

    const response = await this.storage.put(fullKey, {
      body,
      metadata: stringMetadata,
      contentType,
      contentEncoding,
      contentLength,
      ifMatch,
      ifNoneMatch
    });

    // Emit cl:response event for CostsPlugin compatibility
    this.emit('cl:response', 'PutObjectCommand', response, input);

    return response;
  }

  /**
   * Get an object (Client interface method)
   */
  async getObject(key) {
    const fullKey = this._applyKeyPrefix(key);
    const input = { Key: key };
    const response = await this.storage.get(fullKey);
    const decodedResponse = this._decodeMetadataResponse(response);

    // Emit cl:response event for CostsPlugin compatibility
    this.emit('cl:response', 'GetObjectCommand', decodedResponse, input);

    return decodedResponse;
  }

  /**
   * Head object (get metadata only)
   */
  async headObject(key) {
    const fullKey = this._applyKeyPrefix(key);
    const input = { Key: key };
    const response = await this.storage.head(fullKey);
    const decodedResponse = this._decodeMetadataResponse(response);

    // Emit cl:response event for CostsPlugin compatibility
    this.emit('cl:response', 'HeadObjectCommand', decodedResponse, input);

    return decodedResponse;
  }

  /**
   * Copy an object
   */
  async copyObject({ from, to, metadata, metadataDirective, contentType }) {
    const fullFrom = this._applyKeyPrefix(from);
    const fullTo = this._applyKeyPrefix(to);
    const encodedMetadata = this._encodeMetadata(metadata);

    const input = { CopySource: from, Key: to, Metadata: metadata, MetadataDirective: metadataDirective, ContentType: contentType };

    const response = await this.storage.copy(fullFrom, fullTo, {
      metadata: encodedMetadata,
      metadataDirective,
      contentType
    });

    // Emit cl:response event for CostsPlugin compatibility
    this.emit('cl:response', 'CopyObjectCommand', response, input);

    return response;
  }

  /**
   * Check if object exists
   */
  async exists(key) {
    const fullKey = this._applyKeyPrefix(key);
    return this.storage.exists(fullKey);
  }

  /**
   * Delete an object
   */
  async deleteObject(key) {
    const fullKey = this._applyKeyPrefix(key);
    const input = { Key: key };
    const response = await this.storage.delete(fullKey);

    // Emit cl:response event for CostsPlugin compatibility
    this.emit('cl:response', 'DeleteObjectCommand', response, input);

    return response;
  }

  /**
   * Delete multiple objects (batch)
   */
  async deleteObjects(keys) {
    // Add keyPrefix to all keys
    const fullKeys = keys.map(key => this._applyKeyPrefix(key));

    const input = { Delete: { Objects: keys.map(key => ({ Key: key })) } };

    // Split into batches for parallel processing
    const batches = chunk(fullKeys, this.taskManager.concurrency);
    const allResults = { Deleted: [], Errors: [] };

    const { results } = await this.taskManager.process(
      batches,
      async (batch) => {
        return await this.storage.deleteMultiple(batch);
      }
    );

    // Merge results
    for (const result of results) {
      allResults.Deleted.push(...result.Deleted.map(item => ({ Key: this._stripKeyPrefix(item.Key) })));
      allResults.Errors.push(...result.Errors);
    }

    // Emit cl:response event for CostsPlugin compatibility
    this.emit('cl:response', 'DeleteObjectsCommand', allResults, input);

    return allResults;
  }

  /**
   * List objects with pagination support
   */
  async listObjects({ prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = {}) {
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const listParams = {
      prefix: fullPrefix,
      delimiter,
      maxKeys,
      continuationToken
    };

    if (startAfter) {
      listParams.startAfter = this._applyKeyPrefix(startAfter);
    }

    const input = { Prefix: prefix, Delimiter: delimiter, MaxKeys: maxKeys, ContinuationToken: continuationToken, StartAfter: startAfter };

    const response = await this.storage.list(listParams);
    const normalized = this._normalizeListResponse(response);

    // Emit cl:response event for CostsPlugin compatibility
    this.emit('cl:response', 'ListObjectsV2Command', normalized, input);

    return normalized;
  }

  /**
   * Get a page of keys with offset/limit pagination
   */
  async getKeysPage(params = {}) {
    const { prefix = '', offset = 0, amount = 100 } = params;
    let keys = [];
    let truncated = true;
    let continuationToken;

    // If offset > 0, need to skip ahead
    if (offset > 0) {
      const fullPrefix = this._applyKeyPrefix(prefix || '');
      const response = await this.storage.list({
        prefix: fullPrefix,
        maxKeys: offset + amount
      });
      keys = (response.Contents || [])
        .map(x => this._stripKeyPrefix(x.Key))
        .slice(offset, offset + amount);
      truncated = Boolean(response.NextContinuationToken);
      continuationToken = response.NextContinuationToken;
    } else {
      // Regular fetch with amount as maxKeys
      while (truncated) {
        const remaining = amount - keys.length;
        if (remaining <= 0) {
          break;
        }

        const res = await this.listObjects({
          prefix,
          continuationToken,
          maxKeys: remaining
        });
        if (res.Contents) {
          keys = keys.concat(res.Contents.map(x => x.Key));
        }
        truncated = res.IsTruncated || false;
        continuationToken = res.NextContinuationToken;
        if (keys.length >= amount) {
          keys = keys.slice(0, amount);
          break;
        }
      }
    }

    this.emit('cl:GetKeysPage', keys, params);
    return keys;
  }

  /**
   * Get all keys with a given prefix
   */
  async getAllKeys({ prefix = '' }) {
    const fullPrefix = this._applyKeyPrefix(prefix || '');
    const response = await this.storage.list({
      prefix: fullPrefix,
      maxKeys: Number.MAX_SAFE_INTEGER
    });

    const keys = (response.Contents || []).map(x => this._stripKeyPrefix(x.Key));

    this.emit('cl:GetAllKeys', keys, { prefix });
    return keys;
  }

  /**
   * Count total objects under a prefix
   */
  async count({ prefix = '' } = {}) {
    const keys = await this.getAllKeys({ prefix });
    const count = keys.length;
    this.emit('cl:Count', count, { prefix });
    return count;
  }

  /**
   * Delete all objects under a prefix
   */
  async deleteAll({ prefix = '' } = {}) {
    const keys = await this.getAllKeys({ prefix });
    let totalDeleted = 0;

    if (keys.length > 0) {
      const result = await this.deleteObjects(keys);
      totalDeleted = result.Deleted.length;

      this.emit('deleteAll', {
        prefix,
        batch: totalDeleted,
        total: totalDeleted
      });
    }

    this.emit('deleteAllComplete', {
      prefix,
      totalDeleted
    });

    return totalDeleted;
  }

  /**
   * Get continuation token after skipping offset items
   */
  async getContinuationTokenAfterOffset({ prefix = '', offset = 1000 } = {}) {
    if (offset === 0) return null;

    const keys = await this.getAllKeys({ prefix });

    // If offset is beyond available keys, return null
    if (offset >= keys.length) {
      this.emit('cl:GetContinuationTokenAfterOffset', null, { prefix, offset });
      return null;
    }

    // Return the key at offset position as continuation token
    const keyForToken = keys[offset];
    const fullKey = this._applyKeyPrefix(keyForToken || '');
    const token = this._encodeContinuationTokenKey(fullKey);
    this.emit('cl:GetContinuationTokenAfterOffset', token, { prefix, offset });
    return token;
  }

  /**
   * Move a single object (copy + delete)
   */
  async moveObject({ from, to }) {
    const [ok, err] = await tryFn(async () => {
      await this.copyObject({ from, to, metadataDirective: 'COPY' });
      await this.deleteObject(from);
    });

    if (!ok) {
      throw new DatabaseError('Unknown error in moveObject', {
        bucket: this.bucket,
        from,
        to,
        original: err
      });
    }

    return true;
  }

  /**
   * Move all objects under a prefix
   */
  async moveAllObjects({ prefixFrom, prefixTo }) {
    const keys = await this.getAllKeys({ prefix: prefixFrom });
    const { results, errors } = await this.taskManager.process(
      keys,
      async (key) => {
        const to = key.replace(prefixFrom, prefixTo);
        await this.moveObject({ from: key, to });
        return { from: key, to };
      }
    );

    this.emit('moveAllObjects', { results, errors });

    if (errors.length > 0) {
      const error = new Error('Some objects could not be moved');
      error.context = {
        bucket: this.bucket,
        operation: 'moveAllObjects',
        prefixFrom,
        prefixTo,
        totalKeys: keys.length,
        failedCount: errors.length,
        successCount: results.length,
        errors
      };
      throw error;
    }

    return results;
  }

  /**
   * Clear all objects (delete entire basePath)
   */
  async clear() {
    await this.storage.clear();
  }

  /**
   * Encode metadata values using s3db metadata encoding
   * Note: S3 metadata keys are case-insensitive and stored as lowercase
   */
  _encodeMetadata(metadata) {
    if (!metadata) return undefined;

    const encoded = {};
    for (const [rawKey, value] of Object.entries(metadata)) {
      const validKey = String(rawKey).replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      const { encoded: encodedValue } = metadataEncode(value);
      encoded[validKey] = encodedValue;
    }
    return encoded;
  }

  /**
   * Decode metadata in S3 responses
   */
  _decodeMetadataResponse(response) {
    const decodedMetadata = {};
    if (response.Metadata) {
      for (const [k, v] of Object.entries(response.Metadata)) {
        decodedMetadata[k] = metadataDecode(v);
      }
    }

    return {
      ...response,
      Metadata: decodedMetadata
    };
  }

  /**
   * Apply configured keyPrefix to a storage key
   */
  _applyKeyPrefix(key = '') {
    if (!this.keyPrefix) {
      if (key === undefined || key === null) {
        return '';
      }
      return key;
    }
    if (key === undefined || key === null || key === '') {
      return pathPosix.join(this.keyPrefix, '');
    }

    return pathPosix.join(this.keyPrefix, key);
  }

  /**
   * Strip configured keyPrefix from a storage key
   */
  _stripKeyPrefix(key = '') {
    if (!this.keyPrefix) {
      return key;
    }

    const normalizedPrefix = this._keyPrefixForStrip;
    if (normalizedPrefix && key.startsWith(normalizedPrefix)) {
      return key.slice(normalizedPrefix.length).replace(/^\/+/, '');
    }

    return key;
  }

  /**
   * Encode continuation token (base64) to mimic AWS S3
   */
  _encodeContinuationTokenKey(key) {
    return Buffer.from(String(key), 'utf8').toString('base64');
  }

  /**
   * Parse CopySource header and return bucket/key
   */
  _parseCopySource(copySource = '') {
    const trimmedSource = String(copySource).replace(/^\//, '');
    const [sourcePath] = trimmedSource.split('?');
    const decodedSource = decodeURIComponent(sourcePath);
    const [sourceBucket, ...sourceKeyParts] = decodedSource.split('/');

    if (!sourceBucket || sourceKeyParts.length === 0) {
      throw new DatabaseError(`Invalid CopySource value: ${copySource}`, {
        operation: 'CopyObject',
        retriable: false,
        suggestion: 'Provide CopySource in the format "<bucket>/<key>" as expected by AWS S3.'
      });
    }

    return {
      sourceBucket,
      sourceKey: sourceKeyParts.join('/')
    };
  }

  /**
   * Normalize storage list response into client-level structure
   */
  _normalizeListResponse(response) {
    const rawContents = Array.isArray(response.Contents) ? response.Contents : [];
    const contents = rawContents.map(item => ({
      ...item,
      Key: this._stripKeyPrefix(item.Key)
    }));

    const rawPrefixes = Array.isArray(response.CommonPrefixes) ? response.CommonPrefixes : [];
    const commonPrefixes = rawPrefixes.map(({ Prefix }) => ({
      Prefix: this._stripKeyPrefix(Prefix)
    }));

    return {
      Contents: contents,
      CommonPrefixes: commonPrefixes,
      IsTruncated: response.IsTruncated,
      ContinuationToken: response.ContinuationToken,
      NextContinuationToken: response.NextContinuationToken,
      KeyCount: contents.length,
      MaxKeys: response.MaxKeys,
      Prefix: this.keyPrefix ? undefined : response.Prefix,
      Delimiter: response.Delimiter,
      StartAfter: response.StartAfter
    };
  }

  /**
   * ✨ Get storage statistics (from enhanced FileSystemStorage)
   */
  getStats() {
    return this.storage.getStats();
  }

  /**
   * ✨ Cleanup resources (stop cron jobs in storage)
   */
  destroy() {
    if (this.storage && typeof this.storage.destroy === 'function') {
      this.storage.destroy();
    }
  }

  /**
   * Clear all shared storage for a specific basePath (useful for testing)
   * @param {string} basePath - Base path to clear
   */
  static clearPathStorage(basePath) {
    const absolutePath = path.resolve(basePath);
    const storage = globalStorageRegistry.get(absolutePath);
    if (storage && typeof storage.destroy === 'function') {
      storage.destroy();
    }
    globalStorageRegistry.delete(absolutePath);
  }

  /**
   * Clear ALL shared storage (useful for test cleanup)
   */
  static clearAllStorage() {
    // Destroy all storage instances
    for (const storage of globalStorageRegistry.values()) {
      if (typeof storage.destroy === 'function') {
        storage.destroy();
      }
    }
    globalStorageRegistry.clear();
  }
}

export default FileSystemClient;
