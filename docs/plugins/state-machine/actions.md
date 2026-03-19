# Actions

> What this guide covers: named action handlers, entry and exit actions, side effects, and action design.

**Audience:** Developers adding side effects to transitions
**Time to read:** 8 min
**Difficulty:** Intermediate

---

## What Actions Are For

Actions let a state machine do work when a state is entered or exited.

Use actions for:
- audit records
- notifications
- patching the business resource
- creating downstream jobs
- integration calls

Do not use actions for:
- deciding whether a transition is allowed
- encoding transition maps

That is what `guards` and `states.on` are for.

---

## How Actions Are Wired

Actions are declared once under `actions` and referenced by name from a state.

```javascript
states: {
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
    exit: 'auditProcessingExit'
  }
},
actions: {
  recordApproval: async (context, event, machine) => {},
  auditProcessingExit: async (context, event, machine) => {}
}
```

---

## Action Function Signature

Each action receives:
- `context`: event payload or trigger context
- `event`: event name being processed
- `machine`: `{ database, machineId, entityId }`

```javascript
actions: {
  recordApproval: async (context, event, machine) => {
    // Use the machine helper to access database and entity identity.
    await machine.database.resources.requests.patch(machine.entityId, {
      approvedAt: new Date().toISOString(),
      approvedBy: context.approverId
    });
  }
}
```

The `machine` argument is the runtime dependency-injection object for the action.

It exposes:
- `machine.database`: access to the database instance
- `machine.machineId`: the current machine id
- `machine.entityId`: the current entity id

That means the action can talk to other resources, not only the resource attached to the machine.

```javascript
actions: {
  recordApproval: async (context, event, machine) => {
    // Update the main business record controlled by the machine.
    await machine.database.resources.requests.patch(machine.entityId, {
      approvedAt: new Date().toISOString(),
      approvedBy: context.approverId
    });

    // Also write to another resource through the injected database.
    await machine.database.resources.audit_logs.insert({
      id: `audit-${machine.entityId}-${Date.now()}`,
      machineId: machine.machineId,
      entityId: machine.entityId,
      event,
      createdAt: new Date().toISOString()
    });
  }
}
```

Important:
- `context` is the payload passed to `send(...)` or produced by a trigger
- `context` is not automatically the full entity record
- if the action needs the current record, it should load it through `machine.database`

```javascript
actions: {
  dispatchShipment: async (context, event, machine) => {
    // Context contains event payload, not the full order by default.
    console.log(context.carrier); // comes from send(..., { carrier: 'dhl' })

    // Load the actual entity record when the action needs full resource data.
    const order = await machine.database.resources.orders.get(machine.entityId);

    await machine.database.resources.shipments.insert({
      id: `shipment-${machine.entityId}`,
      orderId: machine.entityId,
      carrier: context.carrier,
      destinationZip: order.shippingZip,
      createdAt: new Date().toISOString()
    });
  }
}
```

---

## Entry vs Exit

Use `entry` when the side effect belongs to arriving in the new state.

```javascript
approved: {
  on: {
    EXECUTE: 'processing'
  },
  entry: 'recordApproval'
}
```

Use `exit` when the side effect belongs to leaving the current state.

```javascript
processing: {
  on: {
    COMPLETE: 'completed',
    FAIL: 'failed'
  },
  exit: 'auditProcessingExit'
}
```

Rule of thumb:
- `entry`: "now that we are here, do this"
- `exit`: "before we leave here, do this"

---

## Rich Example

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
          exit: 'auditProcessingExit'
        },
        paid: {
          type: 'final',
          entry: 'emitPaidNotification'
        },
        failed: { type: 'final' },
        rejected: { type: 'final' }
      }
    }
  },
  actions: {
    recordApproval: async (context, event, machine) => {
      // Stamp who approved the payout and when approval happened.
      await machine.database.resources.payouts.patch(machine.entityId, {
        approvedBy: context.reviewerId,
        approvedAt: new Date().toISOString()
      });
    },
    dispatchTransfer: async (context, event, machine) => {
      // Create the external transfer job when processing starts.
      await machine.database.resources.transfer_jobs.insert({
        id: `transfer-${machine.entityId}`,
        payoutId: machine.entityId,
        status: 'queued',
        createdAt: new Date().toISOString()
      });
    },
    auditProcessingExit: async (context, event, machine) => {
      // Track how the processing state was exited.
      await machine.database.resources.audit_logs.insert({
        id: `audit-${machine.entityId}-${Date.now()}`,
        entityId: machine.entityId,
        machineId: machine.machineId,
        event,
        createdAt: new Date().toISOString()
      });
    },
    emitPaidNotification: async (context, event, machine) => {
      // Fan out a notification after the payout becomes final.
      await machine.database.resources.notifications.insert({
        id: `notification-${machine.entityId}`,
        type: 'payout_paid',
        entityId: machine.entityId,
        createdAt: new Date().toISOString()
      });
    }
  }
});
```

---

## Design Guidance

Good actions are:
- small
- explicit
- idempotent when possible
- focused on one side effect

Avoid actions that:
- hide business rules better expressed as guards
- mutate many unrelated systems in one handler
- depend on implicit state not present in `context`

When an action talks to flaky external systems, pair it with [Retries](/plugins/state-machine/retries.md).

---

## Related Guides

- [States](/plugins/state-machine/states.md)
- [Guards](/plugins/state-machine/guards.md)
- [Retries](/plugins/state-machine/retries.md)
- [API Reference](/plugins/state-machine/guides/api-reference.md)
