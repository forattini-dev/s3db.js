/**
 * Documentation Search Tools with Hybrid Search (Fuzzy + Semantic)
 * Provides separate tools for core docs and plugin docs.
 */
import type { S3dbMCPServer } from '../entrypoint.js';
import type { S3dbSearchDocsArgs, S3dbListTopicsArgs } from '../types/index.js';
/**
 * Tool definitions for MCP.
 */
export declare const docsSearchTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            limit: {
                type: string;
                description: string;
                default: number;
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
            query?: undefined;
            limit?: undefined;
        };
        required: never[];
    };
})[];
/**
 * Creates handlers for the docs search tools.
 * @param server - MCP server instance
 * @returns Tool handlers
 */
export declare function createDocsSearchHandlers(server: S3dbMCPServer): {
    s3dbSearchCoreDocs(args: S3dbSearchDocsArgs): Promise<any>;
    s3dbSearchPluginDocs(args: S3dbSearchDocsArgs): Promise<any>;
    s3dbListCoreTopics(args: S3dbListTopicsArgs): Promise<any>;
    s3dbListPluginTopics(args: S3dbListTopicsArgs): Promise<any>;
};
/**
 * Preloads search instances for faster first query.
 */
export declare function preloadSearch(): Promise<void>;
declare const _default: {
    docsSearchTools: ({
        name: string;
        description: string;
        inputSchema: {
            type: string;
            properties: {
                query: {
                    type: string;
                    description: string;
                };
                limit: {
                    type: string;
                    description: string;
                    default: number;
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
                query?: undefined;
                limit?: undefined;
            };
            required: never[];
        };
    })[];
    createDocsSearchHandlers: typeof createDocsSearchHandlers;
    preloadSearch: typeof preloadSearch;
};
export default _default;
//# sourceMappingURL=docs-search.d.ts.map