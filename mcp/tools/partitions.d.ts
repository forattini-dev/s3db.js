import type { S3dbMCPServer } from '../entrypoint.js';
import type { S3db } from '../../database.class.js';
import type { ResourceListPartitionsArgs, ResourceListPartitionValuesArgs, DbFindOrphanedPartitionsArgs, DbRemoveOrphanedPartitionsArgs } from '../types/index.js';
export declare const partitionTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            resourceName: {
                type: string;
                description: string;
            };
            partitionName?: undefined;
            limit?: undefined;
            dryRun?: undefined;
        };
        required: string[];
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
            partitionName: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                default: number;
            };
            dryRun?: undefined;
        };
        required: string[];
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
            dryRun: {
                type: string;
                description: string;
                default: boolean;
            };
            partitionName?: undefined;
            limit?: undefined;
        };
        required: string[];
    };
})[];
export declare function createPartitionHandlers(server: S3dbMCPServer): {
    resourceListPartitions(args: ResourceListPartitionsArgs, database: S3db): Promise<any>;
    resourceListPartitionValues(args: ResourceListPartitionValuesArgs, database: S3db): Promise<any>;
    dbFindOrphanedPartitions(args: DbFindOrphanedPartitionsArgs, database: S3db): Promise<any>;
    dbRemoveOrphanedPartitions(args: DbRemoveOrphanedPartitionsArgs, database: S3db): Promise<any>;
};
//# sourceMappingURL=partitions.d.ts.map