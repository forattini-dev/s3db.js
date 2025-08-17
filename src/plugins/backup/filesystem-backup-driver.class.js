import BaseBackupDriver from './base-backup-driver.class.js';
import { mkdir, copyFile, unlink, readdir, stat, access } from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import crypto from 'crypto';
import tryFn from '../../concerns/try-fn.js';

/**
 * FilesystemBackupDriver - Stores backups on local/network filesystem
 *
 * Configuration:
 * - path: Base directory for backups (supports template variables)
 * - permissions: File permissions (default: 0o644)
 * - directoryPermissions: Directory permissions (default: 0o755)
 */
export default class FilesystemBackupDriver extends BaseBackupDriver {
  constructor(config = {}) {
    super({
      path: './backups/{date}/',
      permissions: 0o644,
      directoryPermissions: 0o755,
      ...config
    });
  }

  getType() {
    return 'filesystem';
  }

  async onSetup() {
    // Validate path configuration
    if (!this.config.path) {
      throw new Error('FilesystemBackupDriver: path configuration is required');
    }

    this.log(`Initialized with path: ${this.config.path}`);
  }

  /**
   * Resolve path template variables
   * @param {string} backupId - Backup identifier
   * @param {Object} manifest - Backup manifest
   * @returns {string} Resolved path
   */
  resolvePath(backupId, manifest = {}) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '-'); // HH-MM-SS
    
    return this.config.path
      .replace('{date}', dateStr)
      .replace('{time}', timeStr)
      .replace('{year}', now.getFullYear().toString())
      .replace('{month}', (now.getMonth() + 1).toString().padStart(2, '0'))
      .replace('{day}', now.getDate().toString().padStart(2, '0'))
      .replace('{backupId}', backupId)
      .replace('{type}', manifest.type || 'backup');
  }

  async upload(filePath, backupId, manifest) {
    const targetDir = this.resolvePath(backupId, manifest);
    const targetPath = path.join(targetDir, `${backupId}.backup`);
    const manifestPath = path.join(targetDir, `${backupId}.manifest.json`);

    // Create target directory
    const [createDirOk, createDirErr] = await tryFn(() => 
      mkdir(targetDir, { recursive: true, mode: this.config.directoryPermissions })
    );
    
    if (!createDirOk) {
      throw new Error(`Failed to create backup directory: ${createDirErr.message}`);
    }

    // Copy backup file
    const [copyOk, copyErr] = await tryFn(() => copyFile(filePath, targetPath));
    if (!copyOk) {
      throw new Error(`Failed to copy backup file: ${copyErr.message}`);
    }

    // Write manifest
    const [manifestOk, manifestErr] = await tryFn(() => 
      import('fs/promises').then(fs => fs.writeFile(
        manifestPath, 
        JSON.stringify(manifest, null, 2),
        { mode: this.config.permissions }
      ))
    );
    
    if (!manifestOk) {
      // Clean up backup file if manifest fails
      await tryFn(() => unlink(targetPath));
      throw new Error(`Failed to write manifest: ${manifestErr.message}`);
    }

    // Get file stats
    const [statOk, , stats] = await tryFn(() => stat(targetPath));
    const size = statOk ? stats.size : 0;

    this.log(`Uploaded backup ${backupId} to ${targetPath} (${size} bytes)`);

    return {
      path: targetPath,
      manifestPath,
      size,
      uploadedAt: new Date().toISOString()
    };
  }

  async download(backupId, targetPath, metadata) {
    const sourcePath = metadata.path || path.join(
      this.resolvePath(backupId, metadata), 
      `${backupId}.backup`
    );

    // Check if source exists
    const [existsOk] = await tryFn(() => access(sourcePath));
    if (!existsOk) {
      throw new Error(`Backup file not found: ${sourcePath}`);
    }

    // Create target directory if needed
    const targetDir = path.dirname(targetPath);
    await tryFn(() => mkdir(targetDir, { recursive: true }));

    // Copy file
    const [copyOk, copyErr] = await tryFn(() => copyFile(sourcePath, targetPath));
    if (!copyOk) {
      throw new Error(`Failed to download backup: ${copyErr.message}`);
    }

    this.log(`Downloaded backup ${backupId} from ${sourcePath} to ${targetPath}`);
    return targetPath;
  }

  async delete(backupId, metadata) {
    const backupPath = metadata.path || path.join(
      this.resolvePath(backupId, metadata), 
      `${backupId}.backup`
    );
    const manifestPath = metadata.manifestPath || path.join(
      this.resolvePath(backupId, metadata), 
      `${backupId}.manifest.json`
    );

    // Delete backup file
    const [deleteBackupOk] = await tryFn(() => unlink(backupPath));
    
    // Delete manifest file
    const [deleteManifestOk] = await tryFn(() => unlink(manifestPath));

    if (!deleteBackupOk && !deleteManifestOk) {
      throw new Error(`Failed to delete backup files for ${backupId}`);
    }

    this.log(`Deleted backup ${backupId}`);
  }

  async list(options = {}) {
    const { limit = 50, prefix = '' } = options;
    const basePath = this.resolvePath('*').replace('*', '');
    
    try {
      const results = [];
      await this._scanDirectory(path.dirname(basePath), prefix, results, limit);
      
      // Sort by creation time (newest first)
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return results.slice(0, limit);
    } catch (error) {
      this.log(`Error listing backups: ${error.message}`);
      return [];
    }
  }

  async _scanDirectory(dirPath, prefix, results, limit) {
    if (results.length >= limit) return;

    const [readDirOk, , files] = await tryFn(() => readdir(dirPath));
    if (!readDirOk) return;

    for (const file of files) {
      if (results.length >= limit) break;

      const fullPath = path.join(dirPath, file);
      const [statOk, , stats] = await tryFn(() => stat(fullPath));
      
      if (!statOk) continue;

      if (stats.isDirectory()) {
        await this._scanDirectory(fullPath, prefix, results, limit);
      } else if (file.endsWith('.manifest.json')) {
        // Read manifest to get backup info
        const [readOk, , content] = await tryFn(() => 
          import('fs/promises').then(fs => fs.readFile(fullPath, 'utf8'))
        );
        
        if (readOk) {
          try {
            const manifest = JSON.parse(content);
            const backupId = file.replace('.manifest.json', '');
            
            if (!prefix || backupId.includes(prefix)) {
              results.push({
                id: backupId,
                path: fullPath.replace('.manifest.json', '.backup'),
                manifestPath: fullPath,
                size: stats.size,
                createdAt: manifest.createdAt || stats.birthtime.toISOString(),
                ...manifest
              });
            }
          } catch (parseErr) {
            this.log(`Failed to parse manifest ${fullPath}: ${parseErr.message}`);
          }
        }
      }
    }
  }

  async verify(backupId, expectedChecksum, metadata) {
    const backupPath = metadata.path || path.join(
      this.resolvePath(backupId, metadata), 
      `${backupId}.backup`
    );

    const [readOk, readErr] = await tryFn(async () => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(backupPath);
      
      await pipeline(stream, hash);
      const actualChecksum = hash.digest('hex');
      
      return actualChecksum === expectedChecksum;
    });

    if (!readOk) {
      this.log(`Verification failed for ${backupId}: ${readErr.message}`);
      return false;
    }

    return readOk;
  }

  getStorageInfo() {
    return {
      ...super.getStorageInfo(),
      path: this.config.path,
      permissions: this.config.permissions,
      directoryPermissions: this.config.directoryPermissions
    };
  }
}