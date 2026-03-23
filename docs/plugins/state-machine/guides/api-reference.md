# API Reference

> What this guide covers: the real public API exposed by `StateMachinePlugin` and the attached `resource.state.*` helpers.

**Audience:** Developers implementing workflows
**Time to read:** 10 min
**Difficulty:** Intermediate

---

## Two Ways to Use the Plugin

You can work with the plugin in two styles.

1. Machine API
   Use `db.stateMachine('machineName')` or the plugin instance directly.
2. Resource shortcut API
   Use `resource.state.*` when the machine is attached to a resource with `resource` or `resource.$schema.stateMachine`.

The second style is usually the most readable in application code.

---

## Machine API

### `send(machineId, entityId, event, context?)`

Send an event through the machine, validate the current state, run guards, persist the transition, and execute entry/exit actions.

```javascript
// Send a business event with contextual payload.
await plugin.send('order', 'order-42', 'PAY', {
  amount: 199.9,
  paymentMethod: 'credit_card'
});
```

Returns:

```javascript
{
  ok: true,
  from: 'pending_payment',
  to: 'paid',
  event: 'PAY',
  stateVersion: 3,
  timestamp: '2026-03-19T12:00:00.000Z',
  machineId: 'order',
  entityId: 'order-42',
  correlationId: 'order-order-42-PAY-...'
}
```

On rejected transition, it returns a normalized payload (never an inconsistent shape):

```javascript
{
  ok: false,
  code: 'GUARD_REJECTED',
  reason: 'MISSING_REQUIRED_FIELD',
  state: 'pending_payment',
  from: 'pending_payment',
  to: 'paid',
  message: 'Transition blocked by guard ...',
  details: {
    currentState: 'pending_payment',
    guardName: 'hasPaymentAmount'
  },
  machineId: 'order',
  entityId: 'order-42',
  event: 'PAY',
  correlationId: 'order-order-42-PAY-...'
}
```

If you need a guaranteed failure contract in downstream code, assert on:
- `ok: false`
- `code`
- `reason`
- `state`
- `details`
- `correlationId`

State mismatch example:

```javascript
const stateMismatchResult = await plugin.send('order', 'order-42', 'SHIP', {
  stateVersion: 1 // must match current stateVersion in memory/persisted state
});
// -> { ok: false, code: 'STATE_VERSION_MISMATCH', reason: 'STATE_VERSION_MISMATCH' }
```

### `assertTransition({ machineId, entityId, event, to, from?, context?, stateVersion? })`

Contract helper for tests and CI pipelines.

```javascript
const result = await plugin.assertTransition({
  machineId: 'order',
  entityId: 'order-42',
  event: 'PAY',
  from: 'pending_payment',
  to: 'paid',
  context: {
    amount: 199.9,
    paymentMethod: 'credit_card'
  }
});
```

If the transition does not succeed or the observed `from`/`to`/`stateVersion` differs from expectations, an Error is thrown with details.

### `assertReject({ machineId, entityId, event, code, reason?, to?, from?, context? })`

Contract helper that ensures the transition is rejected.

```javascript
await plugin.assertReject({
  machineId: 'order',
  entityId: 'order-42',
  event: 'PAY',
  code: 'GUARD_REJECTED',
  reason: 'MISSING_REQUIRED_FIELD'
});
```

If the transition succeeds or returns a different structured error code/reason, an Error is thrown with details.

### `getState(machineId, entityId)`

Read the current state for an entity.

```javascript
// Read the current lifecycle state for this order.
const state = await plugin.getState('order', 'order-42');
```

### `getValidEvents(machineId, entityIdOrState)`

Return the currently allowed events.

```javascript
// Pass an entity id to resolve events from its current state.
const nextEvents = await plugin.getValidEvents('order', 'order-42');

// Pass a literal state name to inspect the definition itself.
const draftEvents = await plugin.getValidEvents('order', 'draft');
```

### `initializeEntity(machineId, entityId, context?)`

Initialize machine state for an entity. This is important when you want state persistence, audit history, entry actions on the initial state, or explicit machine ownership of an entity lifecycle.

```javascript
// Create machine state for a record that already exists in the resource.
await plugin.initializeEntity('order', 'order-42', {
  orderId: 'order-42',
  customerId: 'customer-7'
});
```

### `getTransitions(machineId, entityId, options?)`

Read persisted transitions for one entity in one machine. This is the main REST-like API for history queries.

```javascript
const latest = await plugin.getTransitions('order', 'order-42', {
  limit: 20,
  offset: 0,
  sort: 'desc'
});
```

Options:
- `limit`: max number of rows.
- `offset`: pagination offset.
- `sort`: `'asc' | 'desc'` (default `'desc'`).
- `from`: inclusive start timestamp (ISO 8601).
- `to`: inclusive end timestamp (ISO 8601).
- `event`: filter by event name.
- `fromState`: filter by source state.
- `toState`: filter by target state.

### `getTransitionHistory(machineId, entityId, options?)`

Backward-compatible shorthand for common timeline use cases.

This method uses:
- `limit` (default `50`)
- `offset` (default `0`)
- implicit `sort: 'desc'`
- no additional filtering fields (`from`, `to`, etc. are not supported on this method yet)

```javascript
const history = await plugin.getTransitionHistory('order', 'order-42', {
  limit: 20,
  offset: 0
});
```

### `getTransition(machineId, entityId, transitionId)`

Get one persisted transition by id.

```javascript
const transition = await plugin.getTransition('order', 'order-42', 'transition-id-123');
```

### `getTransitionCount(machineId, entityId, options?)`

Count persisted transitions with optional filters (`event`, `from`, `to`, `fromState`, `toState`).

```javascript
const total = await plugin.getTransitionCount('order', 'order-42', { event: 'PAY' });
```

### `getSnapshot(machineId, entityId)`

Get a practical snapshot of machine state for one entity:
- current state
- state version
- context
- transition counters
- last transition id
- whether state was persisted

```javascript
const snapshot = await plugin.getSnapshot('order', 'order-42');
```

### `getLastTransitions(machineId, entityId, n?)`

Compatibility helper for "latest first" lists.

```javascript
// Get the latest 10 transitions.
const latest = await plugin.getLastTransitions('order', 'order-42', 10);

// Omit n to load all transitions for the entity/machine pair.
const all = await plugin.getLastTransitions('order', 'order-42');
```

`getLastTransitions` always returns transitions from most recent to oldest.

### `deleteEntity(machineId, entityId)`

Delete machine state and transition history for an entity.

```javascript
// Manual cleanup when the domain record is being retired.
await plugin.deleteEntity('order', 'order-42');
```

### `getMachineDefinition(machineId)`

Inspect the loaded machine definition.

```javascript
// Useful for diagnostics and tooling.
const definition = plugin.getMachineDefinition('order');
```

### `getMachineDefinitionDiagnostics(machineId?)`

Run structural validation over the loaded machine graph and return diagnostics.

```javascript
const diagnostic = plugin.getMachineDefinitionDiagnostics('order');

console.log(diagnostic.errors);
console.log(diagnostic.warnings);
console.log(diagnostic.stats);
```

`getDefinitionDiagnostics()` returns diagnostics for all machines at once:

```javascript
const all = plugin.getDefinitionDiagnostics();
```

Returned payload:

```javascript
{
  machineId: 'order',
  errors: [],
  warnings: [
    {
      code: 'UNREACHABLE_STATE',
      message: 'State ... is unreachable from the initial state ...',
      state: 'archived'
    }
  ],
  stats: {
    states: 4,
    transitions: 3,
    deadStates: ['draft'],
    unreachableStates: ['archived']
  }
}
```

### `getMachines()`

List all registered machine ids.

```javascript
// Useful when exposing diagnostics or admin tooling.
const machines = plugin.getMachines();
```

### `visualize(machineId)`

Generate a GraphViz DOT graph of the machine.

```javascript
// Export the graph for architecture docs or debugging.
const dot = plugin.visualize('order');
```

### `waitForPendingEvents(timeout?)`

Wait for async event handlers registered by event triggers to finish.

Use this when:
- the resource emits async events
- a trigger transitions state indirectly
- your code must observe the final state after the event pipeline settles

```javascript
// Update the resource, which may fire async event triggers.
await orders.update('order-42', { paymentStatus: 'confirmed' });

// Wait until trigger handlers finish before asserting state.
await plugin.waitForPendingEvents(5000);
```

---

## Resource Shortcut API

When a machine is attached to a resource, the plugin injects `resource.state`.

```javascript
const orders = db.resources.orders;

// Same behavior as plugin.send('order', 'order-42', 'PAY', ...)
await orders.state.send('order-42', 'PAY', {
  amount: 199.9
});
```

Available helpers:

### `resource.state.send(id, event, context?)`

```javascript
// Preferred when application code already holds the resource object.
await orders.state.send('order-42', 'SHIP', {
  shippedBy: 'warehouse-2'
});
```

### `resource.state.get(id)`

```javascript
// Read the machine state without repeating the machine id.
const state = await orders.state.get('order-42');
```

### `resource.state.canTransition(id, event)`

```javascript
// Enable or disable UI actions before calling send().
const canCancel = await orders.state.canTransition('order-42', 'CANCEL');
```

### `resource.state.getValidEvents(id)`

```javascript
// Build UI actions directly from machine capabilities.
const actions = await orders.state.getValidEvents('order-42');
```

### `resource.state.initialize(id, context?)`

```javascript
// Initialize tracking for a record after insert or import.
await orders.state.initialize('order-42', {
  importedBy: 'migration-1'
});
```

### `resource.state.history(id, options?)`

```javascript
// Render an audit trail for the resource record.
const history = await orders.state.history('order-42', {
  limit: 10,
  offset: 0
});
```

### `resource.state.transitions(id, options?)`

```javascript
// Filter recent transitions from the resource perspective.
const transitions = await orders.state.transitions('order-42', {
  limit: 10,
  sort: 'desc',
  event: 'SHIP'
});
```

### `resource.state.transition(id, transitionId)`

```javascript
const transition = await orders.state.transition('order-42', 'transition-id-123');
```

### `resource.state.transitionCount(id, options?)`

```javascript
const count = await orders.state.transitionCount('order-42', { fromState: 'pending' });
```

### `resource.state.getLastTransitions(id, n?)`

```javascript
// Latest 10 transitions for a record.
const latest = await orders.state.getLastTransitions('order-42', 10);

// Omit n to fetch all transition history for the record.
const all = await orders.state.getLastTransitions('order-42');
```

`resource.state.getLastTransitions` returns events ordered from most recent to oldest.

Note: `resource.state` is the public helper bound to the resource-selected machine. The plugin can still manage multiple machines, but only one machine can expose `resource.state` for each resource.

`resource.state.getLastTransitions` is the REST-like "latest N first" helper for quick UI rendering:
- request `n` for a compact view (for example last 10 transitions)
- omit `n` to fetch the complete timeline for the record/machine pair
- useful when building event streams that should prioritize recency

### `resource.state.snapshot(id)`

```javascript
const snapshot = await orders.state.snapshot('order-42');
```

`snapshot()` is the practical operational view for support tooling:
- current state
- stateVersion
- context
- lastTransition id
- persistence flag

The return is a compact object and is safe for dashboard cards and audit cards.

`resource.state` is available only when the resource has exactly one bound machine:
- configured by plugin `resource` field, or
- attached through `resource.$schema.stateMachine`.

You can define additional machines in the plugin with `stateMachines`, but only one will expose `resource.state`.

### `resource.state.delete(id)`

```javascript
// Explicitly remove machine state when needed.
await orders.state.delete('order-42');
```

`resource.state` is available only when the resource has exactly one bound machine:
- configured by plugin `resource` field, or
- attached through `resource.$schema.stateMachine`.

You can define additional machines in the plugin with `stateMachines`, but only one will expose `resource.state`.

## Hook events

- `plg:state-machine:before-transition`
- `plg:state-machine:transition`
- `plg:state-machine:after-transition`
- `plg:state-machine:transition-rejected`
- `plg:state-machine:action-error`

These events receive a standard transition context:

```javascript
{
  machineId,
  entityId,
  event,
  from,
  to,
  guard,
  stateVersion,
  context,
  correlationId,
  startedAt,
  endedAt,
  elapsedMs,
  error // only on failures/rejects
}
```

`plg:state-machine:transition` remains the canonical event for successful transitions; `transition-rejected` provides machine-level diagnostics.

---

## Runtime Context Injected Into Actions and Guards

Both `actions` and `guards` receive the same runtime signature:

```javascript
async (context, event, machine) => {}
```

Where:
- `context`: payload passed to `send(...)` or produced by a trigger
- `event`: current event name
- `machine.database`: database instance
- `machine.machineId`: current machine id
- `machine.entityId`: current entity id
- `machine.resource`: attached resource when the machine is configured with `resource`

This is how the plugin gives your handlers access to the rest of the system.

Important:
- `context` is event/trigger payload
- `context` is not automatically the full resource record
- `machine.resource` is only available when the machine is attached to a resource
- load the entity explicitly when the handler needs persisted fields

```javascript
actions: {
  recordApproval: async (context, event, machine) => {
    // Update the entity owned by the workflow through the attached resource.
    await machine.resource.patch(machine.entityId, {
      approvedAt: new Date().toISOString()
    });

    // Also talk to a different resource using the injected database.
    await machine.database.resources.audit_logs.insert({
      id: `audit-${machine.entityId}`,
      machineId: machine.machineId,
      event,
      createdAt: new Date().toISOString()
    });
  }
}
```

Example loading the current entity explicitly:

```javascript
guards: {
  canFulfill: async (context, event, machine) => {
    // Event payload says what the caller is trying to do.
    console.log(context.warehouseId);

    // Load the actual record when business validation needs stored fields.
    const order = await machine.resource.get(machine.entityId);
    return order.paymentStatus === 'confirmed' && order.stockReserved === true;
  }
}
```

## Rich Example: Approval Workflow With Guards, Entry/Exit Actions, and Retry

This example is closer to what teams actually need in production: authorization, audit, side effects, and retry policy for unstable integrations.

```javascript
import { Database, StateMachinePlugin } from 's3db.js';

const db = new Database({ connectionString: 'memory://' });
await db.connect();

// Domain resource whose lifecycle is controlled by the machine.
const requests = await db.createResource({
  name: 'requests',
  attributes: {
    title: 'string|required',
    amount: 'number|required',
    department: 'string|required',
    status: 'string|required',
    approvedBy: 'string',
    approvedAt: 'datetime'
  }
});

const plugin = new StateMachinePlugin({
  persistTransitions: true,
  stateMachines: {
    expense_request: {
      resource: 'requests',
      stateField: 'status',
      initialState: 'submitted',
      states: {
        submitted: {
          on: {
            ASSIGN: 'assigned',
            REJECT: 'rejected'
          },
          entry: 'notifyApprovers'
        },
        assigned: {
          on: {
            APPROVE: 'approved',
            REJECT: 'rejected',
            REQUEST_CHANGES: 'changes_requested'
          },
          guards: {
            APPROVE: 'hasApprovalAuthority',
            REJECT: 'hasApprovalAuthority'
          }
        },
        changes_requested: {
          on: {
            RESUBMIT: 'submitted'
          },
          entry: 'notifyRequester'
        },
        approved: {
          on: {
            EXECUTE: 'processing'
          },
          entry: 'recordApproval'
        },
        processing: {
          on: {
            COMPLETE: 'completed',
            FAIL: 'failed'
          },
          entry: 'dispatchPayment',
          exit: 'auditProcessingExit',
          retryConfig: {
            maxAttempts: 3,
            backoffStrategy: 'exponential',
            baseDelay: 1000,
            maxDelay: 5000
          }
        },
        completed: { type: 'final' },
        failed: { type: 'final' },
        rejected: { type: 'final' }
      }
    }
  },
  guards: {
    hasApprovalAuthority: async (context, event, machine) => {
      // Load the actor performing the event.
      const approver = await machine.database.resources.approvers.get(context.approverId);

      // Enforce domain rules before allowing the transition.
      return Boolean(
        approver &&
        approver.active === true &&
        approver.department === context.department &&
        approver.approvalLimit >= context.amount
      );
    }
  },
  actions: {
    notifyApprovers: async (context, event, machine) => {
      // Create a task when a new request enters the workflow.
      await machine.database.resources.approval_tasks.insert({
        id: `task-${machine.entityId}`,
        requestId: machine.entityId,
        createdAt: new Date().toISOString()
      });
    },
    notifyRequester: async (context, event, machine) => {
      // Record that the requester must change something and resubmit.
      await machine.database.resources.request_events.insert({
        id: `event-${machine.entityId}-${Date.now()}`,
        requestId: machine.entityId,
        type: 'changes_requested',
        createdAt: new Date().toISOString()
      });
    },
    recordApproval: async (context, event, machine) => {
      // Persist approval metadata when the request enters approved.
      await machine.database.resources.requests.patch(machine.entityId, {
        approvedBy: context.approverId,
        approvedAt: new Date().toISOString()
      });
    },
    dispatchPayment: async (context, event, machine) => {
      // Kick off an external payment job when the request starts processing.
      await machine.database.resources.payment_jobs.insert({
        id: `payment-${machine.entityId}`,
        requestId: machine.entityId,
        status: 'queued',
        createdAt: new Date().toISOString()
      });
    },
    auditProcessingExit: async (context, event, machine) => {
      // Leave an audit breadcrumb whenever processing finishes, succeeds, or fails.
      await machine.database.resources.request_events.insert({
        id: `processing-exit-${machine.entityId}-${Date.now()}`,
        requestId: machine.entityId,
        type: 'processing_exit',
        event,
        createdAt: new Date().toISOString()
      });
    }
  }
});

await db.usePlugin(plugin);

// Insert the domain record first.
await requests.insert({
  id: 'req-1',
  title: 'Conference travel',
  amount: 3200,
  department: 'engineering',
  status: 'submitted'
});

// Initialize machine tracking for the entity.
await requests.state.initialize('req-1', {
  requestId: 'req-1',
  amount: 3200,
  department: 'engineering'
});

// Drive the workflow with explicit business events.
await requests.state.send('req-1', 'ASSIGN');
await requests.state.send('req-1', 'APPROVE', {
  approverId: 'approver-9',
  amount: 3200,
  department: 'engineering'
});
await requests.state.send('req-1', 'EXECUTE');
await requests.state.send('req-1', 'COMPLETE');

// Read the resulting timeline for audit or UI.
const history = await requests.state.history('req-1', {
  limit: 20,
  offset: 0
});

console.log(history);
```

---

## Design Guidance

When writing machines in this plugin:

- put authorization and business rule checks in `guards`
- put side effects in named `actions`
- keep transition tables readable and declarative
- use `entry` for effects tied to arrival in a state
- use `exit` for cleanup and audit just before leaving a state
- add retry config only around actions that call unstable systems

That split keeps the machine understandable when it grows.

Focused conceptual guides:
- [States](/plugins/state-machine/guides/states.md)
- [Actions](/plugins/state-machine/actions.md)
- [Guards](/plugins/state-machine/guards.md)
- [Triggers](/plugins/state-machine/triggers.md)
- [Retries](/plugins/state-machine/retries.md)
