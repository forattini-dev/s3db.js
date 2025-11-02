# ReconPlugin - Automatic Process Cleanup

## Problem

ReconPlugin spawns external tools (Chrome/Puppeteer for screenshots, command-line tools, etc.) that can become orphaned if:
- The Node.js process crashes
- Uncaught exceptions occur
- The plugin stops abruptly
- The user terminates the process (Ctrl+C)

This leads to:
- **High CPU usage**: 30+ orphaned Chrome processes consuming 15-20% CPU
- **Memory leaks**: Accumulated Puppeteer temp directories
- **Resource exhaustion**: Processes never cleaned up

### Real Example (Before Fix)

```bash
$ ps aux | grep chrome | wc -l
34  # 34 Chrome processes running!

$ ls -la /tmp/puppeteer_dev_profile-* | wc -l
28  # 28 temp directories

$ top
...
ff    33866  0.5  0.1  chrome --puppeteer
ff    34042  0.4  0.1  chrome --puppeteer
ff    34226  0.5  0.1  chrome --puppeteer
... (30 more lines)

CPU usage: 15-20% from orphaned processes
```

## Solution: ProcessManager

A singleton `ProcessManager` that automatically:
1. **Tracks** all spawned child processes
2. **Cleans up** on process exit (SIGINT, SIGTERM, SIGHUP)
3. **Handles crashes** (uncaughtException, unhandledRejection)
4. **Force kills** stuck processes (SIGKILL after 5s timeout)
5. **Removes temp directories** (Puppeteer profiles, etc.)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Process Lifecycle                     │
└─────────────────────────────────────────────────────────┘

1. Spawn Process
   ├─> processManager.track(childProcess, { name, tempDir })
   └─> Add to tracking set

2. Normal Exit
   ├─> Process emits 'exit'
   └─> Auto-remove from tracking

3. Plugin Stop/Uninstall
   ├─> plugin.onStop() / plugin.onUninstall()
   └─> processManager.cleanup()
       ├─> Send SIGTERM (graceful)
       ├─> Wait 5 seconds
       ├─> Send SIGKILL (force) if still running
       └─> Remove temp directories

4. Process Crash/SIGINT
   ├─> Signal handler triggered
   └─> processManager.cleanup()
       ├─> Cleanup all tracked processes
       ├─> Find orphaned Puppeteer processes (pgrep)
       ├─> Kill with SIGKILL
       ├─> Remove /tmp/puppeteer_dev_profile-*
       └─> Exit

┌─────────────────────────────────────────────────────────┐
│                  Cleanup Triggers                        │
└─────────────────────────────────────────────────────────┘

• SIGINT (Ctrl+C)
• SIGTERM (kill PID)
• SIGHUP (terminal close)
• uncaughtException
• unhandledRejection
• process.beforeExit
• plugin.onStop()
• plugin.onUninstall()
```

## Usage

### Automatic (ReconPlugin)

All cleanup is automatic - nothing to do!

```javascript
import { ReconPlugin } from 's3db.js/plugins/recon';

const plugin = new ReconPlugin({ ... });

// Cleanup happens automatically on:
// - Ctrl+C
// - process.exit()
// - crashes
// - plugin.stop()
// - plugin.uninstall()
```

### Manual (Custom Stages)

If you're adding custom stages that spawn processes:

```javascript
import { processManager } from './concerns/process-manager.js';
import { spawn } from 'child_process';

export class CustomStage {
  async execute(target) {
    // Spawn a child process
    const child = spawn('some-tool', ['--arg', target]);

    // Track it for automatic cleanup
    processManager.track(child, {
      name: 'custom-tool',
      tempDir: '/tmp/custom-tool-temp'  // Optional
    });

    // Process will be cleaned up automatically
    return await waitForProcess(child);
  }
}
```

### Manual Cleanup (if needed)

```javascript
import { processManager } from './concerns/process-manager.js';

// Graceful cleanup (SIGTERM, 5s timeout, then SIGKILL)
await processManager.cleanup();

// Force cleanup (immediate SIGKILL)
await processManager.forceCleanup();

// Silent cleanup (no console logs)
await processManager.cleanup({ silent: true });

// Get tracked processes
const processes = processManager.getProcesses();
// [{ pid, name, uptime }, ...]

// Get count
const count = processManager.getProcessCount();
```

## Implementation Details

### Process Tracking

```javascript
class ProcessManager {
  constructor() {
    this.processes = new Set(); // Tracked processes
    this.tempDirs = new Set();   // Temp directories to cleanup
  }

  track(process, options = {}) {
    this.processes.add({
      process,        // Child process object
      pid,            // Process ID
      name,           // Human-readable name
      startTime       // Timestamp
    });

    // Auto-remove when process exits
    process.on('exit', () => this._removeProcess(pid));
  }
}
```

### Signal Handlers

```javascript
// SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
  console.log('\n[ProcessManager] Received SIGINT, cleaning up...');
  await processManager.cleanup();
  process.exit(0);
});

// SIGTERM (kill PID)
process.on('SIGTERM', async () => { ... });

// Uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('[ProcessManager] Uncaught exception:', error);
  await processManager.cleanup();
  process.exit(1);
});
```

### Cleanup Logic

```javascript
async cleanup(options = {}) {
  // 1. Kill tracked processes
  for (const tracked of this.processes) {
    await this._killProcess(tracked, force);
  }

  // 2. Remove temp directories
  for (const dir of this.tempDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }

  // 3. Kill orphaned Puppeteer processes
  await this._cleanupOrphanedPuppeteer();
}

async _killProcess(tracked, force) {
  const signal = force ? 'SIGKILL' : 'SIGTERM';

  try {
    process.kill(tracked.pid, signal);

    // If SIGTERM, wait 5s for graceful exit
    if (!force) {
      await this._waitForProcessExit(tracked.pid, 5000);

      // Still alive? Force kill
      if (this._isProcessRunning(tracked.pid)) {
        process.kill(tracked.pid, 'SIGKILL');
      }
    }
  } catch (error) {
    // Ignore ESRCH (process not found)
  }
}
```

### Orphan Cleanup

```javascript
async _cleanupOrphanedPuppeteer(silent) {
  // Find orphaned Chrome/Puppeteer processes
  const { stdout } = await execAsync('pgrep -f "chrome.*puppeteer" || true');

  if (stdout.trim()) {
    const pids = stdout.trim().split('\n');
    for (const pid of pids) {
      process.kill(parseInt(pid), 'SIGKILL');
    }
  }

  // Remove temp directories
  const puppeteerDirs = fs.readdirSync('/tmp')
    .filter(name => name.startsWith('puppeteer_dev_profile-'))
    .map(name => `/tmp/${name}`);

  for (const dir of puppeteerDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
```

## Lifecycle Integration

### ReconPlugin Hooks

```javascript
export class ReconPlugin extends Plugin {
  constructor(config) {
    super(config);
    this.processManager = processManager; // Singleton
  }

  async onStop() {
    console.log('[ReconPlugin] Stopping, cleaning up processes...');
    await this.processManager.cleanup({ silent: false });
  }

  async onUninstall(options) {
    console.log('[ReconPlugin] Uninstalling, force cleaning up...');
    await this.processManager.forceCleanup();
  }

  afterUninstall() {
    super.afterUninstall();
    // Silent cleanup as fallback
    this.processManager.cleanup({ silent: true }).catch(() => {});
  }
}
```

## Testing

### Verify Cleanup Works

```bash
# Terminal 1: Run a recon scan
node docs/examples/e52-recon-new-features.js

# Terminal 2: Check processes (should see Chrome instances)
ps aux | grep chrome | grep puppeteer

# Terminal 1: Press Ctrl+C
# (Should see cleanup messages)

# Terminal 2: Check processes again
ps aux | grep chrome | grep puppeteer
# (Should be empty)

# Check temp directories
ls /tmp/puppeteer_dev_profile-*
# (Should be empty or "No such file")
```

### Test Crash Cleanup

```javascript
// Add to test file
process.on('uncaughtException', () => {}); // Prevent default handler
throw new Error('Simulated crash');

// Should see:
// [ProcessManager] Uncaught exception: Error: Simulated crash
// [ProcessManager] Cleaning up 3 tracked process(es)...
// [ProcessManager] Killing chrome-puppeteer (PID: 12345) with SIGTERM...
// [ProcessManager] Cleanup complete
```

## Performance Impact

- **Negligible overhead**: Tracking processes is O(1)
- **Cleanup time**: < 5 seconds (SIGTERM wait + SIGKILL)
- **Memory**: ~100 bytes per tracked process
- **CPU**: Only during cleanup, minimal

## Debugging

### Enable Verbose Logging

```javascript
await processManager.cleanup({ silent: false });
```

Output:
```
[ProcessManager] Cleaning up 3 tracked process(es)...
[ProcessManager] Killing puppeteer-screenshot (PID: 12345) with SIGTERM...
[ProcessManager] Force killing puppeteer-screenshot (PID: 12345)...
[ProcessManager] Cleaning up 2 temporary directory(ies)...
[ProcessManager] Removed temp directory: /tmp/puppeteer_dev_profile-abc123
[ProcessManager] Found 5 orphaned Puppeteer process(es), killing...
[ProcessManager] Cleaning up 3 orphaned Puppeteer temp dir(s)...
[ProcessManager] Cleanup complete
```

### Check Tracked Processes

```javascript
console.log(processManager.getProcesses());
// [
//   { pid: 12345, name: 'chrome-puppeteer', uptime: 45230 },
//   { pid: 12346, name: 'screenshot-tool', uptime: 12450 }
// ]

console.log(`Tracking ${processManager.getProcessCount()} processes`);
```

### Manual Orphan Check

```bash
# Find orphaned Puppeteer processes
pgrep -f "chrome.*puppeteer"

# Find temp directories
ls -la /tmp/puppeteer_dev_profile-*

# Kill manually if needed
pkill -9 -f "chrome.*puppeteer"
rm -rf /tmp/puppeteer_dev_profile-*
```

## Best Practices

1. **Always track spawned processes**:
   ```javascript
   const child = spawn('tool', args);
   processManager.track(child, { name: 'tool-name' });
   ```

2. **Track temp directories**:
   ```javascript
   const tempDir = '/tmp/my-tool-temp';
   processManager.trackTempDir(tempDir);
   // OR
   processManager.track(child, { tempDir });
   ```

3. **Use descriptive names**:
   ```javascript
   processManager.track(child, { name: 'puppeteer-screenshot-github.com' });
   // Better than: { name: 'chrome' }
   ```

4. **Don't call cleanup() in normal code**:
   - Cleanup is automatic
   - Only call manually in tests or special cases

5. **Handle errors gracefully**:
   ```javascript
   child.on('error', (error) => {
     console.error('Process error:', error);
     // ProcessManager will auto-cleanup
   });
   ```

## Limitations

1. **Singleton**: One global ProcessManager instance
   - Shared across all ReconPlugin instances
   - Fine for most use cases

2. **Process detection**: Uses `pgrep -f "chrome.*puppeteer"`
   - May miss processes with different naming
   - Customize regex if needed

3. **SIGKILL timeout**: Fixed 5 seconds
   - May not be enough for very large processes
   - Adjust in `_waitForProcessExit()` if needed

4. **No process recovery**: Only cleanup, no restart
   - If you need restart, implement separately

## Troubleshooting

### Processes Not Cleaned Up

**Check 1**: Verify tracking
```javascript
console.log(processManager.getProcessCount());
// Should show > 0 if processes are tracked
```

**Check 2**: Verify signal handlers are registered
```javascript
// Should see this on first ProcessManager creation:
// (handlers auto-registered in constructor)
```

**Check 3**: Check for errors
```javascript
await processManager.cleanup({ silent: false });
// Look for error messages
```

### Cleanup Takes Too Long

**Cause**: Processes not responding to SIGTERM

**Solution**: Use force cleanup
```javascript
await processManager.forceCleanup();
```

### Orphans Still Present

**Cause**: Processes started before ProcessManager

**Solution**: Manual cleanup
```bash
pkill -9 -f "chrome.*puppeteer"
rm -rf /tmp/puppeteer_dev_profile-*
```

## Related Files

- **Implementation**: `src/plugins/recon/concerns/process-manager.js`
- **Integration**: `src/plugins/recon/index.js` (lines 141, 733-745, 765-774)
- **Tests**: (TODO: Add unit tests)

## Future Improvements

- [ ] Add unit tests for ProcessManager
- [ ] Support custom timeout per process
- [ ] Add process restart capability
- [ ] Track process resource usage (CPU, memory)
- [ ] Emit events for process lifecycle
- [ ] Add metrics (processes spawned, cleaned up, orphaned)
- [ ] Support custom orphan detection patterns
- [ ] Add process grouping/tagging

## References

- Node.js Process Events: https://nodejs.org/api/process.html#process-events
- Signal Handling: https://nodejs.org/api/process.html#signal-events
- Child Process: https://nodejs.org/api/child_process.html
