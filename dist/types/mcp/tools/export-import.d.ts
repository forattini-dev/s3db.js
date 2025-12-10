import type { S3dbMCPServer } from '../entrypoint.js';
import type { ResourceExportArgs, ResourceImportArgs, DbBackupMetadataArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';
export declare const exportImportTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            resourceName: {
                type: string;
                description: string;
            };
            format: {
                type: string;
                description: string;
                enum: string[];
                default: string;
            };
            filters: {
                type: string;
                description: string;
            };
            fields: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            limit: {
                type: string;
                description: string;
            };
            data?: undefined;
            mode?: undefined;
            batchSize?: undefined;
            timestamp?: undefined;
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
            mode: {
                type: string;
                description: string;
                enum: string[];
                default: string;
            };
            batchSize: {
                type: string;
                description: string;
                default: number;
            };
            format?: undefined;
            filters?: undefined;
            fields?: undefined;
            limit?: undefined;
            timestamp?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            timestamp: {
                type: string;
                description: string;
                default: boolean;
            };
            resourceName?: undefined;
            format?: undefined;
            filters?: undefined;
            fields?: undefined;
            limit?: undefined;
            data?: undefined;
            mode?: undefined;
            batchSize?: undefined;
        };
        required: never[];
    };
})[];
export declare function createExportImportHandlers(server: S3dbMCPServer): {
    resourceExport(args: ResourceExportArgs, database: S3db): Promise<any>;
    resourceImport(args: ResourceImportArgs, database: S3db): Promise<any>;
    dbBackupMetadata(args: DbBackupMetadataArgs, database: S3db): Promise<any>;
};
//# sourceMappingURL=export-import.d.ts.map