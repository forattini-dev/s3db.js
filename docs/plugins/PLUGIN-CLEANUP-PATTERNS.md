# Plugin Cleanup Patterns - Resource Management Best Practices

## Overview

This document provides guidance on proper resource cleanup in s3db.js plugins to prevent:
- Memory leaks
- Orphaned processes
- Unclosed connections
- Lingering timers/intervals
- Resource exhaustion

## Table of Contents

1. [Core Principles](#core-principles)
2. [Common Resource Types](#common-resource-types)
3. [Lifecycle Hooks](#lifecycle-hooks)
4. [Cleanup Patterns](#cleanup-patterns)
5. [Testing Cleanup](#testing-cleanup)
6. [Examples by Plugin](#examples-by-plugin)

## Core Principles

### 1. Symmetric Resource Management

Every resource allocation must have a corresponding cleanup:

```javascript
// ❌ BAD - No cleanup
constructor() {
  this.timer = setInterval(() => this.refresh(), 60000);
}

// ✅ GOOD - Symmetric allocation/cleanup
constructor() {
  this.timer = setInterval(() => this.refresh(), 60000);
}

async onStop() {
  if (this.timer) {
    clearInterval(this.timer);
    this.timer = null;
  }
}
```

### 2. Defensive Cleanup

Always check if resources exist before cleanup:

```javascript
async onStop() {
  // Check existence
  if (this.timer) {
    clearInterval(this.timer);
    this.timer = null;
  }

  // Handle nullability
  if (this.connection?.close) {
    await this.connection.close();
  }

  // Use try-catch for cleanup errors
  try {
    await this.server?.stop();
  } catch (err) {
    console.error('Server stop failed:', err.message);
  }
}
```

### 3. Nullification After Cleanup

Set resources to `null` after cleanup to prevent double-cleanup:

```javascript
async onStop() {
  if (this.timer) {
    clearInterval(this.timer);
    this.timer = null; // ✅ Prevents double-clear
  }
}
```

## Common Resource Types

### Timers (setInterval/setTimeout)

**Pattern**: Store timer ID, clear on stop

```javascript
class ExamplePlugin extends Plugin {
  constructor(options) {
    super(options);
    this.refreshTimer = null;
    this.cleanupTimer = null;
  }

  async onStart() {
    // Setup periodic tasks
    this.refreshTimer = setInterval(
      () => this.refresh(),
      this.options.refreshInterval
    );

    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      this.options.cleanupInterval
    );
  }

  async onStop() {
    // Clear all timers
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
```

**Real Examples**:
- `src/plugins/api/concerns/failban-manager.js:282-303` - Cleanup timer for expired bans
- `src/plugins/api/concerns/metrics-collector.js:43-49` - Auto-reset timer
- `src/plugins/api/auth/oidc-client.js:364-385` - JWKS refresh interval
- `src/plugins/api/middlewares/rate-limit.js:38` - Cleanup timer for rate limits

### Child Processes (spawn/exec/fork)

**Pattern**: Track processes, kill on stop

```javascript
import { spawn } from 'child_process';
import { processManager } from './process-manager.js';

class ExamplePlugin extends Plugin {
  constructor(options) {
    super(options);
    this.processes = new Set();
  }

  async executeTool(command, args) {
    const proc = spawn(command, args);

    // Track for automatic cleanup
    processManager.track(proc, {
      name: `${command} ${args.join(' ')}`
    });

    // Or manual tracking
    this.processes.add(proc);

    proc.on('exit', () => {
      this.processes.delete(proc);
    });

    return proc;
  }

  async onStop() {
    // Kill all tracked processes
    for (const proc of this.processes) {
      try {
        proc.kill('SIGTERM');
        // Wait for graceful exit
        await this._waitForExit(proc, 5000);
        // Force kill if still running
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      } catch (err) {
        // Ignore ESRCH (process not found)
      }
    }
    this.processes.clear();
  }

  async _waitForExit(proc, timeout) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeout);
      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
```

**Real Example**:
- `src/plugins/recon/concerns/process-manager.js` - Comprehensive process tracking and cleanup

### Browser Instances (Puppeteer)

**Pattern**: Track browsers, close on stop, handle disconnects

```javascript
class BrowserPlugin extends Plugin {
  constructor(options) {
    super(options);
    this.browserPool = [];
    this.dedicatedBrowsers = new Set();
    this.browserIdleTimers = new Map();
  }

  async _createBrowser() {
    const browser = await this.puppeteer.launch(this.config.launch);

    this.browserPool.push(browser);

    // Auto-cleanup on disconnect
    browser.on('disconnected', () => {
      const index = this.browserPool.indexOf(browser);
      if (index > -1) {
        this.browserPool.splice(index, 1);
      }
      this._clearIdleTimer(browser);
    });

    return browser;
  }

  _scheduleIdleClose(browser) {
    const timer = setTimeout(async () => {
      this.browserIdleTimers.delete(browser);
      await browser.close();
    }, this.config.idleTimeout);

    this.browserIdleTimers.set(browser, timer);
  }

  _clearIdleTimer(browser) {
    const timer = this.browserIdleTimers.get(browser);
    if (timer) {
      clearTimeout(timer);
      this.browserIdleTimers.delete(browser);
    }
  }

  async onStop() {
    // Clear all idle timers
    for (const browser of this.browserPool) {
      this._clearIdleTimer(browser);
      try {
        await browser.close();
      } catch (err) {
        // Ignore errors during cleanup
      }
    }
    this.browserPool = [];

    // Close dedicated browsers
    for (const browser of this.dedicatedBrowsers) {
      try {
        await browser.close();
      } catch (err) {
        // Ignore errors
      }
    }
    this.dedicatedBrowsers.clear();
  }
}
```

**Real Example**:
- `src/plugins/puppeteer.plugin.js:643-760` - Browser pool cleanup

### Event Listeners

**Pattern**: Remove listeners on stop

```javascript
class EventPlugin extends Plugin {
  async onStart() {
    this.handlers = {
      data: (data) => this.handleData(data),
      error: (err) => this.handleError(err)
    };

    this.database.on('data', this.handlers.data);
    this.database.on('error', this.handlers.error);
  }

  async onStop() {
    // Remove all listeners
    this.database.off('data', this.handlers.data);
    this.database.off('error', this.handlers.error);
    this.handlers = null;
  }
}
```

### Network Connections (HTTP/WebSocket/Database)

**Pattern**: Close connections, wait for graceful shutdown

```javascript
class ConnectionPlugin extends Plugin {
  async onStart() {
    this.connection = await this.createConnection();
    this.wsServer = new WebSocket.Server({ port: 8080 });
  }

  async onStop() {
    // Close WebSocket server
    if (this.wsServer) {
      await new Promise((resolve) => {
        this.wsServer.close(() => resolve());
      });
      this.wsServer = null;
    }

    // Close database connection
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }
}
```

**Real Example**:
- `src/plugins/api/server.js:243-276` - HTTP server graceful shutdown

### Temporary Directories

**Pattern**: Track temp dirs, remove on stop

```javascript
class TempDirPlugin extends Plugin {
  constructor(options) {
    super(options);
    this.tempDirs = new Set();
  }

  async createTempDir() {
    const dir = `/tmp/plugin-${Date.now()}`;
    await fs.mkdir(dir, { recursive: true });
    this.tempDirs.add(dir);
    return dir;
  }

  async onStop() {
    for (const dir of this.tempDirs) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to remove temp dir ${dir}:`, err.message);
      }
    }
    this.tempDirs.clear();
  }
}
```

**Real Example**:
- `src/plugins/recon/concerns/process-manager.js:243-259` - Temp directory cleanup

## Lifecycle Hooks

s3db.js plugins have several lifecycle hooks for resource management:

### onInstall()
- Create S3DB resources
- Validate dependencies
- Setup initial state

### onStart()
- Initialize connections
- Start timers
- Spawn processes
- Setup event listeners

### onStop()
- **Clear all intervals/timeouts**
- **Kill all spawned processes**
- **Close all connections**
- **Remove event listeners**
- **Delete temp directories**

### onUninstall()
- Call `onStop()` first
- Optionally delete S3DB resources
- Remove any persistent state

### afterUninstall()
- Silent cleanup as fallback
- Called after parent cleanup

## Cleanup Patterns

### Pattern 1: Centralized Cleanup Method

```javascript
class ExamplePlugin extends Plugin {
  async onStop() {
    await this.cleanup();
  }

  async onUninstall() {
    await this.cleanup();
  }

  async cleanup(options = {}) {
    const { silent = false } = options;

    // Timers
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Processes
    for (const proc of this.processes) {
      try {
        proc.kill('SIGTERM');
      } catch (err) {
        if (!silent) {
          console.error('Process kill failed:', err.message);
        }
      }
    }
    this.processes.clear();

    // Connections
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    if (!silent) {
      console.log('[Plugin] Cleanup complete');
    }
  }
}
```

### Pattern 2: Hierarchical Cleanup

```javascript
class ParentPlugin extends Plugin {
  async onStop() {
    // Cleanup child managers first
    if (this.failban) {
      await this.failban.cleanup();
    }

    if (this.metrics) {
      this.metrics.stop();
    }

    // Then own resources
    if (this.server) {
      await this.server.stop();
    }
  }
}
```

**Real Example**:
- `src/plugins/api/server.js:243-276` - Hierarchical cleanup (metrics → failban → oidc → server)

### Pattern 3: Factory-Created Resources

For resources created by factory functions, expose cleanup methods:

```javascript
// Factory function
export function createOIDCMiddleware(options) {
  const client = new OIDCClient(options);

  const middleware = async (req, res, next) => {
    await client.initialize();
    return client.middleware(req, res, next);
  };

  // ✅ Expose cleanup method
  middleware.client = client;
  middleware.destroy = () => client.destroy();

  return middleware;
}

// Plugin using factory
class APIPlugin extends Plugin {
  async onStart() {
    this.oidcMiddleware = createOIDCMiddleware(config);
  }

  async onStop() {
    // ✅ Call exposed cleanup
    if (this.oidcMiddleware?.destroy) {
      this.oidcMiddleware.destroy();
    }
  }
}
```

**Real Example**:
- `src/plugins/api/auth/oidc-client.js:443-463` - OIDC middleware factory with cleanup

## Testing Cleanup

### Manual Testing

```bash
# 1. Start plugin
node your-plugin-test.js

# 2. Check resources (processes, connections, etc.)
ps aux | grep your-tool
lsof -i :8080
ls /tmp/your-plugin-*

# 3. Stop plugin (Ctrl+C)

# 4. Verify cleanup
ps aux | grep your-tool  # Should be empty
lsof -i :8080            # Should be empty
ls /tmp/your-plugin-*    # Should be empty
```

### Automated Testing

```javascript
describe('Plugin Cleanup', () => {
  let plugin;

  beforeEach(async () => {
    plugin = new MyPlugin(config);
    await plugin.onInstall();
    await plugin.onStart();
  });

  afterEach(async () => {
    await plugin.onStop();
  });

  test('should clear all timers on stop', async () => {
    expect(plugin.refreshTimer).not.toBeNull();

    await plugin.onStop();

    expect(plugin.refreshTimer).toBeNull();
  });

  test('should kill all processes on stop', async () => {
    const proc = await plugin.spawn('sleep', ['100']);

    expect(plugin.processes.size).toBe(1);

    await plugin.onStop();

    expect(plugin.processes.size).toBe(0);
    expect(proc.killed).toBe(true);
  });

  test('should close all connections on stop', async () => {
    expect(plugin.connection).toBeDefined();

    await plugin.onStop();

    expect(plugin.connection).toBeNull();
  });
});
```

## Examples by Plugin

### API Plugin

**Resources**:
- HTTP server
- FailbanManager (cleanup timer)
- MetricsCollector (reset timer)
- OIDCClient (JWKS refresh interval)
- Rate limiters (cleanup timers)

**Cleanup Location**: `src/plugins/api/server.js:243-276`

**Pattern**: Hierarchical cleanup
```javascript
async stop() {
  // 1. Stop accepting requests
  this.acceptingRequests = false;

  // 2. Wait for in-flight requests
  await this._gracefulShutdown();

  // 3. Close HTTP server
  if (this.server) {
    await new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  // 4. Cleanup managers
  if (this.metrics) {
    this.metrics.stop();
  }

  if (this.failban) {
    await this.failban.cleanup();
  }

  if (this.oidcMiddleware?.destroy) {
    this.oidcMiddleware.destroy();
  }
}
```

### Recon Plugin

**Resources**:
- Child processes (nmap, subfinder, ffuf, etc.)
- Puppeteer browsers
- Temporary directories

**Cleanup Location**: `src/plugins/recon/index.js:733-774`

**Pattern**: ProcessManager singleton
```javascript
async onStop() {
  console.log('[ReconPlugin] Stopping, cleaning up processes...');
  await this.processManager.cleanup({ silent: false });
}

async onUninstall() {
  console.log('[ReconPlugin] Uninstalling, force cleaning up...');
  await this.processManager.forceCleanup();
}

afterUninstall() {
  super.afterUninstall();
  // Silent cleanup as fallback
  this.processManager.cleanup({ silent: true }).catch(() => {});
}
```

### Puppeteer Plugin

**Resources**:
- Browser pool
- Dedicated browsers
- Browser idle timers
- Cookie/proxy managers

**Cleanup Location**: `src/plugins/puppeteer.plugin.js:383-396`

**Pattern**: Pool cleanup + event handlers
```javascript
async onStop() {
  await this._closeBrowserPool();
  await this._closeDedicatedBrowsers();
  this.initialized = false;
  this.emit('puppeteer.stopped');
}

async _closeBrowserPool() {
  for (const browser of this.browserPool) {
    this._clearIdleTimer(browser);
    try {
      await browser.close();
    } catch (err) {
      // Ignore errors during cleanup
    }
  }
  this.browserPool = [];
  this.tabPool.clear();
}
```

### Cookie Farm Plugin

**Resources**:
- Depends on PuppeteerPlugin (no direct resources)
- Persona pool (in-memory)

**Cleanup Location**: `src/plugins/cookie-farm.plugin.js:237-249`

**Pattern**: Simple state reset
```javascript
async onStop() {
  this.initialized = false;
  this.emit('cookieFarm.stopped');
}
```

## Best Practices Summary

1. ✅ **Always** clear intervals/timeouts in `onStop()`
2. ✅ **Always** kill spawned processes in `onStop()`
3. ✅ **Always** close connections in `onStop()`
4. ✅ **Always** remove event listeners in `onStop()`
5. ✅ **Always** nullify resources after cleanup
6. ✅ **Always** handle cleanup errors gracefully
7. ✅ **Test** cleanup with `ps`, `lsof`, `ls /tmp`
8. ✅ **Document** resource lifecycle in plugin docs
9. ✅ **Expose** cleanup methods for factory-created resources
10. ✅ **Use** ProcessManager for process tracking

## Common Pitfalls

### ❌ Not clearing intervals

```javascript
// BAD
constructor() {
  setInterval(() => this.refresh(), 60000);
}
// Timer keeps running forever!
```

### ❌ Not killing spawned processes

```javascript
// BAD
async execute() {
  const proc = spawn('long-running-tool');
  // Process becomes orphaned when plugin stops!
}
```

### ❌ Not removing event listeners

```javascript
// BAD
async onStart() {
  this.database.on('data', this.handleData);
}
// Listener keeps firing after plugin stops!
```

### ❌ Not closing connections

```javascript
// BAD
async onStart() {
  this.connection = await connect();
}
// Connection stays open forever!
```

### ❌ Not handling cleanup errors

```javascript
// BAD
async onStop() {
  await this.server.stop(); // May throw!
}

// GOOD
async onStop() {
  try {
    await this.server.stop();
  } catch (err) {
    console.error('Server stop failed:', err.message);
  }
}
```

## References

- **Process Cleanup**: `docs/plugins/recon/PROCESS-CLEANUP.md`
- **Plugin Lifecycle**: `docs/plugins/PLUGIN-LIFECYCLE.md`
- **Resource Class**: `src/resource.class.js`
- **Plugin Base**: `src/plugins/plugin.class.js`

## Related Issues

- ProcessManager implementation: Prevents orphaned Chrome/Puppeteer processes
- OIDC client cleanup: Fixed memory leak from unclosed intervals
- Rate limiter cleanup: Already implemented correctly
- Failban cleanup: Already implemented correctly
- Metrics cleanup: Already implemented correctly
