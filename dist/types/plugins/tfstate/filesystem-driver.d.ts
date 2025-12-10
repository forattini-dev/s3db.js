/**
 * Filesystem Driver for TfState Plugin
 *
 * Reads Terraform/OpenTofu state files from local filesystem
 * Useful for development and testing
 */
import { TfStateDriver, type StateFileMetadata } from './base-driver.js';
export interface FilesystemDriverConfig {
    basePath?: string;
    path?: string;
    selector?: string;
}
export interface StateFileMetadataExtended extends StateFileMetadata {
    fullPath: string;
}
export declare class FilesystemTfStateDriver extends TfStateDriver {
    basePath: string;
    constructor(config?: FilesystemDriverConfig);
    /**
     * Initialize filesystem driver
     */
    initialize(): Promise<void>;
    /**
     * List all state files matching the selector
     */
    listStateFiles(): Promise<StateFileMetadataExtended[]>;
    /**
     * Read a state file from filesystem
     */
    readStateFile(path: string): Promise<any>;
    /**
     * Get state file metadata from filesystem
     */
    getStateFileMetadata(path: string): Promise<StateFileMetadataExtended>;
    /**
     * Check if state file has been modified
     */
    hasBeenModified(path: string, since: Date): Promise<boolean>;
    /**
     * Close filesystem driver (no-op)
     */
    close(): Promise<void>;
}
//# sourceMappingURL=filesystem-driver.d.ts.map