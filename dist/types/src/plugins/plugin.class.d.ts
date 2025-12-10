import EventEmitter from 'events';
import { PluginStorage } from '../concerns/plugin-storage.js';
import { FilesystemStorageDriver } from '../concerns/storage-drivers/filesystem-driver.js';
import { S3DBLogger } from '../concerns/logger.js';
import type { Database } from '../database.class.js';
import type { CronManager } from '../concerns/cron-manager.js';
export interface PluginConfig {
    slug?: string;
    namespace?: string;
    instanceId?: string;
    logLevel?: string;
    logger?: S3DBLogger;
    storage?: StorageConfig;
    [key: string]: unknown;
}
export interface StorageConfig {
    driver?: 's3' | 'filesystem';
    config?: Record<string, unknown>;
}
export interface PartitionDefinition {
    fields?: Record<string, unknown>;
}
export interface ResourceConfig {
    partitions?: Record<string, PartitionDefinition>;
}
export interface ResourceLike {
    config?: ResourceConfig;
    $schema?: ResourceConfig;
    name?: string;
    _pluginWrappers?: Map<string, WrapperFunction[]>;
    _pluginMiddlewares?: Record<string, MiddlewareFunction[]>;
    applyPartitionRule?(value: unknown, rule: unknown): unknown;
    insert?(data: unknown): Promise<unknown>;
    update?(id: string, data: unknown): Promise<unknown>;
    delete?(id: string): Promise<unknown>;
    get?(id: string): Promise<unknown>;
    list?(options?: unknown): Promise<unknown>;
    on?(event: string, handler: (...args: unknown[]) => void): void;
    off?(event: string, handler: (...args: unknown[]) => void): void;
}
export type HookHandler = (...args: unknown[]) => Promise<unknown> | unknown;
export type WrapperFunction = (result: unknown, args: unknown[], methodName: string) => Promise<unknown>;
export type MiddlewareFunction = (next: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => Promise<unknown>;
export interface ScheduledTask {
    stop?(): void;
}
export interface UninstallOptions {
    purgeData?: boolean;
}
export declare class Plugin<TOptions extends PluginConfig = PluginConfig> extends EventEmitter {
    name: string;
    options: TOptions;
    hooks: Map<string, Map<string, HookHandler[]>>;
    baseSlug: string;
    slug: string;
    protected _storage: PluginStorage | FilesystemStorageDriver | null;
    instanceName: string | null;
    namespace: string | null;
    protected _namespaceExplicit: boolean;
    cronManager: CronManager | null;
    protected _cronJobs: string[];
    logger: S3DBLogger;
    database: Database;
    logLevel: string;
    constructor(options?: TOptions);
    protected _generateSlug(): string;
    protected _normalizeNamespace(value: string | null | undefined): string | null;
    setNamespace(value: string | null | undefined, { explicit }?: {
        explicit?: boolean;
    }): void;
    setInstanceName(name: string | null | undefined): void;
    onNamespaceChanged(_namespace: string | null): void;
    getChildLogger(name: string, bindings?: Record<string, unknown>): S3DBLogger;
    scheduleCron(expression: string, fn: () => Promise<void> | void, suffix?: string, options?: Record<string, unknown>): Promise<ScheduledTask | null>;
    scheduleInterval(ms: number, fn: () => Promise<void> | void, suffix?: string, options?: Record<string, unknown>): Promise<ScheduledTask | null>;
    stopAllCronJobs(): number;
    getStorage(): PluginStorage | FilesystemStorageDriver;
    detectAndWarnNamespaces(): Promise<string[]>;
    install(database: Database): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    uninstall(options?: UninstallOptions): Promise<void>;
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(_options: UninstallOptions): Promise<void>;
    addHook(resource: string, event: string, handler: HookHandler): void;
    removeHook(resource: string, event: string, handler: HookHandler): void;
    wrapResourceMethod(resource: ResourceLike, methodName: string, wrapper: WrapperFunction): void;
    addMiddleware(resource: ResourceLike, methodName: string, middleware: MiddlewareFunction): void;
    getPartitionValues(data: Record<string, unknown>, resource: ResourceLike): Record<string, Record<string, unknown>>;
    getNestedFieldValue(data: Record<string, unknown>, fieldPath: string): unknown;
    beforeInstall(): void;
    afterInstall(): void;
    beforeStart(): void;
    afterStart(): void;
    beforeStop(): void;
    afterStop(): void;
    beforeUninstall(): void;
    afterUninstall(): void;
}
//# sourceMappingURL=plugin.class.d.ts.map