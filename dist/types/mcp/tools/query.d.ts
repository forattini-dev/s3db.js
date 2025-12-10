import type { S3dbMCPServer } from '../entrypoint.js';
import type { ResourceQueryArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';
export declare const queryTools: ({
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
            limit: {
                type: string;
                description: string;
                default: number;
            };
            offset: {
                type: string;
                description: string;
                default: number;
            };
            searchText?: undefined;
            fields?: undefined;
            caseSensitive?: undefined;
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
            searchText: {
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
            caseSensitive: {
                type: string;
                description: string;
                default: boolean;
            };
            limit: {
                type: string;
                description: string;
                default: number;
            };
            filters?: undefined;
            offset?: undefined;
        };
        required: string[];
    };
})[];
export declare function createQueryHandlers(server: S3dbMCPServer): {
    resourceQuery(args: ResourceQueryArgs, database: S3db): Promise<any>;
    resourceSearch(args: {
        resourceName: string;
        searchText: string;
        fields?: string[];
        caseSensitive?: boolean;
        limit?: number;
    }, database: S3db): Promise<any>;
};
//# sourceMappingURL=query.d.ts.map