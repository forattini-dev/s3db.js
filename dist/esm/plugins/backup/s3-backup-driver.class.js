import BaseBackupDriver from './base-backup-driver.class.js';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import tryFn from '../../concerns/try-fn.js';
import { BackupError } from '../backup.errors.js';
export default class S3BackupDriver extends BaseBackupDriver {
    constructor(config = {}) {
        super({
            bucket: null,
            path: 'backups/{date}/',
            storageClass: 'STANDARD_IA',
            serverSideEncryption: 'AES256',
            client: null,
            ...config
        });
    }
    getType() {
        return 's3';
    }
    async onSetup() {
        if (!this.config.client) {
            this.config.client = this.database.client || null;
        }
        if (!this.config.bucket) {
            this.config.bucket = this.database.bucket || null;
        }
        if (!this.config.client) {
            throw new BackupError('S3BackupDriver: client is required', {
                operation: 'onSetup',
                driver: 's3',
                suggestion: 'Provide a client in config or ensure database has a client configured'
            });
        }
        if (!this.config.bucket) {
            throw new BackupError('S3BackupDriver: bucket is required', {
                operation: 'onSetup',
                driver: 's3',
                suggestion: 'Provide a bucket in config or ensure database has a bucket configured'
            });
        }
        this.log(`Initialized with bucket: ${this.config.bucket}, path: ${this.config.path}`);
    }
    resolveKey(backupId, manifest = {}) {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '-');
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
        const [statOk, , stats] = await tryFn(() => stat(filePath));
        const fileSize = statOk ? stats.size : 0;
        const [uploadOk, uploadErr, uploadResult] = await tryFn(async () => {
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
            throw new BackupError('Failed to upload backup file to S3', {
                operation: 'upload',
                driver: 's3',
                backupId,
                bucket: this.config.bucket,
                key: backupKey,
                original: uploadErr,
                suggestion: 'Check S3 permissions and bucket configuration'
            });
        }
        const [manifestOk, manifestErr] = await tryFn(() => this.config.client.uploadObject({
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
        }));
        if (!manifestOk) {
            await tryFn(() => this.config.client.deleteObject({
                bucket: this.config.bucket,
                key: backupKey
            }));
            throw new BackupError('Failed to upload manifest to S3', {
                operation: 'upload',
                driver: 's3',
                backupId,
                bucket: this.config.bucket,
                manifestKey,
                original: manifestErr,
                suggestion: 'Check S3 permissions and bucket configuration'
            });
        }
        this.log(`Uploaded backup ${backupId} to s3://${this.config.bucket}/${backupKey} (${fileSize} bytes)`);
        return {
            bucket: this.config.bucket,
            key: backupKey,
            manifestKey,
            size: fileSize,
            storageClass: this.config.storageClass,
            uploadedAt: new Date().toISOString(),
            etag: uploadResult?.ETag
        };
    }
    async download(backupId, targetPath, metadata) {
        const backupKey = metadata.key || this.resolveKey(backupId, metadata);
        const [downloadOk, downloadErr] = await tryFn(() => this.config.client.downloadObject({
            bucket: this.config.bucket,
            key: backupKey,
            filePath: targetPath
        }));
        if (!downloadOk) {
            throw new BackupError('Failed to download backup from S3', {
                operation: 'download',
                driver: 's3',
                backupId,
                bucket: this.config.bucket,
                key: backupKey,
                targetPath,
                original: downloadErr,
                suggestion: 'Check if backup exists and S3 permissions are correct'
            });
        }
        this.log(`Downloaded backup ${backupId} from s3://${this.config.bucket}/${backupKey} to ${targetPath}`);
        return targetPath;
    }
    async delete(backupId, metadata) {
        const backupKey = metadata.key || this.resolveKey(backupId, metadata);
        const manifestKey = metadata.manifestKey || this.resolveManifestKey(backupId, metadata);
        const [deleteBackupOk] = await tryFn(() => this.config.client.deleteObject({
            bucket: this.config.bucket,
            key: backupKey
        }));
        const [deleteManifestOk] = await tryFn(() => this.config.client.deleteObject({
            bucket: this.config.bucket,
            key: manifestKey
        }));
        if (!deleteBackupOk && !deleteManifestOk) {
            throw new BackupError('Failed to delete backup from S3', {
                operation: 'delete',
                driver: 's3',
                backupId,
                bucket: this.config.bucket,
                backupKey,
                manifestKey,
                suggestion: 'Check S3 delete permissions'
            });
        }
        this.log(`Deleted backup ${backupId} from S3`);
    }
    async list(options = {}) {
        const { limit = 50, prefix = '' } = options;
        const searchPrefix = this.config.path.replace(/\{[^}]+\}/g, '');
        const [listOk, listErr, response] = await tryFn(() => this.config.client.listObjects({
            bucket: this.config.bucket,
            prefix: searchPrefix,
            maxKeys: limit * 2
        }));
        if (!listOk) {
            this.log(`Error listing S3 objects: ${listErr?.message}`);
            return [];
        }
        const s3Response = response;
        const manifestObjects = (s3Response.Contents || [])
            .filter(obj => obj.Key.endsWith('.manifest.json'))
            .filter(obj => !prefix || obj.Key.includes(prefix));
        const results = [];
        for (const obj of manifestObjects.slice(0, limit)) {
            const [manifestOk, , manifestContent] = await tryFn(() => this.config.client.getObject({
                bucket: this.config.bucket,
                key: obj.Key
            }));
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
                }
                catch (parseErr) {
                    this.log(`Failed to parse manifest ${obj.Key}: ${parseErr.message}`);
                }
            }
        }
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return results;
    }
    async verify(backupId, expectedChecksum, metadata) {
        const backupKey = metadata.key || this.resolveKey(backupId, metadata);
        const [verifyOk, verifyErr] = await tryFn(async () => {
            const headResponse = await this.config.client.headObject({
                bucket: this.config.bucket,
                key: backupKey
            });
            const etag = headResponse.ETag?.replace(/"/g, '');
            if (etag && !etag.includes('-')) {
                const expectedMd5 = crypto.createHash('md5').update(expectedChecksum).digest('hex');
                return etag === expectedMd5;
            }
            else {
                const [streamOk, , stream] = await tryFn(() => this.config.client.getObjectStream({
                    bucket: this.config.bucket,
                    key: backupKey
                }));
                if (!streamOk)
                    return false;
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
//# sourceMappingURL=s3-backup-driver.class.js.map