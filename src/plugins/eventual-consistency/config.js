/**
 * Configuration handling for EventualConsistencyPlugin
 * @module eventual-consistency/config
 */

/**
 * Create default configuration with options
 * @param {Object} options - User-provided options
 * @param {string} detectedTimezone - Auto-detected timezone
 * @returns {Object} Complete configuration object
 */
export function createConfig(options, detectedTimezone) {
  return {
    cohort: {
      timezone: options.cohort?.timezone || detectedTimezone
    },
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
    consolidationInterval: options.consolidationInterval ?? 300,
    consolidationConcurrency: options.consolidationConcurrency || 5,
    consolidationWindow: options.consolidationWindow || 24,
    autoConsolidate: options.autoConsolidate !== false,
    lateArrivalStrategy: options.lateArrivalStrategy || 'warn',
    batchTransactions: options.batchTransactions || false,
    batchSize: options.batchSize || 100,
    mode: options.mode || 'async',
    lockTimeout: options.lockTimeout || 300,
    transactionRetention: options.transactionRetention || 30,
    gcInterval: options.gcInterval || 86400,
    verbose: options.verbose || false,
    enableAnalytics: options.enableAnalytics || false,
    analyticsConfig: {
      periods: options.analyticsConfig?.periods || ['hour', 'day', 'month'],
      metrics: options.analyticsConfig?.metrics || ['count', 'sum', 'avg', 'min', 'max'],
      rollupStrategy: options.analyticsConfig?.rollupStrategy || 'incremental',
      retentionDays: options.analyticsConfig?.retentionDays || 365
    },
    // Checkpoint configuration for high-volume scenarios
    enableCheckpoints: options.enableCheckpoints !== false, // Default: true
    checkpointStrategy: options.checkpointStrategy || 'hourly', // 'hourly', 'daily', 'manual', 'disabled'
    checkpointRetention: options.checkpointRetention || 90, // Days to keep checkpoints
    checkpointThreshold: options.checkpointThreshold || 1000, // Min transactions before creating checkpoint
    deleteConsolidatedTransactions: options.deleteConsolidatedTransactions !== false, // Delete transactions after checkpoint
    autoCheckpoint: options.autoCheckpoint !== false // Auto-create checkpoints for old cohorts
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
      `[EventualConsistency] WARNING: batchTransactions is enabled. ` +
      `This stores transactions in memory and will lose data if container crashes. ` +
      `Not recommended for distributed/production environments.`
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

  // Log detected timezone if not explicitly set
  if (timezoneAutoDetected) {
    console.log(
      `[EventualConsistency] Auto-detected timezone: ${config.cohort.timezone} ` +
      `(from ${process.env.TZ ? 'TZ env var' : 'system Intl API'})`
    );
  }
}
