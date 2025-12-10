/**
 * Identity Server - Hono-based HTTP server for Identity Provider Plugin
 *
 * Manages OAuth2/OIDC endpoints only (no CRUD routes)
 */
import { RateLimiter } from './concerns/rate-limit.js';
import type { Hono as HonoApp } from 'hono';
export interface IdentityServerOptions {
    port?: number;
    host?: string;
    logLevel?: string;
    issuer?: string;
    oauth2Server?: OAuth2ServerInstance;
    sessionManager?: SessionManagerInstance | null;
    usersResource?: any;
    identityPlugin?: IdentityPluginInstance | null;
    failbanManager?: FailbanManagerInstance | null;
    failbanConfig?: FailbanConfig;
    cors?: CorsConfig;
    security?: SecurityConfig;
    logging?: LoggingConfig;
    logger?: Logger;
}
export interface CorsConfig {
    enabled?: boolean;
    origin?: string;
    methods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
export interface SecurityConfig {
    enabled?: boolean;
    contentSecurityPolicy?: Record<string, any>;
}
export interface LoggingConfig {
    enabled?: boolean;
    format?: string;
}
export interface FailbanConfig {
    enabled?: boolean;
    geo?: {
        enabled?: boolean;
    };
}
interface Logger {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    debug: (arg1: any, arg2?: any) => void;
}
interface OAuth2ServerInstance {
    discoveryHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    jwksHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    tokenHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    userinfoHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    introspectHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    authorizeHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    authorizePostHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    registerClientHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
    revokeHandler: (req: ExpressStyleRequest, res: ExpressStyleResponse) => Promise<any>;
}
interface SessionManagerInstance {
}
interface IdentityPluginInstance {
    getOnboardingStatus?: () => Promise<OnboardingStatus>;
    getIntegrationMetadata: () => IntegrationMetadata;
    rateLimiters?: Record<string, RateLimiter>;
}
interface OnboardingStatus {
    completed: boolean;
    adminExists: boolean;
    mode?: string;
    completedAt?: string;
}
interface IntegrationMetadata {
    cacheTtl: number;
    issuedAt: string;
    [key: string]: any;
}
interface FailbanManagerInstance {
    isBlacklisted: (ip: string) => boolean;
    checkCountryBlock: (ip: string) => {
        country: string;
        reason: string;
    } | null;
    isBanned: (ip: string) => boolean;
    getBan: (ip: string) => Promise<BanRecord | null>;
}
interface BanRecord {
    expiresAt: string;
    reason: string;
}
interface ExpressStyleRequest {
    method: string;
    url: string;
    originalUrl: string;
    path: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body: Record<string, any>;
    cookies: Record<string, string>;
    ip: string;
    protocol: string;
    get: (name: string) => string | undefined;
}
interface ExpressStyleResponse {
    status: (code: number) => ExpressStyleResponse;
    json: (data: any) => any;
    header: (name: string, value: string) => ExpressStyleResponse;
    setHeader: (name: string, value: string) => ExpressStyleResponse;
    send: (data?: any) => any;
    redirect: (url: string, code?: number) => any;
}
export declare class IdentityServer {
    private options;
    private app;
    private server;
    private isRunning;
    private initialized;
    private logger;
    private Hono;
    private serve;
    private identityPlugin;
    constructor(options?: IdentityServerOptions);
    private _setupFailbanMiddleware;
    private _extractClientIp;
    private _createRateLimitMiddleware;
    private _setupRoutes;
    private _setupOAuth2Routes;
    private _setupUIRoutes;
    start(): Promise<void>;
    get port(): number;
    stop(): Promise<void>;
    getInfo(): {
        isRunning: boolean;
        port: number;
        host: string;
        issuer: string;
    };
    getApp(): HonoApp | null;
}
export default IdentityServer;
//# sourceMappingURL=server.d.ts.map