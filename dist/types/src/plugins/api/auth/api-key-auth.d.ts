import type { Context, Next } from 'hono';
import type { DatabaseLike } from './resource-manager.js';
export interface ApiKeyConfig {
    resource?: string;
    createResource?: boolean;
    keyField?: string;
    partitionName?: string | null;
    headerName?: string;
    queryParam?: string | null;
    optional?: boolean;
}
export interface UserRecord {
    id: string;
    active?: boolean;
    [key: string]: unknown;
}
export declare function generateApiKey(length?: number): string;
export declare function createApiKeyHandler(config: ApiKeyConfig | undefined, database: DatabaseLike): Promise<(c: Context, next: Next) => Promise<Response | void>>;
declare const _default: {
    generateApiKey: typeof generateApiKey;
    createApiKeyHandler: typeof createApiKeyHandler;
};
export default _default;
//# sourceMappingURL=api-key-auth.d.ts.map