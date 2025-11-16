/**
 * Metrics Collector
 *
 * Collects and aggregates API metrics for monitoring and observability.
 *
 * Metrics Collected:
 * - Request counts by method, path, status
 * - Request duration percentiles (p50, p95, p99)
 * - Auth success/failure counts
 * - Resource operation counts (created, updated, deleted)
 * - User activity (logins, new users)
 * - Error rates
 *
 * @example
 * const metrics = new MetricsCollector({ enabled: true });
 *
 * // Record request
 * metrics.recordRequest({
 *   method: 'GET',
 *   path: '/users',
 *   status: 200,
 *   duration: 45
 * });
 *
 * // Get summary
 * const summary = metrics.getSummary();
 */

import { getCronManager } from '../../../concerns/cron-manager.js';
import { createLogger } from '../../../concerns/logger.js';


// Module-level logger
const logger = createLogger({ name: 'MetricsCollector', level: 'info' });
export class MetricsCollector {
  constructor(options = {}) {
    this.options = {
      enabled: options.enabled !== false, // Enabled by default
      verbose: options.verbose || false,
      maxPathsTracked: options.maxPathsTracked || 100, // Limit memory usage
      resetInterval: options.resetInterval || 300000, // Reset every 5 minutes
      format: options.format || 'json'
    };

    this.metrics = this._createEmptyMetrics();
    this.startTime = Date.now();
    this.cronManager = getCronManager();
    this.resetJobName = null;

    // Auto-reset metrics periodically to prevent memory growth
    if (this.options.resetInterval > 0) {
      this.resetJobName = `metrics-collector-reset-${Date.now()}`;
      this.cronManager.scheduleInterval(
        this.options.resetInterval,
        () => {
          if (this.options.verbose) {
            logger.info('[Metrics] Auto-resetting metrics');
          }
          this.reset();
        },
        this.resetJobName
      );
    }
  }

  /**
   * Create empty metrics structure
   * @private
   */
  _createEmptyMetrics() {
    return {
      requests: {
        total: 0,
        byMethod: {},
        byStatus: {},
        byPath: {},
        durations: [],
        totalDuration: 0
      },
      auth: {
        success: 0,
        failure: 0,
        byMethod: {}
      },
      resources: {
        created: 0,
        updated: 0,
        deleted: 0,
        byResource: {}
      },
      users: {
        logins: 0,
        newUsers: 0
      },
      errors: {
        total: 0,
        byType: {}
      }
    };
  }

  /**
   * Record request metrics
   * @param {Object} data - Request data
   */
  recordRequest({ method, path, status, duration }) {
    if (!this.options.enabled) return;

    const metrics = this.metrics.requests;

    metrics.total++;
    metrics.totalDuration += duration;

    // By method
    metrics.byMethod[method] = (metrics.byMethod[method] || 0) + 1;

    // By status
    const statusGroup = `${Math.floor(status / 100)}xx`;
    metrics.byStatus[statusGroup] = (metrics.byStatus[statusGroup] || 0) + 1;

    // By path (limit tracking to prevent memory growth)
    if (Object.keys(metrics.byPath).length < this.options.maxPathsTracked || metrics.byPath[path]) {
      if (!metrics.byPath[path]) {
        metrics.byPath[path] = { count: 0, totalDuration: 0, errors: 0 };
      }
      metrics.byPath[path].count++;
      metrics.byPath[path].totalDuration += duration;
      if (status >= 400) {
        metrics.byPath[path].errors++;
      }
    }

    // Store duration for percentile calculation
    metrics.durations.push(duration);

    // Keep only last 1000 durations to prevent memory growth
    if (metrics.durations.length > 1000) {
      metrics.durations.shift();
    }

    if (this.options.verbose) {
      logger.info(`[Metrics] Request: ${method} ${path} ${status} (${duration}ms)`);
    }
  }

  /**
   * Record auth metrics
   * @param {Object} data - Auth data
   */
  recordAuth({ success, method }) {
    if (!this.options.enabled) return;

    const metrics = this.metrics.auth;

    if (success) {
      metrics.success++;
    } else {
      metrics.failure++;
    }

    // By method
    if (!metrics.byMethod[method]) {
      metrics.byMethod[method] = { success: 0, failure: 0 };
    }

    if (success) {
      metrics.byMethod[method].success++;
    } else {
      metrics.byMethod[method].failure++;
    }

    if (this.options.verbose) {
      logger.info(`[Metrics] Auth: ${method} ${success ? 'success' : 'failure'}`);
    }
  }

  /**
   * Record resource operation metrics
   * @param {Object} data - Resource operation data
   */
  recordResourceOperation({ action, resource }) {
    if (!this.options.enabled) return;

    const metrics = this.metrics.resources;

    // Total by action
    if (action === 'created') metrics.created++;
    else if (action === 'updated') metrics.updated++;
    else if (action === 'deleted') metrics.deleted++;

    // By resource
    if (!metrics.byResource[resource]) {
      metrics.byResource[resource] = { created: 0, updated: 0, deleted: 0 };
    }
    metrics.byResource[resource][action]++;

    if (this.options.verbose) {
      logger.info(`[Metrics] Resource: ${resource} ${action}`);
    }
  }

  /**
   * Record user event metrics
   * @param {Object} data - User event data
   */
  recordUserEvent({ action }) {
    if (!this.options.enabled) return;

    const metrics = this.metrics.users;

    if (action === 'login') {
      metrics.logins++;
    } else if (action === 'created') {
      metrics.newUsers++;
    }

    if (this.options.verbose) {
      logger.info(`[Metrics] User: ${action}`);
    }
  }

  /**
   * Record error metrics
   * @param {Object} data - Error data
   */
  recordError({ error, type = 'unknown' }) {
    if (!this.options.enabled) return;

    const metrics = this.metrics.errors;

    metrics.total++;
    metrics.byType[type] = (metrics.byType[type] || 0) + 1;

    if (this.options.verbose) {
      logger.info(`[Metrics] Error: ${type} - ${error}`);
    }
  }

  /**
   * Calculate percentile from sorted array
   * @private
   */
  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get metrics summary
   * @returns {Object} Metrics summary
   */
  getSummary() {
    const uptime = Date.now() - this.startTime;

    return {
      uptime: {
        milliseconds: uptime,
        seconds: Math.floor(uptime / 1000),
        formatted: this._formatDuration(uptime)
      },
      requests: {
        total: this.metrics.requests.total,
        rps: (this.metrics.requests.total / (uptime / 1000)).toFixed(2),
        byMethod: this.metrics.requests.byMethod,
        byStatus: this.metrics.requests.byStatus,
        topPaths: this._getTopPaths(),
        duration: {
          p50: this._percentile(this.metrics.requests.durations, 50),
          p95: this._percentile(this.metrics.requests.durations, 95),
          p99: this._percentile(this.metrics.requests.durations, 99),
          avg: this.metrics.requests.durations.length > 0
            ? (this.metrics.requests.durations.reduce((a, b) => a + b, 0) / this.metrics.requests.durations.length).toFixed(2)
            : 0
        }
      },
      auth: {
        total: this.metrics.auth.success + this.metrics.auth.failure,
        success: this.metrics.auth.success,
        failure: this.metrics.auth.failure,
        successRate: this._calculateRate(this.metrics.auth.success, this.metrics.auth.success + this.metrics.auth.failure),
        byMethod: this.metrics.auth.byMethod
      },
      resources: {
        total: this.metrics.resources.created + this.metrics.resources.updated + this.metrics.resources.deleted,
        created: this.metrics.resources.created,
        updated: this.metrics.resources.updated,
        deleted: this.metrics.resources.deleted,
        byResource: this.metrics.resources.byResource
      },
      users: this.metrics.users,
      errors: {
        total: this.metrics.errors.total,
        rate: this._calculateRate(this.metrics.errors.total, this.metrics.requests.total),
        byType: this.metrics.errors.byType
      }
    };
  }

  /**
   * Get metrics in Prometheus/OpenMetrics format
   * @returns {string}
   */
  getPrometheusMetrics() {
    const escapeLabel = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const lines = [];
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const requests = this.metrics.requests;
    const auth = this.metrics.auth;
    const resources = this.metrics.resources;
    const users = this.metrics.users;
    const errors = this.metrics.errors;

    lines.push('# HELP s3db_uptime_seconds API uptime in seconds');
    lines.push('# TYPE s3db_uptime_seconds gauge');
    lines.push(`s3db_uptime_seconds ${uptimeSeconds}`);

    lines.push('# HELP s3db_requests_total Total HTTP requests processed');
    lines.push('# TYPE s3db_requests_total counter');
    lines.push(`s3db_requests_total ${requests.total}`);
    Object.entries(requests.byMethod).forEach(([method, count]) => {
      lines.push(`s3db_requests_method_total{method="${escapeLabel(method)}"} ${count}`);
    });
    Object.entries(requests.byStatus).forEach(([status, count]) => {
      lines.push(`s3db_requests_status_total{status="${escapeLabel(status)}"} ${count}`);
    });

    lines.push('# HELP s3db_request_duration_ms Request duration percentiles in milliseconds');
    lines.push('# TYPE s3db_request_duration_ms summary');
    [
      { quantile: '0.5', value: this._percentile(requests.durations, 50) },
      { quantile: '0.95', value: this._percentile(requests.durations, 95) },
      { quantile: '0.99', value: this._percentile(requests.durations, 99) }
    ].forEach(({ quantile, value }) => {
      lines.push(`s3db_request_duration_ms{quantile="${quantile}"} ${Number(value || 0).toFixed(3)}`);
    });
    lines.push(`s3db_request_duration_ms_sum ${Number(requests.totalDuration || 0).toFixed(3)}`);
    lines.push(`s3db_request_duration_ms_count ${requests.total}`);

    lines.push('# HELP s3db_auth_events_total Authentication events');
    lines.push('# TYPE s3db_auth_events_total counter');
    lines.push(`s3db_auth_events_total{result="success"} ${auth.success}`);
    lines.push(`s3db_auth_events_total{result="failure"} ${auth.failure}`);
    Object.entries(auth.byMethod).forEach(([method, stats]) => {
      lines.push(`s3db_auth_events_total{method="${escapeLabel(method)}",result="success"} ${stats.success}`);
      lines.push(`s3db_auth_events_total{method="${escapeLabel(method)}",result="failure"} ${stats.failure}`);
    });

    lines.push('# HELP s3db_resource_operations_total Resource operations by action');
    lines.push('# TYPE s3db_resource_operations_total counter');
    lines.push(`s3db_resource_operations_total{action="created"} ${resources.created}`);
    lines.push(`s3db_resource_operations_total{action="updated"} ${resources.updated}`);
    lines.push(`s3db_resource_operations_total{action="deleted"} ${resources.deleted}`);
    Object.entries(resources.byResource).forEach(([resourceName, stats]) => {
      lines.push(`s3db_resource_operations_resource_total{resource="${escapeLabel(resourceName)}",action="created"} ${stats.created}`);
      lines.push(`s3db_resource_operations_resource_total{resource="${escapeLabel(resourceName)}",action="updated"} ${stats.updated}`);
      lines.push(`s3db_resource_operations_resource_total{resource="${escapeLabel(resourceName)}",action="deleted"} ${stats.deleted}`);
    });

    lines.push('# HELP s3db_user_events_total User events');
    lines.push('# TYPE s3db_user_events_total counter');
    Object.entries(users).forEach(([event, value]) => {
      lines.push(`s3db_user_events_total{event="${escapeLabel(event)}"} ${value}`);
    });

    lines.push('# HELP s3db_errors_total Total errors recorded');
    lines.push('# TYPE s3db_errors_total counter');
    lines.push(`s3db_errors_total ${errors.total}`);
    Object.entries(errors.byType).forEach(([type, count]) => {
      lines.push(`s3db_errors_by_type_total{type="${escapeLabel(type)}"} ${count}`);
    });

    return lines.join('\n') + '\n';
  }

  /**
   * Get top paths by request count
   * @private
   */
  _getTopPaths(limit = 10) {
    return Object.entries(this.metrics.requests.byPath)
      .map(([path, data]) => ({
        path,
        count: data.count,
        avgDuration: (data.totalDuration / data.count).toFixed(2),
        errors: data.errors,
        errorRate: this._calculateRate(data.errors, data.count)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Calculate rate as percentage
   * @private
   */
  _calculateRate(numerator, denominator) {
    if (denominator === 0) return '0.00%';
    return ((numerator / denominator) * 100).toFixed(2) + '%';
  }

  /**
   * Format duration in human-readable form
   * @private
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = this._createEmptyMetrics();
    this.startTime = Date.now();
  }

  /**
   * Stop metrics collection and cleanup
   */
  stop() {
    if (this.resetJobName) {
      this.cronManager.stop(this.resetJobName);
      this.resetJobName = null;
    }
  }
}

export default MetricsCollector;
