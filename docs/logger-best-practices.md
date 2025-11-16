# Logger Best Practices - s3db.js

**Date**: 2025-11-16
**Status**: ✅ Complete
**Version**: 18.0.0+

---

## 🎯 Objective

Make logging **trivially easy** for developers - access `logger` anywhere without thinking:
- `db.logger` - Database operations
- `plugin.logger` - Plugin context
- `resource.logger` - Resource context
- `ctx.logger` or `c.get('logger')` - HTTP request context

---

## ✅ What Was Fixed (Nov 2025)

### 1. **GlobalCoordinatorService** - CRITICAL BUG ❌→✅
**Problem**: Logger was never initialized, causing crashes when `diagnosticsEnabled: true`

```javascript
// BEFORE (broken):
constructor({ namespace, database, config }) {
  // ... no logger assignment
}

_log(...args) {
  this.logger.info(...); // ❌ Crash: undefined
}

// AFTER (fixed):
constructor({ namespace, database, config }) {
  this.logger = database.getChildLogger(`GlobalCoordinator:${namespace}`, {
    namespace,
    serviceId: this.serviceId
  });
}
```

**File**: `src/plugins/concerns/global-coordinator-service.class.js:101-104`

---

### 2. **HealthManager** - Missing Fallback ⚠️→✅
**Problem**: Optional logger with no fallback - crashes if not provided

```javascript
// BEFORE:
constructor({ logger }) {
  this.logger = logger; // May be undefined
}

register(app) {
  this.logger.debug(...); // ❌ Crash if logger not passed
}

// AFTER:
import { createLogger } from '../../../concerns/logger.js';

constructor({ logger, logLevel }) {
  if (logger) {
    this.logger = logger;
  } else {
    this.logger = createLogger({
      name: 'HealthManager',
      level: logLevel || 'info'
    });
  }
}
```

**File**: `src/plugins/api/server/health-manager.class.js:21-29`

---

### 3. **Router** - Missing Fallback ⚠️→✅
**Problem**: Used optional chaining (`logger?.debug()`) but better to have fallback

```javascript
// BEFORE:
constructor({ logger }) {
  this.logger = logger;
}

mount(app) {
  this.logger?.debug(...); // ⚠️ Works but inconsistent
}

// AFTER:
import { createLogger } from '../../../concerns/logger.js';

constructor({ logger, logLevel }) {
  if (logger) {
    this.logger = logger;
  } else {
    this.logger = createLogger({
      name: 'Router',
      level: logLevel || 'info'
    });
  }
}
```

**File**: `src/plugins/api/server/router.class.js:40-48`

---

## 📚 Logger Access Patterns

### ✅ Recommended Patterns

#### 1. **Database Logger**
```javascript
const db = new Database({ connectionString: 's3://...' });
await db.connect();

db.logger.info('Database connected');
db.logger.debug({ bucketName: 'test' }, 'Using bucket');
```

**Available**: Immediately after `new Database()`
**Child loggers**: `db.getChildLogger(name, bindings)`

---

#### 2. **Plugin Logger**
```javascript
class MyPlugin extends Plugin {
  async onInstall() {
    // ✅ Logger available here (after usePlugin)
    this.logger.info('Plugin installing');
  }

  async myMethod() {
    // ✅ Create child logger for nested operations
    const childLogger = this.getChildLogger('MyMethod', { operation: 'backup' });
    childLogger.info('Starting backup');
  }
}

await db.usePlugin(new MyPlugin(), 'myplugin');
```

**Available**: After `db.usePlugin()` call
**Child loggers**: `plugin.getChildLogger(name, bindings)`

⚠️ **IMPORTANT**: Logger is **NOT** available in plugin constructor!

```javascript
class MyPlugin extends Plugin {
  constructor(options) {
    super(options);
    // ❌ this.logger is undefined here!
  }

  async onInstall() {
    // ✅ this.logger is available here
  }
}
```

---

#### 3. **Resource Logger**
```javascript
const usersResource = db.resources.users;

usersResource.logger.info('Querying users');
const users = await usersResource.query({ active: true });
```

**Available**: After resource creation
**Bindings**: Includes `{ resource: 'users' }`

---

#### 4. **HTTP Context Logger (API Plugin)**
```javascript
// In custom route handler:
app.get('/my-route', async (c) => {
  const logger = c.get('logger'); // ✅ Request-scoped logger
  logger.info({ route: '/my-route' }, 'Handling request');

  return c.json({ success: true });
});
```

**Available**: In all Hono route handlers
**Bindings**: Includes request ID, method, path

---

### ✅ Nested Component Pattern (Best Practice)

```javascript
import { createLogger } from '../concerns/logger.js';

export class MyComponent {
  constructor({ logger, logLevel, name }) {
    // Flexible logger initialization
    if (logger) {
      this.logger = logger; // Use provided logger
    } else {
      this.logger = createLogger({
        name: name || 'MyComponent',
        level: logLevel || 'info'
      });
    }
  }

  doWork() {
    this.logger.info('Doing work');
  }
}

// Usage 1: With parent logger
const component = new MyComponent({
  logger: plugin.getChildLogger('Component')
});

// Usage 2: Standalone
const component = new MyComponent({
  name: 'Standalone',
  logLevel: 'debug'
});
```

**Examples**: HealthManager, Router, FailbanManager, BaseReplicator

---

## 🏗️ Architecture Overview

```
Database (Pino root logger)
  ├── db.logger
  ├── db.getChildLogger(name, bindings)
  │
  ├── Plugin 1
  │   ├── plugin.logger (child of db.logger)
  │   ├── plugin.getChildLogger(name, bindings)
  │   │
  │   └── Nested Components
  │       ├── Router (fallback to createLogger)
  │       ├── HealthManager (fallback to createLogger)
  │       └── Custom classes (fallback to createLogger)
  │
  ├── Plugin 2
  │   └── ... (same pattern)
  │
  └── Resources
      └── resource.logger (child of db.logger)
```

---

## 🔧 Logger Utilities

### 1. **createLogger()**
**File**: `src/concerns/logger.js`

```javascript
import { createLogger } from './concerns/logger.js';

const logger = createLogger({
  name: 'MyComponent',
  level: 'debug', // trace, debug, info, warn, error, fatal, silent
  redact: ['password', 'token'] // Optional: fields to redact
});

logger.info('Hello world');
logger.debug({ userId: 123 }, 'User action');
```

---

### 2. **getChildLogger()**
**Available on**: Database, Plugin

```javascript
// Database child logger
const dbLogger = db.getChildLogger('Migration', { version: '1.0' });
dbLogger.info('Running migration');

// Plugin child logger
const pluginLogger = plugin.getChildLogger('Worker', { workerId: 'w1' });
pluginLogger.info('Worker started');
```

**Benefits**:
- Inherits parent log level
- Adds context bindings
- Shared redaction rules

---

### 3. **setChildLevel()**
**Available on**: Database

```javascript
// Set log level for specific child logger
db.setChildLevel('Plugin:cache', 'debug');
db.setChildLevel('Resource:users', 'trace');
```

**Use case**: Debug specific component without flooding logs

---

## 🎨 Log Level Guidelines

| Level | When to Use | Example |
|-------|-------------|---------|
| `trace` | Very detailed debugging | `logger.trace({ sql: '...' }, 'Executing query')` |
| `debug` | Development debugging | `logger.debug({ count: 10 }, 'Fetched records')` |
| `info` | Normal operations | `logger.info('Plugin installed')` |
| `warn` | Potential issues | `logger.warn('Deprecated method used')` |
| `error` | Errors (recoverable) | `logger.error({ err }, 'Failed to connect')` |
| `fatal` | Unrecoverable errors | `logger.fatal({ err }, 'Database corruption')` |
| `silent` | Disable logging | (tests, benchmarks) |

---

## 🧪 Testing with Loggers

### Pattern 1: Silent Loggers (Recommended)
```javascript
import { test } from '@jest/globals';
import { Database } from '../src/database.class.js';

test('my test', async () => {
  const db = new Database({
    connectionString: 'memory://test/db',
    logLevel: 'silent' // ✅ No logs during tests
  });

  await db.connect();
  // ... test logic
});
```

---

### Pattern 2: Debug Specific Test
```javascript
test('debug this test', async () => {
  const db = new Database({
    connectionString: 'memory://test/db',
    logLevel: 'debug' // ✅ Enable logs for debugging
  });

  await db.connect();
  // ... test logic (logs visible)
});
```

---

### Pattern 3: Mock Logger
```javascript
import { jest } from '@jest/globals';

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn()
};

const component = new MyComponent({ logger: mockLogger });
component.doWork();

expect(mockLogger.info).toHaveBeenCalledWith('Doing work');
```

---

## ⚠️ Common Pitfalls

### 1. **Accessing Logger in Plugin Constructor**
```javascript
// ❌ DON'T:
class MyPlugin extends Plugin {
  constructor(options) {
    super(options);
    this.logger.info('Constructing'); // undefined!
  }
}

// ✅ DO:
class MyPlugin extends Plugin {
  async onInstall() {
    this.logger.info('Installing'); // Available!
  }
}
```

---

### 2. **Forgetting Fallback in Nested Components**
```javascript
// ❌ DON'T:
class MyComponent {
  constructor({ logger }) {
    this.logger = logger; // May be undefined!
  }
}

// ✅ DO:
import { createLogger } from '../concerns/logger.js';

class MyComponent {
  constructor({ logger, logLevel }) {
    this.logger = logger || createLogger({
      name: 'MyComponent',
      level: logLevel || 'info'
    });
  }
}
```

---

### 3. **Using Module-Level Loggers**
```javascript
// ❌ DON'T (not injectable, hard to test):
const logger = createLogger({ name: 'MyModule' });

export function doWork() {
  logger.info('Working');
}

// ✅ DO (injectable, testable):
export function doWork(logger) {
  logger.info('Working');
}
```

---

## 📊 Performance Considerations

### 1. **Hot Path Logging**
Avoid creating child loggers in hot paths:

```javascript
// ❌ DON'T (creates new logger on every call):
async function processRecord(record) {
  const logger = this.getChildLogger('Process', { recordId: record.id });
  logger.debug('Processing');
}

// ✅ DO (create logger once):
constructor() {
  this.processLogger = this.getChildLogger('Process');
}

async function processRecord(record) {
  this.processLogger.debug({ recordId: record.id }, 'Processing');
}
```

---

### 2. **Conditional Logging**
Use `if` for expensive operations:

```javascript
// ❌ SLOW (always serializes object):
logger.debug({ expensiveData: JSON.stringify(largeObject) }, 'Data');

// ✅ FAST (only serializes if debug enabled):
if (logger.isLevelEnabled('debug')) {
  logger.debug({ expensiveData: JSON.stringify(largeObject) }, 'Data');
}
```

---

## 🔍 Debugging Tips

### 1. **Enable Debug for Specific Component**
```javascript
const db = new Database({ connectionString: '...' });
await db.connect();

// Enable debug for specific plugin
db.setChildLevel('Plugin:cache', 'debug');
db.setChildLevel('Plugin:api', 'debug');

// Or set globally
db.logger.level = 'debug';
```

---

### 2. **Trace Request Flow**
```javascript
// API Plugin automatically adds request ID
app.get('/users', async (c) => {
  const logger = c.get('logger');
  logger.info('Fetching users'); // Includes requestId in bindings

  const users = await c.get('resource:users').query({});
  logger.info({ count: users.length }, 'Users fetched');

  return c.json(users);
});
```

Logs:
```json
{"level":30,"requestId":"req-abc123","msg":"Fetching users"}
{"level":30,"requestId":"req-abc123","count":10,"msg":"Users fetched"}
```

---

### 3. **Inspect Logger Bindings**
```javascript
console.log(logger.bindings()); // { name: 'Plugin:cache', plugin: 'cache' }
```

---

## 📝 Migration Guide

### If You Have Existing Code

**Pattern 1: Optional Logger → Fallback**
```javascript
// BEFORE:
class MyClass {
  constructor({ logger }) {
    this.logger = logger; // May be undefined
  }

  method() {
    this.logger?.info('Message'); // Optional chaining
  }
}

// AFTER:
import { createLogger } from '../concerns/logger.js';

class MyClass {
  constructor({ logger, logLevel }) {
    this.logger = logger || createLogger({
      name: 'MyClass',
      level: logLevel || 'info'
    });
  }

  method() {
    this.logger.info('Message'); // Always works
  }
}
```

---

**Pattern 2: Module Logger → Injected Logger**
```javascript
// BEFORE:
const logger = createLogger({ name: 'MyModule' });

export function process(data) {
  logger.info({ data }, 'Processing');
}

// AFTER:
export function process(data, logger) {
  logger.info({ data }, 'Processing');
}

// Or in class:
export class Processor {
  constructor({ logger }) {
    this.logger = logger || createLogger({ name: 'Processor' });
  }

  process(data) {
    this.logger.info({ data }, 'Processing');
  }
}
```

---

## ✅ Checklist for New Components

When creating a new class/component:

- [ ] Accept `logger` in constructor options
- [ ] Provide fallback with `createLogger()` if not provided
- [ ] Accept `logLevel` option for fallback logger
- [ ] Use `this.logger` (not optional chaining)
- [ ] Don't create child loggers in hot paths
- [ ] Use meaningful logger names (e.g., `Router`, `HealthManager`)
- [ ] Add context bindings when useful (e.g., `{ requestId, userId }`)

---

## 🎓 Examples in Codebase

**Good Examples**:
- ✅ `HealthManager` - Fallback logger with configurable level
- ✅ `Router` - Fallback logger with configurable level
- ✅ `GlobalCoordinatorService` - Child logger from database
- ✅ `FailbanManager` - Flexible logger with fallback
- ✅ `BaseReplicator` - Flexible logger with fallback
- ✅ `MiddlewareChain` - Fallback logger with no-op

**Anti-Patterns Fixed**:
- ❌→✅ `GlobalCoordinatorService` - Was undefined, now initialized
- ❌→✅ `HealthManager` - Was optional, now has fallback
- ❌→✅ `Router` - Was optional, now has fallback

---

## 📞 Support

If you encounter logger issues:
1. Check if component has fallback logger
2. Verify logger is available at the lifecycle stage (not in constructor)
3. Use `db.setChildLevel(name, 'debug')` to debug specific components
4. Report bugs at https://github.com/anthropics/s3db.js/issues

---

**Last Updated**: 2025-11-16
**Maintainer**: s3db.js Core Team
