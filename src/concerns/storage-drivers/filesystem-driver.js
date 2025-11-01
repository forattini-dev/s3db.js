/**
 * FilesystemStorageDriver - Filesystem-based storage driver for plugins
 *
 * Implements the same interface as PluginStorage (S3-based) for seamless switching.
 * Stores plugin data as JSON files in a hierarchical directory structure.
 *
 * Key Features:
 * - Same hierarchical key structure as PluginStorage
 * - JSON file storage with atomic writes
 * - Metadata support (stored alongside data)
 * - TTL support (stored as metadata)
 * - No S3 dependency (works offline)
 *
 * @example
 * const driver = new FilesystemStorageDriver({
 *   basePath: '/path/to/storage',
 *   pluginSlug: 'recon'
 * });
 *
 * await driver.set('config', { enabled: true });
 * const config = await driver.get('config');
 */

import fs from 'fs';
import path from 'path';
import { tryFn } from '../try-fn.js';
import { PluginStorageError } from '../../errors.js';

export class FilesystemStorageDriver {
  /**
   * @param {Object} config - Driver configuration
   * @param {string} config.basePath - Base directory for storage
   * @param {string} pluginSlug - Plugin identifier (kebab-case)
   */
  constructor(config, pluginSlug) {
    if (!config?.basePath) {
      throw new PluginStorageError('FilesystemStorageDriver requires basePath in config', {
        operation: 'constructor',
        suggestion: 'Provide a base directory path in config (e.g., { basePath: "./storage" })'
      });
    }
    if (!pluginSlug) {
      throw new PluginStorageError('FilesystemStorageDriver requires pluginSlug', {
        operation: 'constructor',
        suggestion: 'Provide a plugin slug (e.g., "recon", "cache", "audit")'
      });
    }

    this.basePath = config.basePath;
    this.pluginSlug = pluginSlug;

    // Create base directory if it doesn't exist
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  /**
   * Convert key to filesystem path
   */
  _keyToPath(key) {
    // Replace invalid filename characters
    const safePath = key
      .replace(/=/g, '-')
      .replace(/\//g, path.sep);

    return path.join(this.basePath, safePath + '.json');
  }

  /**
   * Save data with optional TTL and metadata
   *
   * @param {string} key - Storage key
   * @param {Object} data - Data to save
   * @param {Object} options - Options
   * @param {number} options.ttl - Time-to-live in seconds
   * @param {Object} options.metadata - Additional metadata
   * @returns {Promise<Object>} Result with ETag
   */
  async set(key, data, options = {}) {
    const { ttl, metadata = {} } = options;

    const filePath = this._keyToPath(key);
    const fileDir = path.dirname(filePath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    // Prepare storage object
    const storageObject = {
      key,
      data,
      metadata: {
        ...metadata,
        createdAt: new Date().toISOString(),
        pluginSlug: this.pluginSlug
      }
    };

    // Add TTL if specified
    if (ttl) {
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
      storageObject.metadata.ttl = ttl;
      storageObject.metadata.expiresAt = expiresAt;
    }

    // Atomic write: write to temp file, then rename
    const tempPath = filePath + '.tmp';
    const [ok, err] = await tryFn(async () => {
      await fs.promises.writeFile(tempPath, JSON.stringify(storageObject, null, 2), 'utf8');
      await fs.promises.rename(tempPath, filePath);
    });

    if (!ok) {
      throw new PluginStorageError(`Failed to save data: ${err.message}`, {
        operation: 'set',
        key,
        path: filePath,
        suggestion: 'Check filesystem permissions and available disk space'
      });
    }

    // Generate ETag (hash of file path + timestamp)
    const etag = Buffer.from(`${key}-${storageObject.metadata.createdAt}`).toString('base64');

    return { ETag: etag };
  }

  /**
   * Get data by key
   *
   * @param {string} key - Storage key
   * @returns {Promise<Object|null>} Data or null if not found/expired
   */
  async get(key) {
    const filePath = this._keyToPath(key);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return null;
    }

    // Read file
    const [ok, err, content] = await tryFn(async () => {
      return await fs.promises.readFile(filePath, 'utf8');
    });

    if (!ok) {
      throw new PluginStorageError(`Failed to read data: ${err.message}`, {
        operation: 'get',
        key,
        path: filePath,
        suggestion: 'Check filesystem permissions'
      });
    }

    // Parse JSON
    let storageObject;
    try {
      storageObject = JSON.parse(content);
    } catch (parseErr) {
      throw new PluginStorageError(`Failed to parse JSON: ${parseErr.message}`, {
        operation: 'get',
        key,
        path: filePath,
        suggestion: 'File may be corrupted. Check file contents.'
      });
    }

    // Check TTL expiration
    if (storageObject.metadata?.expiresAt) {
      const expiresAt = new Date(storageObject.metadata.expiresAt);
      if (expiresAt < new Date()) {
        // Expired - delete file and return null
        await this.delete(key);
        return null;
      }
    }

    return storageObject.data;
  }

  /**
   * Delete data by key
   *
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(key) {
    const filePath = this._keyToPath(key);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    const [ok, err] = await tryFn(async () => {
      await fs.promises.unlink(filePath);
    });

    if (!ok) {
      throw new PluginStorageError(`Failed to delete data: ${err.message}`, {
        operation: 'delete',
        key,
        path: filePath,
        suggestion: 'Check filesystem permissions'
      });
    }

    return true;
  }

  /**
   * List all keys with optional prefix filter
   *
   * @param {Object} options - List options
   * @param {string} options.prefix - Key prefix filter
   * @param {number} options.limit - Max keys to return
   * @returns {Promise<Array<string>>} List of keys
   */
  async list(options = {}) {
    const { prefix = '', limit } = options;

    const keys = [];

    // Recursively walk directory
    const walk = async (dir, currentPrefix = '') => {
      if (limit && keys.length >= limit) return;

      const [ok, err, entries] = await tryFn(async () => {
        return await fs.promises.readdir(dir, { withFileTypes: true });
      });

      if (!ok) {
        // Directory doesn't exist or can't be read - return empty
        return;
      }

      for (const entry of entries) {
        if (limit && keys.length >= limit) break;

        const entryPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const newPrefix = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
          await walk(entryPath, newPrefix);
        } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
          // Reconstruct key from path
          const relativePath = path.relative(this.basePath, entryPath);
          const key = relativePath
            .replace(new RegExp(`\\${path.sep}`, 'g'), '/')
            .replace(/\.json$/, '')
            .replace(/-/g, '=');

          if (!prefix || key.startsWith(prefix)) {
            keys.push(key);
          }
        }
      }
    };

    await walk(this.basePath);

    return keys;
  }

  /**
   * Delete all data for this plugin
   *
   * @returns {Promise<number>} Number of keys deleted
   */
  async deleteAll() {
    const keys = await this.list();
    let count = 0;

    for (const key of keys) {
      const deleted = await this.delete(key);
      if (deleted) count++;
    }

    return count;
  }
}
