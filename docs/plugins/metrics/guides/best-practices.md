# Best Practices & FAQ

> **In this guide:** Production recommendations, troubleshooting, and frequently asked questions.

**Navigation:** [← Back to Metrics Plugin](../README.md) | [Configuration](./configuration.md)

---

## Best Practices

### 1. Configure Appropriate Sampling

```javascript
// For high-volume production environments
{
  sampleRate: 0.1, // 10% sampling
  flushInterval: 60000 // 1 minute
}

// For development/testing
{
  sampleRate: 1.0, // 100% sampling
  flushInterval: 10000 // 10 seconds
}
```

### 2. Set Meaningful Thresholds

```javascript
{
  slowQueryThreshold: 500, // 500ms for web applications
  alertThresholds: {
    errorRate: 0.01,        // 1% for critical systems
    avgResponseTime: 200    // 200ms for responsive UIs
  }
}
```

### 3. Implement Tiered Alerting

```javascript
{
  onSlowQuery: (operation, resource, duration) => {
    if (duration > 2000) {
      // Critical alert
      sendPagerDutyAlert(`Critical slow query: ${operation} on ${resource}`);
    } else if (duration > 1000) {
      // Warning alert
      sendSlackAlert(`Slow query warning: ${operation} on ${resource}`);
    }
  }
}
```

### 4. Regular Performance Reviews

```javascript
// Schedule regular performance reviews
const schedulePerformanceReview = () => {
  setInterval(async () => {
    const metrics = await s3db.plugins.metrics.getMetrics();

    // Generate weekly performance report
    const report = {
      week: new Date().toISOString().substring(0, 10),
      summary: {
        totalOperations: metrics.usage.totalOperations,
        avgResponseTime: metrics.performance.averageResponseTime,
        errorRate: metrics.errors.errorRate
      },
      trends: analyzeWeeklyTrends(metrics),
      recommendations: generateRecommendations(metrics)
    };

    console.log('Weekly performance report generated');
  }, 7 * 24 * 60 * 60 * 1000); // Weekly
};
```

### 5. Optimize Based on Metrics

```javascript
// Use metrics to guide optimization decisions
async function optimizeBasedOnMetrics() {
  const metrics = await s3db.plugins.metrics.getMetrics();

  // Identify slow operations
  const slowOperations = metrics.performance.slowestOperations;
  for (const op of slowOperations) {
    if (op.operation === 'list' && op.avgTime > 500) {
      console.log(`Consider adding pagination to ${op.resource} list operations`);
    }

    if (op.operation === 'fetched' && op.avgTime > 200) {
      console.log(`Consider adding caching for ${op.resource} get operations`);
    }
  }

  // Check cache effectiveness
  if (metrics.cache && metrics.cache.hitRate < 0.6) {
    console.log('Cache hit rate is low - consider adjusting TTL or cache strategy');
  }

  // Resource usage optimization
  Object.entries(metrics.usage.resources).forEach(([resource, usage]) => {
    const readWriteRatio = usage.reads / (usage.inserts + usage.updates + usage.deletes);
    if (readWriteRatio > 10) {
      console.log(`${resource} has high read/write ratio - excellent cache candidate`);
    }
  });
}
```

---

## Troubleshooting

### Issue: High memory usage from metrics
**Solution**: Reduce `sampleRate`, increase `flushInterval`, or decrease `retentionDays`.

### Issue: Metrics showing incorrect data
**Solution**: Ensure proper plugin initialization and check for sampling rate effects.

### Issue: Performance impact from metrics collection
**Solution**: Reduce sampling rate or disable less critical metrics collection.

### Issue: Slow metrics queries
**Solution**: Implement metrics data archiving and use appropriate batch sizes.

### Issue: Missing alerts
**Solution**: Verify alert thresholds and callback functions are properly configured.

---

## FAQ

### General

**Q: What does the MetricsPlugin monitor?**
A: Performance (duration), errors, and operation counters for all resources and operations (insert, update, delete, get, list, etc).

**Q: Where are metrics stored?**
A: In three S3DB resources: `plg_metrics` (operations), `plg_error_logs` (errors), `plg_performance_logs` (detailed performance).

**Q: What is the performance overhead?**
A: Minimal (<1ms per operation). The plugin uses method wrapping and periodic flush to avoid blocking operations.

**Q: Does MetricsPlugin work with MemoryClient?**
A: Yes! All metric storage resources use MemoryClient when `useFakeS3: true`, making testing blazing fast.

**Q: Can I run multiple MetricsPlugin instances?**
A: Yes, use `namespace` parameter:
```javascript
await db.usePlugin(new MetricsPlugin({ enabled: true }), { namespace: 'monitoring' });
```

**Q: Is MetricsPlugin compatible with other plugins?**
A: Yes! It auto-detects API Plugin for `/metrics` endpoint integration and tracks all plugin operations.

---

### Configuration

**Q: How to disable performance collection?**
A: Configure `collectPerformance: false`:
```javascript
new MetricsPlugin({
  collectPerformance: false,
  collectErrors: true
})
```

**Q: How to configure flush interval?**
A: Use `flushInterval`:
```javascript
new MetricsPlugin({
  flushInterval: 30000  // 30 seconds (default: 60000)
})
```

**Q: How to configure data retention?**
A: Use `retentionDays`:
```javascript
new MetricsPlugin({
  retentionDays: 7  // 7 days (default: 30)
})
```

**Q: Can I monitor only specific resources?**
A: Yes, use `include` or `exclude`:
```javascript
new MetricsPlugin({
  include: ['users', 'orders']  // Only these
})
```

**Q: How to configure sampling rate?**
A: Use `sampleRate` (0.0-1.0):
```javascript
new MetricsPlugin({
  sampleRate: 0.1  // 10% sampling (high-volume scenarios)
})
```

**Q: How to set slow query thresholds?**
A: Configure `slowQueryThreshold`:
```javascript
new MetricsPlugin({
  trackSlowQueries: true,
  slowQueryThreshold: 500  // 500ms (default: 1000ms)
})
```

**Q: How to disable metrics in tests?**
A: Metrics are disabled automatically when `NODE_ENV === 'test'`, or explicitly:
```javascript
new MetricsPlugin({
  enabled: process.env.NODE_ENV !== 'test'
})
```

---

### Operations

**Q: How to get aggregated metrics?**
A: Use `getMetrics`:
```javascript
const metrics = await metricsPlugin.getMetrics({
  resourceName: 'users',
  operation: 'fetched',
  startDate: '2025-01-01',
  limit: 100
});
```

**Q: How to get summary statistics?**
A: Use `getStats`:
```javascript
const stats = await metricsPlugin.getStats();
// Returns: totalOperations, avgResponseTime, operationsByType, errorRate, etc.
```

**Q: How to query error logs?**
A: Use `getErrorLogs`:
```javascript
const errors = await metricsPlugin.getErrorLogs({
  resourceName: 'orders',
  operation: 'inserted',
  limit: 50
});
```

**Q: How to get resource-specific metrics?**
A: Use `getResourceMetrics`:
```javascript
const userMetrics = await metricsPlugin.getResourceMetrics('users');
console.log('Avg latency:', userMetrics.performance.averageResponseTime);
```

**Q: How to export metrics?**
A: Use `exportMetrics`:
```javascript
const json = await metricsPlugin.exportMetrics('json');
const csv = await metricsPlugin.exportMetrics('csv');
const xml = await metricsPlugin.exportMetrics('xml');
```

---

### Alerting & Thresholds

**Q: How to set up custom alerts?**
A: Use `alertThresholds` and callbacks:
```javascript
new MetricsPlugin({
  alertThresholds: {
    errorRate: 0.05,
    avgResponseTime: 1000
  },
  onHighErrorRate: (resource, errorRate) => {
    console.error(`Alert: ${resource} has ${errorRate}% errors`);
  }
})
```

**Q: What alert callbacks are available?**
A:
- `onSlowQuery(operation, resource, duration)`
- `onHighErrorRate(resource, errorRate)`
- `onThresholdExceeded(metric, value, threshold)`

**Q: How to detect slow queries?**
A: Enable `trackSlowQueries`:
```javascript
new MetricsPlugin({
  trackSlowQueries: true,
  slowQueryThreshold: 500,
  onSlowQuery: (op, resource, duration) => {
    console.warn(`Slow ${op} on ${resource}: ${duration}ms`);
  }
})
```

---

### Performance

**Q: What's the overhead of metrics collection?**
A: <1ms per operation. Metrics are buffered in-memory and flushed periodically.

**Q: How to reduce memory usage?**
A: Lower `retentionDays` and increase `flushInterval`:
```javascript
new MetricsPlugin({
  retentionDays: 7,
  flushInterval: 300000  // 5 minutes
})
```

**Q: How to optimize for high-volume scenarios?**
A: Use sampling and increase batch size:
```javascript
new MetricsPlugin({
  sampleRate: 0.1,
  batchSize: 500,
  flushInterval: 120000
})
```

**Q: Does metrics collection block operations?**
A: No. Metrics are collected asynchronously using method wrapping and periodic flush.

**Q: How much S3 storage do metrics use?**
A: ~1KB per metric record. With 1M operations/day and 30-day retention: ~30GB (with sampling: ~3GB at 10%).

---

### Maintenance

**Q: How to cleanup old data?**
A: Use `cleanupOldData`:
```javascript
await metricsPlugin.cleanupOldData();
// Removes data older than retentionDays
```

**Q: How to force flush metrics?**
A: Use `flushMetrics`:
```javascript
await metricsPlugin.flushMetrics();
// Persists buffered metrics to database
```

**Q: How to clear all metrics?**
A: Use `clearMetrics`:
```javascript
await metricsPlugin.clearMetrics();
// Deletes ALL metrics data (use with caution!)
```

**Q: How often should I cleanup old data?**
A: Automatic cleanup runs on plugin initialization and every 24 hours. Manual cleanup rarely needed.

---

### Advanced

**Q: Can I create custom metrics?**
A: Yes, use `recordCustomMetric`:
```javascript
await metricsPlugin.recordCustomMetric({
  name: 'custom_operation',
  value: 123,
  labels: { resource: 'users', type: 'custom' }
});
```

**Q: How to integrate with external monitoring?**
A: Export metrics and push to external systems:
```javascript
const metrics = await metricsPlugin.exportMetrics('json');
await axios.post('https://monitoring-service.com/ingest', metrics);
```

**Q: Can I benchmark specific code blocks?**
A: Yes, use `startTimer`/`endTimer`:
```javascript
const timer = metricsPlugin.startTimer('custom_operation');
// ... your code ...
metricsPlugin.endTimer(timer, { resource: 'users' });
```

**Q: How to create health checks based on metrics?**
A: Use `getResourceMetrics` with thresholds:
```javascript
async function healthCheck() {
  const metrics = await metricsPlugin.getStats();
  return {
    healthy: metrics.errors.errorRate < 0.05 &&
             metrics.performance.averageResponseTime < 1000,
    metrics
  };
}
```

---

## See Also

- [Configuration](./configuration.md) - Detailed configuration options
- [Usage Patterns](./usage-patterns.md) - Examples and monitoring patterns
- [Prometheus Integration](./prometheus.md) - Prometheus and Datadog setup
