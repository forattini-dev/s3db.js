# State Machine Plugin

> Model complex workflows with explicit states, guarded transitions, triggers, persistence, and audit history.
>
> **Navigation:** [Plugin Index](/plugins/README.md) | [Guides Index](/plugins/state-machine/guides/README.md) | [API & Usage](/plugins/state-machine/guides/api-reference.md)

---

## TLDR

Use `StateMachinePlugin` when a resource has a lifecycle that must be controlled instead of patched ad hoc.

- Define states and allowed events.
- Add guards to block invalid transitions.
- Add actions for entry and exit side effects.
- Persist current state and transition history.
- Attach the machine to a resource for `resource.state.*` shortcuts.
- Bind machines directly from resource schema (`resource.$schema.stateMachine`) for schema-first plugins.

```javascript
import { Database, StateMachinePlugin } from 's3db.js';

const db = new Database({ connectionString: 'memory://' });
await db.connect();

// Create the business resource first.
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    customerId: 'string|required',
    total: 'number|required',
    status: 'string|required'
  }
});

const stateMachine = new StateMachinePlugin({
  stateMachines: {
    order: {
      resource: 'orders',
      stateField: 'status',
      initialState: 'draft',
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
            PAY: 'hasPaymentAmount'
          }
        },
        paid: {
          on: {
            SHIP: 'shipped'
          },
          entry: 'markPaid'
        },
        shipped: { type: 'final' },
        payment_failed: { type: 'final' },
        cancelled: { type: 'final' }
      }
    }
  },
  guards: {
    hasPaymentAmount: async (context) => {
      // Block payment transitions when the event payload is incomplete.
      return typeof context.amount === 'number' && context.amount > 0;
    }
  },
  actions: {
    markPaid: async (context, event, machine) => {
      // Record side effects when the machine enters "paid".
      await machine.database.resources.orders.patch(machine.entityId, {
        paidAt: new Date().toISOString()
      });
    }
  }
});

await db.usePlugin(stateMachine);

// Initialize machine state for this entity.
await db.stateMachine('order').initializeEntity('order-123', {
  orderId: 'order-123'
});

// Send an event through the machine API.
await db.stateMachine('order').send('order-123', 'SUBMIT');

// Resource shortcut API is available when `resource` is configured.
await orders.state.send('order-123', 'PAY', {
  amount: 149.9
});
```

Use this plugin when:
- A record must follow a controlled lifecycle.
- Multiple workers may touch the same entity.
- You need audit history for transitions.
- You need automatic transitions from events, dates, cron jobs, or polling.

Do not use it when:
- The field is just an informal label.
- The lifecycle has no rules, no history, and no side effects.

---

## Core Mental Model

The plugin has three layers:

1. Machine definition
   Define `initialState`, `states`, `guards`, `actions`, and optional triggers.
2. Runtime API
   Use `send()`, `getState()`, `getValidEvents()`, `getTransitionHistory()`, and related methods.
3. Resource integration
   When `resource` is configured, the plugin injects `resource.state.*` shortcuts and can keep a `stateField` in sync.

Typical transition flow:

```text
event -> acquire lock -> read current state -> validate event
      -> run guard -> run exit action -> persist state/history
      -> run entry action -> emit transition event
```

That matters because this plugin is not just a transition table. It also handles:
- concurrency control
- persistence
- audit history
- async event synchronization
- trigger-driven transitions

---

## What The Plugin Gives You

This plugin is powerful because it combines workflow modeling with runtime behavior.

## Capability Overview

| Capability | What it gives you | Where to go deeper |
|------------|-------------------|--------------------|
| States | Explicit lifecycle modeling with legal transitions | [States](/plugins/state-machine/states.md) |
| Actions | Entry and exit side effects | [Actions](/plugins/state-machine/actions.md) |
| Guards | Business-rule validation before transitions | [Guards](/plugins/state-machine/guards.md) |
| Triggers | Automatic event-driven and time-driven workflow movement | [Triggers](/plugins/state-machine/triggers.md) |
| State TTL | Auto-expire states after a duration; persistent across restarts | [State Machine](/plugins/state-machine.md#state-ttl) |
| Retries | Resilience for unstable action side effects | [Retries](/plugins/state-machine/retries.md) |
| Resource API | `resource.state.*` helpers for attached resources | [API Reference](/plugins/state-machine/guides/api-reference.md) |
| Persistence | Current state recovery and transition history | [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md) |
| Concurrency | Per-entity locks for safe multi-worker transitions | [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md) |
| Async coordination | `waitForPendingEvents()` for async trigger settlement | [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md) |
| Visualization | GraphViz export for review and documentation | [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md) |

---

### States

States are the backbone of the workflow.

They define:
- where an entity is in its lifecycle
- which events are legal from that point
- which states are terminal

Example:

```javascript
states: {
  draft: {
    on: {
      SUBMIT: 'pending_review',
      CANCEL: 'cancelled'
    }
  },
  pending_review: {
    on: {
      APPROVE: 'approved',
      REJECT: 'rejected'
    }
  },
  approved: { type: 'final' },
  rejected: { type: 'final' },
  cancelled: { type: 'final' }
}
```

See [States](/plugins/state-machine/states.md).

### Actions

Actions run side effects on state entry or exit.

Use them for:
- notifications
- audit records
- business record updates
- job dispatch
- integration side effects

Example:

```javascript
actions: {
  recordApproval: async (context, event, machine) => {
    // Persist side effects when the entity enters the approved state.
    await machine.database.resources.requests.patch(machine.entityId, {
      approvedAt: new Date().toISOString(),
      approvedBy: context.approverId
    });
  }
}
```

See [Actions](/plugins/state-machine/actions.md).

### Guards

Guards block invalid transitions before state changes.

Use them for:
- authorization
- business validation
- inventory checks
- approval thresholds

Example:

```javascript
guards: {
  canApprove: async (context, event, machine) => {
    // Only allow approval when the actor has enough authority.
    const approver = await machine.database.resources.approvers.get(context.approverId);
    return approver?.approvalLimit >= context.amount;
  }
}
```

See [Guards](/plugins/state-machine/guards.md).

### Triggers

Triggers automate work or transitions while an entity stays in a state.

Supported trigger types:
- `event`
- `function`
- `date`
- `cron`

Example:

```javascript
pending: {
  triggers: [
    {
      type: 'event',
      eventName: 'updated',
      eventSource: invoices,
      sendEvent: 'CONFIRM_PAYMENT',
      condition: async (context, entityId, payload) => {
        // Advance automatically when payment is confirmed.
        return payload?.data?.paymentStatus === 'confirmed';
      }
    }
  ],
  on: {
    CONFIRM_PAYMENT: 'paid'
  }
}
```

When event trigger payloads include `entityId` or `id`, the runtime resolves the subscribed entity directly. If the payload has no entity identifier, the plugin falls back to the broader state-level broadcast path.

See [Triggers](/plugins/state-machine/triggers.md).

### Retries

Retries make action execution resilient when side effects touch unstable systems.

They support:
- fixed, linear, and exponential backoff
- retryable and non-retriable error classification
- retry hooks for telemetry
- configuration at global, machine, and state scope

Example:

```javascript
processing: {
  entry: 'dispatchTransfer',
  retryConfig: {
    maxAttempts: 4,
    backoffStrategy: 'exponential',
    baseDelay: 1000,
    maxDelay: 8000
  },
  on: {
    COMPLETE: 'paid',
    FAIL: 'failed'
  }
}
```

See [Retries](/plugins/state-machine/retries.md).

### Resource Integration

Attach a machine to a resource and the plugin injects `resource.state.*`.

That gives you:
- `resource.state.send()`
- `resource.state.get()`
- `resource.state.canTransition()`
- `resource.state.getValidEvents()`
- `resource.state.initialize()`
- `resource.state.history()`
- `resource.state.transitions()`
- `resource.state.transition()`
- `resource.state.transitionCount()`
- `resource.state.getLastTransitions()`
- `resource.state.snapshot()`
- `resource.state.delete()`

You can configure this in two equivalent ways:

- Explicitly in the machine definition (`resource: 'orders'`)
- Declaratively in resource schema (`resource.$schema.stateMachine`)

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
  stateMachine: {
    machine: 'order',
    stateField: 'status', // optional, defaults to schema `status` if present
    autoCleanup: true // optional, defaults to machine config
  }
};
```

`resource.$schema.stateMachine` also accepts simple shorthand:

```javascript
orders.$schema = { stateMachine: 'order' };
```

Important: a resource has at most one `state` shortcut surface. If your plugin defines multiple machines, additional machines are still available through `db.stateMachine(...)`, while only the schema-bound or configured machine is available as `orders.state`.

Example:

```javascript
await orders.state.send('order-42', 'PAY', {
  amount: 199.9
});

const state = await orders.state.get('order-42');
const history = await orders.state.history('order-42', {
  limit: 10,
  offset: 0
});
```

See [API Reference](/plugins/state-machine/guides/api-reference.md).

### Persistence and History

With `persistTransitions: true`, the plugin stores:
- current entity state
- transition history

That enables:
- restart recovery
- audit timelines
- support tooling
- workflow introspection

Example:

```javascript
const plugin = new StateMachinePlugin({
  persistTransitions: true,
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

const history = await plugin.getTransitionHistory('order', 'order-42', {
  limit: 10,
  offset: 0
});
```

See [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md).

### Concurrency Control

Transitions use per-entity locks so two workers do not mutate the same lifecycle simultaneously.

This matters when:
- web workers race on the same record
- triggers and manual commands can overlap
- multiple services can act on the same entity

Example:

```javascript
const plugin = new StateMachinePlugin({
  workerId: 'orders-worker-a',
  lockTimeout: 2000,
  lockTTL: 10,
  stateMachines: {
    order: {
      initialState: 'pending',
      states: {
        pending: { on: { PAY: 'paid' } },
        paid: { type: 'final' }
      }
    }
  }
});
```

See [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md).

### Async Event Coordination

When event triggers run through async resource events, `waitForPendingEvents()` gives you a safe synchronization point before reading final state.

Example:

```javascript
await invoices.update('invoice-1', {
  paymentStatus: 'confirmed'
});

await plugin.waitForPendingEvents(5000);

const state = await invoices.state.get('invoice-1');
```

See [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md).

### Visualization

`visualize(machineId)` exports GraphViz DOT so the machine can be reviewed and documented visually.

Example:

```javascript
const dot = plugin.visualize('order');
console.log(dot);
```

See [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md).

Together, these features make the plugin useful not just for state transitions, but for full workflow orchestration.

---

## Quick Start

This example shows the shape you will use in production: a real resource, a synced state field, a guard, an action, and history.

```javascript
import { Database, StateMachinePlugin } from 's3db.js';

const db = new Database({ connectionString: 'memory://' });
await db.connect();

// Business resource that owns the workflow.
const tickets = await db.createResource({
  name: 'tickets',
  attributes: {
    title: 'string|required',
    priority: 'string|required',
    status: 'string|required',
    assignedTo: 'string'
  }
});

const plugin = new StateMachinePlugin({
  persistTransitions: true,
  stateMachines: {
    support_ticket: {
      resource: 'tickets',
      stateField: 'status',
      initialState: 'open',
      states: {
        open: {
          on: {
            ASSIGN: 'assigned',
            CLOSE: 'closed'
          }
        },
        assigned: {
          on: {
            START: 'in_progress',
            CLOSE: 'closed'
          },
          guards: {
            START: 'hasAgent'
          }
        },
        in_progress: {
          on: {
            RESOLVE: 'resolved',
            REOPEN: 'open'
          },
          entry: 'stampWorkStarted'
        },
        resolved: {
          on: {
            CLOSE: 'closed',
            REOPEN: 'open'
          }
        },
        closed: { type: 'final' }
      }
    }
  },
  guards: {
    hasAgent: async (context) => {
      // Only allow work to start after the event payload names an assignee.
      return typeof context.assignedTo === 'string' && context.assignedTo.length > 0;
    }
  },
  actions: {
    stampWorkStarted: async (context, event, machine) => {
      // Persist extra business data when entering "in_progress".
      await machine.database.resources.tickets.patch(machine.entityId, {
        startedAt: new Date().toISOString()
      });
    }
  }
});

await db.usePlugin(plugin);

await tickets.insert({
  id: 'ticket-1',
  title: 'Payment webhook is failing',
  priority: 'high',
  status: 'open'
});

// Initialize state tracking for the entity.
await tickets.state.initialize('ticket-1', {
  ticketId: 'ticket-1'
});

// Move through the workflow with explicit events.
await tickets.state.send('ticket-1', 'ASSIGN');
await tickets.state.send('ticket-1', 'START', {
  assignedTo: 'agent-7'
});
await tickets.state.send('ticket-1', 'RESOLVE');

// Read current state through the resource shortcut API.
const currentState = await tickets.state.get('ticket-1');

// Inspect the audit trail when transitions are persisted.
const history = await tickets.state.history('ticket-1', {
  limit: 10,
  offset: 0
});

console.log(currentState);
console.log(history);
```

---

## What You Can Actually Do With It

The public API is broader than simple transitions.

Machine-level methods:
- `send(machineId, entityId, event, context?)`
- `getState(machineId, entityId)`
- `getValidEvents(machineId, entityIdOrState)`
- `getTransitions(machineId, entityId, options?)`
- `getTransitionHistory(machineId, entityId, { limit, offset })`
- `getLastTransitions(machineId, entityId, n?)`
- `getTransition(machineId, entityId, transitionId)`
- `getTransitionCount(machineId, entityId, options?)`
- `getSnapshot(machineId, entityId)`
- `initializeEntity(machineId, entityId, context?)`
- `deleteEntity(machineId, entityId)`
- `getMachineDefinition(machineId)`
- `getMachines()`
- `visualize(machineId)`
- `waitForPendingEvents(timeout?)`

Resource shortcuts when `resource` is configured:
- `resource.state.send(id, event, context?)`
- `resource.state.get(id)`
- `resource.state.canTransition(id, event)`
- `resource.state.getValidEvents(id)`
- `resource.state.initialize(id, context?)`
- `resource.state.history(id, options?)`
- `resource.state.transitions(id, options?)`
- `resource.state.transition(id, transitionId)`
- `resource.state.transitionCount(id, options?)`
- `resource.state.getLastTransitions(id, n?)`
- `resource.state.snapshot(id)`
- `resource.state.delete(id)`

---

## Rich Capabilities That Deserve Attention

This plugin is usually underestimated when people only look at transition tables.

It also supports:
- named `guards` to block transitions with domain rules
- named `actions` for `entry` and `exit` side effects
- retries for action execution
- automatic triggers from `event`, `function`, `date`, and `cron`
- persisted current state and transition history
- resource integration through `resource.state.*`
- concurrency protection with per-entity locks

Short example with guards and actions together:

```javascript
const plugin = new StateMachinePlugin({
  persistTransitions: true,
  stateMachines: {
    payout: {
      resource: 'payouts',
      stateField: 'status',
      initialState: 'pending_review',
      states: {
        pending_review: {
          on: {
            APPROVE: 'approved',
            REJECT: 'rejected'
          },
          guards: {
            APPROVE: 'reviewerCanApprove'
          }
        },
        approved: {
          on: {
            SEND: 'processing'
          },
          entry: 'recordApproval'
        },
        processing: {
          on: {
            COMPLETE: 'paid',
            FAIL: 'failed'
          },
          entry: 'dispatchTransfer',
          retryConfig: {
            maxAttempts: 3,
            backoffStrategy: 'exponential',
            baseDelay: 500,
            maxDelay: 4000
          }
        },
        paid: { type: 'final' },
        failed: { type: 'final' },
        rejected: { type: 'final' }
      }
    }
  },
  guards: {
    reviewerCanApprove: async (context, event, machine) => {
      // Validate business authorization before changing state.
      const reviewer = await machine.database.resources.reviewers.get(context.reviewerId);
      return reviewer?.active === true && reviewer?.role === 'finance_admin';
    }
  },
  actions: {
    recordApproval: async (context, event, machine) => {
      // Stamp approval metadata when entering the approved state.
      await machine.database.resources.payouts.patch(machine.entityId, {
        approvedAt: new Date().toISOString(),
        approvedBy: context.reviewerId
      });
    },
    dispatchTransfer: async (context, event, machine) => {
      // Call the external payout rail when entering processing.
      await machine.database.resources.transfer_jobs.insert({
        id: `transfer-${machine.entityId}`,
        payoutId: machine.entityId,
        createdAt: new Date().toISOString()
      });
    }
  }
});
```

---

## Documentation Map

| Guide | Focus | Read this when |
|-------|-------|----------------|
| [Guides Index](/plugins/state-machine/guides/README.md) | Entry point for all guides | You want the fastest route |
| [Configuration](/plugins/state-machine/guides/configuration.md) | Plugin options, machine shape, triggers, persistence | You are defining machines |
| [States](/plugins/state-machine/states.md) | State modeling, final states, resource-backed workflows | You are designing the lifecycle itself |
| [Actions](/plugins/state-machine/actions.md) | Entry/exit side effects and action design | You are wiring side effects |
| [Guards](/plugins/state-machine/guards.md) | Transition blocking and business rule validation | You are enforcing rules |
| [Triggers](/plugins/state-machine/triggers.md) | Event-driven and time-driven automation | You are automating state changes |
| [Retries](/plugins/state-machine/retries.md) | Retry policy for action execution | You are calling unstable systems |
| [API Reference](/plugins/state-machine/guides/api-reference.md) | Real public methods, resource shortcuts, rich examples | You are implementing workflows |
| [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md) | Locks, persistence, async events, cleanup, visualization | You are debugging or going to production |

---

## Recommended Reading Paths

If you are new to the plugin:
1. Read [Configuration](/plugins/state-machine/guides/configuration.md)
2. Read [States](/plugins/state-machine/states.md)
3. Read [Actions](/plugins/state-machine/actions.md)
4. Read [Guards](/plugins/state-machine/guards.md)
5. Read [Triggers](/plugins/state-machine/triggers.md)
6. Read [Retries](/plugins/state-machine/retries.md)
7. Read [API Reference](/plugins/state-machine/guides/api-reference.md)
8. Read [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md)

If you are debugging a production workflow:
1. Read [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md)
2. Check `waitForPendingEvents()` and trigger behavior
3. Review lock and persistence configuration

If you are designing a richer example:
1. Start from [States](/plugins/state-machine/states.md)
2. Add [Actions](/plugins/state-machine/actions.md) and [Guards](/plugins/state-machine/guards.md)
3. Add [Triggers](/plugins/state-machine/triggers.md) and [Retries](/plugins/state-machine/retries.md)
4. Validate runtime implications in [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md)
