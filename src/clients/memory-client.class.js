/**
 * MemoryClient - In-Memory S3 Client Implementation
 *
 * Drop-in replacement for the standard S3 Client that stores everything in memory.
 * Implements the complete Client interface including all AWS SDK commands.
 */

import path from 'path';
import EventEmitter from 'events';
import { chunk } from 'lodash-es';

import tryFn from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { mapAwsError, DatabaseError, BaseError } from '../errors.js';
import { TaskManager } from '../task-manager.class.js';
import { MemoryStorage } from './memory-storage.class.js';

const pathPosix = path.posix;

// Global storage registry - share storage between MemoryClient instances with same bucket
// This allows reconnection to work properly (simulates S3 persistence)
const globalStorageRegistry = new Map();

export class MemoryClient extends EventEmitter {
  constructor(config = {}) {
    super();

    // Client configuration
    this.id = config.id || idGenerator(77);
    this.verbose = Boolean(config.verbose);

    // TaskManager for batch operations (MemoryClient analog to OperationsPool)
    this.taskManager = new TaskManager({
      concurrency: config.concurrency || 5,
      retries: config.retries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      timeout: config.timeout ?? 30000,
      retryableErrors: config.retryableErrors || []
    });

    // Storage configuration
    this.bucket = config.bucket || 's3db';
    this.keyPrefix = config.keyPrefix || '';
    this.region = config.region || 'us-east-1';
    this._keyPrefixForStrip = this.keyPrefix ? pathPosix.join(this.keyPrefix, '') : '';

    // Get or create shared storage for this bucket
    // This allows multiple MemoryClient instances to share the same data (simulating S3 persistence)
    if (!globalStorageRegistry.has(this.bucket)) {
      globalStorageRegistry.set(this.bucket, new MemoryStorage({
        bucket: this.bucket,
        enforceLimits: config.enforceLimits || false,
        metadataLimit: config.metadataLimit || 2048,
        maxObjectSize: config.maxObjectSize || 5 * 1024 * 1024 * 1024,
        persistPath: config.persistPath,
        autoPersist: config.autoPersist || false,
        verbose: this.verbose
      }));
    }

    this.storage = globalStorageRegistry.get(this.bucket);

    // Mock config object (for compatibility with Client interface)
    this.config = {
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      region: this.region,
      endpoint: 'memory://localhost',
      forcePathStyle: true
    };

    if (this.verbose) {
      console.log(`[MemoryClient] Initialized (id: ${this.id}, bucket: ${this.bucket})`);
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
      throw new DatabaseError(`Cross-bucket copy is not supported in MemoryClient (requested ${sourceBucket} → ${this.bucket})`, {
        operation: 'CopyObject',
        retriable: false,
        suggestion: 'Instantiate a MemoryClient with the desired bucket or copy within the same bucket.'
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
   * Create a snapshot of current storage state
   */
  snapshot() {
    return this.storage.snapshot();
  }

  /**
   * Restore from a snapshot
   */
  restore(snapshot) {
    return this.storage.restore(snapshot);
  }

  /**
   * Save current state to disk (persistence)
   */
  async saveToDisk(path) {
    return await this.storage.saveToDisk(path);
  }

  /**
   * Load state from disk
   */
  async loadFromDisk(path) {
    return await this.storage.loadFromDisk(path);
  }

  /**
   * Export to BackupPlugin-compatible format
   */
  async exportBackup(outputDir, options = {}) {
    const { mkdir, writeFile } = await import('fs/promises');
    const zlib = await import('zlib');
    const { promisify } = await import('util');
    const gzip = promisify(zlib.gzip);

    await mkdir(outputDir, { recursive: true });

    const compress = options.compress !== false;
    const database = options.database;
    const resourceFilter = options.resources;

    // Get all keys grouped by resource
    const allKeys = await this.getAllKeys({});
    const resourceMap = new Map();

    // Group keys by resource name
    for (const key of allKeys) {
      const match = key.match(/^resource=([^/]+)\//);
      if (match) {
        const resourceName = match[1];
        if (!resourceFilter || resourceFilter.includes(resourceName)) {
          if (!resourceMap.has(resourceName)) {
            resourceMap.set(resourceName, []);
          }
          resourceMap.get(resourceName).push(key);
        }
      }
    }

    const exportedFiles = {};
    const resourceStats = {};

    // Export each resource to JSONL format
    for (const [resourceName, keys] of resourceMap.entries()) {
      const records = [];

      // Get resource from database if available (for proper field decoding)
      const resource = database && database.resources && database.resources[resourceName];

      for (const key of keys) {
        // Extract id from key (e.g., resource=products/id=pr1 -> pr1)
        const idMatch = key.match(/\/id=([^/]+)/);
        let recordId = null;
        if (idMatch && idMatch[1]) {
          recordId = idMatch[1];
        }

        let record;

        // If resource is available, use its get() method for proper field name decoding
        if (resource && recordId) {
          try {
            record = await resource.get(recordId);
          } catch {
            if (this.verbose) {
              console.warn(`Failed to get record ${recordId} from resource ${resourceName}, using fallback`);
            }
            record = null;
          }
        }

        // Fallback: manually reconstruct from metadata and body
        if (!record) {
          const obj = await this.getObject(key);
          record = { ...obj.Metadata };

          // Include id in record if extracted from key
          if (recordId && !record.id) {
            record.id = recordId;
          }

          // If body exists, parse it
          if (obj.Body) {
            const chunks = [];
            for await (const chunk of obj.Body) {
              chunks.push(chunk);
            }
            const bodyBuffer = Buffer.concat(chunks);

            // Try to parse as JSON if it looks like JSON
            const bodyStr = bodyBuffer.toString('utf-8');
            if (bodyStr.startsWith('{') || bodyStr.startsWith('[')) {
              try {
                const bodyData = JSON.parse(bodyStr);
                Object.assign(record, bodyData);
              } catch {
                // If not JSON, store as _body field
                record._body = bodyStr;
              }
            } else if (bodyStr) {
              record._body = bodyStr;
            }
          }
        }

        records.push(record);
      }

      // Convert to JSONL (newline-delimited JSON)
      const jsonl = records.map(r => JSON.stringify(r)).join('\n');
      const filename = compress ? `${resourceName}.jsonl.gz` : `${resourceName}.jsonl`;
      const filePath = `${outputDir}/${filename}`;

      // Write file (compressed or not)
      if (compress) {
        const compressed = await gzip(jsonl);
        await writeFile(filePath, compressed);
      } else {
        await writeFile(filePath, jsonl, 'utf-8');
      }

      exportedFiles[resourceName] = filePath;
      resourceStats[resourceName] = {
        recordCount: records.length,
        fileSize: compress ? (await gzip(jsonl)).length : Buffer.byteLength(jsonl)
      };
    }

    // Create s3db.json metadata file
    const s3dbMetadata = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      bucket: this.bucket,
      keyPrefix: this.keyPrefix || '',
      compressed: compress,
      resources: {},
      totalRecords: 0,
      totalSize: 0
    };

    // Add database schemas if available
    if (database && database.resources) {
      for (const [resourceName, resource] of Object.entries(database.resources)) {
        if (resourceMap.has(resourceName)) {
          s3dbMetadata.resources[resourceName] = {
            schema: resource.schema ? {
              attributes: resource.schema.attributes,
              partitions: resource.schema.partitions,
              behavior: resource.schema.behavior,
              timestamps: resource.schema.timestamps
            } : null,
            stats: resourceStats[resourceName]
          };
        }
      }
    } else {
      // No database instance, just add stats
      for (const [resourceName, stats] of Object.entries(resourceStats)) {
        s3dbMetadata.resources[resourceName] = { stats };
      }
    }

    // Calculate totals
    for (const stats of Object.values(resourceStats)) {
      s3dbMetadata.totalRecords += stats.recordCount;
      s3dbMetadata.totalSize += stats.fileSize;
    }

    // Write s3db.json
    const s3dbPath = `${outputDir}/s3db.json`;
    await writeFile(s3dbPath, JSON.stringify(s3dbMetadata, null, 2), 'utf-8');

    return {
      manifest: s3dbPath,
      files: exportedFiles,
      stats: s3dbMetadata,
      resourceCount: resourceMap.size,
      totalRecords: s3dbMetadata.totalRecords,
      totalSize: s3dbMetadata.totalSize
    };
  }

  /**
   * Import from BackupPlugin-compatible format
   */
  async importBackup(backupDir, options = {}) {
    const { readFile, readdir } = await import('fs/promises');
    const zlib = await import('zlib');
    const { promisify } = await import('util');
    const gunzip = promisify(zlib.gunzip);

    // Clear existing data if requested
    if (options.clear) {
      this.clear();
    }

    // Read s3db.json metadata
    const s3dbPath = `${backupDir}/s3db.json`;
    const s3dbContent = await readFile(s3dbPath, 'utf-8');
    const metadata = JSON.parse(s3dbContent);

    const database = options.database;
    const resourceFilter = options.resources;
    const importStats = {
      resourcesImported: 0,
      recordsImported: 0,
      errors: []
    };

    // Recreate resources if database instance provided
    if (database && metadata.resources) {
      for (const [resourceName, resourceMeta] of Object.entries(metadata.resources)) {
        /* c8 ignore next -- helper coverage exercised separately */
        if (!this._shouldProcessResource(resourceFilter, resourceName)) continue;

        if (resourceMeta.schema) {
          try {
            await database.createResource({
              name: resourceName,
              ...resourceMeta.schema
            });
          } catch (error) {
            // Resource might already exist, that's ok
            if (this.verbose) {
              console.warn(`Failed to create resource ${resourceName} during import: ${error.message}`);
            }
          }
        }
      }
    }

    // Read all files in backup directory
    const files = await readdir(backupDir);

    // Process each JSONL file
    for (const file of files) {
      if (!file.endsWith('.jsonl') && !file.endsWith('.jsonl.gz')) continue;

      const resourceName = file.replace(/\.jsonl(\.gz)?$/, '');
      /* c8 ignore next -- helper coverage exercised separately */
      if (!this._shouldProcessResource(resourceFilter, resourceName)) continue;

      const filePath = `${backupDir}/${file}`;
      let content = await readFile(filePath);

      // Decompress if .gz
      if (file.endsWith('.gz')) {
        content = await gunzip(content);
      }

      // Parse JSONL (one JSON per line)
      const jsonl = content.toString('utf-8');
      const lines = jsonl.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const record = JSON.parse(line);

          // Extract id or use generated one
          let id;
          if (record.id) {
            id = record.id;
          } else if (record._id) {
            id = record._id;
          } else {
            id = `imported_${Date.now()}_${Math.random()}`;
          }

          // Separate _body from other fields
          const { _body, id: _, _id: __, ...metadataRecord } = record;
          let bodyBuffer;
          if (typeof _body === 'string') {
            bodyBuffer = Buffer.from(_body);
          }

          await this.putObject({
            key: `resource=${resourceName}/id=${id}`,
            metadata: metadataRecord,
            body: bodyBuffer
          });

          importStats.recordsImported++;
        } catch (error) {
          importStats.errors.push({
            resource: resourceName,
            error: error.message,
            line
          });
        }
      }

      importStats.resourcesImported++;
    }

    return importStats;
  }

  /**
   * Get storage statistics
   */
  getStats() {
    return this.storage.getStats();
  }

  /**
   * Clear all objects
   */
  clear() {
    this.storage.clear();
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

  _shouldProcessResource(resourceFilter, resourceName) {
    if (!Array.isArray(resourceFilter) || resourceFilter.length === 0) {
      return true;
    }

    return resourceFilter.includes(resourceName);
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
  /* c8 ignore start */
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
  /* c8 ignore end */

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
   * Clear all shared storage for a specific bucket (useful for testing)
   * @param {string} bucket - Bucket name to clear
   */
  static clearBucketStorage(bucket) {
    globalStorageRegistry.delete(bucket);
  }

  /**
   * Clear ALL shared storage (useful for test cleanup)
   */
  static clearAllStorage() {
    globalStorageRegistry.clear();
  }
}

export default MemoryClient;
