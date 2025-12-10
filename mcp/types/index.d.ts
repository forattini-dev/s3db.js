export interface DbConnectArgs {
    connectionString: string;
    verbose?: boolean;
    parallelism?: number;
    passphrase?: string;
    versioningEnabled?: boolean;
    enableCache?: boolean;
    enableCosts?: boolean;
    cacheDriver?: 'memory' | 'filesystem';
    cacheMaxSize?: number;
    cacheTtl?: number;
    cacheDirectory?: string;
    cachePrefix?: string;
}
export interface DbCreateResourceArgs {
    name: string;
    attributes: Record<string, any>;
    behavior?: 'user-managed' | 'body-only' | 'body-overflow' | 'enforce-limits' | 'truncate-data';
    timestamps?: boolean;
    partitions?: Record<string, any>;
    paranoid?: boolean;
}
export interface ResourceInsertArgs {
    resourceName: string;
    data: Record<string, any>;
}
export interface ResourceGetArgs {
    resourceName: string;
    id: string;
    partition?: string;
    partitionValues?: Record<string, any>;
}
export interface ResourceListArgs {
    resourceName: string;
    limit?: number;
    offset?: number;
    partition?: string;
    partitionValues?: Record<string, any>;
}
export interface ResourceCountArgs {
    resourceName: string;
    partition?: string;
    partitionValues?: Record<string, any>;
}
export interface ResourceUpdateArgs {
    resourceName: string;
    id: string;
    data: Record<string, any>;
}
export interface ResourceUpsertArgs {
    resourceName: string;
    data: Record<string, any>;
}
export interface ResourceDeleteArgs {
    resourceName: string;
    id: string;
}
export interface ResourceUpdateManyArgs {
    resourceName: string;
    filters: Record<string, any>;
    updates: Record<string, any>;
    limit?: number;
}
export interface ResourceBulkUpsertArgs {
    resourceName: string;
    data: Record<string, any>[];
}
export interface ResourceExportArgs {
    resourceName: string;
    format?: 'json' | 'ndjson' | 'csv';
    filters?: Record<string, any>;
    fields?: string[];
    limit?: number;
}
export interface ResourceImportArgs {
    resourceName: string;
    data: Record<string, any>[];
    mode?: 'insert' | 'upsert' | 'replace';
    batchSize?: number;
}
export interface ResourceGetStatsArgs {
    resourceName: string;
    includePartitionStats?: boolean;
}
export interface CacheGetStatsArgs {
    resourceName?: string;
}
export interface DbBackupMetadataArgs {
    timestamp?: boolean;
}
export interface DbHealthCheckArgs {
    includeOrphanedPartitions?: boolean;
}
export interface DbInspectResourceArgs {
    resourceName: string;
}
export interface DbGetRawArgs {
    resourceName: string;
    id: string;
}
export interface S3dbSearchDocsArgs {
    query: string;
    limit?: number;
    maxResults?: number;
}
export interface S3dbListTopicsArgs {
}
export interface TransportArgs {
    transport: string;
    host: string;
    port: number;
}
//# sourceMappingURL=index.d.ts.map