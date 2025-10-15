import { S3dbError } from '../errors.js';

/**
 * MetricsError - Errors related to metrics operations
 *
 * Used for metrics operations including:
 * - Metric collection and recording
 * - Metric aggregation
 * - Metric querying
 * - Performance tracking
 * - Statistics computation
 *
 * @extends S3dbError
 */
export class MetricsError extends S3dbError {
  constructor(message, details = {}) {
    const { metricName, operation = 'unknown', resourceName, ...rest } = details;

    let description = details.description;
    if (!description) {
      description = `
Metrics Operation Error

Operation: ${operation}
${metricName ? `Metric: ${metricName}` : ''}
${resourceName ? `Resource: ${resourceName}` : ''}

Common causes:
1. Metric not configured
2. Invalid metric value or type
3. Metrics storage not accessible
4. Aggregation function error
5. Query parameters invalid

Solution:
Check metrics configuration and ensure proper initialization.

Docs: https://github.com/forattini-dev/s3db.js/blob/main/docs/plugins/metrics.md
`.trim();
    }

    super(message, { ...rest, metricName, operation, resourceName, description,
      suggestion: details.suggestion || 'Check metrics configuration and metric definitions.' });
  }
}

export default MetricsError;
