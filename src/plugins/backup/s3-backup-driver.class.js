import BaseBackupDriver from './base-backup-driver.class.js';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import tryFn from '../../concerns/try-fn.js';

/**
 * S3BackupDriver - Stores backups in S3-compatible storage
 *
 * Configuration:
 * - bucket: S3 bucket name (optional, uses database bucket if not specified)
 * - path: Key prefix for backups (supports template variables)
 * - storageClass: S3 storage class (default: STANDARD_IA)
 * - serverSideEncryption: S3 server-side encryption (default: AES256)
 * - client: Custom S3 client (optional, uses database client if not specified)
 */
export default class S3BackupDriver extends BaseBackupDriver {
  constructor(config = {}) {
    super({
      bucket: null, // Will use database bucket if not specified
      path: 'backups/{date}/',
      storageClass: 'STANDARD_IA',
      serverSideEncryption: 'AES256',
      client: null, // Will use database client if not specified
      ...config
    });
  }

  getType() {
    return 's3';
  }

  async onSetup() {
    // Use database client if not provided
    if (!this.config.client) {
      this.config.client = this.database.client;
    }

    // Use database bucket if not specified
    if (!this.config.bucket) {
      this.config.bucket = this.database.bucket;
    }

    if (!this.config.client) {
      throw new Error('S3BackupDriver: client is required (either via config or database)');
    }

    if (!this.config.bucket) {
      throw new Error('S3BackupDriver: bucket is required (either via config or database)');
    }

    this.log(`Initialized with bucket: ${this.config.bucket}, path: ${this.config.path}`);
  }

  /**
   * Resolve S3 key template variables
   * @param {string} backupId - Backup identifier
   * @param {Object} manifest - Backup manifest
   * @returns {string} Resolved S3 key
   */
  resolveKey(backupId, manifest = {}) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '-'); // HH-MM-SS
    
    const basePath = this.config.path
      .replace('{date}', dateStr)
      .replace('{time}', timeStr)
      .replace('{year}', now.getFullYear().toString())
      .replace('{month}', (now.getMonth() + 1).toString().padStart(2, '0'))
      .replace('{day}', now.getDate().toString().padStart(2, '0'))
      .replace('{backupId}', backupId)
      .replace('{type}', manifest.type || 'backup');

    return path.posix.join(basePath, `${backupId}.backup`);
  }

  resolveManifestKey(backupId, manifest = {}) {
    return this.resolveKey(backupId, manifest).replace('.backup', '.manifest.json');
  }

  async upload(filePath, backupId, manifest) {
    const backupKey = this.resolveKey(backupId, manifest);
    const manifestKey = this.resolveManifestKey(backupId, manifest);

    // Get file size
    const [statOk, , stats] = await tryFn(() => stat(filePath));
    const fileSize = statOk ? stats.size : 0;

    // Upload backup file
    const [uploadOk, uploadErr] = await tryFn(async () => {
      const fileStream = createReadStream(filePath);
      
      return await this.config.client.uploadObject({
        bucket: this.config.bucket,
        key: backupKey,
        body: fileStream,
        contentLength: fileSize,
        metadata: {
          'backup-id': backupId,
          'backup-type': manifest.type || 'backup',
          'created-at': new Date().toISOString()
        },
        storageClass: this.config.storageClass,
        serverSideEncryption: this.config.serverSideEncryption
      });
    });

    if (!uploadOk) {
      throw new Error(`Failed to upload backup file: ${uploadErr.message}`);
    }

    // Upload manifest
    const [manifestOk, manifestErr] = await tryFn(() => 
      this.config.client.uploadObject({
        bucket: this.config.bucket,
        key: manifestKey,
        body: JSON.stringify(manifest, null, 2),
        contentType: 'application/json',
        metadata: {
          'backup-id': backupId,
          'manifest-for': backupKey
        },
        storageClass: this.config.storageClass,
        serverSideEncryption: this.config.serverSideEncryption
      })
    );

    if (!manifestOk) {
      // Clean up backup file if manifest upload fails
      await tryFn(() => this.config.client.deleteObject({
        bucket: this.config.bucket,
        key: backupKey
      }));
      throw new Error(`Failed to upload manifest: ${manifestErr.message}`);
    }

    this.log(`Uploaded backup ${backupId} to s3://${this.config.bucket}/${backupKey} (${fileSize} bytes)`);

    return {
      bucket: this.config.bucket,
      key: backupKey,
      manifestKey,
      size: fileSize,
      storageClass: this.config.storageClass,
      uploadedAt: new Date().toISOString(),
      etag: uploadOk?.ETag
    };
  }

  async download(backupId, targetPath, metadata) {
    const backupKey = metadata.key || this.resolveKey(backupId, metadata);

    const [downloadOk, downloadErr] = await tryFn(() => 
      this.config.client.downloadObject({
        bucket: this.config.bucket,
        key: backupKey,
        filePath: targetPath
      })
    );

    if (!downloadOk) {
      throw new Error(`Failed to download backup: ${downloadErr.message}`);
    }

    this.log(`Downloaded backup ${backupId} from s3://${this.config.bucket}/${backupKey} to ${targetPath}`);
    return targetPath;
  }

  async delete(backupId, metadata) {
    const backupKey = metadata.key || this.resolveKey(backupId, metadata);
    const manifestKey = metadata.manifestKey || this.resolveManifestKey(backupId, metadata);

    // Delete backup file
    const [deleteBackupOk] = await tryFn(() => 
      this.config.client.deleteObject({
        bucket: this.config.bucket,
        key: backupKey
      })
    );

    // Delete manifest
    const [deleteManifestOk] = await tryFn(() => 
      this.config.client.deleteObject({
        bucket: this.config.bucket,
        key: manifestKey
      })
    );

    if (!deleteBackupOk && !deleteManifestOk) {
      throw new Error(`Failed to delete backup objects for ${backupId}`);
    }

    this.log(`Deleted backup ${backupId} from S3`);
  }

  async list(options = {}) {
    const { limit = 50, prefix = '' } = options;
    const searchPrefix = this.config.path.replace(/\{[^}]+\}/g, '');
    
    const [listOk, listErr, response] = await tryFn(() => 
      this.config.client.listObjects({
        bucket: this.config.bucket,
        prefix: searchPrefix,
        maxKeys: limit * 2 // Get more to account for manifest files
      })
    );

    if (!listOk) {
      this.log(`Error listing S3 objects: ${listErr.message}`);
      return [];
    }

    const manifestObjects = (response.Contents || [])
      .filter(obj => obj.Key.endsWith('.manifest.json'))
      .filter(obj => !prefix || obj.Key.includes(prefix));

    const results = [];
    
    for (const obj of manifestObjects.slice(0, limit)) {
      const [manifestOk, , manifestContent] = await tryFn(() => 
        this.config.client.getObject({
          bucket: this.config.bucket,
          key: obj.Key
        })
      );

      if (manifestOk) {
        try {
          const manifest = JSON.parse(manifestContent);
          const backupId = path.basename(obj.Key, '.manifest.json');
          
          results.push({
            id: backupId,
            bucket: this.config.bucket,
            key: obj.Key.replace('.manifest.json', '.backup'),
            manifestKey: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
            storageClass: obj.StorageClass,
            createdAt: manifest.createdAt || obj.LastModified,
            ...manifest
          });
        } catch (parseErr) {
          this.log(`Failed to parse manifest ${obj.Key}: ${parseErr.message}`);
        }
      }
    }

    // Sort by creation time (newest first)
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return results;
  }

  async verify(backupId, expectedChecksum, metadata) {
    const backupKey = metadata.key || this.resolveKey(backupId, metadata);

    const [verifyOk, verifyErr] = await tryFn(async () => {
      // Get object metadata to check ETag
      const headResponse = await this.config.client.headObject({
        bucket: this.config.bucket,
        key: backupKey
      });

      // For single-part uploads, ETag is the MD5 hash
      // For multipart uploads, ETag has a suffix like "-2"
      const etag = headResponse.ETag?.replace(/"/g, '');
      
      if (etag && !etag.includes('-')) {
        // Single-part upload, ETag is MD5
        const expectedMd5 = crypto.createHash('md5').update(expectedChecksum).digest('hex');
        return etag === expectedMd5;
      } else {
        // For multipart uploads or SHA256 comparison, download and verify
        const [streamOk, , stream] = await tryFn(() => 
          this.config.client.getObjectStream({
            bucket: this.config.bucket,
            key: backupKey
          })
        );

        if (!streamOk) return false;

        const hash = crypto.createHash('sha256');
        for await (const chunk of stream) {
          hash.update(chunk);
        }
        
        const actualChecksum = hash.digest('hex');
        return actualChecksum === expectedChecksum;
      }
    });

    if (!verifyOk) {
      this.log(`Verification failed for ${backupId}: ${verifyErr?.message || 'checksum mismatch'}`);
      return false;
    }

    return true;
  }

  getStorageInfo() {
    return {
      ...super.getStorageInfo(),
      bucket: this.config.bucket,
      path: this.config.path,
      storageClass: this.config.storageClass,
      serverSideEncryption: this.config.serverSideEncryption
    };
  }
}