import BaseBackupDriver, { type BackupDriverConfig, type BackupManifest, type BackupMetadata, type UploadResult, type ListOptions, type BackupListItem, type StorageInfo } from './base-backup-driver.class.js';
export interface FilesystemBackupDriverConfig extends BackupDriverConfig {
    path?: string;
    permissions?: number;
    directoryPermissions?: number;
}
export default class FilesystemBackupDriver extends BaseBackupDriver {
    config: FilesystemBackupDriverConfig;
    constructor(config?: FilesystemBackupDriverConfig);
    getType(): string;
    onSetup(): Promise<void>;
    resolvePath(backupId: string, manifest?: BackupManifest): string;
    upload(filePath: string, backupId: string, manifest: BackupManifest): Promise<UploadResult>;
    download(backupId: string, targetPath: string, metadata: BackupMetadata): Promise<string>;
    delete(backupId: string, metadata: BackupMetadata): Promise<void>;
    list(options?: ListOptions): Promise<BackupListItem[]>;
    private _scanDirectory;
    verify(backupId: string, expectedChecksum: string, metadata: BackupMetadata): Promise<boolean>;
    getStorageInfo(): StorageInfo;
}
//# sourceMappingURL=filesystem-backup-driver.class.d.ts.map