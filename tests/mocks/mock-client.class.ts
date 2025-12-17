/**
 * MockClient - Ultra-lightweight mock for unit testing
 *
 * Zero I/O, zero memory pressure, pure synchronous operations.
 * Use this for unit tests that don't need real storage behavior.
 *
 * Features:
 * - Synchronous operations (no async overhead)
 * - Configurable responses per operation
 * - Call tracking for assertions
 * - Error injection for testing error paths
 * - No global state (each instance is isolated)
 */

import EventEmitter from 'events';
import { idGenerator } from '#src/concerns/id.js';

export class MockClient extends EventEmitter {
  constructor(config = {}) {
    super();

    this.id = config.id || idGenerator(8);
    this.bucket = config.bucket || 'mock-bucket';
    this.keyPrefix = config.keyPrefix || '';
    this.region = config.region || 'us-east-1';
    this.logLevel = config.logLevel || 'silent';

    // In-memory storage (simple Map, no persistence)
    this._storage = new Map();

    // Call tracking for assertions
    this._calls = {
      putObject: [],
      getObject: [],
      headObject: [],
      copyObject: [],
      deleteObject: [],
      deleteObjects: [],
      listObjects: [],
      sendCommand: []
    };

    // Configurable responses/behaviors
    this._mockResponses = new Map();
    this._mockErrors = new Map();
    this._defaultLatency = config.latency || 0;

    // Stats tracking
    this._stats = {
      puts: 0,
      gets: 0,
      heads: 0,
      copies: 0,
      deletes: 0,
      lists: 0
    };

    // Mock config object (for compatibility)
    this.config = {
      bucket: this.bucket,
      keyPrefix: this.keyPrefix,
      region: this.region,
      endpoint: 'mock://localhost',
      forcePathStyle: true
    };

    // TaskManager mock (for batch operations)
    this.taskManager = {
      concurrency: config.concurrency || 5,
      process: async (items, fn) => {
        const results = [];
        const errors = [];
        for (const item of items) {
          try {
            results.push(await fn(item));
          } catch (err) {
            errors.push({ item, error: err });
          }
        }
        return { results, errors };
      }
    };

    // Connection string for compatibility
    this.connectionString = `mock://${this.bucket}/${this.keyPrefix}`;
  }

  // ============================================
  // Mock Configuration Methods
  // ============================================

  /**
   * Set a mock response for a specific key
   */
  mockResponse(key, response) {
    this._mockResponses.set(this._fullKey(key), response);
    return this;
  }

  /**
   * Set a mock error for a specific key
   */
  mockError(key, error) {
    this._mockErrors.set(this._fullKey(key), error);
    return this;
  }

  /**
   * Clear all mock configurations
   */
  clearMocks() {
    this._mockResponses.clear();
    this._mockErrors.clear();
    return this;
  }

  /**
   * Get call history for a method
   */
  getCalls(method) {
    return this._calls[method] || [];
  }

  /**
   * Assert a method was called with specific args
   */
  assertCalled(method, predicate) {
    const calls = this.getCalls(method);
    if (typeof predicate === 'function') {
      return calls.some(predicate);
    }
    return calls.length > 0;
  }

  /**
   * Reset all call history
   */
  resetCalls() {
    for (const key of Object.keys(this._calls)) {
      this._calls[key] = [];
    }
    return this;
  }

  // ============================================
  // Client Interface Methods
  // ============================================

  async putObject({ key, metadata = {}, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch }) {
    const fullKey = this._fullKey(key);
    this._trackCall('putObject', { key, metadata, contentType, body, contentEncoding, contentLength, ifMatch, ifNoneMatch });

    // Check for mock error
    if (this._mockErrors.has(fullKey)) {
      throw this._mockErrors.get(fullKey);
    }

    // Check preconditions
    const existing = this._storage.get(fullKey);
    if (ifNoneMatch === '*' && existing) {
      const error = new Error('PreconditionFailed');
      error.name = 'PreconditionFailed';
      error.$metadata = { httpStatusCode: 412 };
      throw error;
    }

    if (ifMatch && existing && existing.ETag !== ifMatch) {
      const error = new Error('PreconditionFailed');
      error.name = 'PreconditionFailed';
      error.$metadata = { httpStatusCode: 412 };
      throw error;
    }

    const etag = `"${idGenerator(32)}"`;
    const now = new Date();

    this._storage.set(fullKey, {
      Body: body,
      Metadata: { ...metadata },
      ContentType: contentType || 'application/octet-stream',
      ContentEncoding: contentEncoding,
      ContentLength: contentLength || (body ? Buffer.byteLength(body) : 0),
      ETag: etag,
      LastModified: now
    });

    this._stats.puts++;
    this.emit('cl:response', 'PutObjectCommand', { ETag: etag }, { Key: key });

    return { ETag: etag };
  }

  async getObject(key) {
    const fullKey = this._fullKey(key);
    this._trackCall('getObject', { key });

    // Check for mock error
    if (this._mockErrors.has(fullKey)) {
      throw this._mockErrors.get(fullKey);
    }

    // Check for mock response
    if (this._mockResponses.has(fullKey)) {
      const response = this._mockResponses.get(fullKey);
      this.emit('cl:response', 'GetObjectCommand', response, { Key: key });
      return response;
    }

    const obj = this._storage.get(fullKey);
    if (!obj) {
      const error = new Error('NoSuchKey');
      error.name = 'NoSuchKey';
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    }

    this._stats.gets++;

    // Create stream-like body that works with s3db's streamToString
    const bodyContent = obj.Body;
    const response = {
      Body: this._createStreamBody(bodyContent),
      Metadata: { ...obj.Metadata },
      ContentType: obj.ContentType,
      ContentEncoding: obj.ContentEncoding,
      ContentLength: obj.ContentLength,
      ETag: obj.ETag,
      LastModified: obj.LastModified
    };

    this.emit('cl:response', 'GetObjectCommand', response, { Key: key });
    return response;
  }

  /**
   * Create a stream-like body object compatible with s3db's streamToString
   */
  _createStreamBody(content) {
    const buffer = content
      ? (Buffer.isBuffer(content) ? content : Buffer.from(String(content)))
      : Buffer.alloc(0);

    // Create an object that supports both .on() for streams and async iterator
    const streamLike = {
      _buffer: buffer,
      _listeners: {},

      on(event, handler) {
        if (!this._listeners[event]) {
          this._listeners[event] = [];
        }
        this._listeners[event].push(handler);

        // Immediately emit data and end for synchronous behavior
        if (event === 'data' || event === 'end') {
          setImmediate(() => {
            if (this._listeners.data) {
              for (const h of this._listeners.data) {
                h(this._buffer);
              }
            }
            if (this._listeners.end) {
              for (const h of this._listeners.end) {
                h();
              }
            }
          });
        }
        return this;
      },

      async transformToByteArray() {
        return new Uint8Array(buffer);
      },

      async *[Symbol.asyncIterator]() {
        if (buffer.length > 0) {
          yield buffer;
        }
      }
    };

    return streamLike;
  }

  async headObject(key) {
    const fullKey = this._fullKey(key);
    this._trackCall('headObject', { key });

    // Check for mock error
    if (this._mockErrors.has(fullKey)) {
      throw this._mockErrors.get(fullKey);
    }

    const obj = this._storage.get(fullKey);
    if (!obj) {
      const error = new Error('NotFound');
      error.name = 'NotFound';
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    }

    this._stats.heads++;

    const response = {
      Metadata: { ...obj.Metadata },
      ContentType: obj.ContentType,
      ContentEncoding: obj.ContentEncoding,
      ContentLength: obj.ContentLength,
      ETag: obj.ETag,
      LastModified: obj.LastModified
    };

    this.emit('cl:response', 'HeadObjectCommand', response, { Key: key });
    return response;
  }

  async copyObject({ from, to, metadata, metadataDirective, contentType }) {
    const fullFrom = this._fullKey(from);
    const fullTo = this._fullKey(to);
    this._trackCall('copyObject', { from, to, metadata, metadataDirective, contentType });

    // Check for mock error
    if (this._mockErrors.has(fullFrom)) {
      throw this._mockErrors.get(fullFrom);
    }

    const source = this._storage.get(fullFrom);
    if (!source) {
      const error = new Error('NoSuchKey');
      error.name = 'NoSuchKey';
      error.$metadata = { httpStatusCode: 404 };
      throw error;
    }

    const etag = `"${idGenerator(32)}"`;
    const now = new Date();

    const newObj = {
      Body: source.Body,
      Metadata: metadataDirective === 'REPLACE' ? { ...metadata } : { ...source.Metadata },
      ContentType: contentType || source.ContentType,
      ContentEncoding: source.ContentEncoding,
      ContentLength: source.ContentLength,
      ETag: etag,
      LastModified: now
    };

    this._storage.set(fullTo, newObj);
    this._stats.copies++;

    const response = {
      CopyObjectResult: {
        ETag: etag,
        LastModified: now
      }
    };

    this.emit('cl:response', 'CopyObjectCommand', response, { CopySource: from, Key: to });
    return response;
  }

  async exists(key) {
    const fullKey = this._fullKey(key);
    return this._storage.has(fullKey);
  }

  async deleteObject(key) {
    const fullKey = this._fullKey(key);
    this._trackCall('deleteObject', { key });

    // Check for mock error
    if (this._mockErrors.has(fullKey)) {
      throw this._mockErrors.get(fullKey);
    }

    this._storage.delete(fullKey);
    this._stats.deletes++;

    const response = {};
    this.emit('cl:response', 'DeleteObjectCommand', response, { Key: key });
    return response;
  }

  async deleteObjects(keys) {
    this._trackCall('deleteObjects', { keys });

    const deleted = [];
    const errors = [];

    for (const key of keys) {
      const fullKey = this._fullKey(key);
      if (this._mockErrors.has(fullKey)) {
        errors.push({ Key: key, Code: 'MockError', Message: 'Mocked error' });
      } else {
        this._storage.delete(fullKey);
        deleted.push({ Key: key });
        this._stats.deletes++;
      }
    }

    const response = { Deleted: deleted, Errors: errors };
    this.emit('cl:response', 'DeleteObjectsCommand', response, { Delete: { Objects: keys.map(k => ({ Key: k })) } });
    return response;
  }

  async listObjects({ prefix = '', delimiter = null, maxKeys = 1000, continuationToken = null, startAfter = null } = {}) {
    const fullPrefix = this._fullKey(prefix);
    this._trackCall('listObjects', { prefix, delimiter, maxKeys, continuationToken, startAfter });

    this._stats.lists++;

    let keys = Array.from(this._storage.keys())
      .filter(k => k.startsWith(fullPrefix))
      .sort();

    // Handle startAfter
    if (startAfter) {
      const fullStartAfter = this._fullKey(startAfter);
      keys = keys.filter(k => k > fullStartAfter);
    }

    // Handle continuationToken (simple base64 encoded key)
    if (continuationToken) {
      const startKey = Buffer.from(continuationToken, 'base64').toString('utf8');
      keys = keys.filter(k => k > startKey);
    }

    const isTruncated = keys.length > maxKeys;
    const resultKeys = keys.slice(0, maxKeys);

    const contents = resultKeys.map(key => {
      const obj = this._storage.get(key);
      return {
        Key: this._stripPrefix(key),
        Size: obj.ContentLength || 0,
        LastModified: obj.LastModified,
        ETag: obj.ETag
      };
    });

    // Handle delimiter for common prefixes
    let commonPrefixes = [];
    if (delimiter) {
      const prefixSet = new Set();
      for (const key of resultKeys) {
        const strippedKey = this._stripPrefix(key);
        const afterPrefix = prefix ? strippedKey.slice(prefix.length) : strippedKey;
        const delimIndex = afterPrefix.indexOf(delimiter);
        if (delimIndex >= 0) {
          const commonPrefix = (prefix || '') + afterPrefix.slice(0, delimIndex + 1);
          prefixSet.add(commonPrefix);
        }
      }
      commonPrefixes = Array.from(prefixSet).map(p => ({ Prefix: p }));
    }

    const response = {
      Contents: contents,
      CommonPrefixes: commonPrefixes,
      IsTruncated: isTruncated,
      KeyCount: contents.length,
      MaxKeys: maxKeys,
      Prefix: prefix,
      Delimiter: delimiter,
      NextContinuationToken: isTruncated
        ? Buffer.from(resultKeys[resultKeys.length - 1]).toString('base64')
        : undefined
    };

    this.emit('cl:response', 'ListObjectsV2Command', response, { Prefix: prefix });
    return response;
  }

  async sendCommand(command) {
    const commandName = command.constructor?.name || 'UnknownCommand';
    const input = command.input || command;
    this._trackCall('sendCommand', { commandName, input });

    // Route to appropriate handler
    switch (commandName) {
      case 'PutObjectCommand':
        return this.putObject({
          key: input.Key,
          metadata: input.Metadata,
          contentType: input.ContentType,
          body: input.Body,
          contentEncoding: input.ContentEncoding,
          contentLength: input.ContentLength,
          ifMatch: input.IfMatch,
          ifNoneMatch: input.IfNoneMatch
        });
      case 'GetObjectCommand':
        return this.getObject(input.Key);
      case 'HeadObjectCommand':
        return this.headObject(input.Key);
      case 'CopyObjectCommand':
        return this.copyObject({
          from: input.CopySource,
          to: input.Key,
          metadata: input.Metadata,
          metadataDirective: input.MetadataDirective,
          contentType: input.ContentType
        });
      case 'DeleteObjectCommand':
        return this.deleteObject(input.Key);
      case 'DeleteObjectsCommand':
        return this.deleteObjects(input.Delete?.Objects?.map(o => o.Key) || []);
      case 'ListObjectsV2Command':
        return this.listObjects({
          prefix: input.Prefix,
          delimiter: input.Delimiter,
          maxKeys: input.MaxKeys,
          continuationToken: input.ContinuationToken,
          startAfter: input.StartAfter
        });
      default:
        throw new Error(`MockClient: Unsupported command ${commandName}`);
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  async getAllKeys({ prefix = '' } = {}) {
    const fullPrefix = this._fullKey(prefix);
    return Array.from(this._storage.keys())
      .filter(k => k.startsWith(fullPrefix))
      .map(k => this._stripPrefix(k));
  }

  async getKeysPage({ prefix = '', offset = 0, amount = 100 } = {}) {
    const allKeys = await this.getAllKeys({ prefix });
    return allKeys.slice(offset, offset + amount);
  }

  async count({ prefix = '' } = {}) {
    const keys = await this.getAllKeys({ prefix });
    return keys.length;
  }

  async deleteAll({ prefix = '' } = {}) {
    const keys = await this.getAllKeys({ prefix });
    await this.deleteObjects(keys);
    return keys.length;
  }

  async moveObject({ from, to }) {
    await this.copyObject({ from, to, metadataDirective: 'COPY' });
    await this.deleteObject(from);
    return true;
  }

  async moveAllObjects({ prefixFrom, prefixTo }) {
    const keys = await this.getAllKeys({ prefix: prefixFrom });
    const results = [];
    for (const key of keys) {
      const newKey = key.replace(prefixFrom, prefixTo);
      await this.moveObject({ from: key, to: newKey });
      results.push({ from: key, to: newKey });
    }
    return results;
  }

  getStats() {
    return {
      ...this._stats,
      objectCount: this._storage.size,
      features: {
        compression: false,
        stats: true,
        locking: false
      }
    };
  }

  getQueueStats() {
    return { pending: 0, active: 0, completed: this._stats.puts + this._stats.gets };
  }

  getAggregateMetrics() {
    return this._stats;
  }

  clear() {
    this._storage.clear();
    this._stats = { puts: 0, gets: 0, heads: 0, copies: 0, deletes: 0, lists: 0 };
  }

  snapshot() {
    const data = {};
    for (const [key, value] of this._storage.entries()) {
      data[key] = { ...value };
    }
    return data;
  }

  restore(snapshot) {
    this._storage.clear();
    for (const [key, value] of Object.entries(snapshot)) {
      this._storage.set(key, value);
    }
  }

  destroy() {
    this.clear();
    this.removeAllListeners();
  }

  // ============================================
  // Private Helpers
  // ============================================

  _fullKey(key = '') {
    if (!this.keyPrefix) return key;
    if (!key) return this.keyPrefix;
    return `${this.keyPrefix}/${key}`.replace(/\/+/g, '/');
  }

  _stripPrefix(key = '') {
    if (!this.keyPrefix) return key;
    const prefix = this.keyPrefix + '/';
    if (key.startsWith(prefix)) {
      return key.slice(prefix.length);
    }
    return key;
  }

  _trackCall(method, args) {
    if (this._calls[method]) {
      this._calls[method].push({ timestamp: Date.now(), args });
    }
  }
}

export default MockClient;
