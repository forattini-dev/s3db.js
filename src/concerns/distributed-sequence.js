/**
 * Distributed Sequence - Shared sequence primitives for S3-based coordination
 *
 * Provides atomic distributed sequences using S3 storage with locking.
 * Used by both PluginStorage and IncrementalSequence for sequence management.
 *
 * Features:
 * - Atomic increment with distributed locking
 * - Resource-scoped or plugin-scoped paths
 * - Get, reset, and list operations
 *
 * @example
 * const seq = new DistributedSequence(storage, lock, {
 *   valueKeyGenerator: (name) => `sequences/${name}/value`,
 *   lockKeyGenerator: (name) => `sequences/${name}/lock`
 * });
 *
 * const nextId = await seq.next('counter', { initialValue: 1, increment: 1 });
 * const current = await seq.get('counter');
 * await seq.reset('counter', 100);
 */

import { tryFn } from './try-fn.js';
import { DistributedLock } from './distributed-lock.js';

/**
 * Default sequence configuration
 */
const SEQUENCE_DEFAULTS = {
  initialValue: 1,
  increment: 1,
  lockTimeout: 5000,
  lockTTL: 10
};

/**
 * DistributedSequence - Atomic distributed sequences
 *
 * Storage adapter interface (must implement):
 * - async get(key) → Object|null
 * - async set(key, data, options) → response
 * - async delete(key) → void
 */
export class DistributedSequence {
  /**
   * @param {Object} storage - Storage adapter with get/set/delete methods
   * @param {Object} [options] - Configuration options
   * @param {Function} [options.valueKeyGenerator] - Function to generate value key from name
   * @param {Function} [options.lockKeyGenerator] - Function to generate lock key from name
   * @param {Object} [options.defaults] - Default options for next/reset
   */
  constructor(storage, options = {}) {
    if (!storage) {
      throw new Error('DistributedSequence requires a storage adapter');
    }

    this.storage = storage;
    this.valueKeyGenerator = options.valueKeyGenerator || ((name) => `sequences/${name}/value`);
    this.lockKeyGenerator = options.lockKeyGenerator || ((name) => `sequences/${name}/lock`);
    this.defaults = { ...SEQUENCE_DEFAULTS, ...options.defaults };

    // Create lock instance with the same storage
    this.lock = new DistributedLock(storage, {
      keyGenerator: this.lockKeyGenerator,
      defaults: {
        ttl: this.defaults.lockTTL,
        timeout: this.defaults.lockTimeout
      }
    });
  }

  /**
   * Get the next value from a sequence (atomic, distributed-safe)
   *
   * Returns the current value BEFORE incrementing (suitable for use as an ID).
   *
   * @param {string} name - Sequence name
   * @param {Object} [options] - Sequence options
   * @param {number} [options.initialValue=1] - Starting value if sequence doesn't exist
   * @param {number} [options.increment=1] - Amount to increment
   * @param {number} [options.lockTimeout=5000] - Max time to wait for lock in ms
   * @param {number} [options.lockTTL=10] - Lock TTL in seconds
   * @param {Object} [options.metadata] - Additional metadata to store with sequence
   * @returns {Promise<number>} The sequence value (before increment)
   * @throws {Error} If lock cannot be acquired
   */
  async next(name, options = {}) {
    const opts = { ...this.defaults, ...options };
    const { initialValue, increment, lockTimeout, lockTTL, metadata } = opts;
    const valueKey = this.valueKeyGenerator(name);

    const result = await this.lock.withLock(name, {
      timeout: lockTimeout,
      ttl: lockTTL
    }, async () => {
      const data = await this.storage.get(valueKey);

      if (!data) {
        // Initialize sequence
        await this.storage.set(valueKey, {
          value: initialValue + increment,
          name,
          createdAt: Date.now(),
          ...metadata
        }, { behavior: 'body-only' });
        return initialValue;
      }

      // Get current value and increment
      const currentValue = data.value;
      await this.storage.set(valueKey, {
        ...data,
        value: currentValue + increment,
        updatedAt: Date.now()
      }, { behavior: 'body-only' });

      return currentValue;
    });

    if (result === null) {
      throw new Error(`Failed to acquire lock for sequence "${name}"`);
    }

    return result;
  }

  /**
   * Get the current value of a sequence without incrementing
   *
   * @param {string} name - Sequence name
   * @returns {Promise<number|null>} Current value or null if sequence doesn't exist
   */
  async get(name) {
    const valueKey = this.valueKeyGenerator(name);
    const data = await this.storage.get(valueKey);
    return data?.value ?? null;
  }

  /**
   * Get full sequence data including metadata
   *
   * @param {string} name - Sequence name
   * @returns {Promise<Object|null>} Full sequence data or null
   */
  async getData(name) {
    const valueKey = this.valueKeyGenerator(name);
    return this.storage.get(valueKey);
  }

  /**
   * Reset a sequence to a specific value
   *
   * @param {string} name - Sequence name
   * @param {number} value - New value for the sequence
   * @param {Object} [options] - Options
   * @param {number} [options.lockTimeout=5000] - Max time to wait for lock in ms
   * @param {number} [options.lockTTL=10] - Lock TTL in seconds
   * @param {Object} [options.metadata] - Additional metadata to store
   * @returns {Promise<boolean>} True if reset successful
   * @throws {Error} If lock cannot be acquired
   */
  async reset(name, value, options = {}) {
    const opts = { ...this.defaults, ...options };
    const { lockTimeout, lockTTL, metadata } = opts;
    const valueKey = this.valueKeyGenerator(name);

    const result = await this.lock.withLock(name, {
      timeout: lockTimeout,
      ttl: lockTTL
    }, async () => {
      const data = await this.storage.get(valueKey);

      await this.storage.set(valueKey, {
        value,
        name,
        createdAt: data?.createdAt || Date.now(),
        updatedAt: Date.now(),
        resetAt: Date.now(),
        ...metadata
      }, { behavior: 'body-only' });

      return true;
    });

    if (result === null) {
      throw new Error(`Failed to acquire lock for sequence "${name}"`);
    }

    return result;
  }

  /**
   * Set sequence to a specific value (alias for reset with metadata support)
   *
   * @param {string} name - Sequence name
   * @param {number} value - New value
   * @param {Object} [options] - Options including metadata
   * @returns {Promise<boolean>} True if set successful
   */
  async set(name, value, options = {}) {
    return this.reset(name, value, options);
  }

  /**
   * Delete a sequence
   *
   * @param {string} name - Sequence name
   * @returns {Promise<void>}
   */
  async delete(name) {
    const valueKey = this.valueKeyGenerator(name);
    const lockKey = this.lockKeyGenerator(name);
    await this.storage.delete(valueKey);
    await tryFn(() => this.storage.delete(lockKey));
  }

  /**
   * Check if a sequence exists
   *
   * @param {string} name - Sequence name
   * @returns {Promise<boolean>} True if sequence exists
   */
  async exists(name) {
    const value = await this.get(name);
    return value !== null;
  }

  /**
   * Increment and return the NEW value (post-increment)
   * Unlike next() which returns pre-increment value
   *
   * @param {string} name - Sequence name
   * @param {Object} [options] - Sequence options
   * @returns {Promise<number>} The sequence value (after increment)
   */
  async increment(name, options = {}) {
    const opts = { ...this.defaults, ...options };
    const { increment } = opts;
    const preValue = await this.next(name, options);
    return preValue + increment;
  }
}

/**
 * Create a DistributedSequence with custom key generators
 *
 * @param {Object} storage - Storage adapter
 * @param {Object} options - Options
 * @param {string} [options.prefix] - Key prefix
 * @param {string} [options.resourceName] - Resource name for scoping
 * @param {string} [options.pluginSlug] - Plugin slug for scoping
 * @returns {DistributedSequence}
 */
export function createSequence(storage, options = {}) {
  const { prefix = '', resourceName, pluginSlug } = options;

  let valueKeyGenerator;
  let lockKeyGenerator;

  if (resourceName && pluginSlug) {
    // Plugin + resource scoped: resource={name}/plugin={slug}/sequence={seq}/...
    valueKeyGenerator = (name) =>
      `resource=${resourceName}/plugin=${pluginSlug}/sequence=${name}/value`;
    lockKeyGenerator = (name) =>
      `resource=${resourceName}/plugin=${pluginSlug}/sequence=${name}/lock`;
  } else if (resourceName) {
    // Resource scoped: resource={name}/sequence={seq}/...
    valueKeyGenerator = (name) => `resource=${resourceName}/sequence=${name}/value`;
    lockKeyGenerator = (name) => `resource=${resourceName}/sequence=${name}/lock`;
  } else if (pluginSlug) {
    // Plugin scoped: plugin={slug}/sequence={seq}/...
    valueKeyGenerator = (name) => `plugin=${pluginSlug}/sequence=${name}/value`;
    lockKeyGenerator = (name) => `plugin=${pluginSlug}/sequence=${name}/lock`;
  } else if (prefix) {
    // Custom prefix
    valueKeyGenerator = (name) => `${prefix}sequence=${name}/value`;
    lockKeyGenerator = (name) => `${prefix}sequence=${name}/lock`;
  }

  return new DistributedSequence(storage, {
    ...options,
    valueKeyGenerator,
    lockKeyGenerator
  });
}

export default DistributedSequence;
