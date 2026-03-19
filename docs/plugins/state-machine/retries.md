# Retries

> What this guide covers: retry policy for action execution, backoff, classification, and where retries belong in the design.

**Audience:** Developers integrating unstable external systems
**Time to read:** 7 min
**Difficulty:** Intermediate

---

## What Retries Apply To

Retries in this plugin apply to action execution.

They do not apply to:
- invalid event maps
- guard failures
- unknown states
- invalid machine configuration

That distinction matters:
- transition validity is a logic concern
- retries are a resilience concern

---

## Where Retry Config Can Live

Retry config can be declared:
- globally on the plugin
- per machine
- per state

More specific config overrides broader config.

```javascript
const plugin = new StateMachinePlugin({
  retryConfig: {
    maxAttempts: 2,
    backoffStrategy: 'linear',
    baseDelay: 500,
    maxDelay: 2000
  },
  stateMachines: {
    payout: {
      retryConfig: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        baseDelay: 1000,
        maxDelay: 5000
      },
      initialState: 'approved',
      states: {
        approved: {
          on: {
            SEND: 'processing'
          }
        },
        processing: {
          entry: 'dispatchTransfer',
          retryConfig: {
            maxAttempts: 5,
            backoffStrategy: 'exponential',
            baseDelay: 1500,
            maxDelay: 15000
          },
          on: {
            COMPLETE: 'paid',
            FAIL: 'failed'
          }
        },
        paid: { type: 'final' },
        failed: { type: 'final' }
      }
    }
  }
});
```

---

## Retry Fields

Supported fields:
- `maxAttempts`
- `backoffStrategy`
- `baseDelay`
- `maxDelay`
- `retryableErrors`
- `nonRetriableErrors`
- `onRetry`

Backoff strategies:
- `fixed`
- `linear`
- `exponential`

---

## Rich Example

```javascript
const plugin = new StateMachinePlugin({
  retryConfig: {
    maxAttempts: 2,
    backoffStrategy: 'linear',
    baseDelay: 500,
    maxDelay: 2000,
    retryableErrors: ['ETIMEDOUT', 'ECONNRESET']
  },
  stateMachines: {
    payout: {
      resource: 'payouts',
      stateField: 'status',
      initialState: 'approved',
      states: {
        approved: {
          on: {
            SEND: 'processing'
          }
        },
        processing: {
          on: {
            COMPLETE: 'paid',
            FAIL: 'failed'
          },
          entry: 'dispatchTransfer',
          retryConfig: {
            maxAttempts: 4,
            backoffStrategy: 'exponential',
            baseDelay: 1000,
            maxDelay: 8000,
            nonRetriableErrors: ['ValidationError'],
            onRetry: async (attempt, error, context) => {
              // Emit telemetry for every retry attempt.
              console.log('retrying dispatchTransfer', {
                attempt,
                error: error.message,
                context
              });
            }
          }
        },
        paid: { type: 'final' },
        failed: { type: 'final' }
      }
    }
  },
  actions: {
    dispatchTransfer: async (context, event, machine) => {
      // Call an unstable external provider from an action.
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

## When To Use Retries

Use retries when actions call:
- third-party APIs
- flaky network services
- eventually available downstream systems

Do not use retries to hide:
- bad input
- missing permissions
- invalid state design
- guard failures

If an error is deterministic, retrying it just burns time.

---

## Design Guidance

Keep retries close to the unstable action.

Usually:
- global retry config sets the platform default
- machine retry config adjusts per workflow
- state retry config tightens policy for the exact integration point

This keeps the policy explicit and local.

---

## Related Guides

- [Actions](/plugins/state-machine/actions.md)
- [Guards](/plugins/state-machine/guards.md)
- [Runtime Behavior](/plugins/state-machine/guides/runtime-behavior.md)
- [API Reference](/plugins/state-machine/guides/api-reference.md)
