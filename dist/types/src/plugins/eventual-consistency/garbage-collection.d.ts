/**
 * Garbage collection for EventualConsistencyPlugin
 * @module eventual-consistency/garbage-collection
 */
import type { FieldHandler } from './utils.js';
import type { NormalizedConfig } from './config.js';
import type { PluginStorage } from './locks.js';
export type RunGCCallback = (handler: FieldHandler, resourceName: string, fieldName: string) => Promise<void>;
export type EmitFunction = (event: string, data: any) => void;
/**
 * Start garbage collection timer for a handler
 *
 * @param handler - Field handler
 * @param resourceName - Resource name
 * @param fieldName - Field name
 * @param runGCCallback - Callback to run GC
 * @param config - Plugin configuration
 * @returns GC job name
 */
export declare function startGarbageCollectionTimer(handler: FieldHandler, resourceName: string, fieldName: string, runGCCallback: RunGCCallback, config: NormalizedConfig): string;
export interface GCConfig {
    resource: string;
    field: string;
    transactionRetention: number;
    logLevel?: string;
}
/**
 * Delete old applied transactions based on retention policy
 * Uses distributed locking to prevent multiple containers from running GC simultaneously
 *
 * @param transactionResource - Transaction resource
 * @param storage - PluginStorage instance for locks
 * @param config - Plugin configuration
 * @param emitFn - Function to emit events
 */
export declare function runGarbageCollection(transactionResource: FieldHandler['transactionResource'], storage: PluginStorage, config: GCConfig, emitFn?: EmitFunction): Promise<void>;
//# sourceMappingURL=garbage-collection.d.ts.map