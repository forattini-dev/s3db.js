export interface MetricValue {
  labels: Record<string, string>;
  value: number | string;
}

export interface OperationData {
  count: number;
  totalTime: number;
  errors: number;
}

export interface PoolMetrics {
  tasksStarted: number;
  tasksCompleted: number;
  tasksFailed: number;
  tasksRetried: number;
  avgExecutionTime: number;
  totalExecutionTime: number;
}

export interface MetricsData {
  operations: Record<string, OperationData>;
  resources: Record<string, Record<string, OperationData>>;
  startTime: string;
  pool?: PoolMetrics;
}

export interface MetricsPlugin {
  metrics: MetricsData;
}

function sanitizeLabel(value: unknown): string {
  let strValue: string;
  if (typeof value !== 'string') {
    strValue = String(value);
  } else {
    strValue = value;
  }

  return strValue
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

function sanitizeMetricName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');

  if (/^\d/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }

  return sanitized;
}

function formatLabels(labels: Record<string, string> | null | undefined): string {
  if (!labels || Object.keys(labels).length === 0) {
    return '';
  }

  const labelPairs = Object.entries(labels)
    .map(([key, value]) => `${key}="${sanitizeLabel(value)}"`)
    .join(',');

  return `{${labelPairs}}`;
}

function formatMetric(
  name: string,
  type: string,
  help: string,
  values: MetricValue[]
): string {
  const lines: string[] = [];

  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} ${type}`);

  for (const { labels, value } of values) {
    const labelsStr = formatLabels(labels);
    lines.push(`${name}${labelsStr} ${value}`);
  }

  return lines.join('\n');
}

export function formatPrometheusMetrics(metricsPlugin: MetricsPlugin): string {
  const lines: string[] = [];
  const metrics = metricsPlugin.metrics;

  const operationsTotalValues: MetricValue[] = [];

  for (const [operation, data] of Object.entries(metrics.operations)) {
    if (data.count > 0) {
      operationsTotalValues.push({
        labels: { operation, resource: '_global' },
        value: data.count
      });
    }
  }

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

  const durationValues: MetricValue[] = [];

  for (const [operation, data] of Object.entries(metrics.operations)) {
    if (data.count > 0) {
      const avgSeconds = (data.totalTime / data.count) / 1000;
      durationValues.push({
        labels: { operation, resource: '_global' },
        value: avgSeconds.toFixed(6)
      });
    }
  }

  for (const [resourceName, operations] of Object.entries(metrics.resources)) {
    for (const [operation, data] of Object.entries(operations)) {
      if (data.count > 0) {
        const avgSeconds = (data.totalTime / data.count) / 1000;
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

  const errorsValues: MetricValue[] = [];

  for (const [operation, data] of Object.entries(metrics.operations)) {
    if (data.errors > 0) {
      errorsValues.push({
        labels: { operation, resource: '_global' },
        value: data.errors
      });
    }
  }

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

  const startTime = new Date(metrics.startTime);
  const uptimeSeconds = (Date.now() - startTime.getTime()) / 1000;

  lines.push(formatMetric(
    's3db_uptime_seconds',
    'gauge',
    'Process uptime in seconds',
    [{ labels: {}, value: uptimeSeconds.toFixed(2) }]
  ));
  lines.push('');

  const resourcesCount = Object.keys(metrics.resources).length;

  lines.push(formatMetric(
    's3db_resources_total',
    'gauge',
    'Total number of tracked resources',
    [{ labels: {}, value: resourcesCount }]
  ));
  lines.push('');

  if (metrics.pool) {
    lines.push(formatMetric(
      's3db_pool_tasks_started_total',
      'counter',
      'Total number of pool tasks started',
      [{ labels: {}, value: metrics.pool.tasksStarted }]
    ));
    lines.push('');

    lines.push(formatMetric(
      's3db_pool_tasks_completed_total',
      'counter',
      'Total number of pool tasks completed successfully',
      [{ labels: {}, value: metrics.pool.tasksCompleted }]
    ));
    lines.push('');

    lines.push(formatMetric(
      's3db_pool_tasks_failed_total',
      'counter',
      'Total number of pool tasks that failed',
      [{ labels: {}, value: metrics.pool.tasksFailed }]
    ));
    lines.push('');

    lines.push(formatMetric(
      's3db_pool_tasks_retried_total',
      'counter',
      'Total number of pool task retry attempts',
      [{ labels: {}, value: metrics.pool.tasksRetried }]
    ));
    lines.push('');

    lines.push(formatMetric(
      's3db_pool_task_execution_seconds',
      'gauge',
      'Average task execution time in seconds',
      [{ labels: {}, value: (metrics.pool.avgExecutionTime / 1000).toFixed(6) }]
    ));
    lines.push('');

    lines.push(formatMetric(
      's3db_pool_task_execution_total_seconds',
      'counter',
      'Total cumulative task execution time in seconds',
      [{ labels: {}, value: (metrics.pool.totalExecutionTime / 1000).toFixed(6) }]
    ));
    lines.push('');
  }

  const nodeVersion = process.version || 'unknown';
  const s3dbVersion = '1.0.0';

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

  return lines.join('\n') + '\n';
}

export default {
  formatPrometheusMetrics,
  formatMetric,
  sanitizeLabel,
  sanitizeMetricName,
  formatLabels
};
