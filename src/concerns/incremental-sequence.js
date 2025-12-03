/**
 * Incremental Sequence Manager for s3db.js
 *
 * Provides auto-incrementing ID generation using resource-scoped sequences.
 * Supports both standard mode (lock per ID) and fast mode (batch reservation).
 *
 * Storage structure (resource-scoped, NOT plugin-scoped):
 *   resource={resourceName}/sequence={fieldName}/value   - Current sequence value
 *   resource={resourceName}/sequence={fieldName}/lock    - Distributed lock
 *
 * ## Configuration Formats
 *
 * ### String Formats:
 * - `'incremental'` - Sequential IDs starting from 1
 * - `'incremental:1000'` - Start from specific value
 * - `'incremental:fast'` - Fast mode with batch reservation (~1ms/ID vs ~20-50ms)
 * - `'incremental:fast:1000'` - Fast mode starting from 1000
 * - `'incremental:ORD-0001'` - Prefixed IDs with zero-padding
 * - `'incremental:INV-1000'` - Prefix starting from 1000
 *
 * ### Object Format:
 * ```javascript
 * {
 *   type: 'incremental',      // Required
 *   start: 1,                 // Starting value (default: 1)
 *   increment: 1,             // Step between IDs (default: 1)
 *   mode: 'standard',         // 'standard' or 'fast' (default: 'standard')
 *   batchSize: 100,           // Batch size for fast mode (default: 100)
 *   prefix: '',               // ID prefix like 'ORD-' (default: '')
 *   padding: 0                // Zero-padding width (default: 0)
 * }
 * ```
 *
 * ## Modes
 *
 * ### Standard Mode (default)
 * - Each ID requires a distributed lock acquisition
 * - Guarantees strictly contiguous IDs (1, 2, 3, ...)
 * - Latency: ~20-50ms per ID
 * - Use for: Order numbers, invoice IDs, anything requiring strict sequence
 *
 * ### Fast Mode
 * - Reserves batches of IDs locally
 * - First ID in batch requires lock, subsequent are instant (~1ms)
 * - IDs are unique but may have gaps if process crashes mid-batch
 * - Use for: Logs, analytics events, bulk imports, high-traffic scenarios
 *
 * ## Validation Rules
 *
 * - `start`: Must be a finite integer
 * - `increment`: Must be a non-zero finite integer
 * - `mode`: Must be 'standard' or 'fast'
 * - `batchSize`: Must be a positive integer (1-100000)
 * - `prefix`: Must be a string, max 20 characters, alphanumeric + '-_'
 * - `padding`: Must be a non-negative integer (0-20)
 */

import { tryFn } from './try-fn.js';
import { idGenerator as generateId } from './id.js';
import { DistributedLock, computeBackoff, sleep, isPreconditionFailure } from './distributed-lock.js';

/** Default configuration values */
const INCREMENTAL_DEFAULTS = {
  start: 1,
  increment: 1,
  mode: 'standard',
  batchSize: 100,
  prefix: '',
  padding: 0
};

/** Validation constraints */
const VALIDATION_LIMITS = {
  maxPrefix: 20,
  maxPadding: 20,
  minBatchSize: 1,
  maxBatchSize: 100000,
  maxStartValue: Number.MAX_SAFE_INTEGER,
  minStartValue: Number.MIN_SAFE_INTEGER
};

/**
 * Validation error for incremental configuration
 */
export class IncrementalConfigError extends Error {
  constructor(message, field, value) {
    super(message);
    this.name = 'IncrementalConfigError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Validate incremental configuration
 *
 * @param {Object} config - Parsed configuration object
 * @param {Object} [options] - Validation options
 * @param {boolean} [options.throwOnError=true] - Throw on validation error
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string, value: any }> }}
 * @throws {IncrementalConfigError} If throwOnError is true and validation fails
 */
export function validateIncrementalConfig(config, options = {}) {
  const { throwOnError = true } = options;
  const errors = [];

  // Validate start
  if (config.start !== undefined) {
    if (typeof config.start !== 'number' || !Number.isFinite(config.start)) {
      errors.push({
        field: 'start',
        message: 'start must be a finite number',
        value: config.start
      });
    } else if (!Number.isInteger(config.start)) {
      errors.push({
        field: 'start',
        message: 'start must be an integer',
        value: config.start
      });
    } else if (config.start > VALIDATION_LIMITS.maxStartValue || config.start < VALIDATION_LIMITS.minStartValue) {
      errors.push({
        field: 'start',
        message: `start must be between ${VALIDATION_LIMITS.minStartValue} and ${VALIDATION_LIMITS.maxStartValue}`,
        value: config.start
      });
    }
  }

  // Validate increment
  if (config.increment !== undefined) {
    if (typeof config.increment !== 'number' || !Number.isFinite(config.increment)) {
      errors.push({
        field: 'increment',
        message: 'increment must be a finite number',
        value: config.increment
      });
    } else if (!Number.isInteger(config.increment)) {
      errors.push({
        field: 'increment',
        message: 'increment must be an integer',
        value: config.increment
      });
    } else if (config.increment === 0) {
      errors.push({
        field: 'increment',
        message: 'increment cannot be zero',
        value: config.increment
      });
    }
  }

  // Validate mode
  if (config.mode !== undefined) {
    const validModes = ['standard', 'fast'];
    if (!validModes.includes(config.mode)) {
      errors.push({
        field: 'mode',
        message: `mode must be one of: ${validModes.join(', ')}`,
        value: config.mode
      });
    }
  }

  // Validate batchSize
  if (config.batchSize !== undefined) {
    if (typeof config.batchSize !== 'number' || !Number.isFinite(config.batchSize)) {
      errors.push({
        field: 'batchSize',
        message: 'batchSize must be a finite number',
        value: config.batchSize
      });
    } else if (!Number.isInteger(config.batchSize)) {
      errors.push({
        field: 'batchSize',
        message: 'batchSize must be an integer',
        value: config.batchSize
      });
    } else if (config.batchSize < VALIDATION_LIMITS.minBatchSize || config.batchSize > VALIDATION_LIMITS.maxBatchSize) {
      errors.push({
        field: 'batchSize',
        message: `batchSize must be between ${VALIDATION_LIMITS.minBatchSize} and ${VALIDATION_LIMITS.maxBatchSize}`,
        value: config.batchSize
      });
    }
  }

  // Validate prefix
  if (config.prefix !== undefined) {
    if (typeof config.prefix !== 'string') {
      errors.push({
        field: 'prefix',
        message: 'prefix must be a string',
        value: config.prefix
      });
    } else if (config.prefix.length > VALIDATION_LIMITS.maxPrefix) {
      errors.push({
        field: 'prefix',
        message: `prefix must be at most ${VALIDATION_LIMITS.maxPrefix} characters`,
        value: config.prefix
      });
    } else if (config.prefix && !/^[A-Za-z0-9_-]+$/.test(config.prefix)) {
      errors.push({
        field: 'prefix',
        message: 'prefix must contain only alphanumeric characters, hyphens, and underscores',
        value: config.prefix
      });
    }
  }

  // Validate padding
  if (config.padding !== undefined) {
    if (typeof config.padding !== 'number' || !Number.isFinite(config.padding)) {
      errors.push({
        field: 'padding',
        message: 'padding must be a finite number',
        value: config.padding
      });
    } else if (!Number.isInteger(config.padding)) {
      errors.push({
        field: 'padding',
        message: 'padding must be an integer',
        value: config.padding
      });
    } else if (config.padding < 0 || config.padding > VALIDATION_LIMITS.maxPadding) {
      errors.push({
        field: 'padding',
        message: `padding must be between 0 and ${VALIDATION_LIMITS.maxPadding}`,
        value: config.padding
      });
    }
  }

  const result = {
    valid: errors.length === 0,
    errors
  };

  if (throwOnError && !result.valid) {
    const firstError = errors[0];
    throw new IncrementalConfigError(
      `Invalid incremental config: ${firstError.message}`,
      firstError.field,
      firstError.value
    );
  }

  return result;
}

/**
 * Parse incremental configuration from various formats
 *
 * @param {string|Object} config - Configuration in various formats
 * @param {Object} [options] - Options
 * @param {boolean} [options.validate=false] - Validate config after parsing
 * @returns {Object} Normalized configuration
 * @throws {IncrementalConfigError} If validate is true and validation fails
 *
 * @example
 * // String formats
 * parseIncrementalConfig('incremental')           // { start: 1, increment: 1, mode: 'standard', ... }
 * parseIncrementalConfig('incremental:1000')      // { start: 1000, ... }
 * parseIncrementalConfig('incremental:fast')      // { mode: 'fast', batchSize: 100, ... }
 * parseIncrementalConfig('incremental:ORD-0001')  // { prefix: 'ORD-', start: 1, padding: 4, ... }
 *
 * @example
 * // Object format
 * parseIncrementalConfig({
 *   type: 'incremental',
 *   start: 1000,
 *   increment: 10,
 *   mode: 'fast',
 *   batchSize: 500
 * })
 *
 * @example
 * // With validation
 * parseIncrementalConfig({ start: 'invalid' }, { validate: true })
 * // Throws: IncrementalConfigError: Invalid incremental config: start must be a finite number
 */
export function parseIncrementalConfig(config, options = {}) {
  const { validate = false } = options;
  let parsed;

  // Object config
  if (typeof config === 'object' && config !== null) {
    parsed = {
      ...INCREMENTAL_DEFAULTS,
      ...config,
      type: 'incremental'
    };
  }
  // String config
  else if (typeof config === 'string') {
    // Just 'incremental'
    if (config === 'incremental') {
      parsed = { ...INCREMENTAL_DEFAULTS, type: 'incremental' };
    }
    // Parse 'incremental:...'
    else if (config.startsWith('incremental:')) {
      const rest = config.slice('incremental:'.length);
      parsed = parseIncrementalSuffix(rest, INCREMENTAL_DEFAULTS);
    }
    // Unknown string format
    else {
      parsed = { ...INCREMENTAL_DEFAULTS, type: 'incremental' };
    }
  }
  // Fallback
  else {
    parsed = { ...INCREMENTAL_DEFAULTS, type: 'incremental' };
  }

  // Validate if requested
  if (validate) {
    validateIncrementalConfig(parsed);
  }

  return parsed;
}

/**
 * Parse the suffix after 'incremental:'
 * @param {string} suffix - The part after 'incremental:'
 * @param {Object} defaults - Default values
 * @returns {Object} Parsed configuration
 */
function parseIncrementalSuffix(suffix, defaults) {
  const result = { ...defaults, type: 'incremental' };

  // Check for 'fast' mode first
  if (suffix === 'fast') {
    result.mode = 'fast';
    return result;
  }

  if (suffix.startsWith('fast:')) {
    result.mode = 'fast';
    suffix = suffix.slice('fast:'.length);
  }

  // Try to parse as number (start value)
  const numValue = parseInt(suffix, 10);
  if (!isNaN(numValue) && String(numValue) === suffix) {
    result.start = numValue;
    return result;
  }

  // Try to parse as prefix pattern (e.g., 'ORD-0001', 'INV-1000')
  const prefixMatch = suffix.match(/^([A-Za-z]+-?)(\d+)$/);
  if (prefixMatch) {
    const [, prefix, numPart] = prefixMatch;
    result.prefix = prefix;
    result.start = parseInt(numPart, 10);
    result.padding = numPart.length;
    return result;
  }

  // Unknown format, just use as-is
  return result;
}

/**
 * Format an incremental value with optional prefix and padding
 * Always returns a string for compatibility with Resource ID handling
 * @param {number} value - The numeric value
 * @param {Object} options - Formatting options
 * @param {string} options.prefix - Prefix to prepend
 * @param {number} options.padding - Minimum digits (zero-padded)
 * @returns {string} Formatted value (always string)
 */
export function formatIncrementalValue(value, { prefix = '', padding = 0 } = {}) {
  const numStr = padding > 0
    ? String(value).padStart(padding, '0')
    : String(value);

  return prefix ? `${prefix}${numStr}` : numStr;
}

/**
 * SequenceStorage - Lightweight storage for resource-scoped sequences
 *
 * Uses resource-scoped paths: resource={resourceName}/sequence={fieldName}/...
 * This is NOT a plugin, so it doesn't use the plugin= prefix.
 *
 * Leverages shared DistributedLock utilities for locking logic.
 */
class SequenceStorage {
  constructor(client, resourceName) {
    this.client = client;
    this.resourceName = resourceName;

    // Initialize distributed lock with resource-scoped keys
    this._lock = new DistributedLock(this, {
      keyGenerator: (fieldName) => this.getLockKey(fieldName)
    });
  }

  getKey(fieldName, suffix) {
    return `resource=${this.resourceName}/sequence=${fieldName}/${suffix}`;
  }

  getLockKey(fieldName) {
    return this.getKey(fieldName, 'lock');
  }

  getValueKey(fieldName) {
    return this.getKey(fieldName, 'value');
  }

  async get(key) {
    const [ok, err, response] = await tryFn(() => this.client.getObject(key));

    if (!ok) {
      if (err.name === 'NoSuchKey' || err.code === 'NoSuchKey' ||
          err.Code === 'NoSuchKey' || err.statusCode === 404) {
        return null;
      }
      throw err;
    }

    if (response.Body) {
      const bodyContent = await response.Body.transformToString();
      if (bodyContent && bodyContent.trim()) {
        return JSON.parse(bodyContent);
      }
    }

    return null;
  }

  async set(key, data, options = {}) {
    const { ttl, ifNoneMatch } = options;

    const dataToSave = { ...data };
    if (ttl && typeof ttl === 'number' && ttl > 0) {
      dataToSave._expiresAt = Date.now() + (ttl * 1000);
    }

    const putParams = {
      key,
      body: JSON.stringify(dataToSave),
      contentType: 'application/json'
    };

    if (ifNoneMatch !== undefined) {
      putParams.ifNoneMatch = ifNoneMatch;
    }

    const [ok, err, response] = await tryFn(() => this.client.putObject(putParams));

    if (!ok) throw err;
    return response;
  }

  async delete(key) {
    await tryFn(() => this.client.deleteObject(key));
  }

  async acquireLock(fieldName, options = {}) {
    return this._lock.acquire(fieldName, options);
  }

  async releaseLock(lock) {
    if (!lock) return;
    return this._lock.release(lock);
  }

  async withLock(fieldName, options, callback) {
    return this._lock.withLock(fieldName, options, callback);
  }

  async nextSequence(fieldName, options = {}) {
    const { initialValue = 1, increment = 1, lockTimeout = 5000, lockTTL = 10 } = options;
    const valueKey = this.getValueKey(fieldName);

    const result = await this.withLock(fieldName, { timeout: lockTimeout, ttl: lockTTL }, async () => {
      const data = await this.get(valueKey);

      if (!data) {
        await this.set(valueKey, {
          value: initialValue + increment,
          name: fieldName,
          createdAt: Date.now()
        });
        return initialValue;
      }

      const currentValue = data.value;
      await this.set(valueKey, {
        ...data,
        value: currentValue + increment,
        updatedAt: Date.now()
      });

      return currentValue;
    });

    if (result === null) {
      throw new Error(`Failed to acquire lock for sequence "${fieldName}"`);
    }

    return result;
  }

  async getSequence(fieldName) {
    const valueKey = this.getValueKey(fieldName);
    const data = await this.get(valueKey);
    return data?.value ?? null;
  }

  async resetSequence(fieldName, value, options = {}) {
    const { lockTimeout = 5000, lockTTL = 10 } = options;
    const valueKey = this.getValueKey(fieldName);

    const result = await this.withLock(fieldName, { timeout: lockTimeout, ttl: lockTTL }, async () => {
      const data = await this.get(valueKey);

      await this.set(valueKey, {
        value,
        name: fieldName,
        createdAt: data?.createdAt || Date.now(),
        updatedAt: Date.now(),
        resetAt: Date.now()
      });

      return true;
    });

    if (result === null) {
      throw new Error(`Failed to acquire lock for sequence "${fieldName}"`);
    }

    return result;
  }

  async listSequences() {
    const prefix = `resource=${this.resourceName}/sequence=`;
    const [ok, err, result] = await tryFn(() =>
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
}

/**
 * IncrementalSequence - Manages sequences for a resource
 */
export class IncrementalSequence {
  /**
   * @param {Object} options
   * @param {Object} options.client - S3 client instance
   * @param {string} options.resourceName - Resource name for namespace isolation
   * @param {Object} options.config - Parsed incremental config
   * @param {Object} [options.logger] - Optional logger instance
   */
  constructor({ client, resourceName, config, logger }) {
    this.client = client;
    this.resourceName = resourceName;
    this.config = config;
    this.logger = logger || console;

    // Storage for sequences (resource-scoped, not plugin-scoped)
    this.storage = new SequenceStorage(client, resourceName);

    // Local batch state for fast mode
    this.localBatches = new Map();
  }

  /**
   * Get the next value from the sequence (standard mode)
   * @param {string} [fieldName='id'] - Field name
   * @returns {Promise<number|string>} Next value (formatted if prefix/padding configured)
   */
  async nextValue(fieldName = 'id') {
    const { start, increment, prefix, padding } = this.config;

    const value = await this.storage.nextSequence(fieldName, {
      initialValue: start,
      increment
    });

    return formatIncrementalValue(value, { prefix, padding });
  }

  /**
   * Get the next value using fast mode (batch reservation)
   * @param {string} [fieldName='id'] - Field name
   * @returns {Promise<number|string>} Next value from local batch
   */
  async nextValueFast(fieldName = 'id') {
    const batchKey = fieldName;
    let batch = this.localBatches.get(batchKey);

    // Reserve new batch if needed
    if (!batch || batch.current >= batch.end) {
      batch = await this.reserveBatch(fieldName);
      this.localBatches.set(batchKey, batch);
    }

    const value = batch.current++;
    const { prefix, padding } = this.config;

    return formatIncrementalValue(value, { prefix, padding });
  }

  /**
   * Reserve a batch of IDs
   * @param {string} [fieldName='id'] - Field name
   * @param {number} [count] - Number of IDs to reserve (defaults to config.batchSize)
   * @returns {Promise<Object>} Batch info { start, end, current }
   */
  async reserveBatch(fieldName = 'id', count) {
    const batchSize = count || this.config.batchSize;
    const { start: initialValue } = this.config;

    // Reserve a range by incrementing by batchSize
    const batchStart = await this.storage.nextSequence(fieldName, {
      initialValue,
      increment: batchSize
    });

    const batch = {
      start: batchStart,
      end: batchStart + batchSize,
      current: batchStart,
      reservedAt: Date.now()
    };


    return batch;
  }

  /**
   * Get the next value (auto-selects mode based on config)
   * @param {string} [fieldName='id'] - Field name
   * @returns {Promise<number|string>} Next value
   */
  async next(fieldName = 'id') {
    if (this.config.mode === 'fast') {
      return this.nextValueFast(fieldName);
    }
    return this.nextValue(fieldName);
  }

  /**
   * Get current sequence value without incrementing
   * @param {string} [fieldName='id'] - Field name
   * @returns {Promise<number|null>} Current value or null
   */
  async getValue(fieldName = 'id') {
    return this.storage.getSequence(fieldName);
  }

  /**
   * Reset sequence to a specific value
   * @param {string} fieldName - Field name
   * @param {number} value - New value
   * @returns {Promise<boolean>} Success
   */
  async reset(fieldName, value) {

    // Clear local batch if exists
    this.localBatches.delete(fieldName);

    return this.storage.resetSequence(fieldName, value);
  }

  /**
   * List all sequences for this resource
   * @returns {Promise<Array>} Sequence info array
   */
  async list() {
    return this.storage.listSequences();
  }

  /**
   * Get local batch status (fast mode only)
   * @param {string} [fieldName='id'] - Field name
   * @returns {Object|null} Batch status or null
   */
  getBatchStatus(fieldName = 'id') {
    const batch = this.localBatches.get(fieldName);
    if (!batch) return null;

    return {
      start: batch.start,
      end: batch.end,
      current: batch.current,
      remaining: batch.end - batch.current,
      reservedAt: batch.reservedAt
    };
  }

  /**
   * Release unused batch (for graceful shutdown)
   * @param {string} [fieldName='id'] - Field name
   */
  releaseBatch(fieldName = 'id') {
    const batch = this.localBatches.get(fieldName);
    if (batch) {
      const unused = batch.end - batch.current;
      this.logger.debug?.({ fieldName, unused }, 'Releasing batch with unused IDs');
      this.localBatches.delete(fieldName);
    }
  }
}

/**
 * Create an incremental ID generator function for Resource
 * @param {Object} options
 * @param {Object} options.client - S3 client
 * @param {string} options.resourceName - Resource name
 * @param {string|Object} options.config - Incremental config
 * @param {Object} [options.logger] - Logger instance
 * @returns {Function} Async ID generator function
 */
export function createIncrementalIdGenerator({ client, resourceName, config, logger }) {
  const parsedConfig = parseIncrementalConfig(config);
  const sequence = new IncrementalSequence({
    client,
    resourceName,
    config: parsedConfig,
    logger
  });

  // Return async generator function
  const generator = async () => {
    return sequence.next('id');
  };

  // Attach sequence instance for utility methods
  generator._sequence = sequence;
  generator._config = parsedConfig;

  return generator;
}

export default {
  parseIncrementalConfig,
  validateIncrementalConfig,
  formatIncrementalValue,
  IncrementalSequence,
  IncrementalConfigError,
  createIncrementalIdGenerator
};
