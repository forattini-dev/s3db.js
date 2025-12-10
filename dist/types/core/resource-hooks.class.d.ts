export type HookFunction<T = unknown> = (data: T) => T | Promise<T>;
export type BoundHookFunction<T = unknown> = HookFunction<T> & {
    __s3db_original?: HookFunction<T>;
};
export interface HooksCollection {
    beforeInsert: BoundHookFunction[];
    afterInsert: BoundHookFunction[];
    beforeUpdate: BoundHookFunction[];
    afterUpdate: BoundHookFunction[];
    beforeDelete: BoundHookFunction[];
    afterDelete: BoundHookFunction[];
    beforeGet: BoundHookFunction[];
    afterGet: BoundHookFunction[];
    beforeList: BoundHookFunction[];
    afterList: BoundHookFunction[];
    beforeQuery: BoundHookFunction[];
    afterQuery: BoundHookFunction[];
    beforePatch: BoundHookFunction[];
    afterPatch: BoundHookFunction[];
    beforeReplace: BoundHookFunction[];
    afterReplace: BoundHookFunction[];
    beforeExists: BoundHookFunction[];
    afterExists: BoundHookFunction[];
    beforeCount: BoundHookFunction[];
    afterCount: BoundHookFunction[];
    beforeGetMany: BoundHookFunction[];
    afterGetMany: BoundHookFunction[];
    beforeDeleteMany: BoundHookFunction[];
    afterDeleteMany: BoundHookFunction[];
    [event: string]: BoundHookFunction[];
}
export interface HooksConfig {
    [event: string]: HookFunction[];
}
export interface ResourceHooksConfig {
    hooks?: HooksConfig;
}
export interface Resource {
    name: string;
}
export type HookEvent = 'beforeInsert' | 'afterInsert' | 'beforeUpdate' | 'afterUpdate' | 'beforeDelete' | 'afterDelete' | 'beforeGet' | 'afterGet' | 'beforeList' | 'afterList' | 'beforeQuery' | 'afterQuery' | 'beforePatch' | 'afterPatch' | 'beforeReplace' | 'afterReplace' | 'beforeExists' | 'afterExists' | 'beforeCount' | 'afterCount' | 'beforeGetMany' | 'afterGetMany' | 'beforeDeleteMany' | 'afterDeleteMany';
export declare class ResourceHooks {
    static HOOK_EVENTS: HookEvent[];
    resource: Resource;
    private _hooks;
    constructor(resource: Resource, config?: ResourceHooksConfig);
    getHooks(): HooksCollection;
    getHooksForEvent(event: string): BoundHookFunction[];
    addHook(event: string, fn: HookFunction): boolean;
    executeHooks<T = unknown>(event: string, data: T): Promise<T>;
    private _bindHook;
    hasHooks(event: string): boolean;
    getHookCount(event: string): number;
    clearHooks(event: string): void;
    clearAllHooks(): void;
}
export default ResourceHooks;
//# sourceMappingURL=resource-hooks.class.d.ts.map