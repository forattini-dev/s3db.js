import type { Context } from 'hono';
import type { Logger } from '../../../concerns/logger.js';
export interface HookDefinition {
    phase: string;
    canModify: boolean;
    errorHook: string | null;
}
export declare const HOOK_DEFINITIONS: Record<string, HookDefinition>;
export interface CookieOptions {
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    maxAge?: number;
    domain?: string;
}
export interface CookieHelpersConfig {
    cookiePrefix?: string;
}
export declare class CookieHelpers {
    private context;
    private config;
    private cookiePrefix;
    private defaults;
    constructor(context: Context, config?: CookieHelpersConfig);
    private _prefixName;
    setCookie(name: string, value: string, options?: CookieOptions): void;
    getCookie(name: string): string | undefined;
    deleteCookie(name: string, options?: CookieOptions): void;
    setJsonCookie(name: string, data: unknown, options?: CookieOptions): void;
    getJsonCookie<T = unknown>(name: string): T | undefined;
    getSessionId(): string | undefined;
    getSessionData(): Record<string, unknown> | undefined;
}
export type HookFunction = (params: Record<string, unknown>) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void;
export interface HooksConfig {
    hooks?: Record<string, HookFunction | HookFunction[]>;
}
export interface HookExecutorOptions {
    stopOnError?: boolean;
    mergeResults?: boolean;
}
interface HookMetrics {
    executions: Record<string, number>;
    errors: Record<string, number>;
    totalDuration: Record<string, number>;
}
export declare class HookExecutor {
    private config;
    private logger;
    private metrics;
    constructor(config: HooksConfig, customLogger?: Logger);
    getHooks(hookName: string): HookFunction[];
    executeHooks(hookName: string, params: Record<string, unknown>, options?: HookExecutorOptions): Promise<Record<string, unknown>>;
    executeErrorHook(errorHookName: string, params: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    getMetrics(): HookMetrics;
    resetMetrics(): void;
}
export declare function createHookExecutor(config: HooksConfig, customLogger?: Logger): HookExecutor;
export declare function createCookieHelpers(context: Context, config?: CookieHelpersConfig): CookieHelpers;
export {};
//# sourceMappingURL=oidc-hooks.d.ts.map