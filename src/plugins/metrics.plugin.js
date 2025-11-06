/**
 * # MetricsPlugin - Performance & Error Monitoring for s3db.js
 *
 * ## Overview
 *
 * The MetricsPlugin provides comprehensive performance monitoring, error tracking, and
 * Prometheus integration for s3db.js applications. Track operation counts, durations,
 * errors, and export metrics to Prometheus for visualization.
 *
 * ## Features
 *
 * 1. **Operation Tracking** - Monitor insert, update, delete, get, list, count operations
 * 2. **Performance Metrics** - Track operation duration and throughput
 * 3. **Error Logging** - Capture and store error details
 * 4. **Resource-Level Metrics** - Per-resource and global metrics
 * 5. **Prometheus Integration** - Export metrics in Prometheus format
 * 6. **Flexible Modes** - Standalone, integrated (with API Plugin), or auto mode
 * 7. **Automatic Cleanup** - Retention-based cleanup of old metrics
 * 8. **Periodic Flushing** - Configurable flush interval for metric persistence
 *
 * ## Configuration
 *
 * ```javascript
 * import { Database } from 's3db.js';
 * import { MetricsPlugin } from 's3db.js/plugins/metrics';
 *
 * // Basic configuration
 * const db = new Database({
 *   connectionString: 's3://bucket/db'
 * });
 *
 * await db.use(new MetricsPlugin({
 *   collectPerformance: true,   // Track performance data (default: true)
 *   collectErrors: true,         // Track errors (default: true)
 *   collectUsage: true,          // Track usage metrics (default: true)
 *   retentionDays: 30,           // Keep metrics for 30 days (default: 30)
 *   flushInterval: 60000         // Flush every 60 seconds (default: 60000)
 * }));
 *
 * // With Prometheus integration
 * await db.use(new MetricsPlugin({
 *   prometheus: {
 *     enabled: true,             // Enable Prometheus export (default: true)
 *     mode: 'auto',              // auto | integrated | standalone (default: 'auto')
 *     port: 9090,                // Standalone server port (default: 9090)
 *     path: '/metrics',          // Metrics endpoint path (default: '/metrics')
 *     includeResourceLabels: true // Include resource names in labels (default: true)
 *   }
 * }));
 * ```
 *
 * ## Usage Examples
 *
 * ### Basic Metrics Collection
 *
 * ```javascript
 * const db = new Database({ connectionString: 's3://bucket/db' });
 * await db.use(new MetricsPlugin());
 * await db.start();
 *
 * const users = await db.createResource({
 *   name: 'users',
 *   attributes: { name: 'string', email: 'string' }
 * });
 *
 * // Perform operations (automatically tracked)
 * await users.insert({ id: 'u1', name: 'John', email: 'john@example.com' });
 * await users.get('u1');
 * await users.update('u1', { name: 'Jane' });
 *
 * // Get metrics
 * const metricsPlugin = db.plugins.MetricsPlugin;
 * const stats = await metricsPlugin.getStats();
 *
 * console.log(stats);
 * // {
 * //   period: '24h',
 * //   totalOperations: 3,
 * //   totalErrors: 0,
 * //   avgResponseTime: 45.2,
 * //   operationsByType: {
 * //     insert: { count: 1, errors: 0, avgTime: 52 },
 * //     get: { count: 1, errors: 0, avgTime: 38 },
 * //     update: { count: 1, errors: 0, avgTime: 46 }
 * //   },
 * //   uptime: { startTime: '2025-01-15T...', duration: 3600000 }
 * // }
 * ```
 *
 * ### Query Metrics
 *
 * ```javascript
 * const metricsPlugin = db.plugins.MetricsPlugin;
 *
 * // Get all metrics for last 24 hours
 * const allMetrics = await metricsPlugin.getMetrics({
 *   startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
 * });
 *
 * // Get metrics for specific resource
 * const userMetrics = await metricsPlugin.getMetrics({
 *   resourceName: 'users',
 *   limit: 100
 * });
 *
 * // Get metrics for specific operation
 * const insertMetrics = await metricsPlugin.getMetrics({
 *   operation: 'insert',
 *   startDate: '2025-01-15',
 *   endDate: '2025-01-16'
 * });
 * ```
 *
 * ### Error Tracking
 *
 * ```javascript
 * const metricsPlugin = db.plugins.MetricsPlugin;
 *
 * // Get recent errors
 * const errors = await metricsPlugin.getErrorLogs({
 *   limit: 50
 * });
 *
 * console.log(errors);
 * // [
 * //   {
 * //     id: 'error-123...',
 * //     resourceName: 'users',
 * //     operation: 'insert',
 * //     error: 'Validation failed: email is required',
 * //     timestamp: '2025-01-15T10:30:00Z',
 * //     createdAt: '2025-01-15'
 * //   }
 * // ]
 *
 * // Get errors for specific resource
 * const userErrors = await metricsPlugin.getErrorLogs({
 *   resourceName: 'users',
 *   operation: 'insert',
 *   startDate: '2025-01-15'
 * });
 * ```
 *
 * ### Performance Monitoring
 *
 * ```javascript
 * const metricsPlugin = db.plugins.MetricsPlugin;
 *
 * // Get performance logs
 * const perfLogs = await metricsPlugin.getPerformanceLogs({
 *   resourceName: 'users',
 *   operation: 'insert',
 *   limit: 100
 * });
 *
 * console.log(perfLogs);
 * // [
 * //   {
 * //     id: 'perf-123...',
 * //     resourceName: 'users',
 * //     operation: 'insert',
 * //     duration: 52,
 * //     timestamp: '2025-01-15T10:30:00Z'
 * //   }
 * // ]
 *
 * // Identify slow operations
 * const slowOps = perfLogs.filter(log => log.duration > 100);
 * console.log(`Found ${slowOps.length} slow operations`);
 * ```
 *
 * ### Prometheus Integration
 *
 * ```javascript
 * // AUTO mode: detects API Plugin and chooses mode automatically
 * await db.use(new MetricsPlugin({
 *   prometheus: { mode: 'auto' }
 * }));
 *
 * // INTEGRATED mode: uses API Plugin's server
 * await db.use(new MetricsPlugin({
 *   prometheus: {
 *     mode: 'integrated',
 *     path: '/metrics'
 *   }
 * }));
 * // Metrics available at http://localhost:3000/metrics (API Plugin's port)
 *
 * // STANDALONE mode: separate HTTP server
 * await db.use(new MetricsPlugin({
 *   prometheus: {
 *     mode: 'standalone',
 *     port: 9090,
 *     path: '/metrics'
 *   }
 * }));
 * // Metrics available at http://localhost:9090/metrics
 *
 * // Get Prometheus metrics manually
 * const prometheusMetrics = await metricsPlugin.getPrometheusMetrics();
 * console.log(prometheusMetrics);
 * // # HELP s3db_operations_total Total number of operations
 * // # TYPE s3db_operations_total counter
 * // s3db_operations_total{operation="insert",resource="users"} 15
 * // s3db_operations_total{operation="get",resource="users"} 42
 * // ...
 * ```
 *
 * ### Cleanup Old Metrics
 *
 * ```javascript
 * const metricsPlugin = db.plugins.MetricsPlugin;
 *
 * // Clean up metrics older than retention period
 * await metricsPlugin.cleanupOldData();
 *
 * // Schedule regular cleanup (e.g., daily)
 * setInterval(async () => {
 *   await metricsPlugin.cleanupOldData();
 *   console.log('Metrics cleanup completed');
 * }, 24 * 60 * 60 * 1000);
 * ```
 *
 * ## Best Practices
 *
 * ### 1. Configure Appropriate Retention
 *
 * ```javascript
 * // For production: 30-90 days
 * await db.use(new MetricsPlugin({
 *   retentionDays: 90
 * }));
 *
 * // For development: 7 days
 * await db.use(new MetricsPlugin({
 *   retentionDays: 7
 * }));
 *
 * // For high-volume: shorter retention
 * await db.use(new MetricsPlugin({
 *   retentionDays: 14,
 *   flushInterval: 300000  // Flush every 5 minutes
 * }));
 * ```
 *
 * ### 2. Use Prometheus for Visualization
 *
 * ```javascript
 * // Enable Prometheus export
 * await db.use(new MetricsPlugin({
 *   prometheus: { enabled: true, mode: 'standalone', port: 9090 }
 * }));
 *
 * // Configure Prometheus to scrape metrics
 * // In prometheus.yml:
 * // scrape_configs:
 * //   - job_name: 's3db'
 * //     static_configs:
 * //       - targets: ['localhost:9090']
 *
 * // Use Grafana for dashboards
 * // - Import Prometheus as data source
 * // - Create dashboards with PromQL queries
 * ```
 *
 * ### 3. Monitor Error Rates
 *
 * ```javascript
 * // Set up alerts for high error rates
 * setInterval(async () => {
 *   const stats = await metricsPlugin.getStats();
 *   const errorRate = stats.totalErrors / stats.totalOperations;
 *
 *   if (errorRate > 0.05) {  // 5% error rate
 *     console.error(`High error rate detected: ${(errorRate * 100).toFixed(2)}%`);
 *     sendAlert({
 *       message: 'S3DB error rate exceeded threshold',
 *       errorRate,
 *       totalErrors: stats.totalErrors,
 *       totalOperations: stats.totalOperations
 *     });
 *   }
 * }, 60000);  // Check every minute
 * ```
 *
 * ### 4. Track Performance Baselines
 *
 * ```javascript
 * // Establish performance baselines
 * const baseline = {
 *   insert: 50,  // ms
 *   update: 60,
 *   get: 30,
 *   list: 100
 * };
 *
 * // Alert on performance degradation
 * setInterval(async () => {
 *   const stats = await metricsPlugin.getStats();
 *
 *   for (const [op, opStats] of Object.entries(stats.operationsByType)) {
 *     if (opStats.avgTime > baseline[op] * 1.5) {  // 50% slower
 *       console.warn(`Performance degradation: ${op} is ${opStats.avgTime}ms (baseline: ${baseline[op]}ms)`);
 *     }
 *   }
 * }, 300000);  // Check every 5 minutes
 * ```
 *
 * ## Performance Considerations
 *
 * ### Overhead
 *
 * - **CPU**: 1-3% overhead (timing + metric recording)
 * - **Memory**: ~5-10KB per 1000 operations (in-memory buffer)
 * - **Storage**: ~300-500 bytes per operation metric
 * - **Latency**: <1ms per operation
 *
 * ### Optimization Tips
 *
 * ```javascript
 * // 1. Disable unnecessary collection
 * await db.use(new MetricsPlugin({
 *   collectPerformance: false,  // Disable if not needed
 *   collectErrors: true          // Keep error tracking
 * }));
 *
 * // 2. Increase flush interval
 * await db.use(new MetricsPlugin({
 *   flushInterval: 300000  // Flush every 5 minutes (less frequent writes)
 * }));
 *
 * // 3. Shorter retention period
 * await db.use(new MetricsPlugin({
 *   retentionDays: 14  // Less storage, faster cleanup
 * }));
 *
 * // 4. Manual flush control
 * await db.use(new MetricsPlugin({
 *   flushInterval: 0  // Disable auto-flush, flush manually
 * }));
 * await metricsPlugin.flushMetrics();  // Flush when needed
 * ```
 *
 * ## Troubleshooting
 *
 * ### Metrics Not Being Collected
 *
 * ```javascript
 * // Check if plugin is installed and started
 * console.log(db.plugins.MetricsPlugin);  // Should exist
 * await db.start();  // Must call start() to activate plugin
 *
 * // Check if metrics resources exist
 * console.log(db.resources.plg_metrics);  // Should exist
 * console.log(db.resources.plg_error_logs);
 * console.log(db.resources.plg_performance_logs);
 * ```
 *
 * ### Prometheus Endpoint Not Available
 *
 * ```javascript
 * // Check Prometheus configuration
 * const plugin = db.plugins.MetricsPlugin;
 * console.log(plugin.config.prometheus);
 *
 * // Ensure plugin is started
 * await db.start();
 *
 * // For integrated mode, ensure API Plugin is active
 * console.log(db.plugins.api);  // Should exist for integrated mode
 *
 * // For standalone mode, check if port is available
 * // Try accessing: http://localhost:9090/metrics
 * ```
 *
 * ### High Storage Usage
 *
 * ```javascript
 * // Check metrics count
 * const allMetrics = await metricsPlugin.getMetrics();
 * console.log(`Total metrics: ${allMetrics.length}`);
 *
 * // Solution 1: Reduce retention
 * await db.use(new MetricsPlugin({
 *   retentionDays: 14  // Down from 30
 * }));
 *
 * // Solution 2: Manual cleanup
 * await metricsPlugin.cleanupOldData();
 *
 * // Solution 3: Disable performance logging
 * await db.use(new MetricsPlugin({
 *   collectPerformance: false
 * }));
 * ```
 *
 * ### Metrics Causing Performance Issues
 *
 * ```javascript
 * // Solution 1: Increase flush interval
 * await db.use(new MetricsPlugin({
 *   flushInterval: 600000  // Flush every 10 minutes
 * }));
 *
 * // Solution 2: Disable in tests
 * const shouldEnableMetrics = process.env.NODE_ENV !== 'test';
 * if (shouldEnableMetrics) {
 *   await db.use(new MetricsPlugin());
 * }
 *
 * // Solution 3: Selective collection
 * await db.use(new MetricsPlugin({
 *   collectPerformance: false,  // Disable performance logging
 *   collectErrors: true          // Keep error tracking
 * }));
 * ```
 *
 * ## Real-World Use Cases
 *
 * ### 1. Production Monitoring Dashboard
 *
 * ```javascript
 * // Set up comprehensive monitoring
 * await db.use(new MetricsPlugin({
 *   retentionDays: 90,
 *   prometheus: {
 *     enabled: true,
 *     mode: 'standalone',
 *     port: 9090
 *   }
 * }));
 *
 * // Generate daily reports
 * setInterval(async () => {
 *   const stats = await metricsPlugin.getStats();
 *   const errors = await metricsPlugin.getErrorLogs({ limit: 10 });
 *
 *   const report = {
 *     date: new Date().toISOString(),
 *     totalOps: stats.totalOperations,
 *     avgResponseTime: stats.avgResponseTime,
 *     errorCount: stats.totalErrors,
 *     topErrors: errors.slice(0, 5),
 *     operationBreakdown: stats.operationsByType
 *   };
 *
 *   sendDailyReport(report);
 * }, 24 * 60 * 60 * 1000);
 * ```
 *
 * ### 2. Performance Regression Detection
 *
 * ```javascript
 * // Track performance over time
 * const performanceBaseline = {};
 *
 * setInterval(async () => {
 *   const stats = await metricsPlugin.getStats();
 *
 *   for (const [op, opStats] of Object.entries(stats.operationsByType)) {
 *     if (!performanceBaseline[op]) {
 *       performanceBaseline[op] = opStats.avgTime;
 *     }
 *
 *     const degradation = ((opStats.avgTime / performanceBaseline[op]) - 1) * 100;
 *
 *     if (degradation > 50) {  // 50% slower
 *       console.error(`Performance regression: ${op} is ${degradation.toFixed(1)}% slower`);
 *       createIncident({
 *         title: `S3DB Performance Regression: ${op}`,
 *         description: `${op} operation is ${degradation.toFixed(1)}% slower than baseline`,
 *         baseline: performanceBaseline[op],
 *         current: opStats.avgTime
 *       });
 *     }
 *   }
 * }, 300000);  // Check every 5 minutes
 * ```
 *
 * ### 3. SLA Monitoring
 *
 * ```javascript
 * // Monitor SLA compliance (99.9% uptime, <100ms avg response time)
 * setInterval(async () => {
 *   const stats = await metricsPlugin.getStats();
 *
 *   const errorRate = stats.totalErrors / stats.totalOperations;
 *   const slaCompliance = {
 *     uptime: (1 - errorRate) * 100,
 *     avgResponseTime: stats.avgResponseTime,
 *     meetsUptime: errorRate < 0.001,  // 99.9%
 *     meetsPerformance: stats.avgResponseTime < 100
 *   };
 *
 *   if (!slaCompliance.meetsUptime || !slaCompliance.meetsPerformance) {
 *     sendSLAAlert(slaCompliance);
 *   }
 *
 *   logSLACompliance(slaCompliance);
 * }, 60000);  // Check every minute
 * ```
 *
 * ### 4. Cost Optimization Analysis
 *
 * ```javascript
 * // Analyze operation patterns to optimize costs
 * setInterval(async () => {
 *   const stats = await metricsPlugin.getStats();
 *
 *   const report = {
 *     totalOps: stats.totalOperations,
 *     breakdown: {
 *       expensive: stats.operationsByType.insert?.count || 0 +
 *                  stats.operationsByType.update?.count || 0,
 *       cheap: stats.operationsByType.get?.count || 0
 *     }
 *   };
 *
 *   // Suggest optimizations
 *   if (report.breakdown.expensive > report.breakdown.cheap * 2) {
 *     console.warn('High write-to-read ratio detected. Consider caching to reduce costs.');
 *   }
 * }, 24 * 60 * 60 * 1000);  // Daily analysis
 * ```
 *
 * ## API Reference
 *
 * ### Constructor Options
 *
 * - `collectPerformance` (boolean, default: true) - Track performance metrics
 * - `collectErrors` (boolean, default: true) - Track errors
 * - `collectUsage` (boolean, default: true) - Track usage metrics
 * - `retentionDays` (number, default: 30) - Retention period for metrics
 * - `flushInterval` (number, default: 60000) - Flush interval in milliseconds
 * - `prometheus` (object) - Prometheus configuration
 *   - `enabled` (boolean, default: true) - Enable Prometheus export
 *   - `mode` (string, default: 'auto') - 'auto' | 'integrated' | 'standalone'
 *   - `port` (number, default: 9090) - Standalone server port
 *   - `path` (string, default: '/metrics') - Metrics endpoint path
 *   - `includeResourceLabels` (boolean, default: true) - Include resource names
 *
 * ### Methods
 *
 * - `getMetrics(options)` - Query metrics with filters
 * - `getErrorLogs(options)` - Get error logs
 * - `getPerformanceLogs(options)` - Get performance logs
 * - `getStats()` - Get aggregated statistics (last 24h)
 * - `getPrometheusMetrics()` - Get Prometheus-formatted metrics
 * - `cleanupOldData()` - Delete old metrics based on retention period
 * - `flushMetrics()` - Manually flush metrics to storage
 *
 * ### Query Options
 *
 * ```typescript
 * interface MetricsQueryOptions {
 *   type?: string;           // 'operation' | 'error' | 'performance'
 *   resourceName?: string;   // Filter by resource
 *   operation?: string;      // Filter by operation
 *   startDate?: string;      // Filter by start date (ISO format)
 *   endDate?: string;        // Filter by end date (ISO format)
 *   limit?: number;          // Max results (default: 100)
 *   offset?: number;         // Pagination offset (default: 0)
 * }
 * ```
 *
 * ## Notes
 *
 * - Plugin creates 3 resources: plg_metrics, plg_error_logs, plg_performance_logs
 * - All resources use date partitioning for efficient queries
 * - Metrics flush automatically on plugin stop
 * - Flush timer is disabled during tests (NODE_ENV=test)
 * - Prometheus mode 'auto' detects API Plugin and chooses best mode
 * - Standalone Prometheus server listens on 0.0.0.0 (all interfaces)
 */

import { Plugin } from "./plugin.class.js";
import tryFn from "../concerns/try-fn.js";
import { resolveResourceNames } from "./concerns/resource-names.js";
import { PluginError } from '../errors.js';
import { getCronManager } from "../concerns/cron-manager.js";

export class MetricsPlugin extends Plugin {
  constructor(options = {}) {
    super();
    const resourceNamesOption = options.resourceNames || {};
    const legacyResourceOption = options.resources || {};
    const resourceOverrides = {
      metrics: resourceNamesOption.metrics ?? legacyResourceOption.metrics,
      errors: resourceNamesOption.errors ?? legacyResourceOption.errors,
      performance: resourceNamesOption.performance ?? legacyResourceOption.performance
    };
    this._resourceDescriptors = {
      metrics: {
        defaultName: 'plg_metrics',
        override: resourceOverrides.metrics
      },
      errors: {
        defaultName: 'plg_metrics_errors',
        override: resourceOverrides.errors
      },
      performance: {
        defaultName: 'plg_metrics_performance',
        override: resourceOverrides.performance
      }
    };
    this.resourceNames = this._resolveResourceNames();
    this.config = {
      collectPerformance: options.collectPerformance !== false,
      collectErrors: options.collectErrors !== false,
      collectUsage: options.collectUsage !== false,
      retentionDays: options.retentionDays || 30,
      flushInterval: options.flushInterval || 60000, // 1 minute

      // Prometheus configuration
      prometheus: {
        enabled: options.prometheus?.enabled !== false, // Enabled by default
        mode: options.prometheus?.mode || 'auto',       // 'auto' | 'integrated' | 'standalone'
        port: options.prometheus?.port || 9090,         // Standalone server port
        path: options.prometheus?.path || '/metrics',   // Metrics endpoint path
        includeResourceLabels: options.prometheus?.includeResourceLabels !== false
      },

      ...options
    };

    this.metrics = {
      operations: {
        insert: { count: 0, totalTime: 0, errors: 0 },
        update: { count: 0, totalTime: 0, errors: 0 },
        delete: { count: 0, totalTime: 0, errors: 0 },
        get: { count: 0, totalTime: 0, errors: 0 },
        list: { count: 0, totalTime: 0, errors: 0 },
        count: { count: 0, totalTime: 0, errors: 0 }
      },
      resources: {},
      errors: [],
      performance: [],
      startTime: new Date().toISOString()
    };

    this.flushJobName = null;
    this.flushTimer = null;
    this.metricsServer = null; // Standalone HTTP server (if needed)
  }

  _resolveResourceNames() {
    return resolveResourceNames('metrics', this._resourceDescriptors, {
      namespace: this.namespace
    });
  }

  onNamespaceChanged() {
    this.resourceNames = this._resolveResourceNames();
  }

  async onInstall() {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') return;

    const [ok, err] = await tryFn(async () => {
      const [ok1, err1, metricsResource] = await tryFn(() => this.database.createResource({
        name: this.resourceNames.metrics,
        attributes: {
          id: 'string|required',
          type: 'string|required', // 'operation', 'error', 'performance'
          resourceName: 'string',
          operation: 'string',
          count: 'number|required',
          totalTime: 'number|required',
          errors: 'number|required',
          avgTime: 'number|required',
          timestamp: 'string|required',
          metadata: 'json',
          createdAt: 'string|required' // YYYY-MM-DD for partitioning
        },
        partitions: {
          byDate: { fields: { createdAt: 'string|maxlength:10' } }
        },
        behavior: 'body-overflow'
      }));
      this.metricsResource = ok1
        ? metricsResource
        : this.database.resources[this.resourceNames.metrics];

      const [ok2, err2, errorsResource] = await tryFn(() => this.database.createResource({
        name: this.resourceNames.errors,
        attributes: {
          id: 'string|required',
          resourceName: 'string|required',
          operation: 'string|required',
          error: 'string|required',
          timestamp: 'string|required',
          metadata: 'json',
          createdAt: 'string|required' // YYYY-MM-DD for partitioning
        },
        partitions: {
          byDate: { fields: { createdAt: 'string|maxlength:10' } }
        },
        behavior: 'body-overflow'
      }));
      this.errorsResource = ok2
        ? errorsResource
        : this.database.resources[this.resourceNames.errors];

      const [ok3, err3, performanceResource] = await tryFn(() => this.database.createResource({
        name: this.resourceNames.performance,
        attributes: {
          id: 'string|required',
          resourceName: 'string|required',
          operation: 'string|required',
          duration: 'number|required',
          timestamp: 'string|required',
          metadata: 'json',
          createdAt: 'string|required' // YYYY-MM-DD for partitioning
        },
        partitions: {
          byDate: { fields: { createdAt: 'string|maxlength:10' } }
        },
        behavior: 'body-overflow'
      }));
      this.performanceResource = ok3
        ? performanceResource
        : this.database.resources[this.resourceNames.performance];
    });
    if (!ok) {
      // Resources might already exist
      this.metricsResource = this.database.resources[this.resourceNames.metrics];
      this.errorsResource = this.database.resources[this.resourceNames.errors];
      this.performanceResource = this.database.resources[this.resourceNames.performance];
    }

    // Use database hooks for automatic resource discovery
    this.installDatabaseHooks();
    
    // Install hooks for existing resources
    this.installMetricsHooks();
    
    // Disable flush timer during tests to avoid side effects
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
      this.startFlushTimer();
    }
  }

  async start() {
    // Setup Prometheus metrics exporter
    await this._setupPrometheusExporter();
  }

  async stop() {
    // Stop flush job
    if (this.flushJobName) {
      const cronManager = getCronManager();
      cronManager.stop(this.flushJobName);
      this.flushJobName = null;
    }

    // Clear any legacy timer references
    if (this.flushTimer) {
      const clearFn = (
        globalThis?.originalClearInterval ||
        globalThis?.clearInterval ||
        clearInterval
      ).bind(globalThis);

      if (typeof this.flushTimer?.stop === 'function') {
        try {
          this.flushTimer.stop();
        } catch (err) {
          if (this.config.verbose) {
            console.warn('[MetricsPlugin] Error stopping flush timer:', err?.message || err);
          }
        }
      }

      if (typeof this.flushTimer?.destroy === 'function') {
        try {
          this.flushTimer.destroy();
        } catch (err) {
          if (this.config.verbose) {
            console.warn('[MetricsPlugin] Error destroying flush timer:', err?.message || err);
          }
        }
      }

      if (typeof this.flushTimer === 'object' && !this.flushTimer?.stop && !this.flushTimer?.destroy) {
        try {
          clearFn(this.flushTimer);
        } catch (_) {
          // Ignore legacy timers that can't be cleared
        }
      }

      this.flushTimer = null;
    }

    // Stop standalone metrics server if running
    if (this.metricsServer) {
      await new Promise((resolve) => {
        this.metricsServer.close(() => {
          console.log('[Metrics Plugin] Standalone metrics server stopped');
          this.metricsServer = null;
          resolve();
        });
      });
    }

    // Remove database hooks
    this.removeDatabaseHooks();
  }

  installDatabaseHooks() {
    // Use the new database hooks system for automatic resource discovery
    this.database.addHook('afterCreateResource', (resource) => {
      if (!this.isInternalResource(resource.name)) {
        this.installResourceHooks(resource);
      }
    });
  }

  removeDatabaseHooks() {
    // Remove the hook we added
    this.database.removeHook('afterCreateResource', this.installResourceHooks.bind(this));
  }

  isInternalResource(resourceName) {
    return Object.values(this.resourceNames).includes(resourceName);
  }

  installMetricsHooks() {
    // Only hook into non-metrics resources
    for (const resource of Object.values(this.database.resources)) {
      if (this.isInternalResource(resource.name)) {
        continue; // Skip metrics resources to avoid recursion
      }

      this.installResourceHooks(resource);
    }

    // Hook into database proxy for new resources
    this.database._createResource = this.database.createResource;
    this.database.createResource = async function (...args) {
      const resource = await this._createResource(...args);
      if (this.plugins?.metrics && !this.plugins.metrics.isInternalResource(resource.name)) {
        this.plugins.metrics.installResourceHooks(resource);
      }
      return resource;
    };
  }

  installResourceHooks(resource) {
    // Store original methods
    resource._insert = resource.insert;
    resource._update = resource.update;
    resource._delete = resource.delete;
    resource._deleteMany = resource.deleteMany;
    resource._get = resource.get;
    resource._getMany = resource.getMany;
    resource._getAll = resource.getAll;
    resource._list = resource.list;
    resource._listIds = resource.listIds;
    resource._count = resource.count;
    resource._page = resource.page;

    // Hook insert operations
    resource.insert = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._insert(...args));
      this.recordOperation(resource.name, 'insert', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'insert', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook update operations
    resource.update = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._update(...args));
      this.recordOperation(resource.name, 'update', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'update', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook delete operations
    resource.delete = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._delete(...args));
      this.recordOperation(resource.name, 'delete', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'delete', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook deleteMany operations
    resource.deleteMany = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._deleteMany(...args));
      this.recordOperation(resource.name, 'delete', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'delete', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook get operations
    resource.get = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._get(...args));
      this.recordOperation(resource.name, 'get', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'get', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook getMany operations
    resource.getMany = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._getMany(...args));
      this.recordOperation(resource.name, 'get', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'get', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook getAll operations
    resource.getAll = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._getAll(...args));
      this.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'list', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook list operations
    resource.list = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._list(...args));
      this.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'list', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook listIds operations
    resource.listIds = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._listIds(...args));
      this.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'list', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook count operations
    resource.count = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._count(...args));
      this.recordOperation(resource.name, 'count', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'count', err);
      if (!ok) throw err;
      return result;
    }.bind(this);

    // Hook page operations
    resource.page = async function (...args) {
      const startTime = Date.now();
      const [ok, err, result] = await tryFn(() => resource._page(...args));
      this.recordOperation(resource.name, 'list', Date.now() - startTime, !ok);
      if (!ok) this.recordError(resource.name, 'list', err);
      if (!ok) throw err;
      return result;
    }.bind(this);
  }

  recordOperation(resourceName, operation, duration, isError) {
    // Update global metrics
    if (this.metrics.operations[operation]) {
      this.metrics.operations[operation].count++;
      this.metrics.operations[operation].totalTime += duration;
      if (isError) {
        this.metrics.operations[operation].errors++;
      }
    }

    // Update resource-specific metrics
    if (!this.metrics.resources[resourceName]) {
      this.metrics.resources[resourceName] = {
        insert: { count: 0, totalTime: 0, errors: 0 },
        update: { count: 0, totalTime: 0, errors: 0 },
        delete: { count: 0, totalTime: 0, errors: 0 },
        get: { count: 0, totalTime: 0, errors: 0 },
        list: { count: 0, totalTime: 0, errors: 0 },
        count: { count: 0, totalTime: 0, errors: 0 }
      };
    }

    if (this.metrics.resources[resourceName][operation]) {
      this.metrics.resources[resourceName][operation].count++;
      this.metrics.resources[resourceName][operation].totalTime += duration;
      if (isError) {
        this.metrics.resources[resourceName][operation].errors++;
      }
    }

    // Record performance data if enabled
    if (this.config.collectPerformance) {
      this.metrics.performance.push({
        resourceName,
        operation,
        duration,
        timestamp: new Date().toISOString()
      });
    }
  }

  recordError(resourceName, operation, error) {
    if (!this.config.collectErrors) return;

    this.metrics.errors.push({
      resourceName,
      operation,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }

  startFlushTimer() {
    if (this.flushJobName) {
      const cronManager = getCronManager();
      cronManager.stop(this.flushJobName);
      this.flushJobName = null;
    }
    this.flushTimer = null;

    // Only start timer if flushInterval is greater than 0
    if (this.config.flushInterval > 0) {
      const cronManager = getCronManager();
      const jobName = `metrics-flush-${Date.now()}`;
      this.flushJobName = jobName;

      // Placeholder to keep compatibility with legacy code/tests
      this.flushTimer = {
        stop: () => cronManager.stop(jobName),
        destroy: () => cronManager.stop(jobName),
      };

      cronManager.scheduleInterval(
        this.config.flushInterval,
        () => this.flushMetrics().catch(() => {}),
        jobName
      ).then(task => {
        if (task && typeof task === 'object') {
          this.flushTimer = task;
        }
      }).catch(error => {
        if (this.config.verbose) {
          console.warn('[MetricsPlugin] Failed to schedule flush timer:', error?.message || error);
        }
        this.flushJobName = null;
        this.flushTimer = null;
      });
    }
  }

  async flushMetrics() {
    if (!this.metricsResource) return;

    const [ok, err] = await tryFn(async () => {
      let metadata, perfMetadata, errorMetadata, resourceMetadata;
      
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
        // Use empty metadata during tests to avoid header issues
        metadata = {};
        perfMetadata = {};
        errorMetadata = {};
        resourceMetadata = {};
      } else {
        // Use empty metadata during tests to avoid header issues
        metadata = { global: 'true' };
        perfMetadata = { perf: 'true' };
        errorMetadata = { error: 'true' };
        resourceMetadata = { resource: 'true' };
      }

      // Flush operation metrics
      const now = new Date();
      const createdAt = now.toISOString().slice(0, 10); // YYYY-MM-DD

      for (const [operation, data] of Object.entries(this.metrics.operations)) {
        if (data.count > 0) {
          await this.metricsResource.insert({
            id: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'operation',
            resourceName: 'global',
            operation,
            count: data.count,
            totalTime: data.totalTime,
            errors: data.errors,
            avgTime: data.count > 0 ? data.totalTime / data.count : 0,
            timestamp: now.toISOString(),
            createdAt,
            metadata
          });
        }
      }

      // Flush resource-specific metrics
      for (const [resourceName, operations] of Object.entries(this.metrics.resources)) {
        for (const [operation, data] of Object.entries(operations)) {
          if (data.count > 0) {
            await this.metricsResource.insert({
              id: `metrics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: 'operation',
              resourceName,
              operation,
              count: data.count,
              totalTime: data.totalTime,
              errors: data.errors,
              avgTime: data.count > 0 ? data.totalTime / data.count : 0,
              timestamp: now.toISOString(),
              createdAt,
              metadata: resourceMetadata
            });
          }
        }
      }

      // Flush performance logs
      if (this.config.collectPerformance && this.metrics.performance.length > 0) {
        for (const perf of this.metrics.performance) {
          await this.performanceResource.insert({
            id: `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName: perf.resourceName,
            operation: perf.operation,
            duration: perf.duration,
            timestamp: perf.timestamp,
            createdAt: perf.timestamp.slice(0, 10), // YYYY-MM-DD from timestamp
            metadata: perfMetadata
          });
        }
      }

      // Flush error logs
      if (this.config.collectErrors && this.metrics.errors.length > 0) {
        for (const error of this.metrics.errors) {
          await this.errorsResource.insert({
            id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            resourceName: error.resourceName,
            operation: error.operation,
            error: error.error,
            stack: error.stack,
            timestamp: error.timestamp,
            createdAt: error.timestamp.slice(0, 10), // YYYY-MM-DD from timestamp
            metadata: errorMetadata
          });
        }
      }

      // Reset metrics after flushing
      this.resetMetrics();
    });
    if (!ok) {
      // Silent error handling
    }
  }

  resetMetrics() {
    // Reset operation metrics
    for (const operation of Object.keys(this.metrics.operations)) {
      this.metrics.operations[operation] = { count: 0, totalTime: 0, errors: 0 };
    }

    // Reset resource metrics
    for (const resourceName of Object.keys(this.metrics.resources)) {
      for (const operation of Object.keys(this.metrics.resources[resourceName])) {
        this.metrics.resources[resourceName][operation] = { count: 0, totalTime: 0, errors: 0 };
      }
    }

    // Clear performance and error arrays
    this.metrics.performance = [];
    this.metrics.errors = [];
  }

  // Utility methods
  async getMetrics(options = {}) {
    const {
      type = 'operation',
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    if (!this.metricsResource) return [];

    const allMetrics = await this.metricsResource.getAll();
    
    let filtered = allMetrics.filter(metric => {
      if (type && metric.type !== type) return false;
      if (resourceName && metric.resourceName !== resourceName) return false;
      if (operation && metric.operation !== operation) return false;
      if (startDate && new Date(metric.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(metric.timestamp) > new Date(endDate)) return false;
      return true;
    });

    // Sort by timestamp descending
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return filtered.slice(offset, offset + limit);
  }

  async getErrorLogs(options = {}) {
    if (!this.errorsResource) return [];

    const {
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    const allErrors = await this.errorsResource.getAll();
    
    let filtered = allErrors.filter(error => {
      if (resourceName && error.resourceName !== resourceName) return false;
      if (operation && error.operation !== operation) return false;
      if (startDate && new Date(error.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(error.timestamp) > new Date(endDate)) return false;
      return true;
    });

    // Sort by timestamp descending
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return filtered.slice(offset, offset + limit);
  }

  async getPerformanceLogs(options = {}) {
    if (!this.performanceResource) return [];

    const {
      resourceName,
      operation,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    const allPerformance = await this.performanceResource.getAll();
    
    let filtered = allPerformance.filter(perf => {
      if (resourceName && perf.resourceName !== resourceName) return false;
      if (operation && perf.operation !== operation) return false;
      if (startDate && new Date(perf.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(perf.timestamp) > new Date(endDate)) return false;
      return true;
    });

    // Sort by timestamp descending
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return filtered.slice(offset, offset + limit);
  }

  async getStats() {
    const now = new Date();
    const startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // Last 24 hours

    const [metrics, errors, performance] = await Promise.all([
      this.getMetrics({ startDate: startDate.toISOString() }),
      this.getErrorLogs({ startDate: startDate.toISOString() }),
      this.getPerformanceLogs({ startDate: startDate.toISOString() })
    ]);

    // Calculate summary statistics
    const stats = {
      period: '24h',
      totalOperations: 0,
      totalErrors: errors.length,
      avgResponseTime: 0,
      operationsByType: {},
      resources: {},
      uptime: {
        startTime: this.metrics.startTime,
        duration: now.getTime() - new Date(this.metrics.startTime).getTime()
      }
    };

    // Aggregate metrics
    for (const metric of metrics) {
      if (metric.type === 'operation') {
        stats.totalOperations += metric.count;
        
        if (!stats.operationsByType[metric.operation]) {
          stats.operationsByType[metric.operation] = {
            count: 0,
            errors: 0,
            avgTime: 0
          };
        }
        
        stats.operationsByType[metric.operation].count += metric.count;
        stats.operationsByType[metric.operation].errors += metric.errors;
        
        // Calculate weighted average
        const current = stats.operationsByType[metric.operation];
        const totalCount = current.count;
        const newAvg = ((current.avgTime * (totalCount - metric.count)) + metric.totalTime) / totalCount;
        current.avgTime = newAvg;
      }
    }

    // Calculate overall average response time
    const totalTime = metrics.reduce((sum, m) => sum + m.totalTime, 0);
    const totalCount = metrics.reduce((sum, m) => sum + m.count, 0);
    stats.avgResponseTime = totalCount > 0 ? totalTime / totalCount : 0;

    return stats;
  }

  async cleanupOldData() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    const cutoffDateStr = cutoffDate.toISOString().slice(0, 10); // YYYY-MM-DD

    // Generate list of dates to delete (all dates before cutoff)
    const datesToDelete = [];
    const startDate = new Date(cutoffDate);
    startDate.setDate(startDate.getDate() - 365); // Go back up to 1 year to catch old data

    for (let d = new Date(startDate); d < cutoffDate; d.setDate(d.getDate() + 1)) {
      datesToDelete.push(d.toISOString().slice(0, 10));
    }

    // Clean up old metrics using partition-aware deletion
    if (this.metricsResource) {
      for (const dateStr of datesToDelete) {
        const [ok, err, oldMetrics] = await tryFn(() =>
          this.metricsResource.query({ createdAt: dateStr })
        );
        if (ok && oldMetrics) {
          for (const metric of oldMetrics) {
            await tryFn(() => this.metricsResource.delete(metric.id));
          }
        }
      }
    }

    // Clean up old error logs using partition-aware deletion
    if (this.errorsResource) {
      for (const dateStr of datesToDelete) {
        const [ok, err, oldErrors] = await tryFn(() =>
          this.errorsResource.query({ createdAt: dateStr })
        );
        if (ok && oldErrors) {
          for (const error of oldErrors) {
            await tryFn(() => this.errorsResource.delete(error.id));
          }
        }
      }
    }

    // Clean up old performance logs using partition-aware deletion
    if (this.performanceResource) {
      for (const dateStr of datesToDelete) {
        const [ok, err, oldPerformance] = await tryFn(() =>
          this.performanceResource.query({ createdAt: dateStr })
        );
        if (ok && oldPerformance) {
          for (const perf of oldPerformance) {
            await tryFn(() => this.performanceResource.delete(perf.id));
          }
        }
      }
    }
  }

  /**
   * Get metrics in Prometheus format
   * @returns {Promise<string>} Prometheus metrics text
   */
  async getPrometheusMetrics() {
    const { formatPrometheusMetrics } = await import('./concerns/prometheus-formatter.js');
    return formatPrometheusMetrics(this);
  }

  /**
   * Setup Prometheus metrics exporter
   * Chooses mode based on configuration and API Plugin availability
   * @private
   */
  async _setupPrometheusExporter() {
    if (!this.config.prometheus.enabled) {
      return; // Prometheus export disabled
    }

    const mode = this.config.prometheus.mode;
    const apiPlugin = this.database.plugins?.api || this.database.plugins?.ApiPlugin;

    // AUTO mode: detect API Plugin
    if (mode === 'auto') {
      if (apiPlugin && apiPlugin.server) {
        await this._setupIntegratedMetrics(apiPlugin);
      } else {
        await this._setupStandaloneMetrics();
      }
    }

    // INTEGRATED mode: requires API Plugin
    else if (mode === 'integrated') {
      if (!apiPlugin || !apiPlugin.server) {
        throw new PluginError('[Metrics Plugin] prometheus.mode=integrated requires API Plugin to be active', {
          pluginName: 'MetricsPlugin',
          operation: '_setupPrometheusExporter',
          statusCode: 400,
          retriable: false,
          suggestion: 'Install and start the API plugin or switch prometheus.mode to "standalone" or "auto".'
        });
      }
      await this._setupIntegratedMetrics(apiPlugin);
    }

    // STANDALONE mode: always separate server
    else if (mode === 'standalone') {
      await this._setupStandaloneMetrics();
    }

    else {
      console.warn(
        `[Metrics Plugin] Unknown prometheus.mode="${mode}". Valid modes: auto, integrated, standalone`
      );
    }
  }

  /**
   * Setup integrated metrics (uses API Plugin's server)
   * @param {ApiPlugin} apiPlugin - API Plugin instance
   * @private
   */
  async _setupIntegratedMetrics(apiPlugin) {
    const app = apiPlugin.getApp();
    const path = this.config.prometheus.path;

    if (!app) {
      console.error('[Metrics Plugin] Failed to get Hono app from API Plugin');
      return;
    }

    // Add /metrics route to Hono app
    app.get(path, async (c) => {
      try {
        const metrics = await this.getPrometheusMetrics();
        return c.text(metrics, 200, {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
        });
      } catch (err) {
        console.error('[Metrics Plugin] Error generating Prometheus metrics:', err);
        return c.text('Internal Server Error', 500);
      }
    });

    const port = apiPlugin.config?.port || 3000;
    console.log(
      `[Metrics Plugin] Prometheus metrics available at http://localhost:${port}${path} (integrated mode)`
    );
  }

  /**
   * Setup standalone metrics server (separate HTTP server)
   * @private
   */
  async _setupStandaloneMetrics() {
    const { createServer } = await import('http');
    const port = this.config.prometheus.port;
    const path = this.config.prometheus.path;

    this.metricsServer = createServer(async (req, res) => {
      // CORS headers to allow scraping from anywhere
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.url === path && req.method === 'GET') {
        try {
          const metrics = await this.getPrometheusMetrics();
          res.writeHead(200, {
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
            'Content-Length': Buffer.byteLength(metrics, 'utf8')
          });
          res.end(metrics);
        } catch (err) {
          console.error('[Metrics Plugin] Error generating Prometheus metrics:', err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      } else if (req.method === 'OPTIONS') {
        // Handle preflight requests
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    this.metricsServer.listen(port, '0.0.0.0', () => {
      console.log(
        `[Metrics Plugin] Prometheus metrics available at http://0.0.0.0:${port}${path} (standalone mode)`
      );
    });

    // Handle server errors
    this.metricsServer.on('error', (err) => {
      console.error('[Metrics Plugin] Standalone metrics server error:', err);
    });
  }
} 
