import type { PuppeteerPlugin } from '../puppeteer.plugin.js';
export interface ProxyConfig {
    id?: string;
    protocol: string;
    host: string;
    port: number;
    username: string | null;
    password: string | null;
    url: string;
}
export interface ProxyManagerConfig {
    enabled: boolean;
    list: (string | Partial<ProxyConfig>)[];
    selectionStrategy: 'round-robin' | 'random' | 'least-used' | 'best-performance';
    bypassList?: string[];
    healthCheck?: {
        enabled?: boolean;
        interval?: number;
        testUrl?: string;
        timeout?: number;
        successRateThreshold?: number;
    };
}
export interface ProxyStats {
    requests: number;
    failures: number;
    successRate: number;
    lastUsed: number;
    healthy: boolean;
    createdAt: number;
}
export interface ProxyStatResult {
    proxyId: string;
    url: string;
    requests: number;
    failures: number;
    successRate: number;
    lastUsed: number;
    healthy: boolean;
    createdAt: number;
    boundSessions: number;
}
export interface SessionBinding {
    sessionId: string;
    proxyId: string;
    proxyUrl: string;
}
export interface HealthCheckResult {
    total: number;
    healthy: number;
    unhealthy: number;
    checks: Array<{
        proxyId: string;
        url: string;
        healthy: boolean;
    }>;
}
interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
interface CookieManager {
    storage?: {
        list(options: {
            limit: number;
        }): Promise<Array<{
            sessionId: string;
            proxyId?: string;
        }>>;
    };
}
interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
}
interface Page {
    authenticate(credentials: {
        username: string;
        password: string;
    }): Promise<void>;
    goto(url: string, options?: {
        timeout?: number;
    }): Promise<void>;
}
interface PuppeteerInstance {
    launch(options: Record<string, unknown>): Promise<Browser>;
}
export declare class ProxyManager {
    plugin: PuppeteerPlugin;
    config: ProxyManagerConfig;
    storage: unknown;
    proxies: ProxyConfig[];
    proxyStats: Map<string, ProxyStats>;
    sessionProxyMap: Map<string, string>;
    selectionStrategy: string;
    currentProxyIndex: number;
    constructor(plugin: PuppeteerPlugin);
    get logger(): Logger;
    get puppeteer(): PuppeteerInstance;
    get cookieManager(): CookieManager | null;
    initialize(): Promise<void>;
    private _parseProxy;
    private _loadSessionProxyBindings;
    getProxyForSession(sessionId: string, createIfMissing?: boolean): ProxyConfig | null;
    private _selectProxy;
    recordProxyUsage(proxyId: string, success?: boolean): void;
    getProxyStats(): ProxyStatResult[];
    getSessionBindings(): SessionBinding[];
    verifyBinding(sessionId: string, proxyId: string): boolean;
    getProxyLaunchArgs(proxy: ProxyConfig | null): string[];
    authenticateProxy(page: Page, proxy: ProxyConfig): Promise<void>;
    checkProxyHealth(proxyId: string): Promise<boolean>;
    checkAllProxies(): Promise<HealthCheckResult>;
    private _maskProxyUrl;
    _removeBinding(sessionId: string): void;
}
export default ProxyManager;
//# sourceMappingURL=proxy-manager.d.ts.map