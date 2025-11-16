# API Plugin - Logging Examples

This document shows real logging outputs from the API Plugin in different scenarios.

---

## 📋 Table of Contents

1. [Startup Logs (Verbose Mode)](#startup-logs-verbose-mode)
2. [Startup Logs (Minimal Mode)](#startup-logs-minimal-mode)
3. [Request Logs](#request-logs)
4. [Event Logs](#event-logs)
5. [Metrics Logs](#metrics-logs)
6. [Error Logs](#error-logs)
7. [Production JSON Logs](#production-json-logs)

---

## 🚀 Startup Logs (Verbose Mode)

When `logLevel: 'debug'`, you get detailed initialization logs:

```bash
$ node my-api.js

[API Plugin] Installing...
[API Plugin] Created plg_api_users resource for authentication
[API Plugin] Installed successfully
[API Plugin] Starting server...
[OpenAPIGenerator] Caching enabled
[MiddlewareChain] Request ID tracking enabled (header: X-Request-ID)
[MiddlewareChain] CORS enabled (maxAge: 86400s, origin: *)
[MiddlewareChain] Security headers enabled
[MiddlewareChain] Applied 3 custom middleware(s)
[GlobalAuthStrategy] Using global auth with methods: jwt
[API Router] Context injection middleware registered (resources accessible via c.get())
[API Router] Mounted default splash screen at /api/v1
[API Router] Mounted routes for resource 'users' at /api/v1/users
[API Router] Mounted routes for resource 'posts' at /api/v1/posts
[API Router] Skipping internal resource 'plg_api_users' (not included in config.resources)
[API Router] Mounted auth routes (driver: jwt) at /api/v1/auth
[API Router] Metrics endpoint enabled at /api/v1/metrics
[HealthManager] Health endpoints registered:
[HealthManager]   GET /health
[HealthManager]   GET /health/live
[HealthManager]   GET /health/ready
[API Plugin] Server listening on http://0.0.0.0:3000

  🗄️  s3db.js API ready
     - Local:    http://localhost:3000/api/v1
     - Network:  http://192.168.1.100:3000/api/v1
     - Docs:     http://localhost:3000/api/v1/docs
     Routes:
       • GET, POST, DELETE /api/v1/users (auth:on)
       • GET, POST /api/v1/posts (auth:on)
```

### Log Breakdown

| Phase | Logs | Purpose |
|-------|------|---------|
| **Plugin Install** | `[API Plugin] Installing...` | Plugin initialization |
| **Auth Resource** | `Created plg_api_users resource` | Internal user resource for JWT |
| **OpenAPI** | `[OpenAPIGenerator] Caching enabled` | Spec generation optimization |
| **Middlewares** | `[MiddlewareChain] ...` | Each middleware registration |
| **Auth Strategy** | `[GlobalAuthStrategy] Using global auth` | Auth configuration |
| **Context** | `[API Router] Context injection` | Database resource access |
| **Routes** | `[API Router] Mounted ...` | Each route/resource mounted |
| **Health** | `[HealthManager] Health endpoints` | Health check endpoints |
| **Startup Banner** | `🗄️ s3db.js API ...` | Server info & routes summary |

---

## 🔇 Startup Logs (Minimal Mode)

When `logLevel: 'silent'` (default), you only see the startup banner:

```bash
$ node my-api.js

  🗄️  s3db.js API ready
     - Local:    http://localhost:3000
     - Network:  http://192.168.1.100:3000
     - Docs:     http://localhost:3000/docs
     Routes:
       • GET, POST /users (auth:off)
       • GET, POST, PUT, DELETE /products (auth:on)
```

**To disable banner** (completely silent startup):
```javascript
new ApiPlugin({
  startupBanner: false
})
```

---

## 📡 Request Logs

### Default Format (Colorized)

```bash
GET /api/v1/users => 200 (45 ms, 256 bytes)
POST /api/v1/users => 201 (123 ms, 512 bytes)
GET /api/v1/users/abc123 => 200 (23 ms, 128 bytes)
PUT /api/v1/users/abc123 => 200 (67 ms, 256 bytes)
DELETE /api/v1/users/abc123 => 204 (34 ms)
GET /api/v1/notfound => 404 (12 ms, 89 bytes)
POST /api/v1/users => 400 (15 ms, 145 bytes)
```

**Colors** (when terminal supports ANSI):
- 🔵 Method: Light blue
- 🟣 URL: Light purple
- ⚪ Arrow: Gray
- 🟡 Time: Orange
- 🟢 Size: Blue-gray

### Custom Format

```javascript
new ApiPlugin({
  logging: {
    enabled: true,
    format: ':method :url :status (:elapsed ms)'
  }
})
```

**Output:**
```bash
GET /users 200 (45 ms)
POST /users 201 (123 ms)
DELETE /users/abc123 204 (34 ms)
```

### Available Tokens

| Token | Description | Example |
|-------|-------------|---------|
| `:method` | HTTP method | `GET` |
| `:url` | Request path | `/users` |
| `:status` | Status code | `200` |
| `:elapsed` | Duration in ms | `45` |
| `:ip` | Client IP | `192.168.1.100` |
| `:user-agent` | User agent | `curl/7.68.0` |
| `:req[header]` | Request header | `:req[authorization]` |
| `:res[header]` | Response header | `:res[content-type]` |

---

## 🎯 Event Logs

When `events.enabled: true` and `events.logLevel: 'debug'`:

```javascript
new ApiPlugin({
  events: {
    enabled: true,
    logLevel: 'debug'
  }
})
```

### Request Lifecycle Events

```bash
[ApiEventEmitter] Emitted request:start for /users
[ApiEventEmitter] Emitted request:end for /users (200, 45ms)
[ApiEventEmitter] Emitted resource:insert for users (id: abc123)
[ApiEventEmitter] Emitted request:start for /posts
[ApiEventEmitter] Emitted request:error for /posts (500, 67ms)
```

### Custom Event Listeners

```javascript
apiPlugin.on('request:start', (data) => {
  console.log(`→ ${data.method} ${data.path} [${data.requestId}]`);
});

apiPlugin.on('request:end', (data) => {
  console.log(`← ${data.method} ${data.path} ${data.status} (${data.duration}ms)`);
});

apiPlugin.on('resource:insert', (data) => {
  console.log(`✓ Created ${data.resource} record: ${data.id}`);
});
```

**Output:**
```bash
→ POST /users [abc-123-def]
✓ Created users record: user_abc123
← POST /users 201 (123ms)

→ GET /users [def-456-ghi]
← GET /users 200 (45ms)
```

---

## 📊 Metrics Logs

When `metrics.enabled: true` and `metrics.logLevel: 'debug'`:

```javascript
new ApiPlugin({
  metrics: {
    enabled: true,
    logLevel: 'debug',
    resetInterval: 60000  // Reset every 60s
  }
})
```

### Periodic Metrics Output

```bash
[MetricsCollector] Metrics updated:
  Total requests: 145
  Success rate: 94.5%
  Average duration: 67ms
  Top paths:
    • GET /users (45 requests, avg 34ms)
    • POST /users (23 requests, avg 89ms)
    • GET /posts (18 requests, avg 45ms)

[MetricsCollector] Resetting metrics (interval reached)
```

### Metrics Endpoint

```bash
$ curl http://localhost:3000/metrics

{
  "success": true,
  "data": {
    "enabled": true,
    "totalRequests": 145,
    "successRate": 0.945,
    "averageDuration": 67.4,
    "statusCodes": {
      "200": 120,
      "201": 15,
      "400": 5,
      "404": 3,
      "500": 2
    },
    "paths": {
      "/users": {
        "count": 45,
        "averageDuration": 34.2,
        "methods": {
          "GET": 38,
          "POST": 7
        }
      },
      "/posts": {
        "count": 18,
        "averageDuration": 45.6,
        "methods": {
          "GET": 15,
          "POST": 3
        }
      }
    },
    "uptime": 3600
  }
}
```

---

## ❌ Error Logs

### Validation Errors

```bash
POST /api/v1/users => 400 (15 ms, 145 bytes)

{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "email",
        "message": "must be a valid email",
        "value": "invalid-email"
      },
      {
        "field": "name",
        "message": "is required",
        "value": null
      }
    ]
  }
}
```

### Authentication Errors

```bash
GET /api/v1/users => 401 (12 ms, 89 bytes)

{
  "success": false,
  "error": {
    "message": "Authentication required",
    "code": "UNAUTHORIZED",
    "details": {
      "reason": "Missing or invalid JWT token"
    }
  }
}
```

### Not Found Errors

```bash
GET /api/v1/notfound => 404 (8 ms, 78 bytes)

{
  "success": false,
  "error": {
    "message": "Route not found",
    "code": "NOT_FOUND",
    "details": {
      "path": "/api/v1/notfound",
      "method": "GET"
    }
  }
}
```

### Internal Errors (with debug mode)

```bash
[API Server] Error in request handler:
  Path: /users/abc123
  Method: GET
  Error: Cannot read property 'id' of undefined
  Stack:
    at Resource.get (/app/src/resource.class.js:1144:25)
    at createResourceRoutes (/app/src/plugins/api/routes/resource-routes.js:234:31)
    ...

GET /api/v1/users/abc123 => 500 (45 ms, 123 bytes)
```

---

## 🏭 Production JSON Logs

For log aggregation systems (ELK, Datadog, Splunk):

```javascript
const jsonLogger = async (c, next) => {
  const start = Date.now();
  const log = {
    timestamp: new Date().toISOString(),
    type: 'http_request',
    method: c.req.method,
    path: c.req.path,
    ip: c.req.header('x-forwarded-for') || 'unknown',
    userAgent: c.req.header('user-agent')
  };

  try {
    await next();
    const duration = Date.now() - start;

    console.log(JSON.stringify({
      ...log,
      status: c.res.status,
      duration,
      level: c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info'
    }));
  } catch (err) {
    console.log(JSON.stringify({
      ...log,
      status: 500,
      duration: Date.now() - start,
      level: 'error',
      error: err.message,
      stack: err.stack
    }));
    throw err;
  }
};

new ApiPlugin({
  logLevel: 'silent',
  startupBanner: false,
  middlewares: [jsonLogger]
})
```

**Output** (one JSON object per line):
```json
{"timestamp":"2025-11-10T05:45:23.456Z","type":"http_request","method":"GET","path":"/users","ip":"192.168.1.100","userAgent":"curl/7.68.0","status":200,"duration":45,"level":"info"}
{"timestamp":"2025-11-10T05:45:24.123Z","type":"http_request","method":"POST","path":"/users","ip":"192.168.1.100","userAgent":"curl/7.68.0","status":201,"duration":123,"level":"info"}
{"timestamp":"2025-11-10T05:45:25.789Z","type":"http_request","method":"GET","path":"/notfound","ip":"192.168.1.100","userAgent":"curl/7.68.0","status":404,"duration":12,"level":"warn"}
{"timestamp":"2025-11-10T05:45:26.456Z","type":"http_request","method":"POST","path":"/users","ip":"192.168.1.100","userAgent":"curl/7.68.0","status":500,"duration":67,"level":"error","error":"Database connection failed","stack":"Error: Database connection failed\n    at ..."}
```

### Structured Logging Benefits

✅ **Easy to parse** - Each line is valid JSON
✅ **Query-friendly** - Filter by level, status, duration
✅ **Aggregation** - Works with ELK, Datadog, Splunk
✅ **Alerting** - Trigger alerts on error levels
✅ **Analytics** - Analyze performance patterns

---

## 🎛️ Log Level Control

### Disable Specific Logs

```javascript
new ApiPlugin({
  logLevel: 'silent',           // No startup details
  startupBanner: false,     // No banner
  logging: { enabled: false }, // No request logs
  events: { enabled: false },  // No event logs
  metrics: { enabled: false }  // No metrics logs
})
```

**Result**: Completely silent (only errors to stderr)

### Development Setup

```javascript
new ApiPlugin({
  logLevel: 'debug',            // ✓ All startup details
  logging: { enabled: true }, // ✓ Request logs
  events: {
    enabled: true,
    logLevel: 'debug'           // ✓ Event details
  },
  metrics: {
    enabled: true,
    logLevel: 'debug'           // ✓ Metrics details
  }
})
```

**Result**: Maximum visibility for debugging

### Production Setup

```javascript
new ApiPlugin({
  logLevel: 'silent',           // ✗ No startup spam
  startupBanner: true,      // ✓ Quick summary
  logging: { enabled: true }, // ✓ Request logs (custom JSON)
  events: { enabled: true, logLevel: 'silent' }, // ✓ Events, no debug output
  metrics: { enabled: true, logLevel: 'silent' }, // ✓ Metrics, no debug output
  middlewares: [jsonLogger] // ✓ Structured logging
})
```

**Result**: Production-ready with structured logs

---

## 📝 Best Practices

### 1. Use Verbose Mode in Development

```javascript
const isProduction = process.env.NODE_ENV === 'production';

new ApiPlugin({
  logLevel: !isProduction ? 'debug' : 'info',
  logging: {
    enabled: true,
    format: isProduction
      ? ':method :url :status (:elapsed ms)'
      : ':method :url => :status (:elapsed ms, :res[content-length])'
  }
})
```

### 2. Structured Logging in Production

Always use JSON logging for production:
- Easier to parse
- Works with log aggregation
- Enables powerful querying
- Simplifies monitoring/alerting

### 3. Monitor Metrics Endpoint

Set up health checks that include metrics:

```bash
# Prometheus scraping
curl http://localhost:3000/metrics

# Custom monitoring
curl http://localhost:3000/metrics | jq '.data.statusCodes."500"'
```

### 4. Event-Based Alerting

Listen to critical events:

```javascript
apiPlugin.on('request:error', (data) => {
  if (data.error.includes('Database')) {
    sendAlert('Database error detected', data);
  }
});
```

### 5. Request ID Tracking

Always enable request IDs for debugging:

```javascript
new ApiPlugin({
  requestId: {
    enabled: true,
    headerName: 'X-Request-ID'
  }
})
```

---

## 🔗 Related Documentation

- [API Plugin Configuration](./plugins/api.md)
- [Route Order](./api-plugin-route-order.md)
- [Middleware Guide](./api-plugin-middleware.md)
- [Events Reference](./api-plugin-events.md)

---

**Last Updated**: 2025-11-10
