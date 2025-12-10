import type { Context, MiddlewareHandler } from 'hono';
export interface LoggerLike {
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
    [level: string]: ((obj: unknown, msg?: string) => void) | unknown;
}
export interface RequestLike {
    id?: string;
    method: string;
    url: string;
    headers: Record<string, string | undefined>;
    socket?: {
        remoteAddress?: string;
        remotePort?: number;
    };
    log?: LoggerLike;
    raw?: unknown;
}
export interface ResponseLike {
    statusCode?: number;
    status?: number;
    headers?: Headers;
    getHeader?(name: string): string | number | string[] | undefined;
}
export interface SerializedRequest {
    id?: string;
    method: string;
    url: string;
    headers: Record<string, string | undefined>;
    remoteAddress?: string;
    remotePort?: number;
}
export interface SerializedResponse {
    statusCode?: number;
    headers: Record<string, string | number | string[] | undefined>;
}
export interface SerializedError {
    type?: string;
    message?: string;
    stack?: string;
    code?: string;
    statusCode?: number;
    [key: string]: unknown;
}
export type CustomLogLevelFn = (req: RequestLike | {
    method: string;
    url: string;
}, res: ResponseLike | {
    statusCode: number;
}, err: Error | null) => string;
export type CustomPropsFn = (req: unknown, res: unknown) => Record<string, unknown>;
export interface PinoLoggerOptions {
    logger: LoggerLike;
    autoLogging?: boolean;
    customLogLevel?: CustomLogLevelFn;
    ignorePaths?: string[];
    customProps?: CustomPropsFn | null;
}
export interface PinoHttpLike {
    (req: unknown, res: unknown): void;
}
export interface PinoHttpModule {
    (options: {
        logger: LoggerLike;
        autoLogging: boolean;
        customLogLevel: CustomLogLevelFn;
        customProps?: CustomPropsFn;
        serializers: {
            req: (req: RequestLike) => SerializedRequest;
            res: (res: ResponseLike) => SerializedResponse;
            err: (err: Error) => SerializedError;
        };
    }): PinoHttpLike;
}
export declare function createPinoLoggerMiddleware(options: PinoLoggerOptions): Promise<MiddlewareHandler>;
export declare function getRequestLogger(c: Context): LoggerLike;
export declare function customLogLevelExample(req: RequestLike | {
    method: string;
    url: string;
}, res: ResponseLike | {
    statusCode: number;
}): string;
//# sourceMappingURL=pino-logger.d.ts.map