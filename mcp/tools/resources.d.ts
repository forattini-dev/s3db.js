import type { S3dbMCPServer } from '../entrypoint.js';
import type { DbCreateResourceArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';
export declare const resourceManagementTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            name: {
                type: string;
                description: string;
            };
            attributes: {
                type: string;
                description: string;
            };
            behavior: {
                type: string;
                description: string;
                enum: string[];
                default: string;
            };
            timestamps: {
                type: string;
                description: string;
                default: boolean;
            };
            partitions: {
                type: string;
                description: string;
            };
            paranoid: {
                type: string;
                description: string;
                default: boolean;
            };
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            name?: undefined;
            attributes?: undefined;
            behavior?: undefined;
            timestamps?: undefined;
            partitions?: undefined;
            paranoid?: undefined;
        };
        required: never[];
    };
})[];
export declare function createResourceManagementHandlers(server: S3dbMCPServer): {
    dbCreateResource(args: DbCreateResourceArgs, database: S3db): Promise<any>;
    dbListResources(args: {}, database: S3db): Promise<any>;
};
//# sourceMappingURL=resources.d.ts.map