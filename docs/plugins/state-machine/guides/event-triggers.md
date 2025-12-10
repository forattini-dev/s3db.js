
## 🎯 Event-Based Triggers (Automatic Transitions)

In addition to manual transitions via `send()`, the State Machine Plugin supports **automatic transitions** triggered by events. This enables fully automated workflows where state changes happen based on data updates, scheduled times, or custom conditions.

### Overview

Event-based triggers automatically move entities between states without manual `send()` calls. Instead of:

```javascript
// Manual transition
await ordersResource.update(order.id, { paymentStatus: 'confirmed' });
await stateMachine.send(order.id, 'PAY');  // Must manually trigger
```

You can configure automatic transitions:

```javascript
// Automatic transition - just update the data
await ordersResource.update(order.id, { paymentStatus: 'confirmed' });
// State machine automatically detects the change and transitions to 'processing'
```

### Trigger Types

The plugin supports 4 trigger types:

| Type | Description | Use Case |
|------|-------------|----------|
| **event** | Listen to resource/database events | React to data changes (updated, inserted, etc.) |
| **cron** | Schedule-based triggers | Periodic state checks (daily cleanup, expiration) |
| **date** | Time-based triggers | Transition at specific date/time |
| **function** | Custom condition functions | Complex business logic checks |

### Event Triggers (Resource Events)

Listen to resource events and automatically transition when conditions are met:

```javascript
new StateMachinePlugin({
  machines: {
    orderWorkflow: {
      initialState: 'pending',
      stateField: 'orderStatus',
      resource: ordersResource,

      states: {
        pending: {
          description: 'Order created, waiting for payment',

          // Event-based trigger configuration
          triggers: [{
            type: 'event',

            // Listen for updates to this specific order
            eventName: (context) => `updated:${context.id}`,
            eventSource: ordersResource,

            // Condition to check before transitioning
            condition: (context, event) => {
              return context.paymentStatus === 'confirmed' && context.paymentId;
            },

            // Target state when condition is met
            targetState: 'processing'
          }],

          // Manual transitions still work
          transitions: {
            cancel: 'cancelled'
          }
        },

        processing: {
          description: 'Payment confirmed, processing order',

          triggers: [{
            type: 'event',
            eventName: (context) => `updated:${context.id}`,
            eventSource: ordersResource,
            condition: (context, event) => {
              return context.shipmentId && context.trackingNumber;
            },
            targetState: 'shipped'
          }]
        },

        shipped: {
          description: 'Order shipped',

          triggers: [{
            type: 'event',
            eventName: (context) => `updated:${context.id}`,
            eventSource: ordersResource,
            condition: (context, event) => {
              return context.deliveredAt && context.signature;
            },
            targetState: 'delivered'
          }]
        },

        delivered: {
          description: 'Order delivered',
          type: 'final'
        },

        cancelled: {
          description: 'Order cancelled',
          type: 'final'
        }
      }
    }
  }
});
```

**Usage:**

```javascript
// Step 1: Create order (starts in 'pending' state)
const order = await ordersResource.insert({
  customerId: 'cust-123',
  productId: 'prod-456',
  totalAmount: 199.99,
  paymentStatus: 'pending'
});

await stateMachine.initializeEntity('orderWorkflow', order.id);

// Step 2: Confirm payment - triggers automatic transition to 'processing'
await ordersResource.update(order.id, {
  paymentStatus: 'confirmed',
  paymentId: 'pay-' + Date.now()
});
// State machine automatically detects the change and transitions!

// Step 3: Add shipment - triggers automatic transition to 'shipped'
await ordersResource.update(order.id, {
  shipmentId: 'ship-' + Date.now(),
  trackingNumber: 'TRK123456'
});
// Automatically transitions to 'shipped'!

// Step 4: Confirm delivery - triggers automatic transition to 'delivered'
await ordersResource.update(order.id, {
  deliveredAt: new Date().toISOString(),
  signature: 'John Doe'
});
// Automatically transitions to 'delivered'!
```

### Event Names

Use standard s3db.js resource events:

| Event Pattern | When It Fires | Example |
|---------------|---------------|---------|
| `inserted` | After any insert | All new records |
| `inserted:${id}` | After specific insert | Specific record created |
| `updated` | After any update | All updates |
| `updated:${id}` | After specific update | **Most common for triggers** |
| `deleted` | After any delete | All deletes |
| `deleted:${id}` | After specific delete | Specific record deleted |

**Best Practice**: Use ID-specific events (`updated:${context => context.id}`) to avoid triggering on unrelated records.

### 🔍 Detecting Which Fields Changed

When using event triggers with `updated` or `patched` events, you often need to check **which specific fields changed** before deciding whether to transition. The State Machine Plugin provides access to both old and new values through the event context.

#### Accessing Changed Fields

The `context` parameter in condition functions contains:
- `context.{field}` - Current field values (after the update)
- `context.$before.{field}` - Previous field values (before the update, if available)

**Example: Transition only when specific fields change**

```javascript
new StateMachinePlugin({
  machines: {
    userOnboarding: {
      initialState: 'incomplete',
      stateField: 'onboardingStatus',
      resource: usersResource,

      states: {
        incomplete: {
          description: 'User profile is incomplete',

          triggers: [{
            type: 'event',
            eventName: (context) => `updated:${context.id}`,
            eventSource: usersResource,

            // ✅ Only transition when profileCompleted flag changes to true
            condition: (context, event) => {
              const wasIncomplete = context.$before?.profileCompleted === false;
              const isNowComplete = context.profileCompleted === true;

              // Transition only if the field actually changed
              return wasIncomplete && isNowComplete;
            },

            targetState: 'pending_verification'
          }]
        },

        pending_verification: {
          description: 'Profile complete, waiting for email verification',

          triggers: [{
            type: 'event',
            eventName: (context) => `updated:${context.id}`,
            eventSource: usersResource,

            // ✅ Only transition when emailVerified changes to true
            condition: (context, event) => {
              return context.emailVerified === true &&
                     context.$before?.emailVerified !== true;
            },

            targetState: 'active'
          }]
        },

        active: {
          description: 'User fully onboarded and active',
          type: 'final'
        }
      }
    }
  }
});
```

#### Field-Level Validation Patterns

**Pattern 1: Check if a specific field changed**

```javascript
condition: (context, event) => {
  // Did the 'status' field change?
  const statusChanged = context.status !== context.$before?.status;
  const isApproved = context.status === 'approved';

  return statusChanged && isApproved;
}
```

**Pattern 2: Detect numeric threshold changes**

```javascript
condition: (context, event) => {
  // Did score cross 70% threshold?
  const previousScore = context.$before?.score || 0;
  const currentScore = context.score || 0;

  return previousScore < 70 && currentScore >= 70;
}
```

**Pattern 3: Multiple field validation**

```javascript
condition: (context, event) => {
  // All required fields must be filled
  const allFieldsFilled =
    context.name &&
    context.email &&
    context.phone &&
    context.address;

  // At least one field was previously empty
  const wasIncomplete =
    !context.$before?.name ||
    !context.$before?.email ||
    !context.$before?.phone ||
    !context.$before?.address;

  return allFieldsFilled && wasIncomplete;
}
```

**Pattern 4: Detecting specific value changes**

```javascript
condition: (context, event) => {
  // Transition only when payment method changes from null to 'credit_card'
  const paymentMethodAdded =
    !context.$before?.paymentMethod &&
    context.paymentMethod === 'credit_card';

  return paymentMethodAdded;
}
```

#### Complete Example: Order Approval Workflow

```javascript
const ordersResource = await database.createResource({
  name: 'orders',
  attributes: {
    customerId: 'string|required',
    totalAmount: 'number|required',
    managerApproved: 'boolean|optional',
    financeApproved: 'boolean|optional',
    shippingReady: 'boolean|optional',
    trackingNumber: 'string|optional',
    status: 'string|optional'
  }
});

const stateMachine = new StateMachinePlugin({
  machines: {
    orderApproval: {
      initialState: 'pending_manager',
      stateField: 'status',
      resource: ordersResource,

      states: {
        pending_manager: {
          description: 'Waiting for manager approval',

          triggers: [{
            type: 'event',
            eventName: (context) => `updated:${context.id}`,
            eventSource: ordersResource,

            // ✅ Transition only when managerApproved changes to true
            condition: (context, event) => {
              const wasNotApproved = context.$before?.managerApproved !== true;
              const isNowApproved = context.managerApproved === true;

              console.log(`Manager approval check:`, {
                before: context.$before?.managerApproved,
                after: context.managerApproved,
                willTransition: wasNotApproved && isNowApproved
              });

              return wasNotApproved && isNowApproved;
            },

            targetState: 'pending_finance'
          }]
        },

        pending_finance: {
          description: 'Waiting for finance approval',

          triggers: [{
            type: 'event',
            eventName: (context) => `updated:${context.id}`,
            eventSource: ordersResource,

            // ✅ Transition only when financeApproved changes to true
            condition: (context, event) => {
              return context.financeApproved === true &&
                     context.$before?.financeApproved !== true;
            },

            targetState: 'approved'
          }]
        },

        approved: {
          description: 'Fully approved, preparing for shipment',

          triggers: [{
            type: 'event',
            eventName: (context) => `updated:${context.id}`,
            eventSource: ordersResource,

            // ✅ Transition when shipping is ready AND tracking number is added
            condition: (context, event) => {
              const shippingJustReady =
                context.shippingReady === true &&
                context.$before?.shippingReady !== true;

              const hasTracking = !!context.trackingNumber;

              return shippingJustReady && hasTracking;
            },

            targetState: 'shipped'
          }]
        },

        shipped: {
          description: 'Order shipped to customer',
          type: 'final'
        }
      }
    }
  }
});

await database.usePlugin(stateMachine);

// Usage example:
const order = await ordersResource.insert({
  customerId: 'cust-123',
  totalAmount: 1500,
  managerApproved: false,
  financeApproved: false,
  shippingReady: false
});

await stateMachine.initializeEntity('orderApproval', order.id);
console.log('Order created, status:', (await ordersResource.get(order.id)).status);
// Output: pending_manager

// Manager approves (triggers transition to pending_finance)
await ordersResource.update(order.id, { managerApproved: true });
await new Promise(r => setTimeout(r, 100));
console.log('After manager approval:', (await ordersResource.get(order.id)).status);
// Output: pending_finance

// Finance approves (triggers transition to approved)
await ordersResource.update(order.id, { financeApproved: true });
await new Promise(r => setTimeout(r, 100));
console.log('After finance approval:', (await ordersResource.get(order.id)).status);
// Output: approved

// Shipping ready with tracking (triggers transition to shipped)
await ordersResource.update(order.id, {
  shippingReady: true,
  trackingNumber: 'TRK123456'
});
await new Promise(r => setTimeout(r, 100));
console.log('After shipping ready:', (await ordersResource.get(order.id)).status);
// Output: shipped
```

#### Using `patched` Event (Performance Optimization)

For metadata-only updates, use the `patched` event instead of `updated` for better performance:

```javascript
states: {
  monitoring: {
    triggers: [{
      type: 'event',
      // Use patched for lightweight metadata-only updates
      eventName: (context) => `patched:${context.id}`,
      eventSource: sensorsResource,

      condition: (context, event) => {
        // Check if temperature threshold exceeded
        const temp = parseFloat(context.temperature);
        const prevTemp = parseFloat(context.$before?.temperature || 0);

        const crossedThreshold = prevTemp < 80 && temp >= 80;
        return crossedThreshold;
      },

      targetState: 'alert'
    }]
  }
}
```

**When to use `patched` vs `updated`:**

| Event | Use When | Performance |
|-------|----------|-------------|
| `updated` | Full record updates, body changes | Standard (GET + PUT) |
| `patched` | Metadata-only updates | 40-60% faster (HEAD + COPY) |

**Note:** Both `updated` and `patched` events provide `$before` values for comparison.

#### Best Practices

1. **Always check `$before` exists**: Use optional chaining (`?.`) to handle first updates
   ```javascript
   context.$before?.fieldName !== context.fieldName
   ```

2. **Validate the change, not just the value**: Ensure the field actually changed
   ```javascript
   // ✅ Good - checks if changed
   context.approved === true && context.$before?.approved !== true

   // ❌ Bad - might trigger on every update
   context.approved === true
   ```

3. **Use specific conditions**: Be precise about what triggers a transition
   ```javascript
   // ✅ Good - specific threshold
   context.score >= 70 && context.$before?.score < 70

   // ❌ Bad - too broad
   context.score > 0
   ```

4. **Log for debugging**: Add console.log in conditions to understand trigger behavior
   ```javascript
   condition: (context, event) => {
     console.log('Checking approval:', {
       before: context.$before?.approved,
       after: context.approved
     });
     return context.approved === true;
   }
   ```

5. **Handle undefined `$before`**: First update won't have previous values
   ```javascript
   const prevValue = context.$before?.status || 'unknown';
   const changedToActive = prevValue !== 'active' && context.status === 'active';
   ```

### Cron Triggers (Scheduled)

Periodically check conditions and transition:

```javascript
states: {
  pending_payment: {
    triggers: [{
      type: 'cron',

      // Check every hour
      schedule: '0 * * * *',  // Cron syntax

      // Condition to check
      condition: (context, event) => {
        const createdAt = new Date(context.createdAt);
        const hoursSinceCreated = (Date.now() - createdAt) / (1000 * 60 * 60);
        return hoursSinceCreated > 24;  // Expire after 24 hours
      },

      targetState: 'expired'
    }]
  }
}
```

### Date Triggers (Time-Based)

Transition at a specific date/time:

```javascript
states: {
  scheduled: {
    triggers: [{
      type: 'date',

      // Field containing the target date
      dateField: 'scheduledStartDate',

      // Optional: check additional conditions
      condition: (context, event) => {
        return context.approved === true;
      },

      targetState: 'active'
    }]
  }
}
```

### Function Triggers (Custom Logic)

Run custom logic to determine when to transition:

```javascript
states: {
  processing: {
    triggers: [{
      type: 'function',

      // Custom function to check conditions
      checkFunction: async (context, machine) => {
        // Check external systems
        const inventory = await machine.database.resources.inventory.get(context.productId);
        const payment = await checkPaymentStatus(context.paymentId);

        return inventory.quantity > 0 && payment.status === 'cleared';
      },

      // How often to check (milliseconds)
      interval: 60000,  // Check every minute

      targetState: 'ready_to_ship'
    }]
  }
}
```

### Trigger Configuration Reference

```javascript
triggers: [{
  // Required: trigger type
  type: 'event' | 'cron' | 'date' | 'function',

  // Target state when trigger fires
  targetState: string,

  // Optional: condition to check before transitioning
  condition: (context, event) => boolean,

  // Event trigger specific:
  eventName: string | ((context) => string),
  eventSource: Resource,

  // Cron trigger specific:
  schedule: string,  // Cron syntax

  // Date trigger specific:
  dateField: string,  // Field name containing target date

  // Function trigger specific:
  checkFunction: async (context, machine) => boolean,
  interval: number  // Check interval in milliseconds
}]
```

### Combining Triggers and Manual Transitions

Triggers and manual transitions work together:

```javascript
states: {
  pending: {
    // Automatic transition via event trigger
    triggers: [{
      type: 'event',
      eventName: (context) => `updated:${context.id}`,
      eventSource: ordersResource,
      condition: (context) => context.paymentStatus === 'confirmed',
      targetState: 'processing'
    }],

    // Manual transitions still available
    transitions: {
      cancel: 'cancelled',      // Can manually cancel
      approve: 'processing'     // Can manually approve
    }
  }
}
```

### Monitoring Trigger Execution

Listen to trigger events for debugging and monitoring:

```javascript
// Listen to trigger executions
stateMachine.on('plg:state-machine:trigger-executed', (data) => {
  console.log(`⚡ Trigger Executed:`);
  console.log(`   Machine: ${data.machineId}`);
  console.log(`   Entity: ${data.entityId}`);
  console.log(`   Trigger Type: ${data.triggerType}`);
  console.log(`   Result: ${data.result}`);
  console.log(`   Target State: ${data.targetState}`);
});

// Listen to successful transitions from triggers
stateMachine.on('plg:state-machine:transition', (data) => {
  if (data.triggeredBy === 'event') {
    console.log(`🔄 Auto-transition: ${data.fromState} → ${data.toState}`);
  }
});
```

### Use Cases for Event-Based Triggers

**1. Order Processing Workflows**
- Payment confirmation → auto-transition to "processing"
- Shipment creation → auto-transition to "shipped"
- Delivery confirmation → auto-transition to "delivered"

**2. Document Approval Chains**
- All approvers signed → auto-transition to "approved"
- Rejection received → auto-transition to "rejected"

**3. User Onboarding Flows**
- Email verified → auto-transition to "verified"
- Profile completed → auto-transition to "active"

**4. Ticket Status Tracking**
- Support response added → auto-transition to "in_progress"
- Customer reply received → auto-transition to "waiting_support"
- Resolution confirmed → auto-transition to "closed"

**5. Asset Lifecycle Management**
- Maintenance completed → auto-transition to "operational"
- Expiration date reached → auto-transition to "expired"

### Complete Example

See the full working example in **[docs/examples/e51-state-machine-event-triggers.js](/examples/e51-state-machine-event-triggers.js)** which demonstrates:
- Complete order workflow with event-based triggers
- Multiple trigger conditions
- Event monitoring
- Automatic state progression based on data changes

### Benefits of Event-Based Triggers

✅ **Reduced Boilerplate**: No need to manually call `send()` after every update
✅ **Consistency**: State changes always happen when conditions are met
✅ **Decoupling**: Business logic separated from state machine logic
✅ **Automation**: Fully automated workflows without manual intervention
✅ **Flexibility**: Combine automatic triggers with manual transitions

### Best Practices

1. **Use ID-specific events** (`updated:${context => context.id}`) to avoid cross-contamination
2. **Keep conditions simple** - complex logic should be in guards or actions
3. **Monitor trigger executions** - use event listeners for debugging
4. **Combine with manual transitions** - provide both automatic and manual paths
5. **Test trigger conditions thoroughly** - ensure they fire when expected

---
