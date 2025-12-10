/**
 * API Server - Hono-based HTTP server for s3db.js API Plugin
 *
 * Manages HTTP server lifecycle and delegates routing/middleware concerns
 * to dedicated components (MiddlewareChain, Router, HealthManager).
 */
import type { Context, MiddlewareHandler, Hono } from 'hono';
import type { Logger } from '../../concerns/logger.js';
import { FailbanManager } from '../../concerns/failban-manager.js';
import { ApiEventEmitter } from './concerns/event-emitter.js';
import { MetricsCollector } from './concerns/metrics-collector.js';
import { Router } from './server/router.class.js';
export interface ApiServerOptions {
    port?: number;
    host?: string;
    database?: DatabaseLike;
    namespace?: string | null;
    basePath?: string;
    versionPrefix?: string | boolean;
    resources?: Record<string, unknown>;
    routes?: Record<string, unknown>;
    templates?: {
        enabled: boolean;
        engine: string;
    };
    middlewares?: MiddlewareHandler[];
    cors?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    security?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    sessionTracking?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    requestId?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    httpLogger?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    events?: {
        enabled: boolean;
        logLevel?: string;
        maxListeners?: number;
        [key: string]: unknown;
    };
    metrics?: {
        enabled: boolean;
        logLevel?: string;
        maxPathsTracked?: number;
        resetInterval?: number;
        format?: string;
        [key: string]: unknown;
    };
    failban?: {
        enabled: boolean;
        maxViolations?: number;
        violationWindow?: number;
        banDuration?: number;
        whitelist?: string[];
        blacklist?: string[];
        persistViolations?: boolean;
        logLevel?: string;
        geo?: Record<string, unknown>;
        resourceNames?: Record<string, string>;
        [key: string]: unknown;
    };
    static?: StaticConfig[];
    health?: {
        enabled: boolean;
        [key: string]: unknown;
    };
    logLevel?: string;
    auth?: AuthConfig;
    docsEnabled?: boolean;
    docsUI?: string;
    docsCsp?: string | null;
    apiTitle?: string;
    apiVersion?: string;
    apiDescription?: string;
    maxBodySize?: number;
    startupBanner?: boolean;
    rootRoute?: boolean | ((c: Context) => Response | Promise<Response>);
    compression?: {
        enabled: boolean;
        threshold?: number;
    };
    logger?: Logger;
    docs?: {
        enabled?: boolean;
        ui?: string;
        title?: string;
        version?: string;
        description?: string;
        csp?: string | null;
    };
}
export interface StaticConfig {
    path: string;
    root: string;
    [key: string]: unknown;
}
export interface AuthConfig {
    drivers?: DriverConfig[];
    resource?: string;
    pathAuth?: PathAuthConfig[];
    pathRules?: PathRuleConfig[];
    [key: string]: unknown;
}
export interface DriverConfig {
    driver: string;
    config?: Record<string, unknown>;
}
export interface PathAuthConfig {
    pattern?: string;
    path?: string;
    required?: boolean;
    drivers?: string[];
}
export interface PathRuleConfig {
    pattern: string;
    auth?: string[] | boolean;
    methods?: string[];
    [key: string]: unknown;
}
export interface DatabaseLike {
    resources?: Record<string, ResourceLike>;
    s3dbVersion?: string;
    pluginRegistry?: Record<string, unknown>;
    [key: string]: unknown;
}
export interface ResourceLike {
    name?: string;
    [key: string]: unknown;
}
export interface ServerInfo {
    address: string;
    port: number;
}
export interface RouteSummary {
    path: string;
    methods: string[];
    authEnabled: boolean;
    authConfig?: string[] | boolean;
}
export interface OIDCConfig {
    sessionStore?: SessionStoreConfig | SessionStore;
    [key: string]: unknown;
}
export interface SessionStoreConfig {
    driver: string;
    config?: Record<string, unknown>;
}
export interface SessionStore {
    get(id: string): Promise<unknown>;
    set(id: string, data: unknown, ttl: number): Promise<void>;
    destroy(id: string): Promise<void>;
}
export declare class ApiServer {
    private options;
    private logger;
    private app;
    private server;
    private isRunning;
    private initialized;
    private oidcMiddleware;
    private middlewareChain;
    router: Router | null;
    private healthManager;
    private inFlightRequests;
    private acceptingRequests;
    events: ApiEventEmitter;
    metrics: MetricsCollector;
    failban: FailbanManager | null;
    private relationsPlugin;
    private openApiGenerator;
    private Hono;
    private serve;
    private swaggerUI;
    private cors;
    private ApiApp;
    constructor(options?: ApiServerOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    getInfo(): {
        isRunning: boolean;
        port: number;
        host: string;
        resources: number;
    };
    getApp(): Hono | null;
    stopAcceptingRequests(): void;
    private _registerMetricsPluginRoute;
    waitForRequestsToFinish({ timeout }?: {
        timeout?: number | undefined;
    }): Promise<boolean>;
    shutdown({ timeout }?: {
        timeout?: number | undefined;
    }): Promise<void>;
    private _setupMetricsEventListeners;
    private _setupDocumentationRoutes;
    private _setupOIDCRoutes;
    private _createAuthMiddleware;
    private _printStartupBanner;
    private _resolveLocalHostname;
    private _resolveNetworkHostname;
    private _findLanAddress;
    private _buildUrl;
    _generateOpenAPISpec(): Record<string, unknown>;
}
export default ApiServer;
//# sourceMappingURL=server.d.ts.map