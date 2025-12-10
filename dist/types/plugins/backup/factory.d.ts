import type BaseBackupDriver from './base-backup-driver.class.js';
import type { BackupDriverConfig } from './base-backup-driver.class.js';
export type BackupDriverType = 'filesystem' | 's3' | 'multi';
export interface BackupDriverConstructor {
    new (config?: BackupDriverConfig): BaseBackupDriver;
}
export interface DestinationConfig {
    driver: BackupDriverType;
    config?: BackupDriverConfig;
}
export interface MultiBackupDriverConfig extends BackupDriverConfig {
    destinations: DestinationConfig[];
    strategy?: 'all' | 'any' | 'priority';
    concurrency?: number;
}
export declare const BACKUP_DRIVERS: Record<string, BackupDriverConstructor | null>;
export declare function createBackupDriver(driver: string, config?: BackupDriverConfig): BaseBackupDriver;
export declare function validateBackupConfig(driver: string, config?: BackupDriverConfig): boolean;
//# sourceMappingURL=factory.d.ts.map