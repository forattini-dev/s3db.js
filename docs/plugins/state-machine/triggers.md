# Triggers

> What this guide covers: automatic transitions and state-driven automation with `event`, `function`, `date`, and `cron` triggers.

**Audience:** Developers automating workflows
**Time to read:** 10 min
**Difficulty:** Intermediate to Advanced

---

## What Triggers Are For

Triggers let a state perform work or transition automatically while an entity remains in that state.

Supported trigger types:
- `event`
- `function`
- `date`
- `cron`

Use triggers when:
- a resource update should advance the workflow
- deadlines should expire entities automatically
- periodic polling should drive the next step
- recurring checks should run while an entity waits in a state

---

## Trigger Fields

Available trigger fields include:
- `type`
- `action`
- `schedule`
- `field`
- `interval`
- `event`
- `eventName`
- `eventSource`
- `condition`
- `maxTriggers`
- `onMaxTriggersReached`
- `eventOnSuccess`
- `sendEvent`
- `targetState`

Not every field applies to every trigger type.

---

## Event Triggers

Event triggers react to emitted events and can call an action or send a state machine event.

```javascript
pending: {
  triggers: [
    {
      type: 'event',
      eventName: 'updated',
      eventSource: invoices,
      sendEvent: 'CONFIRM_PAYMENT',
      condition: async (context, entityId, payload) => {
        // Transition only when the update confirms payment.
        return payload?.data?.paymentStatus === 'confirmed';
      }
    }
  ],
  on: {
    CONFIRM_PAYMENT: 'paid'
  }
}
```

If the source uses async events, pair this with `waitForPendingEvents()`.

---

## Function Triggers

Function triggers run repeatedly and usually call an action.

```javascript
waiting: {
  triggers: [
    {
      type: 'function',
      action: 'heartbeat',
      maxTriggers: 5,
      onMaxTriggersReached: 'MAX_REACHED'
    }
  ],
  on: {
    MAX_REACHED: 'exhausted'
  }
}
```

Use them for:
- polling
- health checks
- repeated reminders
- background progress loops

---

## Date Triggers

Date triggers evaluate a field and act when its time is reached.

```javascript
flagged: {
  triggers: [
    {
      type: 'date',
      field: 'reviewDeadline',
      targetState: 'expired'
    }
  ]
}
```

Use them for:
- deadlines
- expiration
- SLA breaches
- scheduled escalation

---

## Cron Triggers

Cron triggers run on a cron schedule while entities remain in a state.

```javascript
pending_settlement: {
  triggers: [
    {
      type: 'cron',
      schedule: '0 */10 * * * *',
      action: 'checkSettlementStatus'
    }
  ]
}
```

Use them for:
- periodic external sync
- recurring reminders
- monitoring long-running workflow states

---

## Rich Example

```javascript
const plugin = new StateMachinePlugin({
  enableEventTriggers: true,
  enableDateTriggers: true,
  enableFunctionTriggers: true,
  triggerCheckInterval: 1000,
  stateMachines: {
    moderation: {
      resource: 'posts',
      stateField: 'status',
      initialState: 'queued',
      states: {
        queued: {
          triggers: [
            {
              type: 'function',
              action: 'scoreContent',
              maxTriggers: 1
            },
            {
              type: 'event',
              eventName: 'updated',
              eventSource: posts,
              sendEvent: 'FLAG',
              condition: async (context, entityId, payload) => {
                // Automatically flag content when the latest update marks it unsafe.
                return payload?.data?.unsafe === true;
              }
            }
          ],
          on: {
            APPROVE: 'approved',
            FLAG: 'flagged'
          }
        },
        flagged: {
          triggers: [
            {
              type: 'date',
              field: 'reviewDeadline',
              targetState: 'expired'
            },
            {
              type: 'cron',
              schedule: '0 */15 * * * *',
              action: 'sendReminder'
            }
          ],
          on: {
            REVIEW: 'approved'
          }
        },
        approved: { type: 'final' },
        expired: { type: 'final' }
      }
    }
  },
  actions: {
    scoreContent: async (context, event, machine) => {
      // Run an automated scoring pass while the entity is queued.
      await machine.database.resources.moderation_jobs.insert({
        id: `score-${machine.entityId}`,
        postId: machine.entityId,
        createdAt: new Date().toISOString()
      });
    },
    sendReminder: async (context, event, machine) => {
      // Remind moderators periodically while the post stays flagged.
      await machine.database.resources.notifications.insert({
        id: `reminder-${machine.entityId}-${Date.now()}`,
        type: 'moderation_reminder',
        entityId: machine.entityId,
        createdAt: new Date().toISOString()
      });
    }
  }
});
```

---

## Design Guidance

Use:
- `event` when the outside world tells the workflow something changed
- `function` when the state itself should keep doing work
- `date` when time-based escalation matters
- `cron` when recurring checks are needed

Prefer `sendEvent` or `targetState` when the goal is a transition.
Prefer `action` when the goal is recurring work without immediate state change.

---

## Related Guides

- [States](/plugins/state-machine/states.md)
- [Actions](/plugins/state-machine/actions.md)
- [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md)
- [API Reference](/plugins/state-machine/guides/api-reference.md)
