/**
 * Install logic for EventualConsistencyPlugin
 * @module eventual-consistency/install
 */
import { type EventualConsistencyPlugin } from './helpers.js';
import { type RunConsolidationCallback } from './consolidation.js';
import { type RunGCCallback, type EmitFunction } from './garbage-collection.js';
import type { FieldHandler } from './utils.js';
import type { NormalizedConfig } from './config.js';
export type FieldHandlers = Map<string, Map<string, FieldHandler>>;
export type ResourceFilter = (resourceName: string) => boolean;
export interface Database {
    resources: Record<string, any>;
    createResource(config: any): Promise<any>;
    addHook(hookName: string, callback: HookCallback): void;
}
export interface HookCallback {
    (params: {
        resource: any;
        config: {
            name: string;
        };
    }): Promise<void>;
}
/**
 * Install plugin for all configured resources
 *
 * @param database - Database instance
 * @param fieldHandlers - Field handlers map
 * @param completeFieldSetupFn - Function to complete field setup for a field
 * @param watchForResourceFn - Function to watch for resource creation
 * @param shouldManageResource - Predicate to determine if a resource should be managed
 */
export declare function onInstall(database: Database, fieldHandlers: FieldHandlers, completeFieldSetupFn: (handler: FieldHandler) => Promise<void>, watchForResourceFn: (resourceName: string) => void, shouldManageResource?: ResourceFilter): Promise<void>;
/**
 * Watch for a specific resource creation
 *
 * @param resourceName - Resource name to watch for
 * @param database - Database instance
 * @param fieldHandlers - Field handlers map
 * @param completeFieldSetupFn - Function to complete setup for a field
 */
export declare function watchForResource(resourceName: string, database: Database, fieldHandlers: FieldHandlers, completeFieldSetupFn: (handler: FieldHandler) => Promise<void>): void;
export interface PluginInstance extends EventualConsistencyPlugin {
    resourceFilter?: ResourceFilter;
}
/**
 * Complete field setup for a single field handler
 *
 * @param handler - Field handler
 * @param database - Database instance
 * @param config - Plugin configuration
 * @param plugin - Plugin instance (for adding helper methods)
 */
export declare function completeFieldSetup(handler: FieldHandler, database: Database, config: NormalizedConfig, plugin: PluginInstance): Promise<void>;
/**
 * Start timers and emit events for all field handlers
 *
 * @param fieldHandlers - Field handlers map
 * @param config - Plugin configuration
 * @param runConsolidationFn - Function to run consolidation for a handler
 * @param runGCFn - Function to run GC for a handler
 * @param emitFn - Function to emit events
 */
export declare function onStart(fieldHandlers: FieldHandlers, config: NormalizedConfig, runConsolidationFn: RunConsolidationCallback, runGCFn: RunGCCallback, emitFn?: EmitFunction): Promise<void>;
/**
 * Stop all timers and flush pending transactions
 *
 * @param fieldHandlers - Field handlers map
 * @param emitFn - Function to emit events
 */
export declare function onStop(fieldHandlers: FieldHandlers, emitFn?: EmitFunction): Promise<void>;
//# sourceMappingURL=install.d.ts.map