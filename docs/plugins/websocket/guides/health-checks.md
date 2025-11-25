# Health Checks Guide

> Kubernetes-compatible health endpoints for WebSocket plugin

[← Back to WebSocket Plugin](../README.md)

---

## Table of Contents

- [Overview](#overview)
- [Health Endpoints](#health-endpoints)
- [Configuration](#configuration)
- [Kubernetes Integration](#kubernetes-integration)
- [Custom Health Checks](#custom-health-checks)
- [Monitoring](#monitoring)

---

## Overview

The WebSocket plugin provides Kubernetes-compatible health check endpoints via HTTP. These endpoints help container orchestrators (Kubernetes, Docker Swarm, ECS) determine if your application is healthy and ready to receive traffic.

### Endpoints

| Endpoint | Purpose | Kubernetes Probe |
|----------|---------|------------------|
| `/health` | Generic health status | - |
| `/health/live` | Is the app alive? | Liveness |
| `/health/ready` | Is the app ready for traffic? | Readiness |

---

## Health Endpoints

### GET /health

Generic health check returning basic status information.

**Response (200 OK):**
```json
{
  "status": "ok",
  "uptime": 3600.123,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "connections": 42,
  "subscriptions": 15,
  "endpoints": {
    "liveness": "/health/live",
    "readiness": "/health/ready"
  }
}
```

### GET /health/live

Liveness probe - checks if the application process is alive.

**Response (200 OK):**
```json
{
  "status": "alive",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**When it fails:**
- Process is dead (no response)
- Kubernetes action: Restart the pod

### GET /health/ready

Readiness probe - checks if the application is ready to receive traffic.

**Response (200 OK) - Healthy:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600.123,
  "checks": {
    "s3db": {
      "status": "healthy",
      "latency_ms": 5,
      "resources": 3
    },
    "websocket": {
      "status": "healthy",
      "clients": 42,
      "subscriptions": 15
    }
  }
}
```

**Response (503 Service Unavailable) - Unhealthy:**
```json
{
  "status": "unhealthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 10.5,
  "checks": {
    "s3db": {
      "status": "unhealthy",
      "connected": false,
      "resources": 0
    },
    "websocket": {
      "status": "healthy",
      "clients": 0,
      "subscriptions": 0
    }
  }
}
```

**Built-in checks:**
- `s3db` - Database connection and resources
- `websocket` - WebSocket server running

**When it fails:**
- Database not connected
- No resources created
- WebSocket server not running
- Custom checks failing
- Kubernetes action: Remove pod from service endpoints

---

## Configuration

### Basic Configuration

Health checks are **enabled by default**.

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  // health: { enabled: true }  // Default
});
```

### Disable Health Checks

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  health: false  // or { enabled: false }
});
```

### Custom Health Checks

Add checks for external dependencies:

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  health: {
    enabled: true,
    readiness: {
      checks: [
        {
          name: 'redis',
          timeout: 5000,  // 5 second timeout
          optional: false,  // Fails readiness if unhealthy
          check: async () => {
            const startTime = Date.now();
            await redis.ping();
            return {
              healthy: true,
              latency_ms: Date.now() - startTime
            };
          }
        },
        {
          name: 'external-api',
          timeout: 10000,
          optional: true,  // Won't fail readiness
          check: async () => {
            const response = await fetch('https://api.example.com/health');
            return {
              healthy: response.ok,
              status: response.status
            };
          }
        }
      ]
    }
  }
});
```

---

## Kubernetes Integration

### Pod Manifest

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: websocket-server
spec:
  containers:
    - name: websocket
      image: your-app:latest
      ports:
        - containerPort: 3001
      livenessProbe:
        httpGet:
          path: /health/live
          port: 3001
        initialDelaySeconds: 5
        periodSeconds: 10
        timeoutSeconds: 5
        failureThreshold: 3
      readinessProbe:
        httpGet:
          path: /health/ready
          port: 3001
        initialDelaySeconds: 10
        periodSeconds: 5
        timeoutSeconds: 10
        failureThreshold: 3
```

### Deployment with Service

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: websocket-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: websocket-server
  template:
    metadata:
      labels:
        app: websocket-server
    spec:
      containers:
        - name: websocket
          image: your-app:latest
          ports:
            - containerPort: 3001
          env:
            - name: NODE_ENV
              value: "production"
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: jwt-secret
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 5
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: websocket-service
spec:
  selector:
    app: websocket-server
  ports:
    - port: 80
      targetPort: 3001
  type: ClusterIP
```

### Ingress for WebSocket

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: websocket-ingress
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/upstream-hash-by: "$remote_addr"
spec:
  rules:
    - host: ws.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: websocket-service
                port:
                  number: 80
```

---

## Custom Health Checks

### Redis Check

```javascript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const wsPlugin = new WebSocketPlugin({
  health: {
    readiness: {
      checks: [{
        name: 'redis',
        timeout: 5000,
        check: async () => {
          try {
            const start = Date.now();
            await redis.ping();
            return {
              healthy: true,
              latency_ms: Date.now() - start
            };
          } catch (err) {
            return {
              healthy: false,
              error: err.message
            };
          }
        }
      }]
    }
  }
});
```

### PostgreSQL Check

```javascript
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const wsPlugin = new WebSocketPlugin({
  health: {
    readiness: {
      checks: [{
        name: 'postgresql',
        timeout: 5000,
        check: async () => {
          const client = await pool.connect();
          try {
            const start = Date.now();
            await client.query('SELECT 1');
            return {
              healthy: true,
              latency_ms: Date.now() - start,
              pool: {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount
              }
            };
          } finally {
            client.release();
          }
        }
      }]
    }
  }
});
```

### External API Check

```javascript
const wsPlugin = new WebSocketPlugin({
  health: {
    readiness: {
      checks: [{
        name: 'payment-api',
        timeout: 10000,
        optional: true,  // Don't fail if payment API is down
        check: async () => {
          const response = await fetch('https://api.stripe.com/v1/health', {
            headers: { 'Authorization': `Bearer ${process.env.STRIPE_KEY}` }
          });
          return {
            healthy: response.ok,
            status: response.status
          };
        }
      }]
    }
  }
});
```

### Memory Check

```javascript
const wsPlugin = new WebSocketPlugin({
  health: {
    readiness: {
      checks: [{
        name: 'memory',
        check: async () => {
          const used = process.memoryUsage();
          const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
          const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
          const usagePercent = Math.round((used.heapUsed / used.heapTotal) * 100);

          return {
            healthy: usagePercent < 90,  // Unhealthy if >90% heap used
            heap_used_mb: heapUsedMB,
            heap_total_mb: heapTotalMB,
            usage_percent: usagePercent
          };
        }
      }]
    }
  }
});
```

---

## Monitoring

### Prometheus Metrics

Expose health metrics for Prometheus:

```javascript
// Custom endpoint for Prometheus
app.get('/metrics', (req, res) => {
  const info = wsPlugin.getServerInfo();
  const metrics = wsPlugin.getMetrics();

  const prometheusMetrics = `
# HELP websocket_connections_total Total WebSocket connections
# TYPE websocket_connections_total counter
websocket_connections_total ${metrics.connections}

# HELP websocket_disconnections_total Total WebSocket disconnections
# TYPE websocket_disconnections_total counter
websocket_disconnections_total ${metrics.disconnections}

# HELP websocket_clients_current Current connected clients
# TYPE websocket_clients_current gauge
websocket_clients_current ${info.clients}

# HELP websocket_messages_received_total Total messages received
# TYPE websocket_messages_received_total counter
websocket_messages_received_total ${metrics.messagesReceived}

# HELP websocket_messages_sent_total Total messages sent
# TYPE websocket_messages_sent_total counter
websocket_messages_sent_total ${metrics.messagesSent}

# HELP websocket_errors_total Total errors
# TYPE websocket_errors_total counter
websocket_errors_total ${metrics.errors}

# HELP process_uptime_seconds Process uptime
# TYPE process_uptime_seconds gauge
process_uptime_seconds ${process.uptime()}
`.trim();

  res.set('Content-Type', 'text/plain');
  res.send(prometheusMetrics);
});
```

### Alerting

Set up alerts for unhealthy states:

```yaml
# Prometheus alerting rules
groups:
  - name: websocket
    rules:
      - alert: WebSocketUnhealthy
        expr: probe_success{job="websocket-health"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "WebSocket server unhealthy"
          description: "WebSocket health check failing for more than 1 minute"

      - alert: WebSocketHighConnections
        expr: websocket_clients_current > 9000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High WebSocket connections"
          description: "WebSocket connections above 9000 for 5 minutes"
```

---

## Best Practices

1. **Set appropriate timeouts**: Liveness should be quick (5s), readiness can be longer (10s)
2. **Use optional checks**: Mark non-critical dependencies as optional
3. **Monitor check latency**: High latency indicates problems
4. **Don't check too frequently**: Every 5-10 seconds is usually sufficient
5. **Log health failures**: Always log why readiness fails

---

[← Back to WebSocket Plugin](../README.md) | [Configuration Reference →](../reference/configuration.md)
