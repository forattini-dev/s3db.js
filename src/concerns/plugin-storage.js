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

const S3_METADATA_LIMIT = 2047; // AWS S3 metadata limit in bytes

export class PluginStorage {
  /**
   * @param {Object} client - S3db Client instance
   * @param {string} pluginSlug - Plugin identifier (kebab-case)
   */
  constructor(client, pluginSlug) {
    if (!client) {
      throw new Error('PluginStorage requires a client instance');
    }
    if (!pluginSlug) {
      throw new Error('PluginStorage requires a pluginSlug');
    }

    this.client = client;
    this.pluginSlug = pluginSlug;
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
   * Save data with metadata encoding, behavior support, and optional TTL
   *
   * @param {string} key - S3 key
   * @param {Object} data - Data to save
   * @param {Object} options - Options
   * @param {number} options.ttl - Time-to-live in seconds (optional)
   * @param {string} options.behavior - 'body-overflow' | 'body-only' | 'enforce-limits'
   * @param {string} options.contentType - Content type (default: application/json)
   * @returns {Promise<void>}
   */
  async set(key, data, options = {}) {
    const { ttl, behavior = 'body-overflow', contentType = 'application/json' } = options;

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

    // Save to S3
    const [ok, err] = await tryFn(() => this.client.putObject(putParams));

    if (!ok) {
      throw new Error(`PluginStorage.set failed for key ${key}: ${err.message}`);
    }
  }

  /**
   * Alias for set() to maintain backward compatibility
   * @deprecated Use set() instead
   */
  async put(key, data, options = {}) {
    return this.set(key, data, options);
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
      if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
        return null;
      }
      throw new Error(`PluginStorage.get failed for key ${key}: ${err.message}`);
    }

    // Metadata is already decoded by Client, but values are strings
    // We need to parse JSON values back to objects
    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);

    // Build final data object
    let data = parsedMetadata;

    // If has body, merge with metadata
    if (response.Body) {
      try {
        const bodyContent = await response.Body.transformToString();

        // Only parse if body has content
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          // Body takes precedence over metadata for same keys
          data = { ...parsedMetadata, ...body };
        }
      } catch (parseErr) {
        throw new Error(`PluginStorage.get failed to parse body for key ${key}: ${parseErr.message}`);
      }
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
          try {
            parsed[key] = JSON.parse(value);
            continue;
          } catch {
            // Not JSON, keep as string
          }
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
      throw new Error(`PluginStorage.list failed: ${err.message}`);
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
      throw new Error(`PluginStorage.listForResource failed: ${err.message}`);
    }

    // Remove keyPrefix from keys
    const keys = result.Contents?.map(item => item.Key) || [];
    return this._removeKeyPrefix(keys);
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
      try {
        const bodyContent = await response.Body.transformToString();
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          data = { ...parsedMetadata, ...body };
        }
      } catch {
        return true;
      }
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
      try {
        const bodyContent = await response.Body.transformToString();
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          data = { ...parsedMetadata, ...body };
        }
      } catch {
        return null;
      }
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
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));

    if (!ok) {
      return false;
    }

    const metadata = response.Metadata || {};
    const parsedMetadata = this._parseMetadataValues(metadata);

    let data = parsedMetadata;

    if (response.Body) {
      try {
        const bodyContent = await response.Body.transformToString();
        if (bodyContent && bodyContent.trim()) {
          const body = JSON.parse(bodyContent);
          data = { ...parsedMetadata, ...body };
        }
      } catch {
        return false;
      }
    }

    // S3 lowercases metadata keys
    const expiresAt = data._expiresat || data._expiresAt;
    if (!expiresAt) {
      return false; // No TTL to extend
    }

    // Extend TTL - use the standard field name (will be lowercased by S3)
    data._expiresAt = expiresAt + (additionalSeconds * 1000);
    delete data._expiresat; // Remove lowercased version

    // Save back (reuse same behavior)
    const { metadata: newMetadata, body: newBody } = this._applyBehavior(data, 'body-overflow');

    const putParams = {
      key,
      metadata: newMetadata,
      contentType: 'application/json'
    };

    if (newBody !== null) {
      putParams.body = JSON.stringify(newBody);
    }

    const [putOk] = await tryFn(() => this.client.putObject(putParams));
    return putOk;
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
      throw new Error(`PluginStorage.delete failed for key ${key}: ${err.message}`);
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
   * Batch put operations
   *
   * @param {Array<{key: string, data: Object, options?: Object}>} items - Items to save
   * @returns {Promise<Array<{key: string, ok: boolean, error?: Error}>>} Results
   */
  async batchPut(items) {
    const results = [];

    for (const item of items) {
      const [ok, err] = await tryFn(() =>
        this.put(item.key, item.data, item.options)
      );

      results.push({
        key: item.key,
        ok,
        error: err
      });
    }

    return results;
  }

  /**
   * Batch get operations
   *
   * @param {Array<string>} keys - Keys to fetch
   * @returns {Promise<Array<{key: string, ok: boolean, data?: Object, error?: Error}>>} Results
   */
  async batchGet(keys) {
    const results = [];

    for (const key of keys) {
      const [ok, err, data] = await tryFn(() => this.get(key));

      results.push({
        key,
        ok,
        data,
        error: err
      });
    }

    return results;
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
    const { ttl = 30, timeout = 0, workerId = 'unknown' } = options;
    const key = this.getPluginKey(null, 'locks', lockName);

    const startTime = Date.now();

    while (true) {
      // Try to acquire
      const existing = await this.get(key);
      if (!existing) {
        await this.set(key, { workerId, acquiredAt: Date.now() }, { ttl });
        return { key, workerId };
      }

      // Check timeout
      if (Date.now() - startTime >= timeout) {
        return null; // Could not acquire
      }

      // Wait and retry (100ms intervals)
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Release a distributed lock
   *
   * @param {string} lockName - Lock identifier
   * @returns {Promise<void>}
   */
  async releaseLock(lockName) {
    const key = this.getPluginKey(null, 'locks', lockName);
    await this.delete(key);
  }

  /**
   * Check if a lock is currently held
   *
   * @param {string} lockName - Lock identifier
   * @returns {Promise<boolean>} True if locked
   */
  async isLocked(lockName) {
    const key = this.getPluginKey(null, 'locks', lockName);
    const lock = await this.get(key);
    return lock !== null;
  }

  /**
   * Increment a counter value
   *
   * @param {string} key - S3 key
   * @param {number} amount - Amount to increment (default: 1)
   * @param {Object} options - Options (e.g., ttl)
   * @returns {Promise<number>} New value
   */
  async increment(key, amount = 1, options = {}) {
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
            throw new Error(
              `Data exceeds metadata limit (${currentSize} > ${effectiveLimit} bytes). ` +
              `Use 'body-overflow' or 'body-only' behavior.`
            );
          }

          metadata[key] = jsonValue;
        }
        break;
      }

      default:
        throw new Error(`Unknown behavior: ${behavior}. Use 'body-overflow', 'body-only', or 'enforce-limits'.`);
    }

    return { metadata, body };
  }
}

export default PluginStorage;
