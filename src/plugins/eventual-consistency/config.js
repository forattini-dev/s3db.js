/**
 * Configuration handling for EventualConsistencyPlugin
 * @module eventual-consistency/config
 */

/**
 * Create default configuration with options
 * @param {Object} options - User-provided options (nested format)
 * @param {string} detectedTimezone - Auto-detected timezone
 * @returns {Object} Complete configuration object
 */
export function createConfig(options, detectedTimezone) {
  // Extract nested configs with defaults
  const consolidation = options.consolidation || {};
  const locks = options.locks || {};
  const gc = options.garbageCollection || {};
  const analytics = options.analytics || {};
  const batch = options.batch || {};
  const lateArrivals = options.lateArrivals || {};
  const checkpoints = options.checkpoints || {};

  return {
    // Cohort (timezone)
    cohort: {
      timezone: options.cohort?.timezone || detectedTimezone
    },

    // Reducer function
    reducer: options.reducer || ((transactions) => {
      let baseValue = 0;
      for (const t of transactions) {
        if (t.operation === 'set') {
          baseValue = t.value;
        } else if (t.operation === 'add') {
          baseValue += t.value;
        } else if (t.operation === 'sub') {
          baseValue -= t.value;
        }
      }
      return baseValue;
    }),

    // Consolidation settings
    consolidationInterval: consolidation.interval ?? 300,
    consolidationConcurrency: consolidation.concurrency ?? 5,
    consolidationWindow: consolidation.window ?? 24,
    autoConsolidate: consolidation.auto !== false,
    mode: consolidation.mode || 'async',

    // ✅ Performance tuning - Mark applied concurrency (default 50, up from 10)
    markAppliedConcurrency: consolidation.markAppliedConcurrency ?? 50,

    // ✅ Performance tuning - Recalculate concurrency (default 50, up from 10)
    recalculateConcurrency: consolidation.recalculateConcurrency ?? 50,

    // Late arrivals
    lateArrivalStrategy: lateArrivals.strategy || 'warn',

    // Batch transactions
    batchTransactions: batch.enabled || false,
    batchSize: batch.size || 100,

    // Locks
    lockTimeout: locks.timeout || 300,

    // Garbage collection
    transactionRetention: gc.retention ?? 30,
    gcInterval: gc.interval ?? 86400,

    // Analytics
    enableAnalytics: analytics.enabled || false,
    analyticsConfig: {
      periods: analytics.periods || ['hour', 'day', 'month'],
      metrics: analytics.metrics || ['count', 'sum', 'avg', 'min', 'max'],
      rollupStrategy: analytics.rollupStrategy || 'incremental',
      retentionDays: analytics.retentionDays ?? 365
    },

    // Checkpoints
    enableCheckpoints: checkpoints.enabled !== false,
    checkpointStrategy: checkpoints.strategy || 'hourly',
    checkpointRetention: checkpoints.retention ?? 90,
    checkpointThreshold: checkpoints.threshold ?? 1000,
    deleteConsolidatedTransactions: checkpoints.deleteConsolidated !== false,
    autoCheckpoint: checkpoints.auto !== false,

    // Debug
    verbose: options.verbose || false
  };
}

/**
 * Validate resources configuration
 * @param {Object} resources - Resources configuration
 * @throws {Error} If configuration is invalid
 */
export function validateResourcesConfig(resources) {
  if (!resources || typeof resources !== 'object') {
    throw new Error(
      "EventualConsistencyPlugin requires 'resources' option.\n" +
      "Example: { resources: { urls: ['clicks', 'views'], posts: ['likes'] } }"
    );
  }

  for (const [resourceName, fields] of Object.entries(resources)) {
    if (!Array.isArray(fields)) {
      throw new Error(
        `EventualConsistencyPlugin resources.${resourceName} must be an array of field names`
      );
    }
  }
}

/**
 * Log configuration warnings
 * @param {Object} config - Configuration object
 */
export function logConfigWarnings(config) {
  // Warn about batching in distributed environments
  if (config.batchTransactions && !config.verbose) {
    console.warn(
      `[EventualConsistency] WARNING: batch.enabled is true. ` +
      `This stores transactions in memory and will lose data if container crashes. ` +
      `Not recommended for distributed/production environments.`
    );
  }

  // Warn if checkpoints are disabled in high-volume scenarios
  if (!config.enableCheckpoints && !config.verbose) {
    console.warn(
      `[EventualConsistency] INFO: checkpoints.enabled is false. ` +
      `Checkpoints improve performance in high-volume scenarios by creating snapshots. ` +
      `Consider enabling for production use.`
    );
  }
}

/**
 * Log initialization information
 * @param {Object} config - Configuration object
 * @param {Map} fieldHandlers - Field handlers map
 * @param {boolean} timezoneAutoDetected - Whether timezone was auto-detected
 */
export function logInitialization(config, fieldHandlers, timezoneAutoDetected) {
  if (!config.verbose) return;

  const totalFields = Array.from(fieldHandlers.values())
    .reduce((sum, handlers) => sum + handlers.size, 0);

  console.log(
    `[EventualConsistency] Initialized with ${fieldHandlers.size} resource(s), ` +
    `${totalFields} field(s) total`
  );

  // Log timezone if not explicitly set by user
  if (timezoneAutoDetected) {
    console.log(
      `[EventualConsistency] Using timezone: ${config.cohort.timezone} ` +
      `(${process.env.TZ ? 'from TZ env var' : 'default UTC'})`
    );
  }
}
