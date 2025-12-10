/**
 * Configuration for EventualConsistencyPlugin
 * @module eventual-consistency/config
 */
export type CohortGranularity = 'hour' | 'day' | 'week' | 'month';
export type ConsolidationMode = 'sync' | 'async';
export type ReducerFunction = (current: number, incoming: number) => number;
export type RollupStrategy = 'incremental' | 'full';
export interface CohortConfig {
    granularity: CohortGranularity;
    timezone: string;
}
export interface AnalyticsConfig {
    rollupStrategy: RollupStrategy;
    retentionDays: number;
}
export interface FieldConfig {
    field: string;
    fieldPath?: string;
    initialValue?: number;
    reducer?: ReducerFunction;
    cohort?: Partial<CohortConfig>;
}
export interface ResourceConfig {
    resource: string;
    fields: (string | FieldConfig)[];
}
export interface EventualConsistencyPluginOptions {
    resources?: ResourceConfig[];
    mode?: ConsolidationMode;
    consolidationInterval?: number;
    consolidationWindow?: number;
    autoConsolidate?: boolean;
    transactionRetention?: number;
    gcInterval?: number;
    enableAnalytics?: boolean;
    enableCoordinator?: boolean;
    ticketBatchSize?: number;
    ticketTTL?: number;
    workerClaimLimit?: number;
    cohort?: Partial<CohortConfig>;
    analyticsConfig?: Partial<AnalyticsConfig>;
    logLevel?: string;
    [key: string]: any;
}
export interface NormalizedConfig {
    resources: ResourceConfig[];
    mode: ConsolidationMode;
    consolidationInterval: number;
    consolidationWindow: number;
    autoConsolidate: boolean;
    transactionRetention: number;
    gcInterval: number;
    enableAnalytics: boolean;
    enableCoordinator: boolean;
    ticketBatchSize: number;
    ticketTTL: number;
    workerClaimLimit: number;
    cohort: CohortConfig;
    analyticsConfig: AnalyticsConfig;
    logLevel?: string;
    [key: string]: any;
}
export interface FieldHandlerConfig extends NormalizedConfig {
    resource: string;
    field: string;
    fieldPath?: string;
    initialValue: number;
    reducer: ReducerFunction;
}
/**
 * Create configuration with defaults
 *
 * @param options - User-provided options
 * @returns Normalized configuration
 */
export declare function createConfig(options?: EventualConsistencyPluginOptions): NormalizedConfig;
/**
 * Validate resources configuration
 *
 * @param resources - Resources configuration
 * @throws Error if configuration is invalid
 */
export declare function validateResourcesConfig(resources: ResourceConfig[]): void;
/**
 * Log configuration warnings
 *
 * @param config - Normalized configuration
 */
export declare function logConfigWarnings(config: NormalizedConfig): void;
/**
 * Log initialization message
 *
 * @param config - Normalized configuration
 */
export declare function logInitialization(config: NormalizedConfig): void;
//# sourceMappingURL=config.d.ts.map