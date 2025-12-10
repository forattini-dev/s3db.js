# Metrics Plugin

> **Operational telemetry, latency insights, and error analytics for every resource.**

---

## TLDR

**Complete** performance monitoring: timing, usage patterns, errors, and cache hit rates.

**1 line to get started:**
```javascript
await db.usePlugin(new MetricsPlugin({ enabled: true }));  // Automatic collection!
```

**Main features:**
- Operation timing (avg/min/max)
- Resource usage patterns
- Error tracking + error rates
- Slow query detection
- Real-time alerts + thresholds
- Prometheus/Datadog integration
- OperationPool metrics (when enabled)

**When to use:**
- Performance optimization
- Debugging + troubleshooting
- Capacity planning
- Alerting + monitoring

**Access:**
```javascript
const metrics = await db.plugins.metrics.getMetrics();
console.log('Avg time:', metrics.performance.averageResponseTime);
```

---

## Quick Start

```javascript
import { Database, MetricsPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

const metricsPlugin = new MetricsPlugin({
  enabled: true,
  trackLatency: true,
  trackErrors: true
});

await db.usePlugin(metricsPlugin);

// Create resource and perform operations
const users = await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required'
  }
});

// Operations are automatically tracked
await users.insert({ name: 'Alice', email: 'alice@example.com' });
await users.insert({ name: 'Bob', email: 'bob@example.com' });
await users.list({ limit: 10 });
await users.count();

// View metrics
const metrics = await metricsPlugin.getMetrics();
console.log('Performance Metrics:');
console.log('- Total operations:', metrics.operations.total);
console.log('- Average response time:', metrics.performance.averageResponseTime, 'ms');
console.log('- Inserts:', metrics.operations.byType.insert);
console.log('- Lists:', metrics.operations.byType.list);
console.log('- Errors:', metrics.errors.total);
```

---

## Dependencies

**Zero external dependencies** - built into s3db.js core.

**What's Included:**
- Performance tracking (built-in)
- Error logging (built-in)
- Usage analytics (built-in)
- Prometheus exporter (built-in)
- Real-time alerting (built-in)

**Optional Integrations:**
- **Prometheus**: Built-in text format exporter
- **Datadog**: OpenMetrics integration via `/metrics` endpoint
- **Grafana**: Works with Prometheus integration
- **API Plugin**: Auto-integrates when available

---

## Documentation Index

| Guide | Description |
|-------|-------------|
| [Configuration](./guides/configuration.md) | All options, data structure, API reference |
| [Usage Patterns](./guides/usage-patterns.md) | Examples, advanced analysis, health monitoring |
| [Prometheus Integration](./guides/prometheus.md) | Prometheus, Datadog, Kubernetes, Grafana |
| [Best Practices](./guides/best-practices.md) | Production tips, troubleshooting, FAQ |

---

## Quick Reference

### Core Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable metrics collection |
| `collectPerformance` | boolean | `true` | Track operation timing |
| `collectErrors` | boolean | `true` | Track errors and failures |
| `collectUsage` | boolean | `true` | Track resource usage patterns |
| `retentionDays` | number | `30` | Days to retain metric data |
| `flushInterval` | number | `60000` | Flush interval (ms) |
| `sampleRate` | number | `1.0` | Sampling rate (0.0-1.0) |
| `slowQueryThreshold` | number | `1000` | Slow query threshold (ms) |

### Key Methods

```javascript
// Get comprehensive metrics
const metrics = await metricsPlugin.getMetrics();

// Get resource-specific metrics
const userMetrics = await metricsPlugin.getResourceMetrics('users');

// Get summary statistics
const stats = await metricsPlugin.getStats();

// Export metrics
const json = await metricsPlugin.exportMetrics('json');

// Clear all metrics
await metricsPlugin.clearMetrics();
```

### Prometheus Integration

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'auto',      // 'auto', 'integrated', or 'standalone'
    path: '/metrics'
  }
}));
```

### Alert Configuration

```javascript
new MetricsPlugin({
  alertThresholds: {
    errorRate: 0.05,
    avgResponseTime: 1000
  },
  onSlowQuery: (op, resource, duration) => {
    console.warn(`Slow ${op} on ${resource}: ${duration}ms`);
  },
  onHighErrorRate: (resource, errorRate) => {
    console.error(`High error rate: ${resource}`);
  }
})
```

---

## See Also

- [Cache Plugin](../cache/README.md) - Improve performance based on metrics insights
- [Audit Plugin](../audit/README.md) - Combine with audit logs for complete observability
- [Costs Plugin](../costs/README.md) - Monitor costs alongside performance metrics
