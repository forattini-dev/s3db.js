/**
 * ApiApp v2 - Explicit builder pattern, no Proxy, deterministic execution
 *
 * Key improvements:
 * - Explicit app.route() instead of Proxy magic
 * - Single RouteContext (ctx) with db/resources/helpers
 * - Deterministic priority queue for guards/middlewares
 * - Schemas compiled at registration (zero runtime work)
 * - app.mountDocs() for integrated documentation
 * - app.group() for route composition
 */
import { Hono } from 'hono';
import type { Context, MiddlewareHandler as HonoMiddleware, TypedResponse } from 'hono';
import { RouteContext } from './route-context.class.js';
export interface RouteOptions {
    description?: string | null;
    summary?: string | null;
    tags?: string[];
    operationId?: string | null;
    schema?: Record<string, unknown> | null;
    requestSchema?: Record<string, unknown> | null;
    responseSchema?: Record<string, unknown> | null;
    guards?: string[];
    protected?: string[];
    priority?: number;
}
export interface RouteMetadata {
    method: string;
    path: string;
    description: string | null;
    summary: string | null;
    tags: string[];
    operationId: string | null;
    requestSchema: OpenAPISchema | null;
    responseSchema: OpenAPISchema | null;
    guards: string[];
    protected: string[];
    priority: number;
    compiledValidator: ((data: unknown) => true | ValidationError[]) | null;
    handlers?: HonoMiddleware[];
}
export interface ValidationError {
    field?: string;
    message?: string;
    type?: string;
    [key: string]: unknown;
}
export interface GuardEntry {
    fn: GuardFunction;
    priority: number;
}
export interface MiddlewareEntry {
    fn: HonoMiddleware;
    priority: number;
    name: string;
}
export type GuardFunction = (ctx: RouteContext, deps: {
    db: unknown;
    resources: Record<string, unknown>;
}) => Promise<boolean | Record<string, unknown>> | boolean | Record<string, unknown>;
export type RouteHandler = (ctx: RouteContext) => Promise<Response | TypedResponse> | Response | TypedResponse;
export interface ApiAppOptions {
    db?: unknown | null;
    resources?: Record<string, unknown> | null;
}
export interface DocsMountOptions {
    title?: string;
    version?: string;
    description?: string;
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    jsonPath?: string;
    htmlPath?: string;
    includeCodeSamples?: boolean;
}
export interface GroupOptions {
    tags?: string[];
    guards?: string[];
    priority?: number;
}
export interface GroupProxy {
    route: (method: string, path: string, options: RouteOptions, handler: RouteHandler) => ApiApp;
    get: (path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler) => ApiApp;
    post: (path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler) => ApiApp;
    put: (path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler) => ApiApp;
    patch: (path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler) => ApiApp;
    delete: (path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler) => ApiApp;
}
export interface CrudHandlers {
    list?: RouteHandler;
    get?: RouteHandler;
    create?: RouteHandler;
    update?: RouteHandler;
    patch?: RouteHandler;
    delete?: RouteHandler;
}
export interface CrudOptions {
    tags?: string[];
    guards?: string[];
    schemas?: {
        list?: Record<string, unknown>;
        get?: Record<string, unknown>;
        create?: Record<string, unknown>;
        update?: Record<string, unknown>;
        patch?: Record<string, unknown>;
    };
    basePath?: string;
}
export interface HealthCheckOptions {
    checker?: (ctx: RouteContext) => Promise<{
        healthy?: boolean;
        checks?: Record<string, unknown>;
    }>;
}
export interface OpenAPISchema {
    type: string;
    format?: string;
    properties?: Record<string, OpenAPISchema>;
    required?: string[];
    items?: OpenAPISchema;
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    default?: unknown;
    example?: unknown;
    description?: string;
}
export interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        version: string;
        description: string;
    };
    servers: Array<{
        url: string;
        description?: string;
    }>;
    paths: Record<string, Record<string, unknown>>;
    components: {
        schemas: Record<string, unknown>;
        securitySchemes: Record<string, unknown>;
    };
}
export interface SchemaCache {
    validator: ((data: unknown) => true | ValidationError[]) | null;
    openApi: OpenAPISchema;
}
interface ValidatorInstance {
    compile(schema: Record<string, unknown>): (data: unknown) => true | ValidationError[];
}
export declare class ApiApp {
    hono: Hono;
    routes: RouteMetadata[];
    guards: Map<string, GuardEntry>;
    middlewares: MiddlewareEntry[];
    validator: ValidatorInstance;
    db: unknown | null;
    resources: Record<string, unknown>;
    schemaCache: Map<string, SchemaCache>;
    constructor({ db, resources }?: ApiAppOptions);
    route(methodOrPath: string, pathOrApp: string | Hono, options?: RouteOptions, handler?: RouteHandler): ApiApp;
    get(path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler): ApiApp;
    post(path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler): ApiApp;
    put(path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler): ApiApp;
    patch(path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler): ApiApp;
    delete(path: string, options: RouteOptions | RouteHandler, handler?: RouteHandler): ApiApp;
    use(pathOrMiddleware: string | HonoMiddleware, middlewareOrOptions?: HonoMiddleware | {
        priority?: number;
        name?: string;
    }, maybeOptions?: {
        priority?: number;
        name?: string;
    }): ApiApp;
    guard(name: string, guardFn: GuardFunction, { priority }?: {
        priority?: number | undefined;
    }): ApiApp;
    group(basePath: string, options?: GroupOptions): GroupProxy;
    mountDocs(options?: DocsMountOptions): ApiApp;
    getRoutes(): RouteMetadata[];
    get fetch(): (request: Request, env?: unknown, executionContext?: unknown) => Response | Promise<Response>;
    onError(handler: (err: Error, c: Context) => Response | Promise<Response>): ApiApp;
    notFound(handler: (c: Context) => Response | Promise<Response>): ApiApp;
    generateOpenAPI(info?: Partial<DocsMountOptions>): Promise<OpenAPISpec>;
    groupWithCallback(basePath: string, optionsOrCallback: GroupOptions | ((group: GroupProxy) => void), callback?: (group: GroupProxy) => void): ApiApp;
    crud(resourceName: string, handlers: CrudHandlers, options?: CrudOptions): ApiApp;
    health(path?: string, options?: HealthCheckOptions): ApiApp;
    private _compileSchemaAtRegistration;
    private _buildMiddlewareChain;
    private _createValidationMiddleware;
    private _createGuardsMiddleware;
    private _fvToOpenApi;
    private _parseRule;
    private _mapType;
    private _generateOpenAPISpec;
    private _generateAllResponses;
    private _errorSchema;
    private _generateParametersFromSchema;
    private _generateCodeSamples;
    private _generateExampleFromSchema;
}
export {};
//# sourceMappingURL=app.class.d.ts.map