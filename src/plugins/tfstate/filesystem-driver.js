/**
 * Filesystem Driver for TfState Plugin
 *
 * Reads Terraform/OpenTofu state files from local filesystem
 * Useful for development and testing
 */
import { TfStateDriver } from './base-driver.js';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import { TfStateError, StateFileNotFoundError } from './errors.js';

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
        throw new TfStateError(`Base path is not a directory: ${this.basePath}`, {
          operation: 'initialize',
          statusCode: 400,
          retriable: false,
          suggestion: 'Update the TfState filesystem driver configuration to point to a directory containing .tfstate files.',
          basePath: this.basePath
        });
      }
    } catch (error) {
      throw new TfStateError(`Invalid base path: ${this.basePath}`, {
        operation: 'initialize',
        statusCode: 400,
        retriable: false,
        suggestion: 'Ensure the basePath exists and is readable by the current process.',
        basePath: this.basePath,
        original: error
      });
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
      throw new TfStateError('Failed to list Terraform state files', {
        operation: 'listStateFiles',
        statusCode: 500,
        retriable: false,
        suggestion: 'Verify filesystem permissions and glob selector pattern.',
        selector: this.selector,
        basePath: this.basePath,
        original: error
      });
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
        throw new StateFileNotFoundError(path, {
          operation: 'readStateFile',
          retriable: false,
          suggestion: 'Ensure the Terraform state file exists at the specified path.',
          original: error
        });
      }
      throw new TfStateError(`Failed to read state file ${path}`, {
        operation: 'readStateFile',
        retriable: false,
        suggestion: 'Validate file permissions and state file contents (must be valid JSON).',
        path,
        original: error
      });
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
        throw new StateFileNotFoundError(path, {
          operation: 'getStateFileMetadata',
          retriable: false,
          suggestion: 'Ensure the Terraform state file exists at the specified path.',
          original: error
        });
      }
      throw new TfStateError(`Failed to get metadata for ${path}`, {
        operation: 'getStateFileMetadata',
        retriable: false,
        suggestion: 'Check filesystem permissions and path configuration for TfStatePlugin.',
        path,
        original: error
      });
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
