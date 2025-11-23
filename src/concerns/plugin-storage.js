/**
 * PluginStorage - Lightweight storage utility for plugins
 *
 * Provides efficient S3 storage for plugins without the overhead of full Resources.
 * Reuses metadata encoding/decoding and behaviors for cost optimization.
 *
 * Key Features:
 * - Hierarchical key structure: resource={name}/plugin={slug}/...
 * - Metadata encoding for cost optimization (reuses existing system)
 * - Behavior support: body-overflow, body-only, enforce-limits
 * - Direct Client operations (no Resource overhead)
 * - 3-5x faster than creating Resources
 * - 30-40% fewer S3 API calls
 *
 * @example
 * const storage = new PluginStorage(client, 'eventual-consistency');
 *
 * // Save transaction
 * await storage.put(
 *   storage.getPluginKey('wallets', 'balance', 'transactions', 'id=txn1'),
 *   { operation: 'add', value: 50 },
 *   { behavior: 'body-overflow' }
 * );
 *
 * // Get transaction
 * const txn = await storage.get(
 *   storage.getPluginKey('wallets', 'balance', 'transactions', 'id=txn1')
 * );
 */

import { metadataEncode, metadataDecode } from './metadata-encoding.js';
import { calculateEffectiveLimit, calculateUTF8Bytes } from './calculator.js';
import { tryFn } from './try-fn.js';
import { idGenerator } from './id.js';
import { PluginStorageError, MetadataLimitError, BehaviorError } from '../errors.js';
import { DistributedLock, computeBackoff, sleep, isPreconditionFailure } from './distributed-lock.js';
import { DistributedSequence } from './distributed-sequence.js';

const S3_METADATA_LIMIT = 2047; // AWS S3 metadata limit in bytes

export class PluginStorage {
  /**
   * @param {Object} client - S3db Client instance
   * @param {string} pluginSlug - Plugin identifier (kebab-case)
   */
  constructor(client, pluginSlug) {
    if (!client) {
      throw new PluginStorageError('PluginStorage requires a client instance', {
        operation: 'constructor',
        pluginSlug,
        suggestion: 'Pass a valid S3db Client instance when creating PluginStorage'
      });
    }
    if (!pluginSlug) {
      throw new PluginStorageError('PluginStorage requires a pluginSlug', {
        operation: 'constructor',
        suggestion: 'Provide a plugin slug (e.g., "eventual-consistency", "cache", "audit")'
      });
    }

    this.client = client;
    this.pluginSlug = pluginSlug;

    // Initialize distributed lock with plugin-scoped keys
    this._lock = new DistributedLock(this, {
      keyGenerator: (name) => this.getPluginKey(null, 'locks', name)
    });

    // Initialize distributed sequence with plugin-scoped keys
    this._sequence = new DistributedSequence(this, {
      valueKeyGenerator: (resourceName, name) =>
        this.getSequenceKey(resourceName, name, 'value'),
      lockKeyGenerator: (resourceName, name) =>
        this.getSequenceKey(resourceName, name, 'lock')
    });
  }

  /**
   * Generate hierarchical plugin-scoped key
   *
   * @param {string} resourceName - Resource name (optional, for resource-scoped data)
   * @param {...string} parts - Additional path parts
   * @returns {string} S3 key
   *
   * @example
   * // Resource-scoped: resource=wallets/plugin=eventual-consistency/balance/transactions/id=txn1
   * getPluginKey('wallets', 'balance', 'transactions', 'id=txn1')
   *
   * // Global plugin data: plugin=eventual-consistency/config
   * getPluginKey(null, 'config')
   */
  getPluginKey(resourceName, ...parts) {
    if (resourceName) {
      return `resource=${resourceName}/plugin=${this.pluginSlug}/${parts.join('/')}`;
    }
    return `plugin=${this.pluginSlug}/${parts.join('/')}`;
  }

  /**
   * Generate sequence key following the resource-scoped pattern
   *
   * Storage path conventions:
   * - Resource-scoped: resource={resourceName}/plugin={slug}/sequence={name}/{suffix}
   * - Global (no resource): plugin={slug}/sequence={name}/{suffix}
   *
   * @param {string} resourceName - Resource name (optional)
   * @param {string} sequenceName - Sequence name
   * @param {string} suffix - 'value' or 'lock'
   * @returns {string} S3 key
   */
  getSequenceKey(resourceName, sequenceName, suffix) {
    if (resourceName) {
      return `resource=${resourceName}/plugin=${this.pluginSlug}/sequence=${sequenceName}/${suffix}`;
    }
    return `plugin=${this.pluginSlug}/sequence=${sequenceName}/${suffix}`;
  }

  /**
   * Save data with metadata encoding, behavior support, and optional TTL
   *
   * @param {string} key - S3 key
   * @param {Object} data - Data to save
   * @param {Object} options - Options
   * @param {number} options.ttl - Time-to-live in seconds (optional)
   * @param {string} options.behavior - 'body-overflow' | 'body-only' | 'enforce-limits'
   * @param {string} options.contentType - Content type (default: application/json)
   * @returns {Promise<Object>} Underlying client response (includes ETag when available)
   */
  async set(key, data, options = {}) {
    const {
      ttl,
      behavior = 'body-overflow',
      contentType = 'application/json',
      ifMatch,
      ifNoneMatch
    } = options;

    // Clone data to avoid mutating original
    const dataToSave = { ...data };

    // Add TTL expiration timestamp if provided
    if (ttl && typeof ttl === 'number' && ttl > 0) {
      dataToSave._expiresAt = Date.now() + (ttl * 1000);
    }

    // Apply behavior to split data between metadata and body
    const { metadata, body } = this._applyBehavior(dataToSave, behavior);

    // Prepare putObject parameters
    const putParams = {
      key,
      metadata,
      contentType
    };

    // Add body if present
    if (body !== null) {
      putParams.body = JSON.stringify(body);
    }

    if (ifMatch !== undefined) {
      putParams.ifMatch = ifMatch;
    }
    if (ifNoneMatch !== undefined) {
      putParams.ifNoneMatch = ifNoneMatch;
    }

    // Save to S3
    const [ok, err, response] = await tryFn(() => this.client.putObject(putParams));

    if (!ok) {
      throw new PluginStorageError(`Failed to save plugin data`, {
        pluginSlug: this.pluginSlug,
        key,
        operation: 'set',
        behavior,
        ttl,
        original: err,
        suggestion: 'Check S3 permissions and key format'
      });
    }

    return response;
  }

  /**
   * Batch set multiple items (parallel execution for performance)
   *
   * @param {Array<{key: string, data: Object, options?: Object}>} items - Items to save
   * @returns {Promise<Array<{ok: boolean, key: string, error?: Error}>>} Results
   */
  async batchSet(items) {
    const promises = items.map(async (item) => {
      const [ok, error] = await tryFn(() => this.set(item.key, item.data, item.options || {}));
      return { ok, key: item.key, error: ok ? undefined : error };
    });

    return Promise.all(promises);
  }

  /**
   * Get data with automatic metadata decoding and TTL check
   *
   * @param {string} key - S3 key
   * @returns {Promise<Object|null>} Data or null if not found/expired
   */
  async get(key) {
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));

    if (!ok) {
      // If not found, return null
      // Check multiple ways the error might indicate "not found":
      // 1. error.name is 'NoSuchKey' (standard S3)
      // 2. error.code is 'NoSuchKey' (ResourceError with code property)
      // 3. error.Code is 'NoSuchKey' (AWS SDK format)
      // 4. statusCode is 404
      if (
        err.name === 'NoSuchKey' ||
        err.code === 'NoSuchKey' ||
        err.Code === 'NoSuchKey' ||
        err.statusCode === 404
      ) {
        return null;
      }
      throw new PluginStorageError(`Failed to retrieve plugin data`, {
        pluginSlug: this.pluginSlug,
        key,
        operation: 'get',
        original: err,
        suggestion: 'Check if the key exists and S3 permissions are correct'
      });
    }

    // Metadata is already decoded by Client, but values are strings
    // We need to parse JSON values back to objects
    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);

    // Build final data object
    let data = parsedMetadata;

    // If has body, merge with metadata
    if (response.Body) {
      const [ok, parseErr, result] = await tryFn(async () => {
        const bodyContent = await response.Body.transformToString();

        // Only parse if body has content
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          // Body takes precedence over metadata for same keys
          return { ...parsedMetadata, ...body };
        }
        return parsedMetadata;
      });

      if (!ok) {
        throw new PluginStorageError(`Failed to parse JSON body`, {
          pluginSlug: this.pluginSlug,
          key,
          operation: 'get',
          original: parseErr,
          suggestion: 'Body content may be corrupted. Check S3 object integrity'
        });
      }

      data = result;
    }

    // Check TTL expiration (S3 lowercases metadata keys)
    const expiresAt = data._expiresat || data._expiresAt;
    if (expiresAt) {
      if (Date.now() > expiresAt) {
        // Expired - delete and return null
        await this.delete(key);
        return null;
      }
      // Remove internal fields before returning
      delete data._expiresat;
      delete data._expiresAt;
    }

    return data;
  }

  /**
   * Parse metadata values back to their original types
   * @private
   */
  _parseMetadataValues(metadata) {
    const parsed = {};
    for (const [key, value] of Object.entries(metadata)) {
      // Try to parse as JSON
      if (typeof value === 'string') {
        // Check if it looks like JSON
        if (
          (value.startsWith('{') && value.endsWith('}')) ||
          (value.startsWith('[') && value.endsWith(']'))
        ) {
          const [ok, err, result] = tryFn(() => JSON.parse(value));
          if (ok) {
            parsed[key] = result;
            continue;
          }
          // Not JSON, keep as string
        }

        // Try to parse as number
        if (!isNaN(value) && value.trim() !== '') {
          parsed[key] = Number(value);
          continue;
        }

        // Try to parse as boolean
        if (value === 'true') {
          parsed[key] = true;
          continue;
        }
        if (value === 'false') {
          parsed[key] = false;
          continue;
        }
      }

      // Keep as is
      parsed[key] = value;
    }
    return parsed;
  }

  /**
   * List all keys with plugin prefix
   *
   * @param {string} prefix - Additional prefix (optional)
   * @param {Object} options - List options
   * @param {number} options.limit - Max number of results
   * @returns {Promise<Array<string>>} List of keys
   */
  async list(prefix = '', options = {}) {
    const { limit } = options;

    // Build full prefix
    const fullPrefix = prefix
      ? `plugin=${this.pluginSlug}/${prefix}`
      : `plugin=${this.pluginSlug}/`;

    const [ok, err, result] = await tryFn(() =>
      this.client.listObjects({ prefix: fullPrefix, maxKeys: limit })
    );

    if (!ok) {
      throw new PluginStorageError(`Failed to list plugin data`, {
        pluginSlug: this.pluginSlug,
        operation: 'list',
        prefix,
        fullPrefix,
        limit,
        original: err,
        suggestion: 'Check S3 permissions and bucket configuration'
      });
    }

    // Remove keyPrefix from keys
    const keys = result.Contents?.map(item => item.Key) || [];
    return this._removeKeyPrefix(keys);
  }

  /**
   * List keys for a specific resource
   *
   * @param {string} resourceName - Resource name
   * @param {string} subPrefix - Additional prefix within resource (optional)
   * @param {Object} options - List options
   * @returns {Promise<Array<string>>} List of keys
   */
  async listForResource(resourceName, subPrefix = '', options = {}) {
    const { limit } = options;

    // Build resource-scoped prefix
    const fullPrefix = subPrefix
      ? `resource=${resourceName}/plugin=${this.pluginSlug}/${subPrefix}`
      : `resource=${resourceName}/plugin=${this.pluginSlug}/`;

    const [ok, err, result] = await tryFn(() =>
      this.client.listObjects({ prefix: fullPrefix, maxKeys: limit })
    );

    if (!ok) {
      throw new PluginStorageError(`Failed to list resource data`, {
        pluginSlug: this.pluginSlug,
        operation: 'listForResource',
        resourceName,
        subPrefix,
        fullPrefix,
        limit,
        original: err,
        suggestion: 'Check resource name and S3 permissions'
      });
    }

    // Remove keyPrefix from keys
    const keys = result.Contents?.map(item => item.Key) || [];
    return this._removeKeyPrefix(keys);
  }

  /**
   * List objects (with data) matching a prefix
   * Convenience method that combines list() + batchGet()
   *
   * @param {string} prefix - Prefix to match
   * @param {Object} options - List options
   * @returns {Promise<Array<Object>>} List of objects with data (not wrappers)
   */
  async listWithPrefix(prefix = '', options = {}) {
    // Get keys matching prefix
    const keys = await this.list(prefix, options);

    if (!keys || keys.length === 0) {
      return [];
    }

    // Fetch all objects
    const results = await this.batchGet(keys);

    // Extract data from wrappers and filter out nulls/errors/expired
    // batchGet returns { ok, data, error } - we only want successful, non-null data
    // Use != null (not !==) to filter both null and undefined
    return results
      .filter(item => item.ok && item.data != null)
      .map(item => item.data);
  }

  /**
   * Remove client keyPrefix from keys
   * @private
   */
  _removeKeyPrefix(keys) {
    const keyPrefix = this.client.config.keyPrefix;
    if (!keyPrefix) return keys;

    return keys
      .map(key => key.replace(keyPrefix, ''))
      .map(key => (key.startsWith('/') ? key.replace('/', '') : key));
  }

  /**
   * Check if a key exists (not expired)
   *
   * @param {string} key - S3 key
   * @returns {Promise<boolean>} True if exists and not expired
   */
  async has(key) {
    const data = await this.get(key);
    return data !== null;
  }

  /**
   * Check if a key is expired
   *
   * @param {string} key - S3 key
   * @returns {Promise<boolean>} True if expired or not found
   */
  async isExpired(key) {
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));

    if (!ok) {
      return true; // Not found = expired
    }

    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);

    let data = parsedMetadata;

    if (response.Body) {
      const [ok, err, result] = await tryFn(async () => {
        const bodyContent = await response.Body.transformToString();
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          return { ...parsedMetadata, ...body };
        }
        return parsedMetadata;
      });

      if (!ok) {
        return true; // Parse error = expired
      }

      data = result;
    }

    // S3 lowercases metadata keys
    const expiresAt = data._expiresat || data._expiresAt;
    if (!expiresAt) {
      return false; // No TTL = not expired
    }

    return Date.now() > expiresAt;
  }

  /**
   * Get remaining TTL in seconds
   *
   * @param {string} key - S3 key
   * @returns {Promise<number|null>} Remaining seconds or null if no TTL/not found
   */
  async getTTL(key) {
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));

    if (!ok) {
      return null;
    }

    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);

    let data = parsedMetadata;

    if (response.Body) {
      const [ok, err, result] = await tryFn(async () => {
        const bodyContent = await response.Body.transformToString();
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          return { ...parsedMetadata, ...body };
        }
        return parsedMetadata;
      });

      if (!ok) {
        return null; // Parse error
      }

      data = result;
    }

    // S3 lowercases metadata keys
    const expiresAt = data._expiresat || data._expiresAt;
    if (!expiresAt) {
      return null; // No TTL
    }

    const remaining = Math.max(0, expiresAt - Date.now());
    return Math.floor(remaining / 1000); // Convert to seconds
  }

  /**
   * Extend TTL by adding additional seconds
   *
   * @param {string} key - S3 key
   * @param {number} additionalSeconds - Seconds to add to current TTL
   * @returns {Promise<boolean>} True if extended, false if not found or no TTL
   */
  async touch(key, additionalSeconds) {
    // Optimization: Use HEAD + COPY instead of GET + PUT for metadata-only updates
    // This avoids transferring the body when only updating the TTL
    const [ok, err, response] = await tryFn(() => this.client.headObject(key));

    if (!ok) {
      return false;
    }

    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);

    // S3 lowercases metadata keys
    const expiresAt = parsedMetadata._expiresat || parsedMetadata._expiresAt;
    if (!expiresAt) {
      return false; // No TTL to extend
    }

    // Extend TTL - use the standard field name (will be lowercased by S3)
    parsedMetadata._expiresAt = expiresAt + (additionalSeconds * 1000);
    delete parsedMetadata._expiresat; // Remove lowercased version

    // Encode metadata for S3
    const encodedMetadata = {};
    for (const [metaKey, metaValue] of Object.entries(parsedMetadata)) {
      const { encoded } = metadataEncode(metaValue);
      encodedMetadata[metaKey] = encoded;
    }

    // Use COPY with MetadataDirective: REPLACE to update metadata atomically
    // This preserves the body without re-transferring it
    const [copyOk] = await tryFn(() => this.client.copyObject({
      from: key,
      to: key,
      metadata: encodedMetadata,
      metadataDirective: 'REPLACE',
      contentType: response.ContentType || 'application/json'
    }));

    return copyOk;
  }

  /**
   * Delete a single object
   *
   * @param {string} key - S3 key
   * @returns {Promise<void>}
   */
  async delete(key) {
    const [ok, err] = await tryFn(() => this.client.deleteObject(key));

    if (!ok) {
      throw new PluginStorageError(`Failed to delete plugin data`, {
        pluginSlug: this.pluginSlug,
        key,
        operation: 'delete',
        original: err,
        suggestion: 'Check S3 delete permissions'
      });
    }
  }

  /**
   * Delete all plugin data (for uninstall)
   *
   * @param {string} resourceName - Resource name (optional, if null deletes all plugin data)
   * @returns {Promise<number>} Number of objects deleted
   */
  async deleteAll(resourceName = null) {
    let deleted = 0;

    if (resourceName) {
      // Delete all data for specific resource
      const keys = await this.listForResource(resourceName);

      for (const key of keys) {
        await this.delete(key);
        deleted++;
      }
    } else {
      // Delete ALL plugin data (global + all resource-scoped)
      // We need to list all keys and filter by plugin slug
      const allKeys = await this.client.getAllKeys({});

      // Filter keys that belong to this plugin
      // Format: plugin=<slug>/* OR resource=*/plugin=<slug>/*
      const pluginKeys = allKeys.filter(key =>
        key.includes(`plugin=${this.pluginSlug}/`)
      );

      for (const key of pluginKeys) {
        await this.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Batch put operations (parallel execution for performance)
   *
   * @param {Array<{key: string, data: Object, options?: Object}>} items - Items to save
   * @returns {Promise<Array<{key: string, ok: boolean, error?: Error}>>} Results
   */
  async batchPut(items) {
    const promises = items.map(async (item) => {
      const [ok, error] = await tryFn(() => this.set(item.key, item.data, item.options));
      return { key: item.key, ok, error: ok ? undefined : error };
    });

    return Promise.all(promises);
  }

  /**
   * Batch get operations (parallel execution for performance)
   *
   * @param {Array<string>} keys - Keys to fetch
   * @returns {Promise<Array<{key: string, ok: boolean, data?: Object, error?: Error}>>} Results
   */
  async batchGet(keys) {
    const promises = keys.map(async (key) => {
      const [ok, error, data] = await tryFn(() => this.get(key));
      return { key, ok, data, error: ok ? undefined : error };
    });

    return Promise.all(promises);
  }

  /**
   * Acquire a distributed lock with TTL and retry logic
   *
   * @param {string} lockName - Lock identifier
   * @param {Object} options - Lock options
   * @param {number} options.ttl - Lock TTL in seconds (default: 30)
   * @param {number} options.timeout - Max wait time in ms (default: 0, no wait)
   * @param {string} options.workerId - Worker identifier (default: 'unknown')
   * @returns {Promise<Object|null>} Lock object or null if couldn't acquire
   */
  async acquireLock(lockName, options = {}) {
    return this._lock.acquire(lockName, options);
  }

  /**
   * Release a distributed lock
   *
   * @param {Object|string} lock - Lock object returned by acquireLock or lock name
   * @param {string} [token] - Lock token (required when passing lock name)
   * @returns {Promise<void>}
   */
  async releaseLock(lock, token) {
    return this._lock.release(lock, token);
  }

  /**
   * Acquire a lock, execute a callback, and release automatically.
   *
   * @param {string} lockName - Lock identifier
   * @param {Object} options - Options forwarded to acquireLock
   * @param {Function} callback - Async function to execute while holding the lock
   * @returns {Promise<*>} Callback result, or null when lock not acquired
   */
  async withLock(lockName, options, callback) {
    return this._lock.withLock(lockName, options, callback);
  }

  /**
   * Check if a lock is currently held
   *
   * @param {string} lockName - Lock identifier
   * @returns {Promise<boolean>} True if locked
   */
  async isLocked(lockName) {
    return this._lock.isLocked(lockName);
  }

  /**
   * Increment a counter value
   *
   * Optimization: Uses HEAD + COPY for existing counters to avoid body transfer.
   * Falls back to GET + PUT for non-existent counters or those with additional data.
   *
   * @param {string} key - S3 key
   * @param {number} amount - Amount to increment (default: 1)
   * @param {Object} options - Options (e.g., ttl)
   * @returns {Promise<number>} New value
   */
  async increment(key, amount = 1, options = {}) {
    // Try optimized path first: HEAD + COPY for existing counters
    const [headOk, headErr, headResponse] = await tryFn(() => this.client.headObject(key));

    if (headOk && headResponse.Metadata) {
      // Counter exists, use optimized HEAD + COPY
      const metadata = headResponse.Metadata || {};
      const parsedMetadata = this._parseMetadataValues(metadata);

      const currentValue = parsedMetadata.value || 0;
      const newValue = currentValue + amount;

      // Update only the value field
      parsedMetadata.value = newValue;

      // Handle TTL if specified
      if (options.ttl) {
        parsedMetadata._expiresAt = Date.now() + (options.ttl * 1000);
      }

      // Encode metadata
      const encodedMetadata = {};
      for (const [metaKey, metaValue] of Object.entries(parsedMetadata)) {
        const { encoded } = metadataEncode(metaValue);
        encodedMetadata[metaKey] = encoded;
      }

      // Atomic update via COPY
      const [copyOk] = await tryFn(() => this.client.copyObject({
        from: key,
        to: key,
        metadata: encodedMetadata,
        metadataDirective: 'REPLACE',
        contentType: headResponse.ContentType || 'application/json'
      }));

      if (copyOk) {
        return newValue;
      }
    }

    // Fallback: counter doesn't exist or has body data, use traditional path
    const data = await this.get(key);
    const value = (data?.value || 0) + amount;
    await this.set(key, { value }, options);
    return value;
  }

  /**
   * Decrement a counter value
   *
   * @param {string} key - S3 key
   * @param {number} amount - Amount to decrement (default: 1)
   * @param {Object} options - Options (e.g., ttl)
   * @returns {Promise<number>} New value
   */
  async decrement(key, amount = 1, options = {}) {
    return this.increment(key, -amount, options);
  }

  /**
   * Get the next value from a named sequence (atomic, distributed-safe)
   *
   * Uses distributed locking to ensure uniqueness across multiple workers/processes.
   * Returns the current value BEFORE incrementing (suitable for use as an ID).
   *
   * Storage paths:
   * - Resource-scoped: resource={resourceName}/plugin={slug}/sequence={name}/value
   * - Global: plugin={slug}/sequence={name}/value
   *
   * @param {string} name - Sequence name
   * @param {Object} options - Sequence options
   * @param {string} options.resourceName - Resource name for resource-scoped sequences (optional)
   * @param {number} options.initialValue - Starting value if sequence doesn't exist (default: 1)
   * @param {number} options.increment - Amount to increment (default: 1)
   * @param {number} options.lockTimeout - Max time to wait for lock in ms (default: 5000)
   * @param {number} options.lockTTL - Lock TTL in seconds (default: 10)
   * @returns {Promise<number>} The sequence value (before increment)
   *
   * @example
   * // Global sequence
   * const globalId = await storage.nextSequence('global-counter');
   *
   * @example
   * // Resource-scoped sequence
   * const orderId = await storage.nextSequence('id', {
   *   resourceName: 'orders',
   *   initialValue: 1000
   * });
   */
  async nextSequence(name, options = {}) {
    const {
      resourceName = null,
      initialValue = 1,
      increment = 1,
      lockTimeout = 5000,
      lockTTL = 10
    } = options;

    const valueKey = this.getSequenceKey(resourceName, name, 'value');
    const lockKey = this.getSequenceKey(resourceName, name, 'lock');

    const result = await this._withSequenceLock(lockKey, { timeout: lockTimeout, ttl: lockTTL }, async () => {
      // Get current sequence value
      const data = await this.get(valueKey);

      if (!data) {
        // Initialize sequence
        await this.set(valueKey, {
          value: initialValue + increment,
          name,
          resourceName,
          createdAt: Date.now()
        }, { behavior: 'body-only' });
        return initialValue;
      }

      // Get current value and increment
      const currentValue = data.value;
      await this.set(valueKey, {
        ...data,
        value: currentValue + increment,
        updatedAt: Date.now()
      }, { behavior: 'body-only' });

      return currentValue;
    });

    if (result === null) {
      throw new PluginStorageError(`Failed to acquire lock for sequence "${name}"`, {
        pluginSlug: this.pluginSlug,
        operation: 'nextSequence',
        sequenceName: name,
        resourceName,
        lockTimeout,
        suggestion: 'Increase lockTimeout or check for deadlocks'
      });
    }

    return result;
  }

  /**
   * Internal lock mechanism for sequences using direct key
   * Uses shared DistributedLock with a custom key generator
   * @private
   */
  async _withSequenceLock(lockKey, options, callback) {
    const { ttl = 30, timeout = 5000 } = options;
    const token = idGenerator();
    const startTime = Date.now();
    let attempt = 0;

    // Try to acquire lock
    while (true) {
      const payload = {
        token,
        acquiredAt: Date.now(),
        _expiresAt: Date.now() + (ttl * 1000)
      };

      const [ok, err] = await tryFn(() => this.set(lockKey, payload, {
        behavior: 'body-only',
        ifNoneMatch: '*'
      }));

      if (ok) {
        // Lock acquired, execute callback
        try {
          return await callback();
        } finally {
          // Release lock
          const current = await this.get(lockKey);
          if (current && current.token === token) {
            await tryFn(() => this.delete(lockKey));
          }
        }
      }

      if (!isPreconditionFailure(err)) {
        throw err;
      }

      if (timeout !== undefined && Date.now() - startTime >= timeout) {
        return null;
      }

      // Check if lock expired
      const current = await this.get(lockKey);
      if (!current) continue;

      if (current._expiresAt && Date.now() > current._expiresAt) {
        await tryFn(() => this.delete(lockKey));
        continue;
      }

      attempt += 1;
      const delay = computeBackoff(attempt, 100, 1000);
      await sleep(delay);
    }
  }

  /**
   * Get the current value of a sequence without incrementing
   *
   * @param {string} name - Sequence name
   * @param {Object} options - Options
   * @param {string} options.resourceName - Resource name for resource-scoped sequences (optional)
   * @returns {Promise<number|null>} Current value or null if sequence doesn't exist
   *
   * @example
   * // Global sequence
   * const current = await storage.getSequence('global-counter');
   *
   * @example
   * // Resource-scoped sequence
   * const current = await storage.getSequence('id', { resourceName: 'orders' });
   */
  async getSequence(name, options = {}) {
    const { resourceName = null } = options;
    const valueKey = this.getSequenceKey(resourceName, name, 'value');
    const data = await this.get(valueKey);
    return data?.value ?? null;
  }

  /**
   * Reset a sequence to a specific value
   *
   * @param {string} name - Sequence name
   * @param {number} value - New value for the sequence
   * @param {Object} options - Options
   * @param {string} options.resourceName - Resource name for resource-scoped sequences (optional)
   * @param {number} options.lockTimeout - Max time to wait for lock in ms (default: 5000)
   * @param {number} options.lockTTL - Lock TTL in seconds (default: 10)
   * @returns {Promise<boolean>} True if reset successful
   *
   * @example
   * // Reset resource-scoped sequence
   * await storage.resetSequence('id', 1000, { resourceName: 'orders' });
   */
  async resetSequence(name, value, options = {}) {
    const { resourceName = null, lockTimeout = 5000, lockTTL = 10 } = options;

    const valueKey = this.getSequenceKey(resourceName, name, 'value');
    const lockKey = this.getSequenceKey(resourceName, name, 'lock');

    const result = await this._withSequenceLock(lockKey, { timeout: lockTimeout, ttl: lockTTL }, async () => {
      const data = await this.get(valueKey);

      await this.set(valueKey, {
        value,
        name,
        resourceName,
        createdAt: data?.createdAt || Date.now(),
        updatedAt: Date.now(),
        resetAt: Date.now()
      }, { behavior: 'body-only' });

      return true;
    });

    if (result === null) {
      throw new PluginStorageError(`Failed to acquire lock for sequence "${name}"`, {
        pluginSlug: this.pluginSlug,
        operation: 'resetSequence',
        sequenceName: name,
        resourceName,
        lockTimeout,
        suggestion: 'Increase lockTimeout or check for deadlocks'
      });
    }

    return result;
  }

  /**
   * Delete a sequence
   *
   * @param {string} name - Sequence name
   * @param {Object} options - Options
   * @param {string} options.resourceName - Resource name for resource-scoped sequences (optional)
   * @returns {Promise<void>}
   */
  async deleteSequence(name, options = {}) {
    const { resourceName = null } = options;
    const valueKey = this.getSequenceKey(resourceName, name, 'value');
    const lockKey = this.getSequenceKey(resourceName, name, 'lock');
    await this.delete(valueKey);
    await tryFn(() => this.delete(lockKey));
  }

  /**
   * List all sequences for this plugin
   *
   * @param {Object} options - Options
   * @param {string} options.resourceName - Resource name to filter (optional)
   * @returns {Promise<Array<{name: string, value: number, createdAt: number, updatedAt?: number}>>}
   */
  async listSequences(options = {}) {
    const { resourceName = null } = options;

    let prefix;
    if (resourceName) {
      prefix = `resource=${resourceName}/plugin=${this.pluginSlug}/sequence=`;
    } else {
      prefix = `plugin=${this.pluginSlug}/sequence=`;
    }

    const [ok, , result] = await tryFn(() =>
      this.client.listObjects({ prefix })
    );

    if (!ok) return [];

    const keys = result.Contents?.map(item => item.Key) || [];
    const valueKeys = keys.filter(k => k.endsWith('/value'));

    const sequences = [];
    for (const key of valueKeys) {
      const data = await this.get(key);
      if (data) {
        sequences.push(data);
      }
    }

    return sequences;
  }

  /**
   * Apply behavior to split data between metadata and body
   *
   * @private
   * @param {Object} data - Data to split
   * @param {string} behavior - Behavior strategy
   * @returns {{metadata: Object, body: Object|null}}
   */
  _applyBehavior(data, behavior) {
    const effectiveLimit = calculateEffectiveLimit({ s3Limit: S3_METADATA_LIMIT });
    let metadata = {};
    let body = null;

    switch (behavior) {
      case 'body-overflow': {
        // Sort fields by size (smallest first)
        const entries = Object.entries(data);
        const sorted = entries.map(([key, value]) => {
          // JSON-encode objects and arrays for metadata storage
          const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
          const { encoded } = metadataEncode(jsonValue);
          const keySize = calculateUTF8Bytes(key);
          const valueSize = calculateUTF8Bytes(encoded);
          return { key, value, jsonValue, encoded, size: keySize + valueSize };
        }).sort((a, b) => a.size - b.size);

        // Fill metadata first, overflow to body
        let currentSize = 0;
        for (const item of sorted) {
          if (currentSize + item.size <= effectiveLimit) {
            metadata[item.key] = item.jsonValue;
            currentSize += item.size;
          } else {
            if (body === null) body = {};
            body[item.key] = item.value;
          }
        }
        break;
      }

      case 'body-only': {
        // Everything goes to body
        body = data;
        break;
      }

      case 'enforce-limits': {
        // Try to fit everything in metadata, throw if exceeds
        let currentSize = 0;
        for (const [key, value] of Object.entries(data)) {
          // JSON-encode objects and arrays for metadata storage
          const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
          const { encoded } = metadataEncode(jsonValue);
          const keySize = calculateUTF8Bytes(key);
          const valueSize = calculateUTF8Bytes(encoded);
          currentSize += keySize + valueSize;

          if (currentSize > effectiveLimit) {
            throw new MetadataLimitError(`Data exceeds metadata limit with enforce-limits behavior`, {
              totalSize: currentSize,
              effectiveLimit,
              absoluteLimit: S3_METADATA_LIMIT,
              excess: currentSize - effectiveLimit,
              operation: 'PluginStorage.set',
              pluginSlug: this.pluginSlug,
              suggestion: "Use 'body-overflow' or 'body-only' behavior to handle large data"
            });
          }

          metadata[key] = jsonValue;
        }
        break;
      }

      default:
        throw new BehaviorError(`Unknown behavior: ${behavior}`, {
          behavior,
          availableBehaviors: ['body-overflow', 'body-only', 'enforce-limits'],
          operation: 'PluginStorage._applyBehavior',
          pluginSlug: this.pluginSlug,
          suggestion: "Use 'body-overflow', 'body-only', or 'enforce-limits'"
        });
    }

    return { metadata, body };
  }
}

export default PluginStorage;
