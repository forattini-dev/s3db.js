import type { S3dbMCPServer } from '../entrypoint.js';
import type { S3dbSearchDocsArgs, S3dbListTopicsArgs } from '../types/index.js';
export declare const documentationTools: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            query: {
                type: string;
                description: string;
            };
            maxResults: {
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
            maxResults?: undefined;
        };
        required: never[];
    };
})[];
export declare function createDocumentationHandlers(server: S3dbMCPServer): {
    s3dbQueryDocs(args: S3dbSearchDocsArgs): Promise<any>;
    s3dbListTopics(args: S3dbListTopicsArgs): Promise<any>;
};
//# sourceMappingURL=documentation.d.ts.map