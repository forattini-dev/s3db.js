import type { Context, MiddlewareHandler } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
import { type DatabaseLike as SessionDatabaseLike } from '../middlewares/session-tracking.js';
import { type FailbanManagerLike } from '../middlewares/failban.js';
type HonoType = {
    use: (path: string, handler: MiddlewareHandler) => void;
};
export interface RequestIdConfig {
    enabled?: boolean;
    headerName?: string;
    generator?: () => string;
}
export interface CorsConfig {
    enabled?: boolean;
    origin?: string | string[];
    allowMethods?: string[];
    allowHeaders?: string[];
    exposeHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
export interface SecurityConfig {
    enabled?: boolean;
    [key: string]: unknown;
}
export interface SessionTrackingConfig {
    enabled?: boolean;
    resource?: string;
    [key: string]: unknown;
}
export interface TemplatesConfig {
    enabled?: boolean;
    engine?: string;
    [key: string]: unknown;
}
export interface HttpLoggerConfig {
    enabled?: boolean;
    autoLogging?: boolean;
    ignorePaths?: string[];
    customLogLevel?: (c: Context, res: Response) => string;
    customProps?: (c: Context) => Record<string, unknown>;
}
export interface EventEmitter {
    emitRequestEvent: (event: string, data: Record<string, unknown>) => void;
    emit?: (event: string, data: unknown) => void;
    on?: (event: string, handler: (data: unknown) => void) => void;
}
export interface DatabaseLike {
    [key: string]: unknown;
}
export interface CorsMiddlewareFactory {
    (config: {
        origin: string | string[];
        allowMethods: string[];
        allowHeaders: string[];
        exposeHeaders: string[];
        credentials: boolean;
        maxAge: number;
    }): MiddlewareHandler;
}
export interface MiddlewareChainOptions {
    requestId?: RequestIdConfig;
    cors?: CorsConfig;
    security?: SecurityConfig;
    sessionTracking?: SessionTrackingConfig;
    middlewares?: MiddlewareHandler[];
    templates?: TemplatesConfig;
    maxBodySize: number;
    failban?: FailbanManagerLike;
    events: EventEmitter;
    logLevel?: string;
    logger?: Logger;
    httpLogger?: HttpLoggerConfig;
    database?: SessionDatabaseLike;
    inFlightRequests: Set<symbol>;
    acceptingRequests: () => boolean;
    corsMiddleware?: CorsMiddlewareFactory;
}
export declare class MiddlewareChain {
    private requestId;
    private cors;
    private security;
    private sessionTracking;
    private middlewares;
    private templates;
    private maxBodySize;
    private failban;
    private events;
    private logLevel;
    private logger;
    private httpLogger;
    private database;
    private inFlightRequests;
    private acceptingRequests;
    private corsMiddleware;
    constructor({ requestId, cors, security, sessionTracking, middlewares, templates, maxBodySize, failban, events, logLevel, logger, httpLogger, database, inFlightRequests, acceptingRequests, corsMiddleware }: MiddlewareChainOptions);
    apply(app: HonoType): Promise<void>;
    private applyRequestTracking;
    private applyFailban;
    private applyRequestId;
    private applyHttpLogger;
    private applyErrorHelper;
    private applyCors;
    private applySecurity;
    private applySessionTracking;
    private applyCustomMiddlewares;
    private applyTemplates;
    private applyBodySizeLimits;
}
export {};
//# sourceMappingURL=middleware-chain.class.d.ts.map