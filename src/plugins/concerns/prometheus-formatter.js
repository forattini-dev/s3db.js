/**
 * Prometheus Formatter - Format s3db.js metrics to Prometheus text-based format
 *
 * Generates metrics in Prometheus exposition format:
 * https://prometheus.io/docs/instrumenting/exposition_formats/
 */

/**
 * Sanitize label value for Prometheus
 * - Replace invalid characters with underscores
 * - Escape special characters
 * @param {string} value - Label value
 * @returns {string} Sanitized value
 */
function sanitizeLabel(value) {
  if (typeof value !== 'string') {
    value = String(value);
  }

  // Escape backslashes and quotes
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

/**
 * Sanitize metric name for Prometheus
 * - Only alphanumeric and underscores allowed
 * - Must not start with digit
 * @param {string} name - Metric name
 * @returns {string} Sanitized name
 */
function sanitizeMetricName(name) {
  // Replace invalid characters with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');

  // Ensure doesn't start with digit
  if (/^\d/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }

  return sanitized;
}

/**
 * Format labels for Prometheus metric line
 * @param {Object} labels - Label key-value pairs
 * @returns {string} Formatted labels string
 */
function formatLabels(labels) {
  if (!labels || Object.keys(labels).length === 0) {
    return '';
  }

  const labelPairs = Object.entries(labels)
    .map(([key, value]) => `${key}="${sanitizeLabel(value)}"`)
    .join(',');

  return `{${labelPairs}}`;
}

/**
 * Format a single Prometheus metric
 * @param {string} name - Metric name
 * @param {string} type - Metric type (counter, gauge, histogram, summary)
 * @param {string} help - Help text
 * @param {Array<{labels: Object, value: number}>} values - Metric values with labels
 * @returns {string} Formatted metric lines
 */
function formatMetric(name, type, help, values) {
  const lines = [];

  // HELP line
  lines.push(`# HELP ${name} ${help}`);

  // TYPE line
  lines.push(`# TYPE ${name} ${type}`);

  // Value lines
  for (const { labels, value } of values) {
    const labelsStr = formatLabels(labels);
    lines.push(`${name}${labelsStr} ${value}`);
  }

  return lines.join('\n');
}

/**
 * Format all metrics from MetricsPlugin to Prometheus format
 * @param {MetricsPlugin} metricsPlugin - Instance of MetricsPlugin
 * @returns {string} Complete Prometheus metrics text
 */
export function formatPrometheusMetrics(metricsPlugin) {
  const lines = [];
  const metrics = metricsPlugin.metrics;

  // 1. Operations Total (counter)
  const operationsTotalValues = [];

  // Global operations
  for (const [operation, data] of Object.entries(metrics.operations)) {
    if (data.count > 0) {
      operationsTotalValues.push({
        labels: { operation, resource: '_global' },
        value: data.count
      });
    }
  }

  // Resource-specific operations
  for (const [resourceName, operations] of Object.entries(metrics.resources)) {
    for (const [operation, data] of Object.entries(operations)) {
      if (data.count > 0) {
        operationsTotalValues.push({
          labels: { operation, resource: sanitizeMetricName(resourceName) },
          value: data.count
        });
      }
    }
  }

  if (operationsTotalValues.length > 0) {
    lines.push(formatMetric(
      's3db_operations_total',
      'counter',
      'Total number of operations by type and resource',
      operationsTotalValues
    ));
    lines.push('');
  }

  // 2. Operation Duration (gauge - average)
  const durationValues = [];

  // Global operations
  for (const [operation, data] of Object.entries(metrics.operations)) {
    if (data.count > 0) {
      const avgSeconds = (data.totalTime / data.count) / 1000; // Convert ms to seconds
      durationValues.push({
        labels: { operation, resource: '_global' },
        value: avgSeconds.toFixed(6)
      });
    }
  }

  // Resource-specific operations
  for (const [resourceName, operations] of Object.entries(metrics.resources)) {
    for (const [operation, data] of Object.entries(operations)) {
      if (data.count > 0) {
        const avgSeconds = (data.totalTime / data.count) / 1000; // Convert ms to seconds
        durationValues.push({
          labels: { operation, resource: sanitizeMetricName(resourceName) },
          value: avgSeconds.toFixed(6)
        });
      }
    }
  }

  if (durationValues.length > 0) {
    lines.push(formatMetric(
      's3db_operation_duration_seconds',
      'gauge',
      'Average operation duration in seconds',
      durationValues
    ));
    lines.push('');
  }

  // 3. Operation Errors Total (counter)
  const errorsValues = [];

  // Global errors
  for (const [operation, data] of Object.entries(metrics.operations)) {
    if (data.errors > 0) {
      errorsValues.push({
        labels: { operation, resource: '_global' },
        value: data.errors
      });
    }
  }

  // Resource-specific errors
  for (const [resourceName, operations] of Object.entries(metrics.resources)) {
    for (const [operation, data] of Object.entries(operations)) {
      if (data.errors > 0) {
        errorsValues.push({
          labels: { operation, resource: sanitizeMetricName(resourceName) },
          value: data.errors
        });
      }
    }
  }

  if (errorsValues.length > 0) {
    lines.push(formatMetric(
      's3db_operation_errors_total',
      'counter',
      'Total number of operation errors',
      errorsValues
    ));
    lines.push('');
  }

  // 4. Uptime (gauge)
  const startTime = new Date(metrics.startTime);
  const uptimeSeconds = (Date.now() - startTime.getTime()) / 1000;

  lines.push(formatMetric(
    's3db_uptime_seconds',
    'gauge',
    'Process uptime in seconds',
    [{ labels: {}, value: uptimeSeconds.toFixed(2) }]
  ));
  lines.push('');

  // 5. Resources Total (gauge)
  const resourcesCount = Object.keys(metrics.resources).length;

  lines.push(formatMetric(
    's3db_resources_total',
    'gauge',
    'Total number of tracked resources',
    [{ labels: {}, value: resourcesCount }]
  ));
  lines.push('');

  // 6. Build Info (gauge - always 1)
  const nodeVersion = process.version || 'unknown';
  const s3dbVersion = '1.0.0'; // TODO: Get from package.json

  lines.push(formatMetric(
    's3db_info',
    'gauge',
    'Build and runtime information',
    [{
      labels: {
        version: s3dbVersion,
        node_version: nodeVersion
      },
      value: 1
    }]
  ));

  // Join all lines with newline and ensure ends with newline
  return lines.join('\n') + '\n';
}

export default {
  formatPrometheusMetrics,
  formatMetric,
  sanitizeLabel,
  sanitizeMetricName,
  formatLabels
};
