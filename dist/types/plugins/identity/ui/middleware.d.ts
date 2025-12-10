/**
 * Identity Provider Middleware
 * Session validation and authentication middleware
 */
import type { MiddlewareHandler } from 'hono';
import type { SessionManager, SessionRecord } from '../session-manager.js';
export interface SessionAuthOptions {
    required?: boolean;
    requireAdmin?: boolean;
    redirectTo?: string;
}
export interface CSRFProtectionOptions {
    excludePaths?: string[];
}
export interface SessionUser {
    id?: string;
    name?: string;
    email?: string;
    isAdmin?: boolean;
    [key: string]: any;
}
export interface SessionContextVariables {
    user: SessionUser | null;
    session: SessionRecord | null;
    isAuthenticated: boolean;
    isAdmin: boolean;
}
export declare function sessionAuth(sessionManager: SessionManager, options?: SessionAuthOptions): MiddlewareHandler;
export declare function adminOnly(sessionManager: SessionManager): MiddlewareHandler;
export declare function optionalAuth(sessionManager: SessionManager): MiddlewareHandler;
export declare function csrfProtection(options?: CSRFProtectionOptions): MiddlewareHandler;
declare const _default: {
    sessionAuth: typeof sessionAuth;
    adminOnly: typeof adminOnly;
    optionalAuth: typeof optionalAuth;
    csrfProtection: typeof csrfProtection;
};
export default _default;
//# sourceMappingURL=middleware.d.ts.map