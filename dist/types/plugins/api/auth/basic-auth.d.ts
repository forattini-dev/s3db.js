import type { Context, Next } from 'hono';
import type { DatabaseLike } from './resource-manager.js';
export interface BasicCredentials {
    username: string;
    password: string;
}
export interface AdminUserConfig {
    enabled?: boolean;
    username: string;
    password: string;
    scopes?: string[];
}
export interface BasicAuthConfig {
    resource?: string;
    createResource?: boolean;
    usernameField?: string;
    passwordField?: string;
    realm?: string;
    passphrase?: string;
    optional?: boolean;
    adminUser?: AdminUserConfig | null;
    cookieName?: string | null;
    tokenField?: string;
}
export interface UserRecord {
    id: string;
    active?: boolean;
    [key: string]: unknown;
}
export declare function parseBasicAuth(authHeader: string | null | undefined): BasicCredentials | null;
export declare function createBasicAuthHandler(config: BasicAuthConfig | undefined, database: DatabaseLike): Promise<(c: Context, next: Next) => Promise<Response | void>>;
declare const _default: {
    parseBasicAuth: typeof parseBasicAuth;
    createBasicAuthHandler: typeof createBasicAuthHandler;
};
export default _default;
//# sourceMappingURL=basic-auth.d.ts.map