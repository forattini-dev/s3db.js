import type { S3dbMCPServer } from '../entrypoint.js';
import type { DbInspectResourceArgs, ResourceValidateArgs, DbHealthCheckArgs, DbGetRawArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';
export declare const debuggingTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            resourceName: {
                type: string;
                description: string;
            };
            data?: undefined;
            includeOrphanedPartitions?: undefined;
            id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            resourceName?: undefined;
            data?: undefined;
            includeOrphanedPartitions?: undefined;
            id?: undefined;
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
            data: {
                type: string;
                description: string;
            };
            includeOrphanedPartitions?: undefined;
            id?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            includeOrphanedPartitions: {
                type: string;
                description: string;
                default: boolean;
            };
            resourceName?: undefined;
            data?: undefined;
            id?: undefined;
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
            id: {
                type: string;
                description: string;
            };
            data?: undefined;
            includeOrphanedPartitions?: undefined;
        };
        required: string[];
    };
})[];
export declare function createDebuggingHandlers(server: S3dbMCPServer): {
    dbInspectResource(args: DbInspectResourceArgs, database: S3db): Promise<any>;
    dbGetMetadata(args: {}, database: S3db): Promise<any>;
    resourceValidate(args: ResourceValidateArgs, database: S3db): Promise<any>;
    dbHealthCheck(args: DbHealthCheckArgs, database: S3db): Promise<any>;
    resourceGetRaw(args: DbGetRawArgs, database: S3db): Promise<any>;
};
//# sourceMappingURL=debugging.d.ts.map