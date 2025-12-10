/**
 * Filesystem Driver for TfState Plugin
 *
 * Reads Terraform/OpenTofu state files from local filesystem
 * Useful for development and testing
 */
import { TfStateDriver, type StateFileMetadata } from './base-driver.js';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import { TfStateError, StateFileNotFoundError } from './errors.js';

export interface FilesystemDriverConfig {
  basePath?: string;
  path?: string;
  selector?: string;
}

export interface StateFileMetadataExtended extends StateFileMetadata {
  fullPath: string;
}

export class FilesystemTfStateDriver extends TfStateDriver {
  basePath: string;

  constructor(config: FilesystemDriverConfig = {}) {
    super(config);
    this.basePath = config.basePath || config.path || process.cwd();
  }

  /**
   * Initialize filesystem driver
   */
  override async initialize(): Promise<void> {
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
    } catch (error: any) {
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
  override async listStateFiles(): Promise<StateFileMetadataExtended[]> {
    const pattern = join(this.basePath, this.selector);

    try {
      // glob v11 returns Promise<string[]> when used this way? 
      // Or glob.glob() returns promise? 
      // If import { glob } from 'glob', it's the function.
      // Types might say it takes callback or returns Glob object.
      // But assuming the JS code works, let's use 'any' or assume promise.
      // glob(pattern, options) usually returns Promise in v10+ if configured or default?
      // Actually, glob v10+ uses `glob` named export which returns Promise<string[]>.
      const files = await (glob as any)(pattern, {
        nodir: true,
        absolute: false,
        cwd: this.basePath
      });

      const stateFiles = await Promise.all(
        (files as string[]).map(async (file) => {
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
    } catch (error: any) {
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
  override async readStateFile(path: string): Promise<any> {
    const fullPath = path.startsWith(this.basePath)
      ? path
      : join(this.basePath, path);

    try {
      const content = await readFile(fullPath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
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
  override async getStateFileMetadata(path: string): Promise<StateFileMetadataExtended> {
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
    } catch (error: any) {
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
  override async hasBeenModified(path: string, since: Date): Promise<boolean> {
    const metadata = await this.getStateFileMetadata(path);
    const lastModified = new Date(metadata.lastModified);
    const sinceDate = new Date(since);

    return lastModified > sinceDate;
  }

  /**
   * Close filesystem driver (no-op)
   */
  override async close(): Promise<void> {
    // Nothing to close for filesystem
  }
}
