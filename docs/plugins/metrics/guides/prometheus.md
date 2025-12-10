# Prometheus & Datadog Integration

> **In this guide:** Prometheus setup, Datadog integration, Kubernetes configuration, and Grafana dashboards.

**Navigation:** [← Back to Metrics Plugin](../README.md) | [Configuration](./configuration.md)

---

## Quick Start

```javascript
// Auto mode (default) - uses API Plugin if available, otherwise standalone server
await db.usePlugin(new MetricsPlugin({
  prometheus: { enabled: true }
}));

// Access metrics:
// - If API Plugin active: GET http://localhost:3000/metrics
// - Otherwise: GET http://localhost:9090/metrics
```

---

## Configuration Modes

The Prometheus exporter supports **3 modes** to fit different deployment scenarios:

### 1. Auto Mode (Recommended)

Automatically detects if API Plugin is active:
- **With API Plugin**: Exposes `/metrics` on same port (integrated)
- **Without API Plugin**: Creates standalone server on port 9090

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'auto'  // Default
  }
}));
```

### 2. Integrated Mode

Forces integration with API Plugin (same HTTP server):

```javascript
await db.usePlugin(new ApiPlugin({ port: 3000 }));
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'integrated',
    path: '/metrics'
  }
}));

// Metrics available at: GET http://localhost:3000/metrics
```

**Benefits:**
- Single scrape target for Prometheus
- Reuses existing server
- Documented in Swagger UI

### 3. Standalone Mode

Always creates separate HTTP server for metrics:

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'standalone',
    port: 9090,
    path: '/metrics'
  }
}));

// Metrics available at: GET http://localhost:9090/metrics
```

---

## IP Allowlist (Security)

The `/metrics` endpoint is protected by **IP allowlist** by default.

### Default Configuration

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    // Default IP allowlist (automatically applied)
    ipAllowlist: [
      '127.0.0.1',           // localhost IPv4
      '::1',                 // localhost IPv6
      '10.0.0.0/8',          // Private network (Kubernetes pods, VPCs)
      '172.16.0.0/12',       // Private network (Docker Compose)
      '192.168.0.0/16'       // Private network (local development)
    ],
    enforceIpAllowlist: true
  }
}));
```

### Custom IP Allowlist

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    ipAllowlist: [
      '127.0.0.1',
      '10.0.0.0/8',
      '203.0.113.50',        // Specific Prometheus server IP
      '198.51.100.0/24'      // Corporate network range
    ]
  }
}));
```

### Disable IP Filtering (Development Only)

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    enforceIpAllowlist: false  // NOT recommended for production
  }
}));
```

---

## Exported Metrics

### Counters (always increasing)

- `s3db_operations_total{operation, resource}` - Total operations by type and resource
- `s3db_operation_errors_total{operation, resource}` - Total errors by operation

### Gauges (can increase or decrease)

- `s3db_operation_duration_seconds{operation, resource}` - Average operation duration
- `s3db_uptime_seconds` - Process uptime in seconds
- `s3db_resources_total` - Total number of tracked resources
- `s3db_info{version, node_version}` - Build information (always 1)

### OperationPool Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `s3db_pool_tasks_started_total` | counter | Total tasks started |
| `s3db_pool_tasks_completed_total` | counter | Total tasks completed successfully |
| `s3db_pool_tasks_failed_total` | counter | Total tasks that failed |
| `s3db_pool_tasks_retried_total` | counter | Total retry attempts |
| `s3db_pool_task_execution_seconds` | gauge | Average task execution time |
| `s3db_pool_task_execution_total_seconds` | counter | Cumulative execution time |

### Example Output

```
# HELP s3db_operations_total Total number of operations by type and resource
# TYPE s3db_operations_total counter
s3db_operations_total{operation="insert",resource="cars"} 1523
s3db_operations_total{operation="update",resource="cars"} 342
s3db_operations_total{operation="get",resource="users"} 8945

# HELP s3db_operation_duration_seconds Average operation duration in seconds
# TYPE s3db_operation_duration_seconds gauge
s3db_operation_duration_seconds{operation="insert",resource="cars"} 0.045
s3db_operation_duration_seconds{operation="update",resource="cars"} 0.032

# HELP s3db_uptime_seconds Process uptime in seconds
# TYPE s3db_uptime_seconds gauge
s3db_uptime_seconds 3600.5
```

---

## Kubernetes Configuration

### ServiceMonitor (Prometheus Operator)

For **integrated mode**:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: s3db-api-metrics
  namespace: s3db-api
spec:
  selector:
    matchLabels:
      app: s3db-api
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
    scrapeTimeout: 10s
```

For **standalone mode**:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: s3db-metrics
  namespace: s3db-api
spec:
  selector:
    matchLabels:
      app: s3db-api
  endpoints:
  - port: metrics       # Separate metrics port
    path: /metrics
    interval: 30s
```

### Pod Annotations (Auto-discovery)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: s3db-api
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      containers:
      - name: api
        image: my-s3db-api:latest
        ports:
        - containerPort: 3000
          name: http
```

---

## Datadog Integration

Datadog can scrape the Prometheus-format `/metrics` endpoint via OpenMetrics.

### Auto-Discovery in Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: s3db-api
spec:
  template:
    metadata:
      annotations:
        ad.datadoghq.com/s3db-api.checks: |
          {
            "openmetrics": {
              "instances": [
                {
                  "openmetrics_endpoint": "http://%%host%%:%%port%%/metrics",
                  "namespace": "s3db",
                  "metrics": [".*"]
                }
              ]
            }
          }
```

### Metric Mapping

| Prometheus Metric | Datadog Metric |
|-------------------|----------------|
| `s3db_operations_total` | `s3db.operations_total` |
| `s3db_operation_errors_total` | `s3db.operation_errors_total` |
| `s3db_operation_duration_seconds` | `s3db.operation_duration_seconds` |

### Datadog Dashboard Queries

```
# Operation Rate
sum:s3db.operations_total{*}.as_rate()

# Error Rate
sum:s3db.operation_errors_total{*}.as_rate()

# Average Operation Duration
avg:s3db.operation_duration_seconds{*} by {operation}

# Pool Success Rate
(sum:s3db.pool_tasks_completed_total{*}.as_rate() / sum:s3db.pool_tasks_started_total{*}.as_rate()) * 100
```

---

## Grafana Dashboard Queries

Example PromQL queries:

### Operation Rate
```promql
rate(s3db_operations_total[5m])
```

### Average Operation Duration
```promql
avg(s3db_operation_duration_seconds) by (operation)
```

### Error Rate
```promql
rate(s3db_operation_errors_total[5m])
```

### Total Operations by Resource
```promql
sum(s3db_operations_total) by (resource)
```

### Slowest Operations
```promql
topk(10, s3db_operation_duration_seconds)
```

### Pool Success Rate
```promql
rate(s3db_pool_tasks_completed_total[5m]) / rate(s3db_pool_tasks_started_total[5m])
```

---

## Docker Compose Example

```yaml
# docker-compose.yml
services:
  s3db-app:
    image: my-s3db-app:latest
    ports:
      - "3000:3000"

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 's3db'
    static_configs:
      - targets: ['s3db-app:3000']
    metrics_path: '/metrics'
```

---

## Testing Metrics

```bash
# Test integrated mode
curl http://localhost:3000/metrics

# Test standalone mode
curl http://localhost:9090/metrics

# Validate Prometheus format
curl http://localhost:3000/metrics | promtool check metrics

# Test with Prometheus locally
docker run -p 9091:9090 -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus
```

---

## Troubleshooting

**Q: Metrics endpoint returns 404?**
A: Check:
1. Prometheus is enabled: `prometheus.enabled: true`
2. If using `mode: 'integrated'`, ensure API Plugin is active
3. Correct path (default: `/metrics`)

**Q: Metrics are empty/zero?**
A:
1. Ensure operations have been performed
2. Check `flushInterval` hasn't reset counters
3. Verify MetricsPlugin was installed BEFORE performing operations

**Q: Getting 403 Forbidden on /metrics?**
A: IP allowlist is blocking your request:
1. Check your IP and add to allowlist
2. Or disable filtering (dev only): `enforceIpAllowlist: false`

**Q: Standalone server won't start?**
A:
1. Check port 9090 is not in use: `lsof -i :9090`
2. Verify `mode: 'standalone'` is set
3. Check console for error messages

---

## See Also

- [Configuration](./configuration.md) - Detailed configuration options
- [Usage Patterns](./usage-patterns.md) - Examples and monitoring patterns
- [Best Practices](./best-practices.md) - Recommendations and FAQ
