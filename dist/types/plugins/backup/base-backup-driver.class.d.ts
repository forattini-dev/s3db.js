import { type Logger } from '../../concerns/logger.js';
import type { Database } from '../../database.class.js';
export interface BackupDriverConfig {
    compression?: 'none' | 'gzip' | 'brotli' | 'deflate';
    encryption?: {
        key: string;
        algorithm: string;
    } | null;
    logLevel?: string;
    [key: string]: unknown;
}
export interface BackupManifest {
    type?: string;
    timestamp?: number;
    resources?: string[];
    compression?: string;
    encrypted?: boolean;
    s3db_version?: string;
    createdAt?: string;
    [key: string]: unknown;
}
export interface UploadResult {
    path?: string;
    key?: string;
    bucket?: string;
    manifestPath?: string;
    manifestKey?: string;
    size?: number;
    uploadedAt?: string;
    storageClass?: string;
    etag?: string;
    [key: string]: unknown;
}
export interface BackupMetadata {
    path?: string;
    key?: string;
    bucket?: string;
    manifestPath?: string;
    manifestKey?: string;
    destination?: number;
    destinations?: BackupMetadata[];
    status?: string;
    [key: string]: unknown;
}
export interface ListOptions {
    limit?: number;
    prefix?: string;
    [key: string]: unknown;
}
export interface BackupListItem {
    id: string;
    path?: string;
    key?: string;
    bucket?: string;
    manifestPath?: string;
    manifestKey?: string;
    size?: number;
    createdAt?: string;
    lastModified?: string;
    storageClass?: string;
    destinations?: BackupMetadata[];
    [key: string]: unknown;
}
export interface StorageInfo {
    type: string;
    config: BackupDriverConfig;
    [key: string]: unknown;
}
export default class BaseBackupDriver {
    config: BackupDriverConfig;
    logger: Logger;
    database: Database;
    constructor(config?: BackupDriverConfig);
    setup(database: Database): Promise<void>;
    onSetup(): Promise<void>;
    upload(_filePath: string, backupId: string, _manifest: BackupManifest): Promise<UploadResult | UploadResult[]>;
    download(backupId: string, _targetPath: string, _metadata: BackupMetadata): Promise<string>;
    delete(backupId: string, _metadata: BackupMetadata): Promise<void>;
    list(_options?: ListOptions): Promise<BackupListItem[]>;
    verify(backupId: string, _expectedChecksum: string, _metadata: BackupMetadata): Promise<boolean>;
    getType(): string;
    getStorageInfo(): StorageInfo;
    cleanup(): Promise<void>;
    log(message: string): void;
}
//# sourceMappingURL=base-backup-driver.class.d.ts.map