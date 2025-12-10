import type { Context, Next } from 'hono';
export interface UserToken {
    id?: string;
    sub?: string;
    email?: string;
    name?: string;
    client_id?: string;
    tenantId?: string;
    token_use?: string;
    token_type?: string;
    service_account?: ServiceAccountMeta;
    scope?: string;
    aud?: string | string[];
}
export interface ServiceAccountMeta {
    clientId?: string;
    name?: string;
    scopes?: string[];
    audiences?: string[];
}
export interface UserProfile {
    id?: string;
    email?: string;
    tenantId?: string;
    scopes: string[];
}
export interface IdentityContext {
    isServiceAccount: () => boolean;
    isUser: () => boolean;
    getServiceAccount: () => ServiceAccountMeta | null;
    getUser: () => UserProfile | null;
}
export declare function createIdentityContextMiddleware(): (c: Context, next: Next) => Promise<void>;
//# sourceMappingURL=identity.d.ts.map