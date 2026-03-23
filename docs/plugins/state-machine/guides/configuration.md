# Configuration

> What this guide covers: the actual configuration surface of `StateMachinePlugin`, including machine definitions, guards, actions, triggers, persistence, and concurrency options.

**Audience:** Developers defining or reviewing a workflow
**Time to read:** 10 min
**Difficulty:** Intermediate

---

## Plugin Options

```javascript
new StateMachinePlugin({
  resourceNames: {
    transitionLog: 'custom_transition_log_resource',
    states: 'custom_state_resource'
  },
  stateMachines: {
    order: {
      resource: 'orders',
      stateField: 'status',
      initialState: 'draft',
      autoCleanup: true,
      retryConfig: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        baseDelay: 500,
        maxDelay: 5000
      },
      states: {
        draft: {
          on: {
            SUBMIT: 'pending_payment'
          }
        },
        pending_payment: {
          on: {
            PAY: 'paid'
          },
          guards: {
            PAY: 'canPay'
          }
        },
        paid: { type: 'final' }
      }
    }
  },
  actions: {
    myAction: async (context, event, machine) => {}
  },
  guards: {
    canPay: async (context, event, machine) => true
  },
  persistTransitions: true,
  transitionLogResource: 'plg_state_transitions',
  stateResource: 'plg_entity_states',
  concurrency: {
    mode: 'serial', // serial | parallel
    conflict: 'reject' // reject | drop
  },
  retryAttempts: 3,
  retryDelay: 100,
  workerId: 'default',
  lockTimeout: 1000,
  lockTTL: 5,
  retryConfig: {
    maxAttempts: 2,
    backoffStrategy: 'linear',
    baseDelay: 1000,
    maxDelay: 4000
  },
  enableScheduler: true,
  schedulerConfig: {},
  enableDateTriggers: true,
  enableFunctionTriggers: true,
  enableEventTriggers: true,
  triggerCheckInterval: 1000,
  logLevel: 'info'
});
```

---

## Machine Definition

Each entry in `stateMachines` defines one machine.

```javascript
stateMachines: {
  order: {
    resource: 'orders',
    stateField: 'status',
    initialState: 'draft',
    autoCleanup: true,
    states: {
      draft: {
        on: {
          SUBMIT: 'pending_payment',
          CANCEL: 'cancelled'
        }
      },
      pending_payment: {
        on: {
          PAY: 'paid',
          FAIL: 'payment_failed'
        },
        guards: {
          PAY: 'paymentHasAmount'
        }
      },
      paid: {
        on: {
          SHIP: 'shipped'
        },
        entry: 'markPaid',
        exit: 'beforeShipping',
        retryConfig: {
          maxAttempts: 3
        }
      },
      shipped: { type: 'final' },
      payment_failed: { type: 'final' },
      cancelled: { type: 'final' }
    }
  }
}
```

Supported machine-level fields:
- `initialState`
- `states`
- `resource`
- `stateField`
- `retryConfig`
- `autoCleanup`
- `config`
- `concurrency`

Supported state-level fields:
- `on`
- `type`
- `entry`
- `exit`
- `guards`
- `meta`
- `triggers`
- `retryConfig`

## Schema-first binding (`resource.$schema.stateMachine`)

You can bind a machine to a resource from the resource definition itself.

```javascript
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    id: 'string|required',
    status: 'string|required'
  },
  behavior: 'body-only'
});

orders.$schema = {
  stateMachine: 'order'
};

const stateMachine = new StateMachinePlugin({
  stateMachines: {
    order: {
      initialState: 'draft',
      states: {
        draft: { on: { SUBMIT: 'submitted' } },
        submitted: { type: 'final' }
      }
    }
  },
  persistTransitions: false
});
```

`stateMachine` supports two forms:
- string shorthand:
  - `stateMachine: 'order'`
- object:
  - `stateMachine: { machine: 'order', stateField?: 'status', autoCleanup?: true }`

Object form notes:
- `stateField` defines which field is synchronized with machine state.
- `autoCleanup` controls delete hooks.
- when `stateField` is not provided and the resource has `status` in schema attributes, that field is used as default.

Important constraints:
- one resource exposes **at most one** `resource.state` binding.
- one machine can be schema-bound to only one resource.
- this does not block additional plugin-level machines; they remain reachable via `db.stateMachine('anotherMachine')`.

When both declaration styles are present, schema-binding becomes the single source of truth:
- set `resource: 'orders'` in the machine and also define `resource.$schema.stateMachine` on that resource, both should resolve to the same lifecycle intent.
- if `resource.$schema.stateMachine` is present, that machine is attached with priority to `resource.state`.

Use schema-first binding to make intent explicit and easy to discover:
- model teams can read it when creating the resource
- migration and observability scripts can discover this value directly from schema metadata
- plugin authors still keep freedom to define multiple machines in `stateMachines` for advanced orchestration.

---

## Persistence Options

### `persistTransitions`

When `true`, the plugin persists:
- current entity state
- transition history

When `false`, state is in memory only.

### `transitionLogResource` and `stateResource`

Override the internal resource names when needed.

```javascript
const plugin = new StateMachinePlugin({
  persistTransitions: true,
  transitionLogResource: 'workflow_transition_log',
  stateResource: 'workflow_current_state',
  stateMachines: {
    order: {
      initialState: 'draft',
      states: {
        draft: { on: { SUBMIT: 'submitted' } },
        submitted: { type: 'final' }
      }
    }
  }
});
```

---

## Concurrency Options

Transitions are protected by locks through plugin storage and can be tuned with global or machine-level policies.

Global defaults:

```javascript
const plugin = new StateMachinePlugin({
  concurrency: {
    mode: 'serial', // serial | parallel
    conflict: 'reject' // reject | drop
  },
  workerId: 'orders-worker-a',
  lockTimeout: 2000,
  lockTTL: 10,
  stateMachines: {
    order: {
      initialState: 'draft',
      states: {
        draft: { on: { SUBMIT: 'submitted' } },
        submitted: { type: 'final' }
      }
    }
  }
});
```

`serial` uses a per-instance lock; `parallel` skips the lock and allows concurrent execution.
`conflict: 'reject'` returns `CONCURRENCY_CONFLICT` when the lock is busy; `'drop'` returns
`CONCURRENCY_CONFLICT_DROP` and does not execute the transition.

You can override concurrency per machine:

```javascript
stateMachines: {
  order: {
    concurrency: {
      mode: 'parallel',
      conflict: 'drop'
    },
    initialState: 'draft',
    states: {
      draft: { on: { SUBMIT: 'submitted' } },
      submitted: { type: 'final' }
    }
  }
}
```

Use these options to tune contention behavior:
- `workerId`
- `lockTimeout`
- `lockTTL`

Optimistic concurrency with versioning is available in each transition payload using `stateVersion`.
Pass the last known version in `send(...)` to force `STATE_VERSION_MISMATCH` when stale.

---

## Retry Configuration

The plugin supports retry configuration globally, per machine, and per state.

```javascript
retryConfig: {
  maxAttempts: 3,
  backoffStrategy: 'exponential',
  baseDelay: 500,
  maxDelay: 5000,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET'],
  nonRetriableErrors: ['ValidationError'],
  onRetry: async (attempt, error, context) => {
    // Emit telemetry or persist retry diagnostics here.
  }
}
```

---

## Recommended Baseline

For most business workflows, start here:

```javascript
new StateMachinePlugin({
  persistTransitions: true,
  lockTimeout: 1000,
  lockTTL: 5,
  triggerCheckInterval: 1000,
  stateMachines: {
    order: {
      resource: 'orders',
      stateField: 'status',
      initialState: 'draft',
      states: {
        draft: {
          on: { SUBMIT: 'submitted' }
        },
        submitted: { type: 'final' }
      }
    }
  }
});
```

Then add guards, actions, and triggers only where the lifecycle actually needs them.

---

## Recommended Design Split

A reliable machine usually follows this division of responsibilities:

- `states.on`: the allowed transition map
- `guards`: permission checks and domain validation
- `entry` actions: side effects that happen after a successful transition
- `exit` actions: cleanup or audit before leaving a state
- `triggers`: automation that decides when a transition should happen without a direct caller
- `retryConfig`: resilience for flaky side effects, not for invalid business logic

See the focused guides for each concept:
- [States](/plugins/state-machine/states.md)
- [Actions](/plugins/state-machine/actions.md)
- [Guards](/plugins/state-machine/guards.md)
- [Triggers](/plugins/state-machine/triggers.md)
- [Retries](/plugins/state-machine/retries.md)
