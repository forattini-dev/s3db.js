import type { S3dbMCPServer } from '../entrypoint.js';
import type { DbConnectArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';
import type { CachePlugin, CostsPlugin } from '../../dist/s3db.es.js';
import type { FilesystemCache } from '../../src/plugins/cache/filesystem-cache.class.js';
export declare const connectionTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            connectionString: {
                type: string;
                description: string;
            };
            verbose: {
                type: string;
                description: string;
                default: boolean;
            };
            parallelism: {
                type: string;
                description: string;
                default: number;
            };
            passphrase: {
                type: string;
                description: string;
                default: string;
            };
            versioningEnabled: {
                type: string;
                description: string;
                default: boolean;
            };
            enableCache: {
                type: string;
                description: string;
                default: boolean;
            };
            enableCosts: {
                type: string;
                description: string;
                default: boolean;
            };
            cacheDriver: {
                type: string;
                description: string;
                enum: string[];
                default: string;
            };
            cacheMaxSize: {
                type: string;
                description: string;
                default: number;
            };
            cacheTtl: {
                type: string;
                description: string;
                default: number;
            };
            cacheDirectory: {
                type: string;
                description: string;
                default: string;
            };
            cachePrefix: {
                type: string;
                description: string;
                default: string;
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
            connectionString?: undefined;
            verbose?: undefined;
            parallelism?: undefined;
            passphrase?: undefined;
            versioningEnabled?: undefined;
            enableCache?: undefined;
            enableCosts?: undefined;
            cacheDriver?: undefined;
            cacheMaxSize?: undefined;
            cacheTtl?: undefined;
            cacheDirectory?: undefined;
            cachePrefix?: undefined;
        };
        required: never[];
    };
})[];
export declare function createConnectionHandlers(server: S3dbMCPServer): {
    dbConnect(args: DbConnectArgs, database: S3db | null, injected: {
        S3db: typeof S3db;
        CachePlugin: typeof CachePlugin;
        CostsPlugin: typeof CostsPlugin;
        FilesystemCache: typeof FilesystemCache;
    }): Promise<any>;
    dbDisconnect(args: any, database: S3db): Promise<any>;
    dbStatus(args: any, database: S3db): Promise<any>;
};
//# sourceMappingURL=connection.d.ts.map