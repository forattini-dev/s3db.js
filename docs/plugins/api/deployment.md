# 🐳 Production Deployment

> **Navigation:** [← Back to API Plugin](../api.md) | [Configuration →](./configuration.md) | [Guards →](./guards.md)

---

## Table of Contents

- [Docker Setup](#docker-setup)
- [Kubernetes Deployment](#kubernetes-deployment)
- [AWS IAM Policy](#aws-iam-policy-for-s3-access)
- [Limits & Constraints](#️-limits--constraints)
- [Production Best Practices](#production-best-practices)
- [Prometheus Monitoring](#prometheus-monitoring)

---

## Docker Setup

**Dockerfile:**
```dockerfile
# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build if needed (optional, for TypeScript projects)
# RUN pnpm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy application code
COPY --from=builder /app/src ./src
COPY --from=builder /app/docs ./docs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health/live', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Start application
CMD ["node", "src/your-api-server.js"]
```

**Docker Compose (for local development):**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - S3_BUCKET=my-s3db-bucket
      - S3_REGION=us-east-1
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./src:/app/src
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health/live"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
    restart: unless-stopped

  # Optional: LocalStack for S3 development
  localstack:
    image: localstack/localstack:latest
    ports:
      - "4566:4566"
    environment:
      - SERVICES=s3
      - DEBUG=1
    volumes:
      - ./localstack-data:/var/lib/localstack
```

**.dockerignore:**
```
node_modules/
npm-debug.log
.git/
.gitignore
*.md
tests/
coverage/
.env
.env.local
localstack-data/
```

**Build and run:**
```bash
# Build image
docker build -t my-s3db-api:1.0.0 .

# Run locally
docker run -p 3000:3000 \
  -e S3_BUCKET=my-bucket \
  -e AWS_ACCESS_KEY_ID=xxx \
  -e AWS_SECRET_ACCESS_KEY=yyy \
  my-s3db-api:1.0.0

# Or use docker-compose
docker-compose up -d

# Check health
curl http://localhost:3000/health/ready
```

---

## Kubernetes Deployment

**Complete Kubernetes manifests for production deployment:**

**1. Namespace:**
```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: s3db-api
  labels:
    name: s3db-api
```

**2. ConfigMap (non-sensitive configuration):**
```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: s3db-api-config
  namespace: s3db-api
data:
  # Server configuration
  PORT: "3000"
  HOST: "0.0.0.0"
  NODE_ENV: "production"

  # S3 configuration
  S3_BUCKET: "my-s3db-production"
  S3_REGION: "us-east-1"

  # API configuration
  CORS_ENABLED: "true"
  CORS_ORIGIN: "*"
  RATE_LIMIT_ENABLED: "true"
  RATE_LIMIT_MAX_REQUESTS: "100"
  RATE_LIMIT_WINDOW_MS: "60000"

  # Logging
  LOGGING_ENABLED: "true"
  VERBOSE: "false"
```

**3. Secret (sensitive data):**
```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: s3db-api-secret
  namespace: s3db-api
type: Opaque
stringData:
  # AWS Credentials (use IRSA in production - see below)
  AWS_ACCESS_KEY_ID: "your-access-key-id"
  AWS_SECRET_ACCESS_KEY: "your-secret-access-key"

  # JWT Secret
  JWT_SECRET: "your-super-secret-jwt-key-256-bits"

  # API Keys (if using Basic Auth)
  BASIC_AUTH_PASSPHRASE: "your-encryption-passphrase"
```

**4. Deployment:**
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: s3db-api
  namespace: s3db-api
  labels:
    app: s3db-api
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: s3db-api
  template:
    metadata:
      labels:
        app: s3db-api
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      # Use service account with IRSA for AWS credentials (recommended)
      serviceAccountName: s3db-api-sa

      # Security context
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
        seccompProfile:
          type: RuntimeDefault

      containers:
      - name: api
        image: my-registry/s3db-api:1.0.0
        imagePullPolicy: Always

        ports:
        - name: http
          containerPort: 3000
          protocol: TCP

        # Environment variables from ConfigMap
        envFrom:
        - configMapRef:
            name: s3db-api-config
        - secretRef:
            name: s3db-api-secret

        # Resource limits
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"

        # Liveness probe - restart if unhealthy
        livenessProbe:
          httpGet:
            path: /health/live
            port: http
            scheme: HTTP
          initialDelaySeconds: 15
          periodSeconds: 10
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 3

        # Readiness probe - remove from load balancer if not ready
        readinessProbe:
          httpGet:
            path: /health/ready
            port: http
            scheme: HTTP
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 2

        # Startup probe - for slow-starting apps
        startupProbe:
          httpGet:
            path: /health/live
            port: http
          initialDelaySeconds: 0
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 12

        # Security context
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: false
          runAsNonRoot: true
          runAsUser: 1001
          capabilities:
            drop:
            - ALL

      # Graceful shutdown
      terminationGracePeriodSeconds: 30

      # DNS policy
      dnsPolicy: ClusterFirst

      # Restart policy
      restartPolicy: Always
```

**5. Service:**
```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: s3db-api
  namespace: s3db-api
  labels:
    app: s3db-api
spec:
  type: ClusterIP
  selector:
    app: s3db-api
  ports:
  - name: http
    port: 80
    targetPort: http
    protocol: TCP
  sessionAffinity: None
```

**6. Ingress (NGINX):**
```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: s3db-api
  namespace: s3db-api
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.yourdomain.com
    secretName: s3db-api-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: s3db-api
            port:
              number: 80
```

**7. HorizontalPodAutoscaler:**
```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: s3db-api
  namespace: s3db-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: s3db-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 15
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 2
        periodSeconds: 15
      selectPolicy: Max
```

**8. ServiceAccount with IRSA (AWS IAM Roles for Service Accounts):**
```yaml
# serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: s3db-api-sa
  namespace: s3db-api
  annotations:
    # AWS EKS - IRSA annotation (replaces access keys)
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/s3db-api-role
```

**9. PodDisruptionBudget:**
```yaml
# pdb.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: s3db-api
  namespace: s3db-api
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: s3db-api
```

---

### Deploy to Kubernetes

**1. Create namespace and apply manifests:**
```bash
# Create namespace
kubectl apply -f namespace.yaml

# Apply configurations
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f serviceaccount.yaml

# Deploy application
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml

# Apply autoscaling and PDB
kubectl apply -f hpa.yaml
kubectl apply -f pdb.yaml

# Verify deployment
kubectl -n s3db-api get all
kubectl -n s3db-api get pods
kubectl -n s3db-api describe pod <pod-name>
```

**2. Check health probes:**
```bash
# Port-forward to test locally
kubectl -n s3db-api port-forward svc/s3db-api 8080:80

# Test health endpoints
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
curl http://localhost:8080/health

# Check pod events
kubectl -n s3db-api get events --sort-by=.metadata.creationTimestamp

# Check logs
kubectl -n s3db-api logs -f deployment/s3db-api
```

**3. Monitor rollout:**
```bash
# Watch rollout status
kubectl -n s3db-api rollout status deployment/s3db-api

# Check pod readiness
kubectl -n s3db-api get pods -w

# Describe deployment
kubectl -n s3db-api describe deployment s3db-api
```

**4. Update deployment:**
```bash
# Update image
kubectl -n s3db-api set image deployment/s3db-api \
  api=my-registry/s3db-api:1.0.1

# Or apply updated manifest
kubectl apply -f deployment.yaml

# Rollback if needed
kubectl -n s3db-api rollout undo deployment/s3db-api
kubectl -n s3db-api rollout history deployment/s3db-api
```

---

## AWS IAM Policy for S3 Access

**IAM Policy for s3db.js (attach to IRSA role):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-s3db-production",
        "arn:aws:s3:::my-s3db-production/*"
      ]
    }
  ]
}
```

**Trust policy for IRSA:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B71EXAMPLE"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.us-east-1.amazonaws.com/id/EXAMPLED539D4633E53DE1B71EXAMPLE:sub": "system:serviceaccount:s3db-api:s3db-api-sa"
        }
      }
    }
  ]
}
```

---

## ⚠️ Limits & Constraints

**Production planning guide** - understand the boundaries before scaling.

### S3 Backend Constraints

| Constraint | Limit | Impact | Mitigation |
|------------|-------|--------|------------|
| **S3 Request Rate** | 3,500 PUT/POST/DELETE per prefix/sec<br/>5,500 GET/HEAD per prefix/sec | API throttling under extreme load | Use partitions to distribute writes across prefixes |
| **S3 Metadata Size** | 2 KB max | Large objects need `body-overflow` behavior | Automatic with s3db.js behaviors |
| **S3 Latency** | 50-200ms (p50)<br/>500ms+ (p99) | API response time floor | Cache frequently accessed data (CachePlugin) |
| **S3 Consistency** | Read-after-write consistent | No eventual consistency issues | Safe for all operations |
| **S3 Object Size** | 5 TB max | Very large payloads | Unlikely to hit with typical API data |

**Key Insight**: **S3 is the bottleneck**, not the API Plugin. The framework adds < 2ms overhead.

### API Plugin Constraints

| Constraint | Recommended Limit | Hard Limit | Notes |
|------------|-------------------|------------|-------|
| **Concurrent Requests** | 1,000-5,000 per instance | ~10,000 | Beyond this, horizontal scaling needed |
| **Request Size** | 10 MB | 100 MB (configurable) | Large uploads → use multipart |
| **Response Size** | 10 MB | No hard limit | Large responses → use streaming |
| **Resources per Database** | 100-500 | ~1,000 | Each resource = separate API routes |
| **Routes per Plugin** | 1,000-5,000 | ~10,000 | Includes auto-generated + custom routes |
| **Guards per Resource** | 10-20 | No hard limit | Complex guards → performance impact |
| **Auth Token Size** | 2 KB (JWT) | 8 KB | Large JWTs → network overhead |
| **Rate Limit Rules** | 100-500 | ~1,000 | Each rule = memory overhead |

### Scaling Limits

**Single Instance (4 vCPU, 8 GB RAM):**
- ✅ **27,000 req/s** (simple GET, as per benchmarks)
- ✅ **9,000 req/s** (complex query with filters)
- ✅ **24,000 req/s** (POST/PUT/DELETE)
- ⚠️ **Memory**: Peaks at ~120 MB under 100 RPS load
- ⚠️ **CPU**: 80-90% utilization at max throughput

**Horizontal Scaling:**
- ✅ **Stateless** - safe to run multiple instances
- ✅ **Load balancer-friendly** - ALB, NGINX, Traefik
- ✅ **Kubernetes-ready** - health probes, graceful shutdown
- ⚠️ **S3 rate limits apply globally** - distribute across partitions

**Vertical Scaling:**
- ✅ **Linear CPU scaling** - 8 vCPU → ~54k req/s
- ✅ **Memory-efficient** - 8 GB handles 100+ RPS easily
- ⚠️ **Diminishing returns** - beyond 16 vCPU, horizontal scaling better

### Database Size Constraints

| Metric | Typical | Large | Massive |
|--------|---------|-------|---------|
| **Total Records** | 1M | 100M | 1B+ |
| **Resources** | 10-50 | 100-500 | 1,000+ |
| **Partitions per Resource** | 5-10 | 50-100 | 500+ |
| **Records per Partition** | 10k-100k | 1M | 10M+ |
| **S3 Objects** | 100k | 10M | 100M+ |

**Performance Impact:**
- **No degradation with size** - O(1) partition lookups
- **List operations scale linearly** - 100k items = ~200ms, 1M items = ~2s
- **Partitions are critical** - without partitions, list() scans all objects (slow!)

---

## Production Best Practices

**1. Security:**
- ✅ Use IRSA instead of access keys (no secrets in pods)
- ✅ Run as non-root user (UID 1001)
- ✅ Read-only root filesystem when possible
- ✅ Drop all Linux capabilities
- ✅ Use secrets for sensitive data
- ✅ Enable TLS/HTTPS via Ingress
- ✅ Use NetworkPolicies to restrict traffic

**2. Reliability:**
- ✅ Set resource requests and limits
- ✅ Configure liveness and readiness probes
- ✅ Use PodDisruptionBudget (min 1 pod available)
- ✅ Enable HPA for auto-scaling
- ✅ Use RollingUpdate strategy with maxUnavailable: 0
- ✅ Set proper termination grace period (30s)

**3. Monitoring:**
- ✅ Expose metrics endpoint (Prometheus)
- ✅ Configure structured logging
- ✅ Use APM tools (DataDog, New Relic, etc.)
- ✅ Set up alerts for health probe failures
- ✅ Monitor S3 costs and API calls

**4. High Availability:**
- ✅ Run minimum 2 replicas (3+ recommended)
- ✅ Spread pods across availability zones
- ✅ Use pod anti-affinity for spreading
- ✅ Configure backup S3 buckets
- ✅ Implement circuit breakers for S3 calls

**Example pod anti-affinity:**
```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchExpressions:
          - key: app
            operator: In
            values:
            - s3db-api
        topologyKey: topology.kubernetes.io/zone
```

---

## Prometheus Monitoring

The API Plugin integrates seamlessly with the MetricsPlugin to expose Prometheus metrics for monitoring and observability.

**Two deployment modes:**

1. **Integrated Mode** (Recommended): Metrics exposed on same port as API (`/metrics` endpoint)
2. **Standalone Mode**: Separate metrics server on dedicated port (e.g., 9090)

### Integrated Mode Setup

```javascript
import { Database, ApiPlugin, MetricsPlugin } from 's3db.js';

const db = new Database({ connectionString: 's3://...' });

// 1. Add MetricsPlugin first (auto-detects API Plugin)
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'auto',        // Auto-detects API Plugin and integrates
    path: '/metrics'      // Metrics available at /metrics
  }
}));

// 2. Add API Plugin
await db.usePlugin(new ApiPlugin({
  port: 3000,
  resources: { /* ... */ }
}));

// Metrics now available at: http://localhost:3000/metrics
```

**Kubernetes Deployment with Prometheus Annotations:**

The deployment example above includes Prometheus annotations that tell Prometheus to scrape metrics:

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"      # Enable scraping
    prometheus.io/port: "3000"        # Same port as API
    prometheus.io/path: "/metrics"    # Metrics endpoint path
```

**ServiceMonitor (Prometheus Operator):**

```yaml
# servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: s3db-api
  namespace: s3db-api
  labels:
    app: s3db-api
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

**Apply ServiceMonitor:**
```bash
kubectl apply -f servicemonitor.yaml

# Verify Prometheus is scraping
kubectl -n monitoring get servicemonitor s3db-api
```

### Standalone Mode Setup

For security or compliance requirements, run metrics on a separate port:

```javascript
await db.usePlugin(new MetricsPlugin({
  prometheus: {
    enabled: true,
    mode: 'standalone',   // Separate HTTP server
    port: 9090,           // Dedicated metrics port
    path: '/metrics'
  }
}));

// API on port 3000, metrics on port 9090
await db.usePlugin(new ApiPlugin({ port: 3000 }));
```

**Kubernetes Deployment for Standalone Mode:**

```yaml
# deployment.yaml (standalone metrics)
spec:
  template:
    metadata:
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"         # Separate metrics port
        prometheus.io/path: "/metrics"
    spec:
      containers:
      - name: api
        ports:
        - name: http
          containerPort: 3000
        - name: metrics          # Additional port for metrics
          containerPort: 9090
```

**Service for Standalone Mode:**

```yaml
# service.yaml (with metrics port)
apiVersion: v1
kind: Service
metadata:
  name: s3db-api
  namespace: s3db-api
spec:
  ports:
  - name: http
    port: 80
    targetPort: 3000
  - name: metrics        # Expose metrics port
    port: 9090
    targetPort: 9090
  selector:
    app: s3db-api
```

### Exported Metrics

The MetricsPlugin exports these Prometheus metrics:

**Counters** (always increasing):
- `s3db_operations_total{operation, resource}` - Total operations by type
- `s3db_operation_errors_total{operation, resource}` - Total errors

**Gauges** (can increase/decrease):
- `s3db_operation_duration_seconds{operation, resource}` - Average operation duration
- `s3db_uptime_seconds` - Process uptime
- `s3db_resources_total` - Number of tracked resources
- `s3db_info{version, node_version}` - Build information

**Example Prometheus output:**
```
# HELP s3db_operations_total Total number of operations by type and resource
# TYPE s3db_operations_total counter
s3db_operations_total{operation="insert",resource="cars"} 1523
s3db_operations_total{operation="update",resource="cars"} 342

# HELP s3db_operation_duration_seconds Average operation duration in seconds
# TYPE s3db_operation_duration_seconds gauge
s3db_operation_duration_seconds{operation="insert",resource="cars"} 0.045
```

### Testing Metrics Endpoint

```bash
# Integrated mode
curl http://localhost:3000/metrics

# Standalone mode
curl http://localhost:9090/metrics

# In Kubernetes (port-forward)
kubectl -n s3db-api port-forward svc/s3db-api 8080:80
curl http://localhost:8080/metrics
```

### Grafana Dashboard Queries

**Request Rate:**
```promql
rate(s3db_operations_total[5m])
```

**Error Rate:**
```promql
rate(s3db_operation_errors_total[5m]) / rate(s3db_operations_total[5m])
```

**P95 Latency:**
```promql
histogram_quantile(0.95, rate(s3db_operation_duration_seconds[5m]))
```

**Resource Operations by Type:**
```promql
sum by (operation) (rate(s3db_operations_total{resource="cars"}[5m]))
```

### Complete Example

See [e48-metrics-prometheus.js](../examples/e48-metrics-prometheus.js) for a complete working example demonstrating both integrated and standalone modes.

For detailed MetricsPlugin configuration and features, see [MetricsPlugin documentation](./metrics.md#prometheus-integration).

---

> **Navigation:** [← Back to API Plugin](../api.md) | [Configuration →](./configuration.md) | [Guards →](./guards.md)
