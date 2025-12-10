import BaseBackupDriver, { type BackupDriverConfig, type BackupManifest, type BackupMetadata, type UploadResult, type ListOptions, type BackupListItem, type StorageInfo } from './base-backup-driver.class.js';
export interface DestinationConfig {
    driver: string;
    config?: BackupDriverConfig;
}
export interface MultiBackupDriverConfig extends BackupDriverConfig {
    destinations?: DestinationConfig[];
    strategy?: 'all' | 'any' | 'priority';
    concurrency?: number;
    requireAll?: boolean;
}
interface DriverInstance {
    driver: BaseBackupDriver;
    config: DestinationConfig;
    index: number;
}
export interface MultiUploadResult extends UploadResult {
    driver: string;
    destination: number;
    status: 'success' | 'failed';
    error?: string;
}
export default class MultiBackupDriver extends BaseBackupDriver {
    config: MultiBackupDriverConfig;
    drivers: DriverInstance[];
    constructor(config?: MultiBackupDriverConfig);
    getType(): string;
    onSetup(): Promise<void>;
    upload(filePath: string, backupId: string, manifest: BackupManifest): Promise<MultiUploadResult[]>;
    download(backupId: string, targetPath: string, metadata: BackupMetadata): Promise<string>;
    delete(backupId: string, metadata: BackupMetadata): Promise<void>;
    list(options?: ListOptions): Promise<BackupListItem[]>;
    verify(backupId: string, expectedChecksum: string, metadata: BackupMetadata): Promise<boolean>;
    cleanup(): Promise<void>;
    getStorageInfo(): StorageInfo;
    private _executeConcurrent;
}
export {};
//# sourceMappingURL=multi-backup-driver.class.d.ts.map