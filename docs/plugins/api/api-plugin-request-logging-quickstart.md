# API Plugin - Request Logging Quick Start

How to enable and customize HTTP request logs in the API Plugin.

---

## ✅ Basic Activation (1 line!)

```javascript
import { Database } from 's3db.js';
import { ApiPlugin } from 's3db.js';

const db = new Database({
  connectionString: 'memory://mybucket/db'
});

await db.connect();

await db.createResource({
  name: 'users',
  attributes: {
    name: 'string|required',
    email: 'string|required|email'
  }
});

const apiPlugin = new ApiPlugin({
  port: 3000,

  // 👇 Enable logging here
  logging: true,  // ✨ That's it!

  resources: {
    users: { methods: ['GET', 'POST', 'PUT', 'DELETE'] }
  }
});

await db.usePlugin(apiPlugin);
```

### Output (Colorized in the terminal)

```bash
GET /users ⇒ 200 (13.497 ms, –)
POST /users ⇒ 201 (20.276 ms, –)
GET /users/abc123 ⇒ 200 (3.124 ms, –)
PUT /users/abc123 ⇒ 200 (38.027 ms, –)
DELETE /users/abc123 ⇒ 204 (8.776 ms, –)
GET /notfound ⇒ 404 (1.115 ms, –)
POST /users ⇒ 400 (20.792 ms, –)
```

**Color legend:**
- 🟢 **200-299** (success): green
- 🔵 **300-399** (redirect): cyan
- 🟡 **400-499** (client error): yellow
- 🔴 **500-599** (server error): red

---

## 🎛️ Configuration Syntax

The `logging` option accepts three forms:

### 1. Boolean (simplest)

```javascript
logging: true   // ✅ Turns it on with default settings
logging: false  // ❌ Fully disables logging
```

### 2. Shorthand object (auto-enabled)

Passing an object **automatically enables logging** even without `enabled: true`:

```javascript
logging: {
  format: ':method :url :status'  // ✅ Auto-enabled
}
```

### 3. Full object (complete control)

```javascript
logging: {
  enabled: true,     // Explicit opt-in
  format: '...',     // Custom format string
  colorize: false,   // Disable colors
  logLevel: 'debug'      // Extra diagnostics
}
```

---

## 🎨 Formatting Options

### Default (verbose)

```javascript
logging: true  // Uses the default ':verb :url => :status (:elapsed ms, :res[content-length])'
```

**Output:**
```
GET /users ⇒ 200 (13.497 ms, 256)
POST /users ⇒ 201 (20.276 ms, 512)
```

### Compact format

```javascript
logging: {
  format: ':method :url :status'  // Auto-enabled!
}
```

**Output:**
```
GET /users 200
POST /users 201
DELETE /users/abc123 204
```

### With timestamp

```javascript
logging: {
  format: '[:time] :method :url :status (:elapsed ms)'
}
```

**Output:**
```
[12:34:56] GET /users 200 (13.497 ms)
[12:34:57] POST /users 201 (20.276 ms)
```

### Apache-style

```javascript
logging: {
  format: ':ip - :user [:time] ":method :url HTTP/1.1" :status :res[content-length]'
}
```

**Output:**
```
192.168.1.100 - john [12:34:56] "GET /users HTTP/1.1" 200 256
192.168.1.100 - anonymous [12:34:57] "POST /users HTTP/1.1" 201 512
```

### JSON (log aggregation friendly)

```javascript
logging: {
  format: '{"method":":method","url":":url","status"::status,"duration"::elapsed,"user":":user"}'
}
```

**Output:**
```json
{"method":"GET","url":"/users","status":200,"duration":13.497,"user":"anonymous"}
{"method":"POST","url":"/users","status":201,"duration":20.276,"user":"john"}
```

---

## 🏷️ Available Tokens

| Token | Description | Example |
|-------|-------------|---------|
| `:verb` or `:method` | HTTP method | `GET` |
| `:path` or `:ruta` | Request path (no query string) | `/users` |
| `:url` | Full URL (with query) | `/users?page=2` |
| `:status` | HTTP status code | `200` |
| `:elapsed` or `:response-time` | Duration in ms | `13.497` |
| `:who` or `:user` | Authenticated user | `john` or `anonymous` |
| `:reqId` or `:requestId` | Unique request ID | `abc-123-def` |
| `:time` | Current timestamp | `12:34:56` |
| `:res[header]` | Response header value | `:res[content-length]` → `256` |
| `:req[header]` | Request header value | `:req[user-agent]` → `curl/7.68.0` |

---

## 🎯 Common Use Cases

### Development: maximum detail

```javascript
logging: true  // Verbose default with colors
```

Ou customize:

```javascript
logging: {
  format: ':method :url ⇒ :status (:elapsed ms, :res[content-length])'
  // colorize defaults to true
}
```

**Benefits:**
- ✅ Colors make it easy to spot errors
- ✅ Response time is always visible
- ✅ Shows payload size

### Production: clean format

```javascript
const isProduction = process.env.NODE_ENV === 'production';

logging: {
  enabled: true,
  colorize: !isProduction,  // No colors in prod
  format: isProduction
    ? ':method :url :status (:elapsed ms)'  // Simple
    : ':method :url ⇒ :status (:elapsed ms, :res[content-length])'  // Detailed
}
```

### CI/CD: disable colors

```javascript
logging: {
  colorize: false,  // Pipelines usually lack ANSI support
  format: ':method :url :status (:elapsed ms)'
}
```

### Debug: maximum context

```javascript
logging: {
  format: '[:reqId] :user :method :url :status (:elapsed ms) UA=:req[user-agent]'
}
```

**Output:**
```
[abc-123] john GET /users 200 (13.497 ms) UA=Mozilla/5.0
[def-456] anonymous POST /users 201 (20.276 ms) UA=curl/7.68.0
```

---

## 🔕 Turning Logging Off

### Disable entirely

```javascript
logging: false  // Simplest option!
```

Or omit the `logging` option (disabled by default).

### Disable only colors

```javascript
logging: {
  colorize: false  // Auto-enabled, but colorless
}
```

---

## 🚀 Full Example

```javascript
import { Database } from 's3db.js';
import { ApiPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.DATABASE_URL || 'memory://mybucket/db'
});

await db.connect();

await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    price: 'number|required',
    stock: 'number|default:0'
  }
});

const isProduction = process.env.NODE_ENV === 'production';

const apiPlugin = new ApiPlugin({
  port: process.env.PORT || 3000,
  logLevel: !isProduction ? 'debug' : 'info',  // Debug logs in dev

  // Request logging
  logging: {
    enabled: true,
    colorize: !isProduction,  // Colors only in dev
    format: isProduction
      ? ':method :url :status (:elapsed ms)'  // Production: simple
      : ':method :url ⇒ :status (:elapsed ms, :res[content-length])'  // Dev: detailed
  },

  // Request ID tracking (useful for correlation)
  requestId: {
    enabled: true,
    headerName: 'X-Request-ID'
  },

  resources: {
    products: {
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  }
});

await db.usePlugin(apiPlugin);

console.log('✅ API started with request logging enabled!');
```

### Output (development)

```bash
✅ API started with request logging enabled!

GET /products ⇒ 200 (13.497 ms, 256)
POST /products ⇒ 201 (20.276 ms, 512)
GET /products/abc123 ⇒ 200 (3.124 ms, 128)
PUT /products/abc123 ⇒ 200 (38.027 ms, 256)
DELETE /products/abc123 ⇒ 204 (8.776 ms, –)
```

### Output (production)

```bash
✅ API started with request logging enabled!

GET /products 200 (13.497 ms)
POST /products 201 (20.276 ms)
GET /products/abc123 200 (3.124 ms)
PUT /products/abc123 200 (38.027 ms)
DELETE /products/abc123 204 (8.776 ms)
```

---

## 💡 Tips

### 1. Combine with events for structured logs

```javascript
new ApiPlugin({
  logging: { enabled: false },  // Turn off text logs
  events: { enabled: true },    // Emit events

  // ...
});

// Custom structured logging
apiPlugin.on('request:end', (data) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    method: data.method,
    path: data.path,
    status: data.status,
    duration: data.duration,
    requestId: data.requestId
  }));
});
```

### 2. Use request IDs for debugging

```javascript
logging: {
  enabled: true,
  format: '[:reqId] :method :url :status'
}

requestId: {
  enabled: true
}
```

Each request will include a unique ID that can be followed across logs.

### 3. Monitor performance

```javascript
logging: {
  enabled: true,
  format: ':method :url :status (:elapsed ms)'
}

// Flag slow requests
apiPlugin.on('request:end', (data) => {
  if (data.duration > 1000) {
    console.warn(`⚠️ Slow request: ${data.method} ${data.path} (${data.duration}ms)`);
  }
});
```

### 4. Silence health checks

If you don’t want health checks in the logs:

```javascript
// Use custom middleware to filter them
middlewares: [
  async (c, next) => {
    if (c.req.path.startsWith('/health')) {
      c.set('skipLogging', true);
    }
    await next();
  }
]

logging: {
  enabled: true,
  filter: (c) => !c.get('skipLogging')  // Note: filter not yet implemented
}
```

*(The `filter` option is slated for a future release.)*

---

## 📚 More Information

- [API Plugin Logging Examples](./api-plugin-logging-examples.md) - Complete outputs
- [API Plugin Configuration](./plugins/api.md) - Every option explained
- [Events Reference](./api-plugin-events.md) - Event-driven logging hooks

---

**Last updated**: 2025-11-10
