/**
 * Helper methods for EventualConsistencyPlugin
 * @module eventual-consistency/helpers
 */
import { type FieldHandler } from './utils.js';
import type { NormalizedConfig } from './config.js';
export interface HelperOptions {
    source?: string;
}
export interface TargetResource {
    _eventualConsistencyPlugins?: Record<string, FieldHandler>;
    add?(field: string, value: number, options?: HelperOptions): Promise<any>;
    add?(value: number, options?: HelperOptions): Promise<any>;
    sub?(field: string, value: number, options?: HelperOptions): Promise<any>;
    sub?(value: number, options?: HelperOptions): Promise<any>;
    set?(field: string, value: number, options?: HelperOptions): Promise<any>;
    set?(value: number, options?: HelperOptions): Promise<any>;
    increment?(field: string, options?: HelperOptions): Promise<any>;
    increment?(options?: HelperOptions): Promise<any>;
    decrement?(field: string, options?: HelperOptions): Promise<any>;
    decrement?(options?: HelperOptions): Promise<any>;
    consolidate?(field?: string): Promise<any>;
    getConsolidatedValue?(field: string, recordId: string): Promise<number>;
    recalculate?(field: string, recordId: string): Promise<number>;
    [key: string]: any;
}
export interface EventualConsistencyPlugin {
    runConsolidation(handler: FieldHandler, resourceName: string, fieldName: string): Promise<any>;
    getConsolidatedValue(resourceName: string, fieldName: string, recordId: string): Promise<number>;
    recalculateRecord(resourceName: string, fieldName: string, recordId: string): Promise<number>;
}
/**
 * Add helper methods to a target resource
 *
 * @param resource - Target resource to add methods to
 * @param plugin - Plugin instance for consolidation methods
 * @param config - Plugin configuration
 */
export declare function addHelperMethods(resource: TargetResource, plugin: EventualConsistencyPlugin, config: NormalizedConfig): void;
//# sourceMappingURL=helpers.d.ts.map