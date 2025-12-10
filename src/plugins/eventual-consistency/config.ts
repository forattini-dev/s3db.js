/**
 * Configuration for EventualConsistencyPlugin
 * @module eventual-consistency/config
 */

import { createLogger } from '../../concerns/logger.js';

const logger = createLogger({ name: 'eventual-consistency' });

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
export function createConfig(options: EventualConsistencyPluginOptions = {}): NormalizedConfig {
  const defaultReducer: ReducerFunction = (current, incoming) => current + incoming;

  return {
    resources: options.resources || [],
    mode: options.mode || 'async',
    consolidationInterval: options.consolidationInterval || 60,
    consolidationWindow: options.consolidationWindow || 24,
    autoConsolidate: options.autoConsolidate !== false,
    transactionRetention: options.transactionRetention ?? 7,
    gcInterval: options.gcInterval || 3600,
    enableAnalytics: options.enableAnalytics || false,
    enableCoordinator: options.enableCoordinator || false,
    ticketBatchSize: options.ticketBatchSize || 100,
    ticketTTL: options.ticketTTL || 300000,
    workerClaimLimit: options.workerClaimLimit || 1,
    cohort: {
      granularity: options.cohort?.granularity || 'hour',
      timezone: options.cohort?.timezone || 'UTC'
    },
    analyticsConfig: {
      rollupStrategy: options.analyticsConfig?.rollupStrategy || 'incremental',
      retentionDays: options.analyticsConfig?.retentionDays || 365
    },
    logLevel: options.logLevel
  };
}

/**
 * Validate resources configuration
 *
 * @param resources - Resources configuration
 * @throws Error if configuration is invalid
 */
export function validateResourcesConfig(resources: ResourceConfig[]): void {
  if (!Array.isArray(resources)) {
    throw new Error('EventualConsistencyPlugin: resources must be an array');
  }

  for (const resourceConfig of resources) {
    if (!resourceConfig.resource || typeof resourceConfig.resource !== 'string') {
      throw new Error('EventualConsistencyPlugin: each resource must have a "resource" name');
    }

    if (!Array.isArray(resourceConfig.fields) || resourceConfig.fields.length === 0) {
      throw new Error(`EventualConsistencyPlugin: resource "${resourceConfig.resource}" must have at least one field`);
    }

    for (const fieldConfig of resourceConfig.fields) {
      if (typeof fieldConfig === 'string') {
        if (!fieldConfig) {
          throw new Error(`EventualConsistencyPlugin: field name cannot be empty for resource "${resourceConfig.resource}"`);
        }
      } else if (typeof fieldConfig === 'object') {
        if (!fieldConfig.field || typeof fieldConfig.field !== 'string') {
          throw new Error(`EventualConsistencyPlugin: field config must have a "field" name for resource "${resourceConfig.resource}"`);
        }
        if (fieldConfig.reducer && typeof fieldConfig.reducer !== 'function') {
          throw new Error(`EventualConsistencyPlugin: reducer must be a function for field "${fieldConfig.field}"`);
        }
      } else {
        throw new Error(`EventualConsistencyPlugin: invalid field config type for resource "${resourceConfig.resource}"`);
      }
    }
  }
}

/**
 * Log configuration warnings
 *
 * @param config - Normalized configuration
 */
export function logConfigWarnings(config: NormalizedConfig): void {
  if (config.mode === 'sync' && config.autoConsolidate) {
    logger.warn(
      '[EventualConsistency] Warning: autoConsolidate is ignored in sync mode'
    );
  }

  if (config.consolidationInterval < 10) {
    logger.warn(
      '[EventualConsistency] Warning: consolidationInterval < 10s may cause high CPU usage'
    );
  }

  if (config.transactionRetention === 0) {
    logger.warn(
      '[EventualConsistency] Warning: transactionRetention=0 disables garbage collection'
    );
  }

  if (config.enableCoordinator && config.mode !== 'async') {
    logger.warn(
      '[EventualConsistency] Warning: coordinator mode is only effective in async mode'
    );
  }
}

/**
 * Log initialization message
 *
 * @param config - Normalized configuration
 */
export function logInitialization(config: NormalizedConfig): void {
  if (!config.logLevel) return;

  const resourceSummary = config.resources
    .map(r => `${r.resource}(${r.fields.length} fields)`)
    .join(', ');

  logger.info(
    `[EventualConsistency] Initialized: mode=${config.mode}, ` +
    `consolidationInterval=${config.consolidationInterval}s, ` +
    `resources=[${resourceSummary}]`
  );
}
