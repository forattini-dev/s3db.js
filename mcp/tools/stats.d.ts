import type { S3dbMCPServer } from '../entrypoint.js';
import type { DbClearCacheArgs, ResourceGetStatsArgs, CacheGetStatsArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';
export declare const statsTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            resourceName?: undefined;
            includePartitionStats?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            resourceName: {
                type: string;
                description: string;
            };
            includePartitionStats?: undefined;
        };
        required: never[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            resourceName: {
                type: string;
                description: string;
            };
            includePartitionStats: {
                type: string;
                description: string;
                default: boolean;
            };
        };
        required: string[];
    };
})[];
export declare function createStatsHandlers(server: S3dbMCPServer): {
    dbGetStats(args: {}, database: S3db): Promise<any>;
    dbClearCache(args: DbClearCacheArgs, database: S3db): Promise<any>;
    resourceGetStats(args: ResourceGetStatsArgs, database: S3db): Promise<any>;
    cacheGetStats(args: CacheGetStatsArgs, database: S3db): Promise<any>;
};
//# sourceMappingURL=stats.d.ts.map