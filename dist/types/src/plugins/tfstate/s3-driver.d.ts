/**
 * S3 Driver for TfState Plugin
 *
 * Reads Terraform/OpenTofu state files from S3 buckets
 */
import { TfStateDriver, type StateFileMetadata } from './base-driver.js';
import { S3Client } from '../../clients/s3-client.class.js';
export declare class S3TfStateDriver extends TfStateDriver {
    connectionConfig: {
        bucket: string;
        prefix: string;
        credentials?: {
            accessKeyId?: string;
            secretAccessKey?: string;
        };
        region?: string;
    };
    client: S3Client | null;
    constructor(config?: any);
    /**
     * Parse S3 connection string
     * Format: s3://accessKey:secretKey@bucket/prefix
     */
    private _parseConnectionString;
    /**
     * Initialize S3 client
     */
    initialize(): Promise<void>;
    /**
     * List all state files in S3 matching the selector
     */
    listStateFiles(): Promise<StateFileMetadata[]>;
    /**
     * Read a state file from S3
     */
    readStateFile(path: string): Promise<any>;
    /**
     * Get state file metadata from S3
     */
    getStateFileMetadata(path: string): Promise<StateFileMetadata>;
    /**
     * Check if state file has been modified
     */
    hasBeenModified(path: string, since: Date): Promise<boolean>;
    /**
     * Close S3 client
     */
    close(): Promise<void>;
}
//# sourceMappingURL=s3-driver.d.ts.map