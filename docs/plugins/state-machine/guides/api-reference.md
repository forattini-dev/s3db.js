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
   Use `resource.state.*` when the machine is attached to a resource with `resource`.

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
  from: 'pending_payment',
  to: 'paid',
  event: 'PAY',
  timestamp: '2026-03-19T12:00:00.000Z'
}
```

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

### `getTransitionHistory(machineId, entityId, options?)`

Read persisted transition history. This only returns useful data when `persistTransitions: true`.

```javascript
// Read the latest transitions for timeline UI or audit.
const history = await plugin.getTransitionHistory('order', 'order-42', {
  limit: 20,
  offset: 0
});
```

Options:
- `limit`: max number of rows to return, default `50`
- `offset`: pagination offset, default `0`

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

### `resource.state.delete(id)`

```javascript
// Explicitly remove machine state when needed.
await orders.state.delete('order-42');
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
