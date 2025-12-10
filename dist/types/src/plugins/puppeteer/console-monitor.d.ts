import type { PuppeteerPlugin } from '../puppeteer.plugin.js';
export interface ConsoleMonitorConfig {
    enabled: boolean;
    persist: boolean;
    filters: {
        levels: string[] | null;
        excludePatterns: RegExp[];
        includeStackTraces: boolean;
        includeSourceLocation: boolean;
        captureNetwork: boolean;
    };
}
export interface ConsoleMessage {
    level: string;
    text: string;
    timestamp: number;
    url?: string;
    location?: {
        url: string;
        lineNumber?: number;
        columnNumber?: number;
    };
    stackTrace?: string[];
}
export interface ConsoleSession {
    sessionId: string;
    startTime: number;
    endTime?: number;
    messageCount: number;
    errorCount: number;
    warningCount: number;
}
export interface ConsoleStats {
    totalMessages: number;
    byLevel: Record<string, number>;
    errorsCount: number;
    warningsCount: number;
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
interface ConsoleMessageHandle {
    type(): string;
    text(): string;
    location(): {
        url: string;
        lineNumber?: number;
        columnNumber?: number;
    };
    stackTrace?(): Array<{
        url: string;
        lineNumber?: number;
        columnNumber?: number;
    }>;
}
interface PageErrorEvent extends Error {
    message: string;
    stack?: string;
}
interface Page {
    on(event: 'console', handler: (msg: ConsoleMessageHandle) => void): void;
    on(event: 'pageerror', handler: (error: PageErrorEvent) => void): void;
    url(): string;
}
export declare class ConsoleMonitor {
    plugin: PuppeteerPlugin;
    config: ConsoleMonitorConfig;
    messages: Map<string, ConsoleMessage[]>;
    sessions: Map<string, ConsoleSession>;
    storage: Resource | null;
    constructor(plugin: PuppeteerPlugin);
    get database(): Database;
    get logger(): Logger;
    initialize(): Promise<void>;
    private _setupStorage;
    startSession(sessionId: string): ConsoleSession;
    attachToPage(page: Page, sessionId: string): void;
    endSession(sessionId: string): Promise<ConsoleSession | null>;
    private _persistSession;
    getSessionMessages(sessionId: string): ConsoleMessage[];
    getSessionStats(sessionId: string): ConsoleStats | null;
    clearSession(sessionId: string): void;
}
export default ConsoleMonitor;
//# sourceMappingURL=console-monitor.d.ts.map