import type { PuppeteerPlugin } from '../puppeteer.plugin.js';
export interface NetworkMonitorConfig {
    enabled: boolean;
    persist: boolean;
    filters: {
        types: string[] | null;
        statuses: number[] | null;
        minSize: number | null;
        maxSize: number | null;
        saveErrors: boolean;
        saveLargeAssets: boolean;
    };
    compression: {
        enabled: boolean;
        threshold: number;
    };
}
export interface NetworkRequest {
    requestId: string;
    url: string;
    method: string;
    resourceType: string;
    timestamp: number;
    requestHeaders?: Record<string, string>;
    postData?: string;
}
export interface NetworkResponse {
    requestId: string;
    url: string;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    mimeType: string;
    timestamp: number;
    responseTime: number;
    size?: number;
    body?: string | Buffer;
    compressed?: boolean;
}
export interface NetworkError {
    requestId: string;
    url: string;
    errorText: string;
    timestamp: number;
}
export interface NetworkSession {
    sessionId: string;
    startTime: number;
    endTime?: number;
    requestCount: number;
    errorCount: number;
    totalSize: number;
}
export interface NetworkStats {
    totalRequests: number;
    totalSize: number;
    byType: Record<string, {
        count: number;
        size: number;
    }>;
    byStatus: Record<string, number>;
    errorCount: number;
    avgResponseTime: number;
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
    insert(data: Record<string, unknown>): Promise<Record<string, unknown>>;
    list(options: {
        limit: number;
    }): Promise<Record<string, unknown>[]>;
}
interface CDPSession {
    send(method: string, params?: Record<string, unknown>): Promise<unknown>;
    on(event: string, handler: (params: unknown) => void): void;
}
interface Page {
    url(): string;
    target(): {
        createCDPSession(): Promise<CDPSession>;
    };
}
export declare class NetworkMonitor {
    plugin: PuppeteerPlugin;
    config: NetworkMonitorConfig;
    requests: Map<string, Map<string, NetworkRequest>>;
    responses: Map<string, Map<string, NetworkResponse>>;
    sessions: Map<string, NetworkSession>;
    cdpSessions: Map<string, CDPSession>;
    constructor(plugin: PuppeteerPlugin);
    get database(): Database;
    get logger(): Logger;
    initialize(): Promise<void>;
    private _setupStorage;
    startSession(sessionId: string): NetworkSession;
    attachToPage(page: Page, sessionId: string): Promise<void>;
    endSession(sessionId: string): Promise<NetworkSession | null>;
    private _persistSession;
    getSessionStats(sessionId: string): NetworkStats | null;
    decompressBody(compressedBody: string): Promise<string>;
    clearSession(sessionId: string): void;
}
export default NetworkMonitor;
//# sourceMappingURL=network-monitor.d.ts.map