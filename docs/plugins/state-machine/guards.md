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
