import type { S3dbMCPServer } from '../entrypoint.js';
import type { ResourceUpdateManyArgs, ResourceBulkUpsertArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';
export declare const bulkTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            resourceName: {
                type: string;
                description: string;
            };
            filters: {
                type: string;
                description: string;
            };
            updates: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                default: number;
            };
            data?: undefined;
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
            data: {
                type: string;
                description: string;
            };
            filters?: undefined;
            updates?: undefined;
            limit?: undefined;
        };
        required: string[];
    };
})[];
export declare function createBulkHandlers(server: S3dbMCPServer): {
    resourceUpdateMany(args: ResourceUpdateManyArgs, database: S3db): Promise<any>;
    resourceBulkUpsert(args: ResourceBulkUpsertArgs, database: S3db): Promise<any>;
};
//# sourceMappingURL=bulk.d.ts.map