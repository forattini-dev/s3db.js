import BaseBackupDriver, { type BackupDriverConfig, type BackupManifest, type BackupMetadata, type UploadResult, type ListOptions, type BackupListItem, type StorageInfo } from './base-backup-driver.class.js';
import type { S3Client } from '../../clients/s3-client.class.js';
export interface S3BackupDriverConfig extends BackupDriverConfig {
    bucket?: string | null;
    path?: string;
    storageClass?: string;
    serverSideEncryption?: string;
    client?: S3Client | null;
}
export default class S3BackupDriver extends BaseBackupDriver {
    config: S3BackupDriverConfig;
    constructor(config?: S3BackupDriverConfig);
    getType(): string;
    onSetup(): Promise<void>;
    resolveKey(backupId: string, manifest?: BackupManifest): string;
    resolveManifestKey(backupId: string, manifest?: BackupManifest): string;
    upload(filePath: string, backupId: string, manifest: BackupManifest): Promise<UploadResult>;
    download(backupId: string, targetPath: string, metadata: BackupMetadata): Promise<string>;
    delete(backupId: string, metadata: BackupMetadata): Promise<void>;
    list(options?: ListOptions): Promise<BackupListItem[]>;
    verify(backupId: string, expectedChecksum: string, metadata: BackupMetadata): Promise<boolean>;
    getStorageInfo(): StorageInfo;
}
//# sourceMappingURL=s3-backup-driver.class.d.ts.map