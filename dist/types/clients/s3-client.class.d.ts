import EventEmitter from 'events';
import { S3Client as AwsS3Client } from '@aws-sdk/client-s3';
import { ConnectionString } from '../connection-string.class.js';
import type { S3ClientConfig, HttpClientOptions, PutObjectParams, CopyObjectParams, ListObjectsParams, GetKeysPageParams, QueueStats } from './types.js';
interface AwsCommand {
    constructor: {
        name: string;
    };
    input?: any;
}
export declare class S3Client extends EventEmitter {
    id: string;
    logLevel: string;
    private logger;
    config: ConnectionString;
    connectionString: string;
    httpClientOptions: HttpClientOptions;
    client: AwsS3Client;
    private _inflightCoalescing;
    private taskExecutorConfig;
    private taskExecutor;
    constructor({ logLevel, logger, id, AwsS3Client: providedClient, connectionString, httpClientOptions, taskExecutor, executorPool, }: S3ClientConfig);
    private _coalesce;
    private _normalizeTaskExecutorConfig;
    private _createTasksPool;
    private _executeOperation;
    private _executeBatch;
    getQueueStats(): QueueStats | null;
    getAggregateMetrics(since?: number): unknown | null;
    pausePool(): Promise<void | null>;
    resumePool(): void | null;
    drainPool(): Promise<void | null>;
    stopPool(): void;
    destroy(): void;
    createClient(): AwsS3Client;
    sendCommand(command: AwsCommand): Promise<unknown>;
    putObject(params: PutObjectParams): Promise<unknown>;
    getObject(key: string): Promise<unknown>;
    headObject(key: string): Promise<unknown>;
    copyObject(params: CopyObjectParams): Promise<unknown>;
    exists(key: string): Promise<boolean>;
    deleteObject(key: string): Promise<unknown>;
    deleteObjects(keys: string[]): Promise<{
        deleted: unknown[];
        notFound: Array<{
            message: string;
            raw: Error;
        }>;
    }>;
    deleteAll({ prefix }?: {
        prefix?: string;
    }): Promise<number>;
    moveObject({ from, to }: {
        from: string;
        to: string;
    }): Promise<boolean>;
    listObjects(params?: ListObjectsParams): Promise<unknown>;
    count({ prefix }?: {
        prefix?: string;
    }): Promise<number>;
    getAllKeys({ prefix }?: {
        prefix?: string;
    }): Promise<string[]>;
    getContinuationTokenAfterOffset(params?: {
        prefix?: string;
        offset?: number;
    }): Promise<string | null>;
    getKeysPage(params?: GetKeysPageParams): Promise<string[]>;
    moveAllObjects({ prefixFrom, prefixTo }: {
        prefixFrom: string;
        prefixTo: string;
    }): Promise<string[]>;
}
export default S3Client;
//# sourceMappingURL=s3-client.class.d.ts.map