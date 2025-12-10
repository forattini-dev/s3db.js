import { S3db } from '../src/index.js';
import type { TransportArgs } from './types/index.js';
export declare class S3dbMCPServer {
    private server;
    private allToolHandlers;
    constructor();
    setupToolHandlers(): Record<string, Function>;
    setupTransport(): void;
    setupHttpTransport(): void;
    ensureConnected(db: S3db): void;
    getResource(db: S3db, resourceName: string): any;
    _extractPartitionInfo(resource: any, data: any): Record<string, any> | null;
    _generateCacheKeyHint(resourceName: string, action: string, params?: Record<string, any>): string;
    _generateCacheInvalidationPatterns(resource: any, data: any, action?: string): string[];
}
export declare function parseArgs(): TransportArgs;
export declare function startServer(args?: TransportArgs): Promise<void>;
//# sourceMappingURL=entrypoint.d.ts.map