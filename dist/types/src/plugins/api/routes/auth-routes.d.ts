import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
export interface AuthResource {
    name: string;
    schema?: {
        attributes?: Record<string, unknown>;
    };
    query(filter: Record<string, unknown>): Promise<AuthUser[]>;
    insert(data: Record<string, unknown>): Promise<AuthUser>;
    update(id: string, data: Record<string, unknown>): Promise<AuthUser>;
    database?: unknown;
}
export interface AuthUser {
    id: string;
    email?: string;
    username?: string;
    role?: string;
    active?: boolean;
    apiKey?: string;
    lastLoginAt?: string;
    [key: string]: unknown;
}
export interface RegistrationConfig {
    enabled?: boolean;
    allowedFields?: string[];
    defaultRole?: string;
}
export interface LoginThrottleConfig {
    enabled?: boolean;
    maxAttempts?: number;
    windowMs?: number;
    blockDurationMs?: number;
    maxEntries?: number;
}
export interface AuthRoutesConfig {
    driver?: string;
    drivers?: string[];
    usernameField?: string;
    passwordField?: string;
    jwtSecret?: string;
    jwtExpiresIn?: string;
    passphrase?: string;
    registration?: RegistrationConfig;
    loginThrottle?: LoginThrottleConfig;
}
export declare function createAuthRoutes(authResource: AuthResource, config?: AuthRoutesConfig, authMiddleware?: MiddlewareHandler): Hono;
declare const _default: {
    createAuthRoutes: typeof createAuthRoutes;
};
export default _default;
//# sourceMappingURL=auth-routes.d.ts.map