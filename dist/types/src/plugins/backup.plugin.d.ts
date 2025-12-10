import { Plugin } from './plugin.class.js';
import { PluginError } from '../errors.js';
import type BaseBackupDriver from './backup/base-backup-driver.class.js';
import type { UploadResult } from './backup/base-backup-driver.class.js';
export type CompressionType = 'none' | 'gzip' | 'brotli' | 'deflate';
export type BackupType = 'full' | 'incremental';
export interface EncryptionConfig {
    key: string;
    algorithm: string;
}
export interface RetentionPolicy {
    daily?: number;
    weekly?: number;
    monthly?: number;
    yearly?: number;
}
export interface BackupHookContext {
    backupId: string;
    type?: BackupType;
    error?: Error;
    size?: number;
    duration?: number;
    driverInfo?: UploadResult | UploadResult[];
    restored?: RestoredResourceInfo[];
    [key: string]: unknown;
}
export type BackupHook = (type: string, context: BackupHookContext) => void | Promise<void>;
export type RestoreHook = (backupId: string, context: Record<string, unknown>) => void | Promise<void>;
export interface BackupPluginOptions {
    driver?: string;
    config?: Record<string, unknown>;
    schedule?: Record<string, unknown>;
    retention?: RetentionPolicy;
    compression?: CompressionType;
    encryption?: EncryptionConfig | null;
    verification?: boolean;
    parallelism?: number;
    include?: string[] | null;
    exclude?: string[];
    backupMetadataResource?: string;
    tempDir?: string;
    onBackupStart?: BackupHook | null;
    onBackupComplete?: BackupHook | null;
    onBackupError?: BackupHook | null;
    onRestoreStart?: RestoreHook | null;
    onRestoreComplete?: RestoreHook | null;
    onRestoreError?: RestoreHook | null;
    logLevel?: string;
    [key: string]: unknown;
}
export interface BackupPluginConfig {
    driver: string;
    driverConfig: Record<string, unknown>;
    schedule: Record<string, unknown>;
    retention: Required<RetentionPolicy>;
    compression: CompressionType;
    encryption: EncryptionConfig | null;
    verification: boolean;
    parallelism: number;
    include: string[] | null;
    exclude: string[];
    backupMetadataResource: string;
    tempDir: string;
    logLevel?: string;
    onBackupStart: BackupHook | null;
    onBackupComplete: BackupHook | null;
    onBackupError: BackupHook | null;
    onRestoreStart: RestoreHook | null;
    onRestoreComplete: RestoreHook | null;
    onRestoreError: RestoreHook | null;
    [key: string]: unknown;
}
export interface BackupMetadataRecord {
    id: string;
    type: BackupType;
    timestamp: number;
    resources: string[];
    driverInfo: UploadResult | UploadResult[];
    size: number;
    compressed: boolean;
    encrypted: boolean;
    checksum: string | null;
    status: 'in_progress' | 'completed' | 'failed';
    error: string | null;
    duration: number;
    createdAt: string;
}
export interface BackupResult {
    id: string;
    type: BackupType;
    size: number;
    duration: number;
    checksum: string;
    driverInfo: UploadResult;
}
export interface RestoredResourceInfo {
    name: string;
    recordsRestored: number;
    totalRecords: number;
}
export interface RestoreResult {
    backupId: string;
    restored: RestoredResourceInfo[];
}
export interface RestoreOptions {
    resources?: string[];
    mode?: 'merge' | 'replace' | 'skip';
}
export interface ListBackupsOptions {
    limit?: number;
}
export declare class BackupPlugin extends Plugin {
    config: BackupPluginConfig;
    driver: BaseBackupDriver | null;
    activeBackups: Set<string>;
    constructor(options?: BackupPluginOptions);
    createError(message: string, details?: Record<string, unknown>): PluginError;
    private _validateConfiguration;
    onInstall(): Promise<void>;
    private _createBackupMetadataResource;
    backup(type?: BackupType, options?: {
        resources?: string[];
    }): Promise<BackupResult>;
    private _generateBackupId;
    private _createBackupMetadata;
    private _updateBackupMetadata;
    private _createBackupManifest;
    private _exportResources;
    private _generateMetadataFile;
    private _createArchive;
    private _generateChecksum;
    private _cleanupTempFiles;
    restore(backupId: string, options?: RestoreOptions): Promise<RestoreResult>;
    private _restoreFromBackup;
    listBackups(options?: ListBackupsOptions): Promise<BackupMetadataRecord[]>;
    getBackupStatus(backupId: string): Promise<BackupMetadataRecord | null>;
    private _cleanupOldBackups;
    private _executeHook;
    private _executeRestoreHook;
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=backup.plugin.d.ts.map