/**
 * Filesystem Driver for TfState Plugin
 *
 * Reads Terraform/OpenTofu state files from local filesystem
 * Useful for development and testing
 */
import { TfStateDriver } from './base-driver.js';
import { readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import { glob } from 'glob';

export class FilesystemTfStateDriver extends TfStateDriver {
  constructor(config = {}) {
    super(config);
    this.basePath = config.basePath || config.path || process.cwd();
  }

  /**
   * Initialize filesystem driver
   */
  async initialize() {
    // Verify base path exists
    try {
      const stats = await stat(this.basePath);
      if (!stats.isDirectory()) {
        throw new Error(`Base path is not a directory: ${this.basePath}`);
      }
    } catch (error) {
      throw new Error(`Invalid base path: ${this.basePath} - ${error.message}`);
    }
  }

  /**
   * List all state files matching the selector
   */
  async listStateFiles() {
    const pattern = join(this.basePath, this.selector);

    try {
      const files = await glob(pattern, {
        nodir: true,
        absolute: false,
        cwd: this.basePath
      });

      const stateFiles = await Promise.all(
        files.map(async (file) => {
          const fullPath = join(this.basePath, file);
          const stats = await stat(fullPath);

          return {
            path: file,
            fullPath,
            lastModified: stats.mtime,
            size: stats.size,
            etag: `${stats.mtime.getTime()}-${stats.size}` // Pseudo-etag
          };
        })
      );

      return stateFiles;
    } catch (error) {
      throw new Error(`Failed to list state files: ${error.message}`);
    }
  }

  /**
   * Read a state file from filesystem
   */
  async readStateFile(path) {
    const fullPath = path.startsWith(this.basePath)
      ? path
      : join(this.basePath, path);

    try {
      const content = await readFile(fullPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`State file not found: ${path}`);
      }
      throw new Error(`Failed to read state file ${path}: ${error.message}`);
    }
  }

  /**
   * Get state file metadata from filesystem
   */
  async getStateFileMetadata(path) {
    const fullPath = path.startsWith(this.basePath)
      ? path
      : join(this.basePath, path);

    try {
      const stats = await stat(fullPath);

      return {
        path,
        fullPath,
        lastModified: stats.mtime,
        size: stats.size,
        etag: `${stats.mtime.getTime()}-${stats.size}`
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`State file not found: ${path}`);
      }
      throw new Error(`Failed to get metadata for ${path}: ${error.message}`);
    }
  }

  /**
   * Check if state file has been modified
   */
  async hasBeenModified(path, since) {
    const metadata = await this.getStateFileMetadata(path);
    const lastModified = new Date(metadata.lastModified);
    const sinceDate = new Date(since);

    return lastModified > sinceDate;
  }

  /**
   * Close filesystem driver (no-op)
   */
  async close() {
    // Nothing to close for filesystem
  }
}
