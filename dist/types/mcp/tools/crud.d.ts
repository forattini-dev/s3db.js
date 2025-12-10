import type { S3dbMCPServer } from '../entrypoint.js';
import type { ResourceInsertArgs, ResourceGetArgs, ResourceListArgs, ResourceCountArgs, ResourceUpdateArgs, ResourceUpsertArgs, ResourceDeleteArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';
export declare const crudTools: ({
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
            id?: undefined;
            partition?: undefined;
            partitionValues?: undefined;
            ids?: undefined;
            limit?: undefined;
            offset?: undefined;
            confirm?: undefined;
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
            id: {
                type: string;
                description: string;
            };
            partition: {
                type: string;
                description: string;
            };
            partitionValues: {
                type: string;
                description: string;
            };
            data?: undefined;
            ids?: undefined;
            limit?: undefined;
            offset?: undefined;
            confirm?: undefined;
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
            ids: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            data?: undefined;
            id?: undefined;
            partition?: undefined;
            partitionValues?: undefined;
            limit?: undefined;
            offset?: undefined;
            confirm?: undefined;
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
            id: {
                type: string;
                description: string;
            };
            data: {
                type: string;
                description: string;
            };
            partition?: undefined;
            partitionValues?: undefined;
            ids?: undefined;
            limit?: undefined;
            offset?: undefined;
            confirm?: undefined;
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
            id: {
                type: string;
                description: string;
            };
            data?: undefined;
            partition?: undefined;
            partitionValues?: undefined;
            ids?: undefined;
            limit?: undefined;
            offset?: undefined;
            confirm?: undefined;
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
            partition: {
                type: string;
                description: string;
            };
            partitionValues: {
                type: string;
                description: string;
            };
            data?: undefined;
            id?: undefined;
            ids?: undefined;
            confirm?: undefined;
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
            data?: undefined;
            id?: undefined;
            partition?: undefined;
            partitionValues?: undefined;
            ids?: undefined;
            confirm?: undefined;
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
            partition: {
                type: string;
                description: string;
            };
            partitionValues: {
                type: string;
                description: string;
            };
            data?: undefined;
            id?: undefined;
            ids?: undefined;
            limit?: undefined;
            offset?: undefined;
            confirm?: undefined;
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
            data?: undefined;
            id?: undefined;
            partition?: undefined;
            partitionValues?: undefined;
            ids?: undefined;
            limit?: undefined;
            offset?: undefined;
            confirm?: undefined;
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
            confirm: {
                type: string;
                description: string;
            };
            data?: undefined;
            id?: undefined;
            partition?: undefined;
            partitionValues?: undefined;
            ids?: undefined;
            limit?: undefined;
            offset?: undefined;
        };
        required: string[];
    };
})[];
export declare function createCrudHandlers(server: S3dbMCPServer): {
    resourceInsert(args: ResourceInsertArgs, database: S3db): Promise<any>;
    resourceInsertMany(args: {
        resourceName: string;
        data: any[];
    }, database: S3db): Promise<any>;
    resourceGet(args: ResourceGetArgs, database: S3db): Promise<any>;
    resourceGetMany(args: {
        resourceName: string;
        ids: string[];
    }, database: S3db): Promise<any>;
    resourceUpdate(args: ResourceUpdateArgs, database: S3db): Promise<any>;
    resourceUpsert(args: ResourceUpsertArgs, database: S3db): Promise<any>;
    resourceDelete(args: ResourceDeleteArgs, database: S3db): Promise<any>;
    resourceDeleteMany(args: {
        resourceName: string;
        ids: string[];
    }, database: S3db): Promise<any>;
    resourceExists(args: ResourceGetArgs, database: S3db): Promise<any>;
    resourceList(args: ResourceListArgs, database: S3db): Promise<any>;
    resourceListIds(args: ResourceListArgs, database: S3db): Promise<any>;
    resourceCount(args: ResourceCountArgs, database: S3db): Promise<any>;
    resourceGetAll(args: {
        resourceName: string;
    }, database: S3db): Promise<any>;
    resourceDeleteAll(args: {
        resourceName: string;
        confirm: boolean;
    }, database: S3db): Promise<any>;
};
//# sourceMappingURL=crud.d.ts.map