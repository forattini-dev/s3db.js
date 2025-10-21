/**
 * Output Drivers - Unified file output system for plugins
 *
 * Provides consistent API for writing files to:
 * - S3 (via PluginStorage - default)
 * - S3 Custom (external bucket)
 * - Filesystem (local)
 *
 * Features:
 * - ✅ Consistent API across all drivers
 * - ✅ Automatic path normalization
 * - ✅ Streaming support
 * - ✅ Clean error messages
 *
 * @example
 * // S3 Default (PluginStorage)
 * const driver = OutputDriverFactory.create({
 *   driver: 's3',
 *   pluginStorage: storage
 * });
 *
 * // S3 Custom
 * const driver = OutputDriverFactory.create({
 *   driver: 's3',
 *   connectionString: 's3://...'
 * });
 *
 * // Filesystem
 * const driver = OutputDriverFactory.create({
 *   driver: 'filesystem',
 *   basePath: './exports'
 * });
 */

import * as fs from 'fs';
import * as path from 'path';
import { Client } from '../../client.class.js';
import { PluginStorage } from '../../concerns/plugin-storage.js';
import tryFn from '../../concerns/try-fn.js';

/**
 * Base Output Driver
 */
export class BaseOutputDriver {
  /**
   * Write data to file
   * @param {string} filePath - File path
   * @param {string|Buffer} data - Data to write
   * @param {Object} options - Write options
   * @returns {Promise<void>}
   */
  async write(filePath, data, options = {}) {
    throw new Error('write() must be implemented by subclass');
  }

  /**
   * Append data to file
   * @param {string} filePath - File path
   * @param {string|Buffer} data - Data to append
   * @param {Object} options - Append options
   * @returns {Promise<void>}
   */
  async append(filePath, data, options = {}) {
    throw new Error('append() must be implemented by subclass');
  }

  /**
   * Read file
   * @param {string} filePath - File path
   * @returns {Promise<string|Buffer>}
   */
  async read(filePath) {
    throw new Error('read() must be implemented by subclass');
  }

  /**
   * Check if file exists
   * @param {string} filePath - File path
   * @returns {Promise<boolean>}
   */
  async exists(filePath) {
    throw new Error('exists() must be implemented by subclass');
  }

  /**
   * Delete file
   * @param {string} filePath - File path
   * @returns {Promise<void>}
   */
  async delete(filePath) {
    throw new Error('delete() must be implemented by subclass');
  }

  /**
   * List files
   * @param {string} prefix - Path prefix
   * @returns {Promise<string[]>}
   */
  async list(prefix = '') {
    throw new Error('list() must be implemented by subclass');
  }

  /**
   * Get file size
   * @param {string} filePath - File path
   * @returns {Promise<number>} Size in bytes
   */
  async size(filePath) {
    throw new Error('size() must be implemented by subclass');
  }
}

/**
 * S3 Output Driver (uses PluginStorage or custom Client)
 */
export class S3OutputDriver extends BaseOutputDriver {
  /**
   * @param {Object} config
   * @param {PluginStorage} config.pluginStorage - PluginStorage instance (for default S3)
   * @param {Client} config.client - S3 Client instance (for custom S3)
   * @param {string} config.basePath - Base path for files
   */
  constructor(config = {}) {
    super();

    if (!config.pluginStorage && !config.client) {
      throw new Error('S3OutputDriver requires either pluginStorage or client');
    }

    this.pluginStorage = config.pluginStorage;
    this.client = config.client;
    this.basePath = config.basePath || '';
  }

  _getFullPath(filePath) {
    return this.basePath ? `${this.basePath}/${filePath}` : filePath;
  }

  async write(filePath, data, options = {}) {
    const fullPath = this._getFullPath(filePath);

    if (this.pluginStorage) {
      // Use PluginStorage
      await this.pluginStorage.set(
        this.pluginStorage.getPluginKey(null, fullPath),
        { content: data },
        { behavior: 'body-only', ...options }
      );
    } else {
      // Use custom Client
      await this.client.putObject({
        key: fullPath,
        body: typeof data === 'string' ? data : JSON.stringify(data),
        contentType: options.contentType || 'application/octet-stream'
      });
    }
  }

  async append(filePath, data, options = {}) {
    const fullPath = this._getFullPath(filePath);

    // Read existing content
    const [existsOk, existsErr, existing] = await tryFn(() => this.read(filePath));

    const existingData = existsOk ? existing : '';
    const newData = existingData + data;

    // Write combined content
    await this.write(filePath, newData, options);
  }

  async read(filePath) {
    const fullPath = this._getFullPath(filePath);

    if (this.pluginStorage) {
      // Use PluginStorage
      const data = await this.pluginStorage.get(
        this.pluginStorage.getPluginKey(null, fullPath)
      );
      return data?.content || null;
    } else {
      // Use custom Client
      const [ok, err, response] = await tryFn(() => this.client.getObject(fullPath));

      if (!ok) {
        if (err.name === 'NoSuchKey') return null;
        throw err;
      }

      return await response.Body.transformToString();
    }
  }

  async exists(filePath) {
    const fullPath = this._getFullPath(filePath);

    if (this.pluginStorage) {
      return await this.pluginStorage.has(
        this.pluginStorage.getPluginKey(null, fullPath)
      );
    } else {
      return await this.client.exists(fullPath);
    }
  }

  async delete(filePath) {
    const fullPath = this._getFullPath(filePath);

    if (this.pluginStorage) {
      await this.pluginStorage.delete(
        this.pluginStorage.getPluginKey(null, fullPath)
      );
    } else {
      await this.client.deleteObject(fullPath);
    }
  }

  async list(prefix = '') {
    const fullPrefix = this._getFullPath(prefix);

    if (this.pluginStorage) {
      return await this.pluginStorage.list(fullPrefix);
    } else {
      const response = await this.client.listObjects({ prefix: fullPrefix });
      return response.Contents?.map(item => item.Key) || [];
    }
  }

  async size(filePath) {
    const fullPath = this._getFullPath(filePath);

    if (this.pluginStorage) {
      const data = await this.read(filePath);
      if (!data) return 0;
      return Buffer.byteLength(data, 'utf8');
    } else {
      const response = await this.client.headObject(fullPath);
      return response.ContentLength || 0;
    }
  }
}

/**
 * Filesystem Output Driver
 */
export class FilesystemOutputDriver extends BaseOutputDriver {
  /**
   * @param {Object} config
   * @param {string} config.basePath - Base directory path
   */
  constructor(config = {}) {
    super();

    if (!config.basePath) {
      throw new Error('FilesystemOutputDriver requires basePath');
    }

    this.basePath = config.basePath;
  }

  _getFullPath(filePath) {
    return path.join(this.basePath, filePath);
  }

  _ensureDirectory(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async write(filePath, data, options = {}) {
    const fullPath = this._getFullPath(filePath);
    this._ensureDirectory(fullPath);

    await fs.promises.writeFile(
      fullPath,
      data,
      { encoding: options.encoding || 'utf8' }
    );
  }

  async append(filePath, data, options = {}) {
    const fullPath = this._getFullPath(filePath);
    this._ensureDirectory(fullPath);

    await fs.promises.appendFile(
      fullPath,
      data,
      { encoding: options.encoding || 'utf8' }
    );
  }

  async read(filePath) {
    const fullPath = this._getFullPath(filePath);

    const [ok, err, data] = await tryFn(() =>
      fs.promises.readFile(fullPath, { encoding: 'utf8' })
    );

    if (!ok) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }

    return data;
  }

  async exists(filePath) {
    const fullPath = this._getFullPath(filePath);
    return fs.existsSync(fullPath);
  }

  async delete(filePath) {
    const fullPath = this._getFullPath(filePath);

    if (await this.exists(filePath)) {
      await fs.promises.unlink(fullPath);
    }
  }

  async list(prefix = '') {
    const fullPath = this._getFullPath(prefix);

    const [ok, err, files] = await tryFn(async () => {
      if (!fs.existsSync(fullPath)) return [];

      const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
      return entries
        .filter(entry => entry.isFile())
        .map(entry => path.join(prefix, entry.name));
    });

    return ok ? files : [];
  }

  async size(filePath) {
    const fullPath = this._getFullPath(filePath);

    const [ok, err, stats] = await tryFn(() =>
      fs.promises.stat(fullPath)
    );

    if (!ok) {
      if (err.code === 'ENOENT') return 0;
      throw err;
    }

    return stats.size;
  }
}

/**
 * Output Driver Factory
 */
export class OutputDriverFactory {
  /**
   * Create output driver from configuration
   *
   * @param {Object} config - Driver configuration
   * @param {string} config.driver - Driver type ('s3', 'filesystem')
   * @param {string} config.path - Base path
   * @param {string} config.connectionString - S3 connection string (for custom S3)
   * @param {PluginStorage} config.pluginStorage - PluginStorage instance (for default S3)
   * @returns {BaseOutputDriver}
   *
   * @example
   * // S3 with PluginStorage (default)
   * OutputDriverFactory.create({
   *   driver: 's3',
   *   path: 'exports',
   *   pluginStorage: storage
   * });
   *
   * // S3 with custom connection
   * OutputDriverFactory.create({
   *   driver: 's3',
   *   connectionString: 's3://...',
   *   path: 'exports'
   * });
   *
   * // Filesystem
   * OutputDriverFactory.create({
   *   driver: 'filesystem',
   *   path: './exports'
   * });
   */
  static create(config = {}) {
    const { driver = 's3', path: basePath, connectionString, pluginStorage } = config;

    switch (driver) {
      case 's3': {
        if (connectionString) {
          // Custom S3
          const client = new Client({ connectionString });
          return new S3OutputDriver({ client, basePath });
        } else if (pluginStorage) {
          // Default S3 (PluginStorage)
          return new S3OutputDriver({ pluginStorage, basePath });
        } else {
          throw new Error('S3 driver requires either connectionString or pluginStorage');
        }
      }

      case 'filesystem': {
        if (!basePath) {
          throw new Error('Filesystem driver requires path');
        }
        return new FilesystemOutputDriver({ basePath });
      }

      default:
        throw new Error(`Unknown output driver: ${driver}. Available: s3, filesystem`);
    }
  }
}

// Export individual classes
export default {
  BaseOutputDriver,
  S3OutputDriver,
  FilesystemOutputDriver,
  OutputDriverFactory
};
