# States

> What this guide covers: how to model states, events, final states, resource integration, and state-centric workflow design.

**Audience:** Developers designing a workflow shape
**Time to read:** 8 min
**Difficulty:** Beginner to Intermediate

---

## What a State Represents

A state is a named step in the lifecycle of an entity.

In this plugin, a state can define:
- which events are allowed through `on`
- whether it is final through `type: 'final'`
- what happens on entry through `entry`
- what happens on exit through `exit`
- which guard protects a given event through `guards`
- which automatic triggers run while the entity is in that state through `triggers`
- auto-expiration after a duration through `ttl`
- optional metadata through `meta`
- state-level retry policy through `retryConfig`

---

## Minimal State Shape

```javascript
states: {
  draft: {
    on: {
      SUBMIT: 'submitted',
      CANCEL: 'cancelled'
    }
  },
  submitted: {
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

This is the declarative core:
- the machine is readable from top to bottom
- legal transitions are explicit
- callers must use events, not arbitrary status patches

---

## Rich State Example

```javascript
stateMachines: {
  onboarding: {
    resource: 'users',
    stateField: 'status',
    initialState: 'registered',
    states: {
      registered: {
        on: {
          VERIFY_EMAIL: 'email_verified',
          DELETE: 'deleted'
        },
        entry: 'sendVerificationEmail'
      },
      email_verified: {
        on: {
          COMPLETE_PROFILE: 'profile_completed',
          SKIP_PROFILE: 'active'
        }
      },
      profile_completed: {
        on: {
          ACTIVATE: 'active'
        },
        guards: {
          ACTIVATE: 'hasRequiredProfileFields'
        },
        exit: 'auditProfileCompletion'
      },
      active: {
        type: 'final',
        entry: 'enableWelcomeSequence'
      },
      deleted: { type: 'final' }
    }
  }
}
```

Each part has a different job:
- `on`: state graph
- `entry`: effect after entering the state
- `exit`: effect before leaving the state
- `guards`: business rule gate
- `type: 'final'`: no more normal progression

---

## Final States

A final state declares terminal workflow completion.

```javascript
completed: { type: 'final' },
cancelled: { type: 'final' },
failed: { type: 'final' }
```

Use final states when:
- the lifecycle is complete
- only reporting remains
- no new events should be accepted in normal operation

Avoid marking a state as final if the business process can still reopen it.

---

## State Design Heuristics

Good states are:
- business meaningful
- stable enough to matter
- few enough to understand quickly

Bad states are usually:
- implementation details
- too temporary to justify visibility
- aliases for the same business condition

Prefer:
- `pending_review`
- `approved`
- `processing`
- `completed`

Avoid:
- `step_2`
- `after_webhook`
- `temp_ok`

---

## States With Resource Integration

When a machine is attached to a resource, the state model becomes part of the record lifecycle.

```javascript
stateMachines: {
  order: {
    resource: 'orders',
    stateField: 'status',
    initialState: 'draft',
    states: {
      draft: {
        on: {
          SUBMIT: 'submitted'
        }
      },
      submitted: { type: 'final' }
    }
  }
}
```

That gives you:
- `orders.state.*` helpers
- optional synchronization into `orders.status`
- auto-cleanup support on record delete

---

## Example: State-Centric Order Flow

```javascript
const plugin = new StateMachinePlugin({
  persistTransitions: true,
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
            PAY: 'paymentHasAmount'
          }
        },
        paid: {
          on: {
            SHIP: 'shipped'
          },
          entry: 'recordPayment'
        },
        shipped: { type: 'final' },
        payment_failed: { type: 'final' },
        cancelled: { type: 'final' }
      }
    }
  }
});
```

This is the right level of state modeling because:
- each state has business meaning
- events describe intent
- guards and actions stay attached to the relevant step

---

## Related Guides

- [Actions](/plugins/state-machine/actions.md)
- [Guards](/plugins/state-machine/guards.md)
- [Triggers](/plugins/state-machine/triggers.md)
- [Retries](/plugins/state-machine/retries.md)
- [API Reference](/plugins/state-machine/guides/api-reference.md)
