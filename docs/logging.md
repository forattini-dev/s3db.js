# Logging in s3db.js

s3db.js uses **Pino** for high-performance structured logging with **pretty format enabled by default** for the best developer experience.

## Quick Start

### Default Pretty Logging

By default, all logs use **pino-pretty** format - colored, human-readable output perfect for development:

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 'memory://myapp',
  logLevel: 'info' // Pretty format by default! 🎨
});

await db.connect();
```

**Output example:**
```
[12:34:56.123] INFO: Database connected successfully
[12:34:57.456] INFO (http): GET /users ⇒ 200 (15.234 ms, 1.2KB)
```

### JSON Format (Production)

For production environments or log aggregation, use JSON format:

```bash
# Environment variable (recommended)
S3DB_LOG_FORMAT=json node app.js

# Or programmatically
const db = new Database({
  connectionString: 'memory://myapp',
  logLevel: 'info',
  logger: createLogger({ format: 'json' })
});
```

**Output example:**
```json
{"level":30,"time":1234567890,"pid":12345,"hostname":"server","msg":"Database connected"}
{"level":30,"time":1234567891,"component":"http","req":{"method":"GET","url":"/users"},"res":{"statusCode":200},"responseTime":15.234,"msg":"GET /users ⇒ 200"}
```

## Configuration

### Environment Variables

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `S3DB_LOG_FORMAT` | `pretty`, `json` | `pretty` | Log output format |
| `S3DB_LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` | `info` | Log level |

```bash
# Pretty format (default)
node app.js

# JSON format for production
S3DB_LOG_FORMAT=json node app.js

# Debug level with pretty format
S3DB_LOG_LEVEL=debug node app.js

# Debug level with JSON format
S3DB_LOG_FORMAT=json S3DB_LOG_LEVEL=debug node app.js
```

### Programmatic Configuration

#### Database Logger

```javascript
import { Database } from 's3db.js';
import { createLogger } from 's3db.js/src/concerns/logger.js';

// Option 1: Use Database logLevel (creates logger automatically)
const db = new Database({
  connectionString: 'memory://myapp',
  logLevel: 'debug' // Pretty format by default
});

// Option 2: Pass custom logger
const customLogger = createLogger({
  level: 'debug',
  format: 'json', // Override to JSON
  name: 'MyApp'
});

const db = new Database({
  connectionString: 'memory://myapp',
  logger: customLogger
});
```

#### Plugin Logger

Plugins inherit the database logger automatically:

```javascript
import { ApiPlugin } from 's3db.js';

const apiPlugin = new ApiPlugin({
  port: 3000,
  logLevel: 'info', // Inherits pretty format from database logger
  logging: {
    enabled: true,
    colorize: true // Enable colored HTTP logs (works with pretty format)
  }
});

await db.usePlugin(apiPlugin, 'api');
```

## HTTP Request Logging

The API plugin includes beautiful HTTP request logging inspired by **Morgan's dev format**:

```javascript
const apiPlugin = new ApiPlugin({
  port: 3000,
  logging: {
    enabled: true,
    colorize: true, // Pastel colors for method, URL, status, timing
    format: ':verb :url => :status (:elapsed ms, :res[content-length])', // Default
    excludePaths: ['/health', '/metrics'] // Skip logging these paths
  }
});
```

### Pretty HTTP Log Output

```
GET /users ⇒ 200 (15.234 ms, 1.2KB)
POST /users ⇒ 201 (45.678 ms, 512)
GET /users/123 ⇒ 200 (8.901 ms, 256)
POST /users ⇒ 400 (12.345 ms, 128)
DELETE /users/123 ⇒ 204 (34.567 ms, –)
```

**Color coding:**
- 🔵 Method (pastel blue)
- 🟦 URL (light blue)
- ➡️ Arrow (gray)
- ⏱️ Time (pastel orange)
- 📦 Size (pastel purple)
- Status: 🟢 2xx (green), 🟡 3xx (cyan), 🟠 4xx (yellow), 🔴 5xx (red)

### JSON HTTP Log Output

When using `S3DB_LOG_FORMAT=json`:

```json
{
  "level": 30,
  "time": 1234567890,
  "component": "http",
  "req": { "method": "GET", "url": "/users" },
  "res": { "statusCode": 200 },
  "responseTime": 15.234,
  "contentLength": "1234",
  "requestId": "abc123",
  "user": "john@example.com",
  "msg": "GET /users ⇒ 200 (15.234 ms, 1234)"
}
```

## Custom Format Tokens

Customize HTTP log messages with tokens:

```javascript
logging: {
  format: ':method :url :status :elapsed ms - :user'
}
```

**Available tokens:**
- `:verb`, `:method` - HTTP method
- `:url`, `:path`, `:ruta` - Request path
- `:status` - HTTP status code
- `:elapsed`, `:response-time` - Response time in ms
- `:user`, `:who` - Authenticated user
- `:requestId`, `:reqId` - Request ID
- `:res[header-name]` - Response header value

## Log Levels

| Level | Value | Usage |
|-------|-------|-------|
| `trace` | 10 | Extremely verbose, every detail |
| `debug` | 20 | Debugging information |
| `info` | 30 | General information (default) |
| `warn` | 40 | Warning messages |
| `error` | 50 | Error messages |
| `fatal` | 60 | Fatal errors |

```javascript
// Set level at database creation
const db = new Database({
  logLevel: 'debug'
});

// Or via environment
// S3DB_LOG_LEVEL=debug node app.js
```

## Child Loggers

Create context-specific loggers:

```javascript
const logger = db.logger; // Main database logger
const httpLogger = logger.child({ component: 'http' });
const workerLogger = logger.child({ component: 'worker', workerId: 123 });

httpLogger.info('Request received'); // Includes component: 'http'
workerLogger.debug({ job: 'email' }, 'Processing job'); // Includes workerId
```

## Secret Redaction

Sensitive fields are automatically redacted in logs:

```javascript
logger.info({
  user: {
    email: 'john@example.com',
    password: 'secret123', // Will be redacted
    apiKey: 'abc123'       // Will be redacted
  }
}, 'User login');

// Output:
// {"user":{"email":"john@example.com","password":"[REDACTED]","apiKey":"[REDACTED]"},"msg":"User login"}
```

**Auto-redacted fields:**
- `password`, `passwd`, `pwd`
- `secret`, `apiKey`, `api_key`
- `token`, `accessToken`, `refreshToken`
- `authorization`, `auth`
- `private_key`, `privateKey`
- And more... (see `src/concerns/logger-redact.js`)

## Error Logging

Errors are automatically serialized with stack traces:

```javascript
try {
  await resource.insert({ invalid: 'data' });
} catch (err) {
  logger.error({ err }, 'Failed to insert record');
}

// Pretty output:
// [12:34:56.789] ERROR: Failed to insert record
//     err: {
//       "type": "ValidationError",
//       "message": "Validation failed",
//       "stack": "Error: Validation failed\n    at ..."
//     }

// JSON output:
// {"level":50,"err":{"type":"ValidationError","message":"...","stack":"..."},"msg":"Failed to insert record"}
```

## Performance Tips

### 1. Avoid Child Loggers in Hot Paths

```javascript
// ❌ BAD: Creates new logger on every request
app.use(async (c, next) => {
  const reqLogger = logger.child({ requestId: c.get('requestId') });
  reqLogger.info('Request started');
  await next();
});

// ✅ GOOD: Use bindings parameter
app.use(async (c, next) => {
  logger.info({ requestId: c.get('requestId') }, 'Request started');
  await next();
});
```

### 2. Use Appropriate Log Levels

```javascript
// ❌ BAD: Too verbose in production
logger.debug({ largeObject }, 'Processing data');

// ✅ GOOD: Use info for important events
logger.info({ userId: 123 }, 'User logged in');
```

### 3. Disable Logging in Tests

```javascript
const db = new Database({
  logLevel: 'silent' // No logs during tests
});

// Or via environment
// S3DB_LOG_LEVEL=silent npm test
```

## Example: Complete Setup

```javascript
import { Database } from 's3db.js';
import { ApiPlugin } from 's3db.js';
import { createLogger } from 's3db.js/src/concerns/logger.js';

// 1. Create custom logger (optional - defaults to pretty format)
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.LOG_FORMAT || 'pretty', // 'pretty' or 'json'
  name: 'MyApp'
});

// 2. Create database with logger
const db = new Database({
  connectionString: process.env.S3DB_CONNECTION_STRING,
  logger
});

await db.connect();

// 3. Setup API plugin with HTTP logging
const apiPlugin = new ApiPlugin({
  port: 3000,
  logging: {
    enabled: true,
    colorize: true,
    format: ':method :url => :status (:elapsed ms)',
    excludePaths: ['/health', '/metrics'],
    filter: ({ status }) => status >= 400 // Only log errors
  }
});

await db.usePlugin(apiPlugin, 'api');

// 4. Use logger throughout your application
logger.info('Application started');
logger.debug({ config: { port: 3000 } }, 'Configuration loaded');

try {
  const result = await someOperation();
  logger.info({ result }, 'Operation completed');
} catch (err) {
  logger.error({ err }, 'Operation failed');
}
```

## Related Files

- `src/concerns/logger.js` - Logger factory
- `src/concerns/logger-redact.js` - Secret redaction rules
- `src/plugins/api/middleware/logging.js` - HTTP request logging
- `src/plugins/api/utils/http-logger.js` - Pretty HTTP formatter
- `docs/examples/e200-pretty-logging.js` - Live example

## See Also

- [Pino Documentation](https://getpino.io/)
- [pino-pretty Documentation](https://github.com/pinojs/pino-pretty)
- [Morgan dev format](https://github.com/expressjs/morgan#dev) (inspiration for HTTP logs)
