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

Supported state-level fields:
- `on`
- `type`
- `entry`
- `exit`
- `guards`
- `meta`
- `triggers`
- `retryConfig`

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

Transitions are protected by locks through plugin storage.

```javascript
const plugin = new StateMachinePlugin({
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

Use these options to tune contention behavior:
- `workerId`
- `lockTimeout`
- `lockTTL`

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
