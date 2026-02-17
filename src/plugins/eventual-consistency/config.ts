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
  resources?: ResourceConfig[] | Record<string, (string | FieldConfig)[]>;
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
  ticketMaxRetries?: number;
  ticketRetryDelayMs?: number;
  ticketScanPageSize?: number;
  cohort?: Partial<CohortConfig>;
  analyticsConfig?: Partial<AnalyticsConfig>;
  coordinator?: {
    heartbeatInterval?: number;
    heartbeatTTL?: number;
    epochDuration?: number;
    workInterval?: number;
    workerInterval?: number;
    ticketBatchSize?: number;
    workerClaimLimit?: number;
    ticketMaxRetries?: number;
    ticketRetryDelayMs?: number;
    ticketScanPageSize?: number;
    coordinatorWorkInterval?: number;
    enableCoordinator?: boolean;
  };
  consolidation?: {
    mode?: ConsolidationMode | string;
    auto?: boolean;
    autoConsolidate?: boolean;
  };
  analytics?: {
    enabled?: boolean;
  };
  heartbeatInterval?: number;
  heartbeatTTL?: number;
  epochDuration?: number;
  coordinatorWorkInterval?: number;
  workerInterval?: number;
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
  ticketMaxRetries: number;
  ticketRetryDelayMs: number;
  ticketScanPageSize: number;
  heartbeatInterval: number;
  heartbeatTTL: number;
  epochDuration: number;
  coordinatorWorkInterval: number;
  workerInterval: number;
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
  const normalizeNumber = (value: any, fallback: number, minimum = 0): number => {
    const normalizedValue = Number(value);
    if (!Number.isFinite(normalizedValue)) {
      return fallback;
    }
    return Math.max(minimum, Math.floor(normalizedValue));
  };

  const normalizeMode = (mode: any): ConsolidationMode => {
    return mode === 'sync' || mode === 'async' ? mode : 'async';
  };

  const normalizedResources = (() => {
    if (!options.resources) return [];

    if (Array.isArray(options.resources)) {
      return options.resources;
    }

    return Object.entries(options.resources).map(([resource, rawFields]) => ({
      resource,
      fields: Array.isArray(rawFields) ? rawFields : []
    }));
  })();

  const coordinatorOptions = options.coordinator || {};
  const consolidationOptions = options.consolidation || {};

  return {
    resources: normalizedResources,
    mode: normalizeMode(options.mode || consolidationOptions.mode),
    consolidationInterval: normalizeNumber(options.consolidationInterval, 60, 1),
    consolidationWindow: normalizeNumber(options.consolidationWindow, 24, 1),
    autoConsolidate:
      options.autoConsolidate ??
      consolidationOptions.auto ??
      consolidationOptions.autoConsolidate ??
      true,
    transactionRetention: options.transactionRetention ?? 7,
    gcInterval: normalizeNumber(options.gcInterval, 3600, 0),
    enableAnalytics: options.enableAnalytics ?? options.analytics?.enabled ?? false,
    enableCoordinator: options.enableCoordinator ?? coordinatorOptions.enableCoordinator ?? true,
    ticketBatchSize: normalizeNumber(options.ticketBatchSize ?? coordinatorOptions.ticketBatchSize, 100, 1),
    ticketTTL: normalizeNumber(options.ticketTTL, 300000, 1),
    workerClaimLimit: normalizeNumber(options.workerClaimLimit ?? coordinatorOptions.workerClaimLimit, 1, 1),
    ticketMaxRetries: normalizeNumber(options.ticketMaxRetries ?? coordinatorOptions.ticketMaxRetries, 3, 0),
    ticketRetryDelayMs: normalizeNumber(options.ticketRetryDelayMs ?? coordinatorOptions.ticketRetryDelayMs, 1000, 250),
    ticketScanPageSize: normalizeNumber(options.ticketScanPageSize ?? coordinatorOptions.ticketScanPageSize, 100, 25),
    heartbeatInterval: normalizeNumber(
      options.heartbeatInterval ?? coordinatorOptions.heartbeatInterval,
      5000,
      1000
    ),
    heartbeatTTL: normalizeNumber(
      options.heartbeatTTL ?? coordinatorOptions.heartbeatTTL,
      3,
      1
    ),
    epochDuration: normalizeNumber(
      options.epochDuration ?? coordinatorOptions.epochDuration,
      300000,
      1
    ),
    coordinatorWorkInterval: normalizeNumber(
      options.coordinatorWorkInterval ??
      coordinatorOptions.coordinatorWorkInterval ??
      coordinatorOptions.workInterval,
      60000,
      100
    ),
    workerInterval: normalizeNumber(
      options.workerInterval ?? coordinatorOptions.workerInterval,
      10000,
      1
    ),
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

  if (config.workerInterval < 100) {
    logger.warn(
      '[EventualConsistency] Warning: workerInterval < 100ms may cause high resource usage in CI and memory clients'
    );
  }

  if (config.workerClaimLimit < 1) {
    logger.warn(
      '[EventualConsistency] Warning: workerClaimLimit must be >= 1'
    );
  }

  if (config.ticketMaxRetries < 0) {
    logger.warn(
      '[EventualConsistency] Warning: ticketMaxRetries must be >= 0'
    );
  }

  if (config.ticketRetryDelayMs < 250) {
    logger.warn(
      '[EventualConsistency] Warning: ticketRetryDelayMs < 250ms may cause high churn'
    );
  }

  if (config.ticketScanPageSize < 25 || config.ticketScanPageSize > 500) {
    logger.warn(
      '[EventualConsistency] Warning: ticketScanPageSize should stay within 25..500 for stable memory usage'
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
