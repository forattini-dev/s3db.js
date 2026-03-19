# Guards

> What this guide covers: guard handlers, transition blocking, business rule validation, and guard design.

**Audience:** Developers enforcing business rules
**Time to read:** 7 min
**Difficulty:** Intermediate

---

## What Guards Are For

Guards decide whether a transition is allowed.

Use guards for:
- authorization
- validation
- inventory checks
- approval thresholds
- domain invariants

Do not use guards for:
- side effects
- notifications
- integration jobs

Those belong in actions.

---

## How Guards Are Wired

Guards are declared under `guards` and attached by event name inside a state.

```javascript
pending_review: {
  on: {
    APPROVE: 'approved',
    REJECT: 'rejected'
  },
  guards: {
    APPROVE: 'reviewerCanApprove',
    REJECT: 'reviewerCanReject'
  }
}
```

```javascript
guards: {
  reviewerCanApprove: async (context, event, machine) => true,
  reviewerCanReject: async (context, event, machine) => true
}
```

If a guard returns `false` or throws, the transition is blocked.

---

## Guard Function Signature

Each guard receives:
- `context`: event payload or trigger context
- `event`: current event name
- `machine`: `{ database, machineId, entityId }`

```javascript
guards: {
  reviewerCanApprove: async (context, event, machine) => {
    // Load the actor responsible for the approval event.
    const reviewer = await machine.database.resources.reviewers.get(context.reviewerId);

    // Only approve when the actor has the right role and enough limit.
    return Boolean(
      reviewer &&
      reviewer.active === true &&
      reviewer.role === 'finance_admin' &&
      reviewer.approvalLimit >= context.amount
    );
  }
}
```

The `machine` argument is also injected into guards.

It exposes:
- `machine.database`: access to the database instance
- `machine.machineId`: the current machine id
- `machine.entityId`: the current entity id

That lets a guard load other resources before allowing a transition.

```javascript
guards: {
  hasInventory: async (context, event, machine) => {
    // Load the current order controlled by the machine.
    const order = await machine.database.resources.orders.get(machine.entityId);

    // Validate order lines against inventory in another resource.
    for (const item of order.items || []) {
      const stock = await machine.database.resources.inventory.get(item.productId);
      if (!stock || stock.quantity < item.quantity) {
        return false;
      }
    }

    return true;
  }
}
```

Important:
- `context` is the payload passed to `send(...)` or produced by a trigger
- `context` is not automatically the full entity record
- if the guard needs the current record, it should load it through `machine.database`

```javascript
guards: {
  canShip: async (context, event, machine) => {
    // Event payload carries operational input for this transition.
    if (!context.carrier) {
      return false;
    }

    // Load the full entity when the validation depends on stored data.
    const order = await machine.database.resources.orders.get(machine.entityId);
    return order.status === 'paid' && order.addressVerified === true;
  }
}
```

---

## Rich Example

```javascript
const plugin = new StateMachinePlugin({
  stateMachines: {
    purchase_order: {
      resource: 'purchase_orders',
      stateField: 'status',
      initialState: 'draft',
      states: {
        draft: {
          on: {
            SUBMIT: 'pending_review'
          }
        },
        pending_review: {
          on: {
            APPROVE: 'approved',
            REJECT: 'rejected'
          },
          guards: {
            APPROVE: 'hasBudgetAndAuthority',
            REJECT: 'reviewerIsAssigned'
          }
        },
        approved: {
          on: {
            ISSUE: 'issued'
          }
        },
        issued: { type: 'final' },
        rejected: { type: 'final' }
      }
    }
  },
  guards: {
    hasBudgetAndAuthority: async (context, event, machine) => {
      // Validate reviewer permissions.
      const reviewer = await machine.database.resources.reviewers.get(context.reviewerId);

      // Validate department budget before allowing approval.
      const budget = await machine.database.resources.department_budgets.get(context.departmentId);

      return Boolean(
        reviewer &&
        reviewer.active === true &&
        reviewer.departmentId === context.departmentId &&
        reviewer.approvalLimit >= context.amount &&
        budget &&
        budget.available >= context.amount
      );
    },
    reviewerIsAssigned: async (context, event, machine) => {
      // Only the assigned reviewer can reject.
      const order = await machine.database.resources.purchase_orders.get(machine.entityId);
      return order?.assignedReviewerId === context.reviewerId;
    }
  }
});
```

---

## Design Guidance

Good guards are:
- deterministic
- readable
- focused on permission or validity
- free of side effects

Prefer:
- "can this transition happen?"

Avoid:
- "do the transition and also notify someone"

If the rule depends on slow or flaky systems, think carefully:
- if it must be a hard gate, keep it in a guard
- if it is a side effect after success, move it to an action

---

## Related Guides

- [States](/plugins/state-machine/states.md)
- [Actions](/plugins/state-machine/actions.md)
- [Retries](/plugins/state-machine/retries.md)
- [API Reference](/plugins/state-machine/guides/api-reference.md)
