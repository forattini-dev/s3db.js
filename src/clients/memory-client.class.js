/**
 * MemoryClient - In-Memory S3 Client Implementation
 *
 * Drop-in replacement for the standard S3 Client that stores everything in memory.
 * Implements the complete Client interface including all AWS SDK commands.
 *
 * Usage:
 *   import { Database } from 's3db.js';
 *   import { MemoryClient } from 's3db.js/plugins/emulator';
 *
 *   const db = new Database({ client: new MemoryClient() });
 *   await db.connect();
 */

import path from 'path';
import EventEmitter from 'events';
import { chunk } from 'lodash-es';
import { PromisePool } from '@supercharge/promise-pool';

import tryFn from '../concerns/try-fn.js';
import { idGenerator } from '../concerns/id.js';
import { metadataEncode, metadataDecode } from '../concerns/metadata-encoding.js';
import { mapAwsError } from '../errors.js';
import { MemoryStorage } from './memory-storage.class.js';

/**
 * MemoryClient - simulates S3Client entirely in memory
 */
export class MemoryClient extends EventEmitter {
  constructor(config = {}) {
    super();

    // Client configuration
    this.id = config.id || idGenerator(77);
    this.verbose = config.verbose || false;
    this.parallelism = config.parallelism || 10;

    // Storage configuration
    this.bucket = config.bucket || 's3db';
    this.keyPrefix = config.keyPrefix || '';
    this.region = config.region || 'us-east-1';

    // Create internal storage engine
    this.storage = new MemoryStorage({
      bucket: this.bucket,
      enforceLimits: config.enforceLimits || false,
      metadataLimit: config.metadataLimit || 2048,
      maxObjectSize: config.maxObjectSize || 5 * 1024 * 1024 * 1024,
      persistPath: config.persistPath,
      autoPersist: config.autoPersist || false,
      verbose: this.verbose
    });

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
          throw new Error(`Unsupported command: ${commandName}`);
      }

      this.emit('command.response', commandName, response, input);
      return response;

    } catch (error) {
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
    const key = input.Key;
    const metadata = input.Metadata || {};
    const contentType = input.ContentType;
    const body = input.Body;
    const contentEncoding = input.ContentEncoding;
    const contentLength = input.ContentLength;
    const ifMatch = input.IfMatch;

    return await this.storage.put(key, {
      body,
      metadata,
      contentType,
      contentEncoding,
      contentLength,
      ifMatch
    });
  }

  /**
   * GetObjectCommand handler
   */
  async _handleGetObject(input) {
    const key = input.Key;
    return await this.storage.get(key);
  }

  /**
   * HeadObjectCommand handler
   */
  async _handleHeadObject(input) {
    const key = input.Key;
    return await this.storage.head(key);
  }

  /**
   * CopyObjectCommand handler
   */
  async _handleCopyObject(input) {
    // Parse source: "bucket/key" format
    const copySource = input.CopySource;
    const parts = copySource.split('/');
    const sourceKey = parts.slice(1).join('/'); // Remove bucket part

    const destinationKey = input.Key;
    const metadata = input.Metadata;
    const metadataDirective = input.MetadataDirective;
    const contentType = input.ContentType;

    return await this.storage.copy(sourceKey, destinationKey, {
      metadata,
      metadataDirective,
      contentType
    });
  }

  /**
   * DeleteObjectCommand handler
   */
  async _handleDeleteObject(input) {
    const key = input.Key;
    return await this.storage.delete(key);
  }

  /**
   * DeleteObjectsCommand handler
   */
  async _handleDeleteObjects(input) {
    const objects = input.Delete?.Objects || [];
    const keys = objects.map(obj => obj.Key);
    return await this.storage.deleteMultiple(keys);
  }

  /**
   * ListObjectsV2Command handler
   */
  async _handleListObjects(input) {
    const fullPrefix = this.keyPrefix && input.Prefix
      ? path.join(this.keyPrefix, input.Prefix)
      : (this.keyPrefix || input.Prefix || '');

    return await this.storage.list({
      prefix: fullPrefix,
      delimiter: input.Delimiter,
      maxKeys: input.MaxKeys,
      continuationToken: input.ContinuationToken
    });
  }

  /**
   * Put an object (Client interface method)
   */
  async putObject({ key, metadata, contentType, body, contentEncoding, contentLength, ifMatch }) {
    const fullKey = this.keyPrefix ? path.join(this.keyPrefix, key) : key;

    // Encode metadata using s3db encoding
    const stringMetadata = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, '_');
        const { encoded } = metadataEncode(v);
        stringMetadata[validKey] = encoded;
      }
    }

    const response = await this.storage.put(fullKey, {
      body,
      metadata: stringMetadata,
      contentType,
      contentEncoding,
      contentLength,
      ifMatch
    });

    this.emit('putObject', null, { key, metadata, contentType, body, contentEncoding, contentLength });

    return response;
  }

  /**
   * Get an object (Client interface method)
   */
  async getObject(key) {
    const fullKey = this.keyPrefix ? path.join(this.keyPrefix, key) : key;
    const response = await this.storage.get(fullKey);

    // Decode metadata
    const decodedMetadata = {};
    if (response.Metadata) {
      for (const [k, v] of Object.entries(response.Metadata)) {
        decodedMetadata[k] = metadataDecode(v);
      }
    }

    this.emit('getObject', null, { key });

    return {
      ...response,
      Metadata: decodedMetadata
    };
  }

  /**
   * Head object (get metadata only)
   */
  async headObject(key) {
    const fullKey = this.keyPrefix ? path.join(this.keyPrefix, key) : key;
    const response = await this.storage.head(fullKey);

    // Decode metadata
    const decodedMetadata = {};
    if (response.Metadata) {
      for (const [k, v] of Object.entries(response.Metadata)) {
        decodedMetadata[k] = metadataDecode(v);
      }
    }

    this.emit('headObject', null, { key });

    return {
      ...response,
      Metadata: decodedMetadata
    };
  }

  /**
   * Copy an object
   */
  async copyObject({ from, to, metadata, metadataDirective, contentType }) {
    const fullFrom = this.keyPrefix ? path.join(this.keyPrefix, from) : from;
    const fullTo = this.keyPrefix ? path.join(this.keyPrefix, to) : to;

    // Encode new metadata if provided
    const encodedMetadata = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        const validKey = String(k).replace(/[^a-zA-Z0-9\-_]/g, '_');
        const { encoded } = metadataEncode(v);
        encodedMetadata[validKey] = encoded;
      }
    }

    const response = await this.storage.copy(fullFrom, fullTo, {
      metadata: encodedMetadata,
      metadataDirective,
      contentType
    });

    this.emit('copyObject', null, { from, to, metadata, metadataDirective });

    return response;
  }

  /**
   * Check if object exists
   */
  async exists(key) {
    const fullKey = this.keyPrefix ? path.join(this.keyPrefix, key) : key;
    return this.storage.exists(fullKey);
  }

  /**
   * Delete an object
   */
  async deleteObject(key) {
    const fullKey = this.keyPrefix ? path.join(this.keyPrefix, key) : key;
    const response = await this.storage.delete(fullKey);

    this.emit('deleteObject', null, { key });

    return response;
  }

  /**
   * Delete multiple objects (batch)
   */
  async deleteObjects(keys) {
    // Add keyPrefix to all keys
    const fullKeys = keys.map(key =>
      this.keyPrefix ? path.join(this.keyPrefix, key) : key
    );

    // Split into batches for parallel processing
    const batches = chunk(fullKeys, this.parallelism);
    const allResults = { Deleted: [], Errors: [] };

    const { results } = await PromisePool
      .withConcurrency(this.parallelism)
      .for(batches)
      .process(async (batch) => {
        return await this.storage.deleteMultiple(batch);
      });

    // Merge results
    for (const result of results) {
      allResults.Deleted.push(...result.Deleted);
      allResults.Errors.push(...result.Errors);
    }

    this.emit('deleteObjects', null, { keys, count: allResults.Deleted.length });

    return allResults;
  }

  /**
   * List objects with pagination support
   */
  async listObjects({ prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null }) {
    const fullPrefix = this.keyPrefix ? path.join(this.keyPrefix, prefix) : prefix;

    const response = await this.storage.list({
      prefix: fullPrefix,
      delimiter,
      maxKeys,
      continuationToken
    });

    this.emit('listObjects', null, { prefix, count: response.Contents.length });

    return response;
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
      // For simplicity, fetch all up to offset + amount and slice
      const fullPrefix = this.keyPrefix ? path.join(this.keyPrefix, prefix) : prefix;
      const response = await this.storage.list({
        prefix: fullPrefix,
        maxKeys: offset + amount
      });
      keys = response.Contents.map(x => x.Key).slice(offset, offset + amount);
    } else {
      // Regular fetch with amount as maxKeys
      while (truncated) {
        const options = {
          prefix,
          continuationToken,
          maxKeys: amount - keys.length
        };
        const res = await this.listObjects(options);
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

    // Strip keyPrefix from results
    if (this.keyPrefix) {
      keys = keys
        .map(x => x.replace(this.keyPrefix, ''))
        .map(x => (x.startsWith('/') ? x.replace('/', '') : x));
    }

    this.emit('getKeysPage', keys, params);
    return keys;
  }

  /**
   * Get all keys with a given prefix
   */
  async getAllKeys({ prefix = '' }) {
    const fullPrefix = this.keyPrefix ? path.join(this.keyPrefix, prefix) : prefix;
    const response = await this.storage.list({
      prefix: fullPrefix,
      maxKeys: 100000 // Large number to get all
    });

    let keys = response.Contents.map(x => x.Key);

    // Strip keyPrefix from results
    if (this.keyPrefix) {
      keys = keys
        .map(x => x.replace(this.keyPrefix, ''))
        .map(x => (x.startsWith('/') ? x.replace('/', '') : x));
    }

    this.emit('getAllKeys', keys, { prefix });
    return keys;
  }

  /**
   * Count total objects under a prefix
   */
  async count({ prefix = '' } = {}) {
    const keys = await this.getAllKeys({ prefix });
    const count = keys.length;
    this.emit('count', count, { prefix });
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
      this.emit('getContinuationTokenAfterOffset', null, { prefix, offset });
      return null;
    }

    // Return the key at offset position as continuation token
    const token = keys[offset];
    this.emit('getContinuationTokenAfterOffset', token, { prefix, offset });
    return token;
  }

  /**
   * Move an object from one key to another
   */
  async moveObject({ from, to }) {
    await this.copyObject({ from, to, metadataDirective: 'COPY' });
    await this.deleteObject(from);
  }

  /**
   * Move all objects from one prefix to another
   */
  async moveAllObjects({ prefixFrom, prefixTo }) {
    const keys = await this.getAllKeys({ prefix: prefixFrom });
    const results = [];
    const errors = [];

    for (const key of keys) {
      try {
        const to = key.replace(prefixFrom, prefixTo);
        await this.moveObject({ from: key, to });
        results.push(to);
      } catch (error) {
        errors.push({
          message: error.message,
          raw: error,
          key
        });
      }
    }

    this.emit('moveAllObjects', { results, errors }, { prefixFrom, prefixTo });

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
}

export default MemoryClient;
