import type { PuppeteerPlugin } from '../puppeteer.plugin.js';
export interface CookieData {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
}
export interface SessionData {
    sessionId: string;
    cookies: CookieData[];
    userAgent?: string;
    viewport?: {
        width: number;
        height: number;
        deviceScaleFactor: number;
    };
    proxyId?: string;
    domain: string;
    date: string;
    reputation: {
        successCount: number;
        failCount: number;
        successRate: number;
        lastUsed: number;
    };
    metadata: {
        createdAt: number;
        expiresAt: number;
        requestCount: number;
        age: number;
    };
}
export interface CookieManagerConfig {
    enabled: boolean;
    storage: {
        resource: string;
        autoSave: boolean;
        autoLoad: boolean;
        encrypt: boolean;
    };
    farming: {
        enabled: boolean;
        warmup: {
            enabled: boolean;
            pages: string[];
            randomOrder: boolean;
            timePerPage: {
                min: number;
                max: number;
            };
            interactions: {
                scroll: boolean;
                click: boolean;
                hover: boolean;
            };
        };
        rotation: {
            enabled: boolean;
            requestsPerCookie: number;
            maxAge: number;
            poolSize: number;
        };
        reputation: {
            enabled: boolean;
            trackSuccess: boolean;
            retireThreshold: number;
            ageBoost: boolean;
        };
    };
}
export interface CookieStats {
    total: number;
    healthy: number;
    unhealthy: number;
    averageAge: number;
    averageSuccessRate: number;
    byDomain: Record<string, number>;
}
export interface SaveSessionOptions {
    success?: boolean;
    userAgent?: string;
    viewport?: {
        width: number;
        height: number;
        deviceScaleFactor: number;
    };
    proxyId?: string;
}
interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
interface Database {
    createResource(config: Record<string, unknown>): Promise<unknown>;
    getResource(name: string): Promise<Resource>;
    resources: Record<string, Resource>;
}
interface Resource {
    name: string;
    get(id: string): Promise<SessionData | null>;
    insert(data: Record<string, unknown>): Promise<SessionData>;
    patch(id: string, data: Record<string, unknown>): Promise<SessionData>;
    list(options: {
        limit: number;
    }): Promise<SessionData[]>;
}
interface Page {
    cookies(): Promise<CookieData[]>;
    setCookie(...cookies: CookieData[]): Promise<void>;
    url(): string;
    goto(url: string, options?: {
        waitUntil?: string;
    }): Promise<void>;
    evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
    $$(selector: string): Promise<ElementHandle[]>;
    _userAgent?: string;
    _viewport?: {
        width: number;
        height: number;
        deviceScaleFactor: number;
    };
    _proxyId?: string;
}
interface ElementHandle {
    click(): Promise<void>;
    hover(): Promise<void>;
}
export declare class CookieManager {
    plugin: PuppeteerPlugin;
    config: CookieManagerConfig;
    storage: Resource | null;
    sessions: Map<string, SessionData>;
    constructor(plugin: PuppeteerPlugin);
    get database(): Database;
    get logger(): Logger;
    initialize(): Promise<void>;
    private _loadAllSessions;
    loadSession(page: Page, sessionId: string): Promise<boolean>;
    saveSession(page: Page, sessionId: string, options?: SaveSessionOptions): Promise<SessionData>;
    farmCookies(sessionId: string): Promise<void>;
    private _randomScroll;
    private _randomHover;
    private _randomClick;
    getStats(): Promise<CookieStats>;
    getSession(sessionId: string): SessionData | undefined;
    hasSession(sessionId: string): boolean;
    rotateSession(sessionId: string): Promise<string>;
    private _delay;
}
export default CookieManager;
//# sourceMappingURL=cookie-manager.d.ts.map