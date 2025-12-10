import type { DatabaseRef, HookEventName, DatabaseHookFunction } from './types.js';
import type { CreateResourceConfig } from './database-resources.class.js';
export declare const HOOK_EVENTS: HookEventName[];
export declare class DatabaseHooks {
    private database;
    private _hooks;
    private _hookEvents;
    private _hooksInstalled;
    private _originalConnect?;
    private _originalCreateResource?;
    private _originalUploadMetadataFile?;
    private _originalDisconnect?;
    constructor(database: DatabaseRef);
    private _initHooks;
    get hookEvents(): HookEventName[];
    get isInstalled(): boolean;
    wrapMethods(connect: () => Promise<void>, createResource: (config: CreateResourceConfig) => Promise<any>, uploadMetadataFile: () => Promise<void>, disconnect: () => Promise<void>): {
        connect: () => Promise<void>;
        createResource: (config: CreateResourceConfig) => Promise<any>;
        uploadMetadataFile: () => Promise<void>;
        disconnect: () => Promise<void>;
    };
    addHook(event: HookEventName, fn: DatabaseHookFunction): void;
    removeHook(event: HookEventName, fn: DatabaseHookFunction): void;
    getHooks(event: HookEventName): DatabaseHookFunction[];
    clearHooks(event: HookEventName): void;
    executeHooks(event: HookEventName, context?: Record<string, unknown>): Promise<void>;
}
//# sourceMappingURL=database-hooks.class.d.ts.map