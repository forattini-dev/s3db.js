# Configuration

> **In this guide:** All configuration options for the Metrics Plugin.

**Navigation:** [← Back to Metrics Plugin](../README.md)

---

## Configuration Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable metrics collection |
| `collectPerformance` | boolean | `true` | Track operation timing and performance |
| `collectErrors` | boolean | `true` | Track errors and failures |
| `collectUsage` | boolean | `true` | Track resource usage patterns |
| `retentionDays` | number | `30` | Days to retain metric data |
| `flushInterval` | number | `60000` | Interval to flush metrics (ms) |
| `sampleRate` | number | `1.0` | Sampling rate for metrics (0.0-1.0) |
| `trackSlowQueries` | boolean | `true` | Track slow operations |
| `slowQueryThreshold` | number | `1000` | Threshold for slow queries (ms) |
| `batchSize` | number | `100` | Batch size for metric storage |

---

## Metrics Data Structure

```javascript
{
  performance: {
    averageResponseTime: 245,     // milliseconds
    totalRequests: 1250,
    requestsPerSecond: 12.5,
    slowestOperations: [
      { operation: "list", resource: "users", avgTime: 450, count: 50 }
    ],
    operationTiming: {
      insert: { avg: 180, min: 120, max: 350, total: 50 },
      update: { avg: 160, min: 90, max: 280, total: 30 },
      get: { avg: 95, min: 45, max: 180, total: 200 }
    }
  },
  usage: {
    resources: {
      users: { inserts: 150, updates: 75, deletes: 10, reads: 800 },
      products: { inserts: 300, updates: 120, deletes: 25, reads: 1200 }
    },
    totalOperations: 2680,
    mostActiveResource: "products",
    peakUsageHour: "14:00",
    dailyPatterns: { /* hourly usage data */ }
  },
  errors: {
    total: 15,
    byType: {
      "ValidationError": 8,
      "NotFoundError": 5,
      "PermissionError": 2
    },
    byResource: { users: 10, products: 5 },
    errorRate: 0.0056  // 0.56%
  },
  cache: {
    hitRate: 0.78,
    totalHits: 980,
    totalMisses: 270
  }
}
```

---

## Advanced Configuration with Alerts

```javascript
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [new MetricsPlugin({
    enabled: true,

    // Comprehensive monitoring
    collectPerformance: true,
    collectErrors: true,
    collectUsage: true,

    // Advanced settings
    retentionDays: 90,        // 3 months of data
    flushInterval: 10000,     // 10 seconds
    sampleRate: 1.0,          // 100% sampling

    // Performance thresholds
    trackSlowQueries: true,
    slowQueryThreshold: 500,  // 500ms threshold

    // Storage optimization
    batchSize: 50,

    // Custom alerting thresholds
    alertThresholds: {
      errorRate: 0.05,        // 5% error rate
      avgResponseTime: 1000,  // 1 second average
      memoryUsage: 0.9        // 90% memory usage
    },

    // Event hooks
    onSlowQuery: (operation, resource, duration) => {
      console.warn(`Slow query: ${operation} on ${resource} took ${duration}ms`);
    },

    onHighErrorRate: (resource, errorRate) => {
      console.error(`High error rate: ${resource} has ${(errorRate * 100).toFixed(1)}% errors`);
    },

    onThresholdExceeded: (metric, value, threshold) => {
      console.warn(`Threshold exceeded: ${metric} = ${value} (threshold: ${threshold})`);
    }
  })]
});
```

---

## API Reference

### Plugin Constructor

```javascript
new MetricsPlugin({
  enabled?: boolean,
  collectPerformance?: boolean,
  collectErrors?: boolean,
  collectUsage?: boolean,
  retentionDays?: number,
  flushInterval?: number,
  sampleRate?: number,
  trackSlowQueries?: boolean,
  slowQueryThreshold?: number,
  batchSize?: number,
  alertThresholds?: object,
  onSlowQuery?: (operation: string, resource: string, duration: number) => void,
  onHighErrorRate?: (resource: string, errorRate: number) => void,
  onThresholdExceeded?: (metric: string, value: any, threshold: any) => void
})
```

### Plugin Methods

#### `getMetrics()`
Returns comprehensive metrics data.

```javascript
const metrics = await s3db.plugins.metrics.getMetrics();
```

#### `clearMetrics()`
Clears all collected metrics data.

```javascript
await s3db.plugins.metrics.clearMetrics();
```

#### `exportMetrics(format)`
Exports metrics in specified format ('json', 'csv', 'xml').

```javascript
const data = await s3db.plugins.metrics.exportMetrics('json');
```

#### `getResourceMetrics(resourceName)`
Get metrics for a specific resource.

```javascript
const userMetrics = await s3db.plugins.metrics.getResourceMetrics('users');
```

#### `getOperationMetrics(operation)`
Get metrics for a specific operation type.

```javascript
const insertMetrics = await s3db.plugins.metrics.getOperationMetrics('inserted');
```

---

## See Also

- [Usage Patterns](./usage-patterns.md) - Examples and monitoring patterns
- [Prometheus Integration](./prometheus.md) - Prometheus and Datadog setup
- [Best Practices](./best-practices.md) - Recommendations and FAQ
