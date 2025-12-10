import type { Context, MiddlewareHandler } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
type HonoConstructor = new () => HonoType;
type HonoType = {
    get: (path: string, handler: ((c: Context) => Response | Promise<Response>) | MiddlewareHandler) => void;
    use: (path: string, handler: MiddlewareHandler) => void;
    route: (path: string, app: HonoType) => void;
    on: (method: string, path: string, handler: ((c: Context) => Response | Promise<Response>) | MiddlewareHandler) => void;
};
export interface ResourceConfig {
    enabled?: boolean;
    versionPrefix?: string | boolean;
    auth?: boolean | string[];
    customMiddleware?: MiddlewareHandler | MiddlewareHandler[];
    methods?: string[];
    validation?: boolean;
    relations?: Record<string, {
        expose?: boolean;
    }>;
    [key: string]: unknown;
}
export interface ResourceLike {
    config?: {
        currentVersion?: string;
        versionPrefix?: string | boolean;
        methods?: string[];
        validation?: boolean;
        routes?: Record<string, unknown>;
        [key: string]: unknown;
    };
    version?: string;
    [key: string]: unknown;
}
export interface RoutesConfig {
    [path: string]: unknown;
}
export interface AuthConfig {
    drivers?: Array<{
        driver: string;
        config?: Record<string, unknown>;
    }>;
    resource?: string;
    usernameField?: string;
    passwordField?: string;
    registration?: {
        enabled?: boolean;
        allowedFields?: string[];
        defaultRole?: string;
    };
    loginThrottle?: {
        enabled?: boolean;
        maxAttempts?: number;
        windowMs?: number;
        blockDurationMs?: number;
        maxEntries?: number;
    };
}
export interface StaticConfig {
    driver: 'filesystem' | 's3';
    path: string;
    root?: string;
    bucket?: string;
    prefix?: string;
    config?: {
        index?: string;
        fallback?: string;
        maxAge?: number;
        dotfiles?: string;
        etag?: boolean;
        cors?: boolean;
        streaming?: boolean;
        signedUrlExpiry?: number;
        cacheControl?: string;
        contentDisposition?: string;
    };
}
export interface FailbanPlugin {
    [key: string]: unknown;
}
export interface MetricsPlugin {
    options?: {
        enabled?: boolean;
        format?: string;
    };
    getPrometheusMetrics?: () => string;
    getSummary?: () => Record<string, unknown>;
}
export interface RelationConfig {
    type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';
    resource: string;
    [key: string]: unknown;
}
export interface RelationsPlugin {
    relations?: Record<string, Record<string, RelationConfig>>;
    database?: DatabaseLike;
    populate?(resource: unknown, items: unknown, includes: Record<string, unknown>): Promise<void>;
}
export interface EventEmitter {
    emitResourceEvent(event: string, data: Record<string, unknown>): void;
    [key: string]: unknown;
}
export interface DatabaseLike {
    resources: Record<string, ResourceLike>;
    client?: {
        client?: unknown;
    };
    pluginRegistry?: Record<string, unknown>;
}
export interface RouteSummary {
    resource: string;
    path: string;
    methods: string[];
    authEnabled: boolean;
    authConfig?: boolean | string[];
}
export interface RouterOptions {
    database: DatabaseLike;
    resources?: Record<string, ResourceConfig>;
    routes?: RoutesConfig;
    versionPrefix?: string | boolean;
    basePath?: string;
    auth?: AuthConfig;
    static?: StaticConfig[];
    failban?: FailbanPlugin;
    metrics?: MetricsPlugin;
    relationsPlugin?: RelationsPlugin;
    authMiddleware?: MiddlewareHandler;
    logLevel?: string;
    logger?: Logger;
    Hono: HonoConstructor;
    apiTitle?: string;
    apiDescription?: string;
    docsEnabled?: boolean;
    rootRoute?: boolean | ((c: Context) => Response | Promise<Response>);
}
export declare class Router {
    private database;
    private resources;
    private routes;
    private versionPrefix;
    private basePath;
    private auth;
    private staticConfigs;
    private failban;
    private metrics;
    private relationsPlugin;
    private authMiddleware;
    private logLevel;
    private logger;
    private Hono;
    private apiTitle;
    private apiDescription;
    private docsEnabled;
    private rootRoute;
    private routeSummaries;
    constructor({ database, resources, routes, versionPrefix, basePath, auth, static: staticConfigs, failban, metrics, relationsPlugin, authMiddleware, logLevel, logger, Hono, apiTitle, apiDescription, docsEnabled, rootRoute }: RouterOptions);
    mount(app: HonoType, events: EventEmitter): void;
    private mountRootRoute;
    private _createSplashScreen;
    private mountResourceRoutes;
    private mountAuthRoutes;
    private mountStaticRoutes;
    private mountRelationalRoutes;
    private mountCustomRoutes;
    private mountAdminRoutes;
    private _withBasePath;
    getRouteSummaries(): RouteSummary[];
}
export {};
//# sourceMappingURL=router.class.d.ts.map