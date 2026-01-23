## Configuration Options

### State Machine Configuration

```javascript
{
  stateMachines: {
    [machineName]: {
      initialState: string,           // Initial state for new instances
      states: {
        [stateName]: {
          on?: { [event]: targetState }, // Event transitions
          entry?: string | function,     // Action on state entry
          exit?: string | function,      // Action on state exit
          guards?: { [event]: string },  // Guard conditions
          type?: 'final'                 // Mark as final state
        }
      },
      resource?: string,                // Resource to attach (enables resource.state.* API)
      stateField?: string,              // Field that stores state in the resource
      autoCleanup?: boolean,            // Auto-delete state/history on record delete (default: true)
      context?: object,                 // Default context data
      strict?: boolean                  // Strict mode (default: true)
    }
  },
  actions: {
    [actionName]: function             // Named action functions
  },
  guards: {
    [guardName]: function              // Named guard functions
  },
  stateField: string,                  // Global field name for state (default: '_state')

  // Concurrency Control (Distributed Locks)
  workerId: string,                    // Worker identifier (default: 'default')
  lockTimeout: number,                 // Max wait for lock in ms (default: 1000)
  lockTTL: number                      // Lock TTL in seconds (default: 5)
}
```

### Concurrency Control

The plugin uses **distributed locks** (via PluginStorage) to prevent concurrent transitions for the same entity, ensuring state consistency in multi-worker environments.

```javascript
new StateMachinePlugin({
  stateMachines: { /* ... */ },

  // Configure distributed locking
  workerId: 'worker-1',      // Unique worker identifier
  lockTimeout: 2000,         // Wait up to 2s for lock acquisition
  lockTTL: 10                // Lock expires after 10s (prevent deadlock)
});
```

**How it works:**
1. Before each transition, a distributed lock is acquired for `{machineId}-{entityId}`
2. If lock cannot be acquired within `lockTimeout`, transition fails with error
3. Lock is automatically released after transition completes (success or failure)
4. If worker crashes, lock expires after `lockTTL` seconds (auto-recovery)

**Benefits:**
- ✅ Prevents race conditions in concurrent transitions
- ✅ Automatic deadlock prevention (TTL)
- ✅ Multi-worker safe (different workers can't corrupt state)
- ✅ Transparent (no API changes required)

### State Definition

```javascript
states: {
  // Basic state with transitions
  pending: {
    on: {
      APPROVE: 'approved',
      REJECT: 'rejected'
    }
  },
  
  // State with entry action
  approved: {
    on: { PROCESS: 'processing' },
    entry: 'onApproved'  // Calls actions.onApproved
  },
  
  // State with guard condition
  processing: {
    on: { COMPLETE: 'completed' },
    guards: { COMPLETE: 'canComplete' }  // Must pass guards.canComplete
  },
  
  // Final state
  completed: {
    type: 'final'
  }
}
```

---
