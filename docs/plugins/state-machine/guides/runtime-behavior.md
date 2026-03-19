# Runtime Behavior

> What this guide covers: what happens after configuration, including locks, persistence, async event handlers, cleanup, and visualization.

**Audience:** Developers debugging workflows or preparing for production
**Time to read:** 8 min
**Difficulty:** Intermediate

---

## Concurrency and Locks

Each transition acquires a lock per `machineId + entityId`.

That gives you:
- protection against concurrent transitions on the same entity
- deterministic failure when another transition is already in progress
- recovery through lock TTL if a worker dies

Relevant options:
- `workerId`
- `lockTimeout`
- `lockTTL`

```javascript
const plugin = new StateMachinePlugin({
  workerId: 'checkout-worker-1',
  lockTimeout: 2000,
  lockTTL: 10,
  stateMachines: {
    order: {
      initialState: 'pending',
      states: {
        pending: {
          on: {
            PAY: 'paid'
          }
        },
        paid: { type: 'final' }
      }
    }
  }
});
```

If the lock cannot be acquired in time, `send()` throws a `StateMachineError`.

---

## Persistence Model

When `persistTransitions: true`, the plugin manages two internal resources:

- current state resource
- transition log resource

The plugin uses them to:
- recover the current state after restart
- store transition history
- support history lookups

If persistence is disabled, current state lives only in memory.

That means:
- restarts lose state
- `getTransitionHistory()` returns an empty list
- the plugin still enforces transitions during the current process lifetime

---

## Resource State Field Synchronization

When a machine is attached to a resource and `stateField` is configured, the workflow state can be reflected in the business record itself.

Typical shape:

```javascript
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
```

This is useful when:
- UI code queries the resource directly
- downstream systems read the business record, not the machine tables
- the workflow state must be visible in APIs without extra joins

---

## Async Event Triggers and `waitForPendingEvents()`

Event triggers may run asynchronously, especially when the source resource uses async events.

In that case:
- the resource update finishes first
- trigger handlers may still be running
- reading state immediately can produce stale results

Use `waitForPendingEvents()` when you need a synchronization point.

```javascript
// Update the resource and fire async trigger handlers.
await invoices.update('invoice-1', {
  paymentStatus: 'confirmed'
});

// Wait until pending handlers complete.
await plugin.waitForPendingEvents(5000);

// Only now is the final machine state safe to read.
const state = await invoices.state.get('invoice-1');
```

Use it in:
- tests
- scripts that chain operations after an event-driven transition
- admin tooling that must show settled state

Example with asynchronous settlement:

```javascript
// Resource emits async events, so trigger handlers finish later.
await payments.update('payment-1', {
  gatewayStatus: 'authorized'
});

// Synchronize before reading state or rendering results.
await plugin.waitForPendingEvents(5000);

// Safe to read after handlers finish.
const state = await payments.state.get('payment-1');
const history = await payments.state.history('payment-1', {
  limit: 10,
  offset: 0
});
```

---

## Automatic Cleanup on Delete

When a machine is attached to a resource, `autoCleanup` is enabled by default.

That means deleting the domain record can also delete:
- in-memory machine state
- persisted machine state
- transition history

```javascript
const plugin = new StateMachinePlugin({
  stateMachines: {
    order: {
      resource: 'orders',
      autoCleanup: true,
      initialState: 'pending',
      states: {
        pending: { on: { CLOSE: 'closed' } },
        closed: { type: 'final' }
      }
    }
  }
});
```

Disable it if cleanup must be orchestrated elsewhere.

---

## Visualization

Use `visualize(machineId)` to export a GraphViz DOT graph.

```javascript
// Generate DOT output for docs or debugging.
const dot = plugin.visualize('order');
console.log(dot);
```

This is useful for:
- reviewing machine design with the team
- checking large transition maps
- generating diagrams for public docs

---

## How the Pieces Work Together

For a non-trivial workflow, the plugin runtime usually looks like this:

```text
caller or trigger
  -> send event
  -> acquire entity lock
  -> load current state
  -> validate allowed event
  -> run guard
  -> run exit action
  -> persist current state
  -> persist transition log
  -> run entry action
  -> emit runtime events
```

That is why rich examples need more than transition arrows. The operational behavior comes from the combination of:
- states
- guards
- actions
- triggers
- persistence
- locking
- async event settling
