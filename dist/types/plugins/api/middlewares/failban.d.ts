import type { Context, MiddlewareHandler } from 'hono';
export interface BanInfo {
    ip: string;
    reason: string;
    expiresAt: string;
    createdAt?: string;
    violations?: number;
}
export interface CountryBlockInfo {
    ip?: string;
    country: string;
    reason: string;
}
export interface FailbanStats {
    totalBans: number;
    activeBans: number;
    violations: number;
    [key: string]: unknown;
}
export interface FailbanOptions {
    enabled: boolean;
    banDuration?: number;
    logLevel?: string;
}
export interface FailbanManagerLike {
    options: FailbanOptions;
    isBlacklisted(ip: string): boolean;
    checkCountryBlock(ip: string): CountryBlockInfo | null;
    isBanned(ip: string): boolean;
    getBan(ip: string): Promise<BanInfo | null>;
    ban(ip: string, reason: string): Promise<void>;
    unban(ip: string): Promise<boolean>;
    listBans(): Promise<BanInfo[]>;
    getStats(): Promise<FailbanStats>;
    recordViolation(ip: string, type: string, metadata?: Record<string, unknown>): void;
}
export interface ApiEventEmitterLike {
    emit(event: string, data: unknown): void;
    on(event: string, handler: (data: unknown) => void): void;
}
export interface BannedContext {
    ip: string;
    reason?: string;
    permanent?: boolean;
    ban?: BanInfo;
    retryAfter?: number;
}
export type BannedHandler = (c: Context, info: BannedContext | CountryBlockInfo) => Response | Promise<Response>;
export interface FailbanMiddlewareConfig {
    plugin?: FailbanManagerLike;
    events?: ApiEventEmitterLike | null;
    handler?: BannedHandler | null;
}
export interface AuthFailureEvent {
    ip?: string;
    path?: string;
    allowedMethods?: string[];
}
export interface RequestErrorEvent {
    ip?: string;
    path?: string;
    status?: number;
    error?: string;
    userAgent?: string;
}
export interface ViolationListenerConfig {
    plugin?: FailbanManagerLike;
    events?: ApiEventEmitterLike;
}
export interface HonoLike {
    new (): HonoAppLike;
}
export interface HonoAppLike {
    get(path: string, handler: (c: Context) => Promise<Response>): void;
    post(path: string, handler: (c: Context) => Promise<Response>): void;
    delete(path: string, handler: (c: Context) => Promise<Response>): void;
}
export declare function createFailbanMiddleware(config?: FailbanMiddlewareConfig): MiddlewareHandler;
export declare function setupFailbanViolationListener(config?: ViolationListenerConfig): void;
export declare function createFailbanAdminRoutes(Hono: HonoLike, plugin: FailbanManagerLike): HonoAppLike;
declare const _default: {
    createFailbanMiddleware: typeof createFailbanMiddleware;
    setupFailbanViolationListener: typeof setupFailbanViolationListener;
    createFailbanAdminRoutes: typeof createFailbanAdminRoutes;
};
export default _default;
//# sourceMappingURL=failban.d.ts.map