import type { Context, MiddlewareHandler } from 'hono';
export interface SessionData {
    id: string;
    userAgent?: string | null;
    ip?: string | null;
    referer?: string | null;
    createdAt?: string;
    lastSeenAt?: string;
    lastUserAgent?: string | null;
    lastIp?: string | null;
    [key: string]: unknown;
}
export interface ResourceLike {
    exists(id: string): Promise<boolean>;
    get(id: string): Promise<SessionData | null>;
    insert(data: SessionData): Promise<SessionData>;
    update(id: string, data: Partial<SessionData>): Promise<SessionData>;
}
export interface DatabaseLike {
    resources: Record<string, ResourceLike>;
}
export interface EnrichSessionParams {
    session: SessionData;
    context: Context;
}
export type EnrichSessionFn = (params: EnrichSessionParams) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;
export interface SessionTrackingConfig {
    enabled?: boolean;
    resource?: string | null;
    cookieName?: string;
    cookieMaxAge?: number;
    cookieSecure?: boolean;
    cookieSameSite?: 'Strict' | 'Lax' | 'None';
    updateOnRequest?: boolean;
    passphrase?: string | null;
    enrichSession?: EnrichSessionFn | null;
}
export declare function createSessionTrackingMiddleware(config?: SessionTrackingConfig, db?: DatabaseLike): MiddlewareHandler;
export default createSessionTrackingMiddleware;
//# sourceMappingURL=session-tracking.d.ts.map