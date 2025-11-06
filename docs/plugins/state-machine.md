# 🤖 State Machine Plugin

> **Enforce complex workflow transitions with guards, events, and audit trails.**
>
> **Navigation:** [← Plugin Index](./README.md) | [Configuration ↓](#-configuration-reference) | [FAQ ↓](#-faq)

---

## ⚡ IMPORTANT FIX (v13.4.0)

**Fixed race condition with resource events:**
The plugin now tracks pending event handlers and provides `waitForPendingEvents()` method to ensure all state transitions complete before continuing.

**Works with BOTH async and sync events:**

```javascript
// Option 1: Async events (default) - use waitForPendingEvents()
const orders = await db.createResource({ name: 'orders', asyncEvents: true });
await orders.update('order-123', { paymentStatus: 'confirmed' });
await stateMachine.waitForPendingEvents(); // Wait for handlers
// State transition completed ✅

// Option 2: Sync events - immediate, no waiting needed
const orders = await db.createResource({ name: 'orders', asyncEvents: false });
await orders.update('order-123', { paymentStatus: 'confirmed' });
// State transition completed IMMEDIATELY ✅
```

See [example e76](../examples/e76-state-machine-sync-events.js) for complete demo.

---

## ⚡ TLDR

**Finite state machine** for complex workflows with controlled transitions and business rule validation.

**Usage example:**
```javascript
await db.usePlugin(new StateMachinePlugin({ stateMachines: { order: { initialState: 'pending', states: { pending: { on: { PAY: 'paid' }}, paid: { type: 'final' }}}}}));
await db.stateMachine('order').send('order-123', 'PAY');
```

> 🧩 **Namespaces**: Set `namespace: 'fulfillment'` (or pass an alias to `db.usePlugin`) when running multiple StateMachinePlugin instances. Transition/audit resources will be emitted as `plg_fulfillment_state_transitions`, etc.

**Main features:**
- ✅ Well-defined states and transitions
- ✅ Guard functions (conditional validation)
- ✅ Action handlers (transition logic)
- ✅ Automatic audit trail
- ✅ State persistence in DB
- ✅ Distributed locks (prevent race conditions)

**When to use:**
- 🛒 Order processing
- 👤 User onboarding
- ✅ Approval workflows
- 📦 Delivery status
- 💳 Payment processing

---

## 📦 Dependencies

**Required:**
```bash
pnpm install s3db.js
```

**NO Peer Dependencies!**

StateMachinePlugin is **built into s3db.js core** with zero external dependencies!

**Why Zero Dependencies?**

- ✅ Pure JavaScript implementation (no external libraries)
- ✅ Uses only Node.js built-ins and s3db.js core features
- ✅ Lightweight and fast (~10KB plugin code)
- ✅ Works instantly after installing s3db.js
- ✅ No version conflicts or compatibility issues

**What's Included:**

- **State Machine Logic**: Transition validation, guards, actions
- **Event System**: Leverages s3db.js resource events
- **Persistence**: Uses s3db.js resources for state storage
- **Audit Trail**: Automatic transition logging to s3db.js
- **Distributed Locks**: Uses PluginStorage for concurrency control
- **Visualization**: GraphViz DOT format export (requires `graphviz` CLI tool for rendering)

**Optional External Tools:**

If you want to render state machine diagrams visually:

```bash
# For diagram visualization (optional)
# Ubuntu/Debian
sudo apt install graphviz

# macOS
brew install graphviz

# Windows
choco install graphviz
```

Then generate diagrams:

```javascript
const machine = db.stateMachine('order');
console.log(machine.visualize()); // Outputs GraphViz DOT format

// Save to file and render
// $ node script.js > state-machine.dot
// $ dot -Tpng state-machine.dot > state-machine.png
```

**Minimum Node.js Version:** 18.x (for async/await, native Map/Set performance)

---

## ⚡ Quick Start

Build a simple order workflow in under 2 minutes:

```javascript
import { Database, StateMachinePlugin } from 's3db.js';

// Step 1: Create database
const db = new Database({ connectionString: 's3://key:secret@bucket' });
await db.connect();

// Step 2: Create orders resource
const orders = await db.createResource({
  name: 'orders',
  attributes: {
    customerId: 'string|required',
    total: 'number|required',
    status: 'string|required'  // State field
  }
});

// Step 3: Configure state machine
const stateMachinePlugin = new StateMachinePlugin({
  stateMachines: {
    order: {
      resource: 'orders',           // Resource to manage
      stateField: 'status',         // Field that stores state
      initialState: 'pending',      // Initial state for new orders

      states: {
        pending: {
          on: {
            PAY: 'paid',            // Event PAY → paid state
            CANCEL: 'cancelled'     // Event CANCEL → cancelled state
          }
        },
        paid: {
          on: {
            SHIP: 'shipped',
            CANCEL: 'refunded'
          }
        },
        shipped: {
          on: {
            DELIVER: 'delivered'
          }
        },
        delivered: {
          type: 'final'             // Final state (no more transitions)
        },
        cancelled: {
          type: 'final'
        },
        refunded: {
          type: 'final'
        }
      }
    }
  }
});

await db.usePlugin(stateMachinePlugin);

// Step 4: Create an order (starts in 'pending' state)
const order = await orders.insert({
  customerId: 'customer-1',
  total: 99.99,
  status: 'pending'
});

console.log('Order created:', order.id, 'Status:', order.status);
// Order created: order-1 Status: pending

// Step 5: Transition through states
await db.stateMachine('order').send(order.id, 'PAY');
const paidOrder = await orders.get(order.id);
console.log('After payment:', paidOrder.status);
// After payment: paid

await db.stateMachine('order').send(order.id, 'SHIP');
const shippedOrder = await orders.get(order.id);
console.log('After shipping:', shippedOrder.status);
// After shipping: shipped

await db.stateMachine('order').send(order.id, 'DELIVER');
const deliveredOrder = await orders.get(order.id);
console.log('After delivery:', deliveredOrder.status);
// After delivery: delivered

// Step 6: Try invalid transition (will throw error)
try {
  await db.stateMachine('order').send(order.id, 'SHIP');
  // Error! Can't ship when already delivered
} catch (error) {
  console.log('Invalid transition prevented:', error.message);
  // Invalid transition prevented: No transition defined for event 'SHIP' from state 'delivered'
}
```

**What just happened:**
1. ✅ State machine configured with 6 states (pending → paid → shipped → delivered)
2. ✅ Automatic state validation (only valid transitions allowed)
3. ✅ State persisted in database (`status` field)
4. ✅ Invalid transitions prevented automatically

**Next steps:**
- Add guard functions for conditional transitions (see [Usage Examples](#usage-examples))
- Add action handlers for transition side-effects (see [Advanced Patterns](#advanced-patterns))
- Enable audit trail for state changes (see [Configuration Options](#configuration-options))

---

## 📋 Table of Contents

- [Dependencies](#-dependencies)
- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Event-Based Triggers (Automatic Transitions)](#-event-based-triggers-automatic-transitions)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)
- [Error Handling](#-error-handling)
- [Troubleshooting](#troubleshooting)
- [See Also](#see-also)
- [FAQ](#-faq)

---

## Overview

The State Machine Plugin provides finite state machine capabilities for managing complex workflows and business processes. It ensures that your resources can only transition between valid states according to predefined rules, providing consistency and preventing invalid state changes.

### How It Works

1. **State Definition**: Define valid states and allowed transitions
2. **Event-Driven Transitions**: Trigger state changes through events
3. **Guard Functions**: Implement conditional logic for transitions
4. **Action Handlers**: Execute code when entering/exiting states
5. **State Persistence**: Automatically save state changes to the database

> 🤖 **Workflow Automation**: Perfect for order processing, user onboarding, approval workflows, and any process with defined states and business rules.

### State Machine Diagram Example

Here's a visual representation of an order processing state machine:

```
                    ┌──────────┐
                    │  draft   │
                    └────┬─────┘
                         │ SUBMIT
                         ▼
                ┌────────────────┐
                │ pending_payment│
                └────┬───────┬───┘
                     │       │ CANCEL
              PAY    │       ▼
                     │  ┌───────────┐
                     │  │ cancelled │ (final)
                     │  └───────────┘
                     ▼
                ┌────────┐
                │  paid  │
                └────┬───┘
                     │ FULFILL
                     ▼
              ┌──────────────┐
              │  fulfilling  │
              └────┬─────────┘
                   │ SHIP
                   ▼
              ┌──────────┐
              │ shipped  │
              └────┬─────┘
                   │ DELIVER
                   ▼
              ┌───────────┐
              │ delivered │ (final)
              └───────────┘
```

> **Interactive Visualization**: Use the `visualize()` method to generate GraphViz diagrams:
> ```bash
> $ node -e "console.log(machine.visualize())" > state-machine.dot
> $ dot -Tpng state-machine.dot > state-machine.png
> ```

---

## Key Features

### 🎯 Core Features
- **Finite State Machine**: Well-defined states with controlled transitions
- **Event-Driven Architecture**: Trigger transitions through named events
- **Guard Functions**: Conditional logic to prevent invalid transitions
- **Action Handlers**: Execute code during state transitions
- **State Persistence**: Automatic database updates on state changes

### 🔧 Technical Features
- **Multiple State Machines**: Support for multiple independent state machines
- **Context Preservation**: Maintain state and data throughout transitions
- **Error Handling**: Robust error handling with rollback capabilities
- **Audit Trail**: Complete history of state transitions
- **Async Support**: Full support for asynchronous operations
- **Distributed Locks**: Prevent concurrent transitions with PluginStorage locks
- **Multi-Worker Safe**: Automatic concurrency control across multiple workers

---

## Installation & Setup

### Basic Setup

```javascript
import { S3db, StateMachinePlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [
    new StateMachinePlugin({
      stateMachines: {
        order_processing: {
          initialState: 'pending',
          states: {
            pending: {
              on: { CONFIRM: 'confirmed', CANCEL: 'cancelled' }
            },
            confirmed: {
              on: { PREPARE: 'preparing', CANCEL: 'cancelled' },
              entry: 'onConfirmed'
            },
            preparing: {
              on: { SHIP: 'shipped', CANCEL: 'cancelled' },
              guards: { SHIP: 'canShip' }
            },
            shipped: {
              on: { DELIVER: 'delivered', RETURN: 'returned' }
            },
            delivered: { type: 'final' },
            cancelled: { type: 'final' },
            returned: { type: 'final' }
          }
        }
      },
      actions: {
        onConfirmed: async (context, event, machine) => {
          console.log(`Order ${context.id} confirmed!`);
          return { action: 'confirmed', timestamp: new Date() };
        }
      },
      guards: {
        canShip: async (context, event, machine) => {
          const inventory = await machine.database.resources.inventory.get(context.productId);
          return inventory && inventory.quantity >= context.quantity;
        }
      }
    })
  ]
});

await s3db.connect();

// Use state machine with your resources
const orders = s3db.resources.orders;
await orders.insert({
  id: 'order-123',
  productId: 'prod-456',
  quantity: 2,
  _state: 'pending' // Initial state
});

// Trigger state transitions
await s3db.stateMachine('order_processing').send('order-123', 'CONFIRM');
```

### Plugin Resources

The StateMachinePlugin automatically creates internal resources for state tracking and audit:

| Resource | Purpose | Structure |
|----------|---------|-----------|
| `state_machine_transitions` | Complete transition history for audit trail | `{ id, machineId, entityId, from, to, event, context, timestamp }` |
| `state_machine_entities` | Current state of all entities | `{ id, machineId, entityId, currentState, context, updatedAt }` |

> **Automatic Management**: These resources are created automatically when the plugin starts. The transitions resource provides complete audit trail with full context, and entities resource stores current state for fast lookups.

> **Partition Optimization**: Transitions are partitioned by `machineId` and `entityId` for efficient historical queries. Use `getTransitionHistory()` to leverage partition-based lookups.

---

## Configuration Options

### State Machine Configuration

```javascript
{
  stateMachines: {
    [machineName]: {
      initialState: string,           // Initial state for new instances
      states: {
        [stateName]: {
          on?: { [event]: targetState }, // Event transitions
          entry?: string | function,     // Action on state entry
          exit?: string | function,      // Action on state exit
          guards?: { [event]: string },  // Guard conditions
          type?: 'final'                 // Mark as final state
        }
      },
      context?: object,                 // Default context data
      strict?: boolean                  // Strict mode (default: true)
    }
  },
  actions: {
    [actionName]: function             // Named action functions
  },
  guards: {
    [guardName]: function              // Named guard functions
  },
  stateField: string,                  // Field name for state (default: '_state')

  // Concurrency Control (Distributed Locks)
  workerId: string,                    // Worker identifier (default: 'default')
  lockTimeout: number,                 // Max wait for lock in ms (default: 1000)
  lockTTL: number                      // Lock TTL in seconds (default: 5)
}
```

### Concurrency Control

The plugin uses **distributed locks** (via PluginStorage) to prevent concurrent transitions for the same entity, ensuring state consistency in multi-worker environments.

```javascript
new StateMachinePlugin({
  stateMachines: { /* ... */ },

  // Configure distributed locking
  workerId: 'worker-1',      // Unique worker identifier
  lockTimeout: 2000,         // Wait up to 2s for lock acquisition
  lockTTL: 10                // Lock expires after 10s (prevent deadlock)
});
```

**How it works:**
1. Before each transition, a distributed lock is acquired for `{machineId}-{entityId}`
2. If lock cannot be acquired within `lockTimeout`, transition fails with error
3. Lock is automatically released after transition completes (success or failure)
4. If worker crashes, lock expires after `lockTTL` seconds (auto-recovery)

**Benefits:**
- ✅ Prevents race conditions in concurrent transitions
- ✅ Automatic deadlock prevention (TTL)
- ✅ Multi-worker safe (different workers can't corrupt state)
- ✅ Transparent (no API changes required)

### State Definition

```javascript
states: {
  // Basic state with transitions
  pending: {
    on: {
      APPROVE: 'approved',
      REJECT: 'rejected'
    }
  },
  
  // State with entry action
  approved: {
    on: { PROCESS: 'processing' },
    entry: 'onApproved'  // Calls actions.onApproved
  },
  
  // State with guard condition
  processing: {
    on: { COMPLETE: 'completed' },
    guards: { COMPLETE: 'canComplete' }  // Must pass guards.canComplete
  },
  
  // Final state
  completed: {
    type: 'final'
  }
}
```

---

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

See the full working example in **[docs/examples/e51-state-machine-event-triggers.js](../examples/e51-state-machine-event-triggers.js)** which demonstrates:
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

## Usage Examples

### Order Processing Workflow

```javascript
const orderStateMachine = new StateMachinePlugin({
  stateMachines: {
    order_processing: {
      initialState: 'draft',
      states: {
        draft: {
          on: {
            SUBMIT: 'pending_payment',
            DELETE: 'deleted'
          },
          entry: 'onDraftCreated'
        },
        pending_payment: {
          on: {
            PAY: 'paid',
            CANCEL: 'cancelled',
            EXPIRE: 'expired'
          },
          guards: {
            PAY: 'hasValidPayment'
          }
        },
        paid: {
          on: {
            FULFILL: 'fulfilling',
            REFUND: 'refunded'
          },
          entry: 'onPaymentReceived'
        },
        fulfilling: {
          on: {
            SHIP: 'shipped',
            FAIL: 'fulfillment_failed'
          },
          guards: {
            SHIP: 'inventoryAvailable'
          }
        },
        shipped: {
          on: {
            DELIVER: 'delivered',
            RETURN: 'returned'
          }
        },
        delivered: { type: 'final' },
        cancelled: { type: 'final' },
        expired: { type: 'final' },
        refunded: { type: 'final' },
        returned: { type: 'final' },
        deleted: { type: 'final' }
      }
    }
  },
  
  actions: {
    onDraftCreated: async (context, event, machine) => {
      console.log(`Order ${context.id} created in draft state`);
      return { created_at: new Date().toISOString() };
    },
    
    onPaymentReceived: async (context, event, machine) => {
      // Process payment
      console.log(`Payment received for order ${context.id}`);
      
      // Update order with payment info
      await machine.database.resources.orders.update(context.id, {
        payment_received_at: new Date().toISOString(),
        payment_amount: event.amount,
        payment_method: event.method
      });
      
      return { payment_processed: true };
    }
  },
  
  guards: {
    hasValidPayment: async (context, event, machine) => {
      // Validate payment information
      return event.amount >= context.total_amount && 
             event.payment_method && 
             event.payment_token;
    },
    
    inventoryAvailable: async (context, event, machine) => {
      // Check inventory for all order items
      const items = context.items || [];
      
      for (const item of items) {
        const inventory = await machine.database.resources.inventory.get(item.product_id);
        if (!inventory || inventory.quantity < item.quantity) {
          return false;
        }
      }
      
      return true;
    }
  }
});

// Usage
const orders = s3db.resources.orders;

// Create new order
await orders.insert({
  id: 'order-123',
  customer_id: 'customer-456',
  items: [
    { product_id: 'prod-1', quantity: 2, price: 25.00 },
    { product_id: 'prod-2', quantity: 1, price: 50.00 }
  ],
  total_amount: 100.00,
  _state: 'draft'
});

// Submit order
await s3db.stateMachine('order_processing').send('order-123', 'SUBMIT');

// Process payment
await s3db.stateMachine('order_processing').send('order-123', 'PAY', {
  amount: 100.00,
  payment_method: 'credit_card',
  payment_token: 'tok_123456'
});

// Fulfill order
await s3db.stateMachine('order_processing').send('order-123', 'FULFILL');
```

### User Onboarding Workflow

```javascript
const userOnboardingMachine = {
  stateMachines: {
    user_onboarding: {
      initialState: 'registered',
      states: {
        registered: {
          on: {
            VERIFY_EMAIL: 'email_verified',
            RESEND_EMAIL: 'registered'
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
            SETUP_PREFERENCES: 'preferences_set',
            SKIP_PREFERENCES: 'active'
          },
          entry: 'profileCompletionBonus'
        },
        preferences_set: {
          on: { ACTIVATE: 'active' },
          entry: 'personalizeExperience'
        },
        active: {
          on: {
            SUSPEND: 'suspended',
            DEACTIVATE: 'deactivated'
          },
          type: 'final'
        },
        suspended: {
          on: {
            REACTIVATE: 'active',
            DEACTIVATE: 'deactivated'
          }
        },
        deactivated: { type: 'final' }
      }
    }
  },
  
  actions: {
    sendVerificationEmail: async (context, event, machine) => {
      // Send verification email
      console.log(`Sending verification email to ${context.email}`);
      return { verification_sent_at: new Date().toISOString() };
    },
    
    profileCompletionBonus: async (context, event, machine) => {
      // Award bonus for completing profile
      await machine.database.resources.user_rewards.insert({
        user_id: context.id,
        type: 'profile_completion',
        points: 100,
        awarded_at: new Date().toISOString()
      });
      
      return { bonus_awarded: 100 };
    },
    
    personalizeExperience: async (context, event, machine) => {
      // Set up personalized experience based on preferences
      const preferences = event.preferences || {};
      
      await machine.database.resources.user_preferences.insert({
        user_id: context.id,
        ...preferences,
        created_at: new Date().toISOString()
      });
      
      return { personalization_enabled: true };
    }
  }
};
```

### Approval Workflow

```javascript
const approvalWorkflowMachine = {
  stateMachines: {
    approval_workflow: {
      initialState: 'submitted',
      states: {
        submitted: {
          on: {
            ASSIGN: 'assigned',
            REJECT: 'rejected'
          },
          entry: 'notifySubmission'
        },
        assigned: {
          on: {
            REVIEW: 'under_review',
            REASSIGN: 'assigned',
            REJECT: 'rejected'
          }
        },
        under_review: {
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
            RESUBMIT: 'submitted',
            WITHDRAW: 'withdrawn'
          },
          entry: 'notifyChangesRequested'
        },
        approved: {
          type: 'final',
          entry: 'processApproval'
        },
        rejected: {
          type: 'final',
          entry: 'notifyRejection'
        },
        withdrawn: { type: 'final' }
      }
    }
  },
  
  actions: {
    notifySubmission: async (context, event, machine) => {
      // Notify approvers of new submission
      const approvers = await machine.database.resources.approvers.list({
        where: { department: context.department, active: true }
      });
      
      for (const approver of approvers) {
        // Send notification
        console.log(`Notifying approver ${approver.id} of submission ${context.id}`);
      }
      
      return { approvers_notified: approvers.length };
    },
    
    processApproval: async (context, event, machine) => {
      // Process the approved request
      console.log(`Processing approved request ${context.id}`);
      
      // Update request with approval info
      await machine.database.resources.requests.update(context.id, {
        approved_by: event.approver_id,
        approved_at: new Date().toISOString(),
        approval_comments: event.comments
      });
      
      return { processed: true };
    }
  },
  
  guards: {
    hasApprovalAuthority: async (context, event, machine) => {
      const approver = await machine.database.resources.approvers.get(event.approver_id);
      return approver && 
             approver.active && 
             approver.department === context.department &&
             approver.approval_limit >= context.amount;
    }
  }
};
```

---

## API Reference

### Plugin Methods

#### `stateMachine(machineName)`
Get a state machine instance.

```javascript
const machine = s3db.stateMachine('order_processing');
```

#### `send(recordId, event, eventData?)`
Send an event to trigger a state transition.

```javascript
await machine.send('order-123', 'CONFIRM', { confirmed_by: 'user-456' });
```

#### `getState(recordId)`
Get current state of a record.

```javascript
const currentState = await machine.getState('order-123');
```

#### `canTransition(recordId, event)`
Check if a transition is valid.

```javascript
const canConfirm = await machine.canTransition('order-123', 'CONFIRM');
```

#### `getHistory(recordId)`
Get transition history for a record.

```javascript
const history = await machine.getHistory('order-123');
```

#### `getValidEvents(recordId)`
Get all valid events for the current state of a record.

```javascript
const validEvents = await machine.getValidEvents('order-123');
// Returns: ['SHIP', 'CANCEL'] (if in 'confirmed' state)
```

#### `getTransitionHistory(recordId, options?)`
Get complete transition history for a record with filtering options.

```javascript
const history = await machine.getTransitionHistory('order-123', {
  limit: 50,
  fromDate: new Date('2024-01-01'),
  toDate: new Date('2024-12-31')
});
// Returns: [{ from, to, event, context, timestamp }, ...]
```

**Options:**
- `limit` (number): Maximum number of transitions to return (default: 100)
- `fromDate` (Date): Filter transitions after this date
- `toDate` (Date): Filter transitions before this date
- `status` (string): Filter by transition status ('success', 'failed')

#### `initializeEntity(recordId, context?)`
Initialize a new entity with the initial state and optional context.

```javascript
await machine.initializeEntity('order-456', {
  customerId: 'user-123',
  amount: 100.00
});
// Entity state set to initialState (e.g., 'pending')
```

#### `visualize()`
Generate GraphViz DOT format visualization of the state machine.

```javascript
const dot = machine.visualize();
// Save to file and convert to image:
// $ echo "$dot" > state-machine.dot
// $ dot -Tpng state-machine.dot > state-machine.png
```

**Returns**: DOT format string for GraphViz visualization, useful for documenting and debugging state machines.

### Action Functions

Action functions receive `(context, event, machine)` parameters:

```javascript
import { StateMachineError } from 's3db.js';

actions: {
  myAction: async (context, event, machine) => {
    // context: Current record data
    // event: Event data passed to send()
    // machine: State machine instance with database access
    
    // Perform actions
    await machine.database.resources.logs.insert({
      action: 'state_transition',
      record_id: context.id,
      timestamp: new Date().toISOString()
    });
    
    // Return data to merge into context
    return { processed_at: new Date().toISOString() };
  }
}
```

### Guard Functions

Guard functions return boolean values to allow/prevent transitions:

```javascript
guards: {
  myGuard: async (context, event, machine) => {
    // Check conditions
    const user = await machine.database.resources.users.get(event.user_id);
    return user && user.role === 'admin';
  }
}
```

---

## Advanced Patterns

### Hierarchical State Machines

```javascript
// Complex state machine with nested states
const complexWorkflow = {
  stateMachines: {
    order_fulfillment: {
      initialState: 'processing',
      states: {
        processing: {
          initialState: 'validating',
          states: {
            validating: {
              on: { VALID: 'inventory_check', INVALID: '#rejected' }
            },
            inventory_check: {
              on: { AVAILABLE: '#fulfilling', UNAVAILABLE: '#backordered' }
            }
          }
        },
        fulfilling: {
          initialState: 'preparing',
          states: {
            preparing: {
              on: { READY: 'shipping' }
            },
            shipping: {
              on: { SHIPPED: '#completed' }
            }
          }
        },
        completed: { type: 'final' },
        rejected: { type: 'final' },
        backordered: {
          on: { INVENTORY_AVAILABLE: 'processing' }
        }
      }
    }
  }
};
```

### State Machine Composition

```javascript
// Compose multiple state machines for complex workflows
class OrderManager {
  constructor(database) {
    this.database = database;
    this.orderMachine = database.stateMachine('order_processing');
    this.paymentMachine = database.stateMachine('payment_processing');
    this.fulfillmentMachine = database.stateMachine('fulfillment_processing');
  }
  
  async processOrder(orderId) {
    try {
      // Start order processing
      await this.orderMachine.send(orderId, 'SUBMIT');
      
      // Process payment
      await this.paymentMachine.send(orderId, 'CHARGE');
      
      // Start fulfillment
      await this.fulfillmentMachine.send(orderId, 'FULFILL');
      
      return { success: true };
    } catch (error) {
      // Handle errors and rollback if needed
      await this.handleOrderError(orderId, error);
      throw error;
    }
  }
  
  async handleOrderError(orderId, error) {
    // Rollback operations
    const orderState = await this.orderMachine.getState(orderId);
    const paymentState = await this.paymentMachine.getState(orderId);
    
    if (paymentState === 'charged') {
      await this.paymentMachine.send(orderId, 'REFUND');
    }
    
    if (orderState !== 'cancelled') {
      await this.orderMachine.send(orderId, 'CANCEL');
    }
  }
}
```

### Dynamic State Machines

```javascript
// Create state machines dynamically based on configuration
class DynamicStateMachine {
  constructor(plugin) {
    this.plugin = plugin;
  }
  
  async createWorkflow(workflowConfig) {
    const machineName = `dynamic_${Date.now()}`;
    
    const stateMachine = {
      initialState: workflowConfig.initialState,
      states: {}
    };
    
    // Build states from configuration
    workflowConfig.steps.forEach(step => {
      stateMachine.states[step.name] = {
        on: step.transitions || {},
        entry: step.onEntry,
        exit: step.onExit,
        guards: step.guards || {},
        type: step.isFinal ? 'final' : undefined
      };
    });
    
    // Register the state machine
    this.plugin.registerStateMachine(machineName, stateMachine);
    
    return machineName;
  }
}
```

---

## Best Practices

### 1. Design Clear State Diagrams

```javascript
// Document your state machine with clear states and transitions
/*
State Machine: order_processing

States:
- draft → [SUBMIT] → pending_payment
- pending_payment → [PAY] → paid
- pending_payment → [CANCEL] → cancelled
- paid → [FULFILL] → fulfilling
- fulfilling → [SHIP] → shipped
- shipped → [DELIVER] → delivered (final)

Guards:
- PAY: hasValidPayment
- FULFILL: inventoryAvailable
*/
```

### 2. Implement Comprehensive Error Handling

```javascript
actions: {
  processPayment: async (context, event, machine) => {
    try {
      const result = await paymentService.charge({
        amount: context.amount,
        token: event.payment_token
      });
      
      return { 
        payment_id: result.id,
        charged_at: new Date().toISOString()
      };
    } catch (error) {
      // Log error and transition to error state
      console.error(`Payment failed for order ${context.id}:`, error);
      
      // Trigger error transition
      await machine.send(context.id, 'PAYMENT_FAILED', {
        error: error.message,
        failed_at: new Date().toISOString()
      });
      
      throw error;
    }
  }
}
```

### 3. Use Guards for Business Rules

```javascript
guards: {
  canApprove: async (context, event, machine) => {
    const user = await machine.database.resources.users.get(event.user_id);
    const request = context;
    
    // Multiple validation rules
    return user && 
           user.active &&
           user.role === 'manager' &&
           user.department === request.department &&
           request.amount <= user.approval_limit &&
           !user.on_vacation;
  },
  
  inventoryAvailable: async (context, event, machine) => {
    const items = context.items || [];
    
    for (const item of items) {
      const inventory = await machine.database.resources.inventory.get(item.product_id);
      if (!inventory || inventory.available_quantity < item.quantity) {
        return false;
      }
    }
    
    return true;
  }
}
```

### 4. Maintain Audit Trails

```javascript
actions: {
  logTransition: async (context, event, machine) => {
    // Log every state transition for audit purposes
    await machine.database.resources.state_transitions.insert({
      id: `transition_${Date.now()}`,
      resource_type: 'order',
      resource_id: context.id,
      from_state: event.from,
      to_state: event.to,
      event_name: event.event,
      user_id: event.user_id,
      timestamp: new Date().toISOString(),
      metadata: {
        ip_address: event.ip,
        user_agent: event.userAgent,
        reason: event.reason
      }
    });
    
    return { transition_logged: true };
  }
}
```

### 5. Handle Concurrent State Changes

```javascript
import { StateMachineError } from 's3db.js';

// Implement optimistic locking for concurrent updates
actions: {
  safeStateUpdate: async (context, event, machine) => {
    const currentRecord = await machine.database.resources.orders.get(context.id);
    
    // Check if state has changed since we started
    if (currentRecord._state !== context._state) {
      throw new StateMachineError('State conflict detected during safe update', {
        statusCode: 409,
        retriable: false,
        suggestion: 'Reload the record and retry the transition.',
        currentState: currentRecord._state,
        targetState: context._state,
        resourceName: 'orders',
        operation: 'safeStateUpdate'
      });
    }
    
    // Proceed with update using version check
    await machine.database.resources.orders.update(context.id, {
      status_updated_at: new Date().toISOString(),
      updated_by: event.user_id
    }, {
      version: currentRecord._version // Optimistic locking
    });
    
    return { safely_updated: true };
  }
}
```

### 6. Test State Machine Logic

```javascript
// Comprehensive testing for state machines
describe('Order Processing State Machine', () => {
  let machine;
  
  beforeEach(() => {
    machine = s3db.stateMachine('order_processing');
  });
  
  test('should transition from draft to pending_payment', async () => {
    const orderId = 'test-order-1';
    
    // Create order in draft state
    await orders.insert({ id: orderId, _state: 'draft' });
    
    // Submit order
    await machine.send(orderId, 'SUBMIT');
    
    // Verify state change
    const state = await machine.getState(orderId);
    expect(state).toBe('pending_payment');
  });
  
  test('should prevent invalid transitions', async () => {
    const orderId = 'test-order-2';
    
    await orders.insert({ id: orderId, _state: 'draft' });
    
    // Try invalid transition
    await expect(
      machine.send(orderId, 'SHIP')
    ).rejects.toThrow('Invalid transition');
  });
  
  test('should enforce guard conditions', async () => {
    const orderId = 'test-order-3';
    
    await orders.insert({ 
      id: orderId, 
      _state: 'pending_payment',
      amount: 100
    });
    
    // Try payment without valid token
    await expect(
      machine.send(orderId, 'PAY', { amount: 100 })
    ).rejects.toThrow('Guard condition failed');
  });
});
```

### 7. State Persistence and Consistency

```javascript
// Configure state field name (default: '_state')
new StateMachinePlugin({
  stateField: 'status',  // Use 'status' instead of '_state'
  stateMachines: { ...}
});

// Ensure state is always in sync with database
actions: {
  onStateChange: async (context, event, machine) => {
    // Update entity record with new state
    await machine.database.resources.orders.update(context.id, {
      status: event.to,
      status_updated_at: new Date().toISOString(),
      status_updated_by: event.userId || 'system',
      previous_status: event.from
    });

    // Store detailed transition in audit log
    await machine.database.resources.state_transitions.insert({
      id: `transition_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      entity_type: 'order',
      entity_id: context.id,
      from_state: event.from,
      to_state: event.to,
      event_name: event.event,
      triggered_by: event.userId,
      timestamp: new Date().toISOString(),
      metadata: {
        ip_address: event.ip,
        user_agent: event.userAgent,
        reason: event.reason
      }
    });

    return { state_persisted: true };
  }
}

// Read state consistently
async function getOrderWithState(orderId) {
  const order = await db.resources.orders.get(orderId);
  const currentState = await stateMachine.getState(orderId);

  // Verify consistency between database and state machine
  if (order.status !== currentState) {
    console.warn(`State mismatch detected: DB has '${order.status}', machine has '${currentState}'`);

    // Option 1: Trust database
    await stateMachine.setState(orderId, order.status);

    // Option 2: Trust state machine
    // await db.resources.orders.update(orderId, { status: currentState });
  }

  return { ...order, _state: currentState };
}

// Handle state restoration on startup
async function restoreStateMachineState(orderId) {
  const order = await db.resources.orders.get(orderId);

  // Initialize state machine with database state
  await stateMachine.initializeEntity(orderId, {
    ...order,
    _state: order.status
  });

  console.log(`Restored state for order ${orderId}: ${order.status}`);
}
```

> **Important**: Always update the entity record when state changes to keep database and state machine in sync. Use the `stateField` option to customize which field stores the state.

> **Best Practice**: Store transition history in a separate audit resource for compliance and debugging. This enables full traceability of state changes over time.

---

## 🚨 Error Handling

The State Machine Plugin uses standardized error classes with comprehensive context and recovery guidance:

### StateMachineError

All state machine operations throw `StateMachineError` instances with detailed context:

```javascript
try {
  await stateMachine.send('order-123', 'INVALID_EVENT');
} catch (error) {
  console.error(error.name);        // 'StateMachineError'
  console.error(error.message);     // Brief error summary
  console.error(error.description); // Detailed explanation with guidance
  console.error(error.context);     // Machine name, event, state, etc.
}
```

### Common Errors

#### Invalid Transition

**When**: Sending event not allowed in current state
**Error**: `Invalid transition '{event}' from state '{currentState}'`
**Recovery**:
```javascript
// Bad
const order = await orders.get('order-123'); // state: 'delivered'
await stateMachine.send('order-123', 'SHIP');  // Throws - can't ship delivered order

// Good - Check valid transitions first
const validEvents = await stateMachine.canTransition('order-123', 'SHIP');
if (validEvents) {
  await stateMachine.send('order-123', 'SHIP');
} else {
  console.log('Cannot ship order in current state');
}

// Good - Check current state
const currentState = await stateMachine.getState('order-123');
if (currentState === 'confirmed') {
  await stateMachine.send('order-123', 'SHIP');
}
```

#### Guard Condition Failed

**When**: Guard function returns false or throws error
**Error**: `Transition blocked by guard '{guardName}': {reason}`
**Recovery**:
```javascript
import { StateMachineError } from 's3db.js';

// Define guard with clear error messages
guards: {
  canShip: async (context, event, machine) => {
    const inventory = await machine.database.resources.inventory.get(context.productId);

    if (!inventory) {
      throw new StateMachineError('Product not found in inventory', {
        statusCode: 404,
        retriable: false,
        suggestion: 'Ensure the inventory record exists before attempting to ship.',
        resourceName: 'inventory',
        currentState: context._state,
        operation: 'guard:canShip'
      });
    }

    if (inventory.quantity < context.quantity) {
      throw new StateMachineError('Insufficient inventory for shipment', {
        statusCode: 409,
        retriable: false,
        suggestion: `Reserve more stock or reduce the shipment quantity (need ${context.quantity}, have ${inventory.quantity}).`,
        resourceName: 'inventory',
        currentState: context._state,
        operation: 'guard:canShip'
      });
    }

    return true;
  }
}

// Handle guard failures gracefully
try {
  await stateMachine.send('order-123', 'SHIP');
} catch (error) {
  if (error.name === 'StateMachineError' && error.message.includes('guard')) {
    // Extract guard error reason
    console.error('Cannot ship order:', error.description);

    // Take corrective action
    if (error.description.includes('Insufficient inventory')) {
      await notifyInventoryTeam(orderId);
      await stateMachine.send('order-123', 'BACKORDER');
    }
  }
}
```

#### State Machine Not Found

**When**: Referencing non-existent state machine
**Error**: `State machine not found: {machineName}`
**Recovery**:
```javascript
// Bad
const machine = s3db.stateMachine('nonexistent');  // Throws

// Good - Check machine exists
const availableMachines = Object.keys(stateMachinePlugin.stateMachines);
if (availableMachines.includes('order_processing')) {
  const machine = s3db.stateMachine('order_processing');
}

// Good - List all machines
console.log('Available state machines:', availableMachines);
```

#### Action Function Error

**When**: Action function throws error during execution
**Error**: `Action '{actionName}' failed: {errorMessage}`
**Recovery**:
```javascript
// Implement robust action functions
actions: {
  processPayment: async (context, event, machine) => {
    try {
      // Attempt payment processing
      const result = await paymentService.charge(context.amount);
      return { payment_id: result.id };
    } catch (paymentError) {
      // Log detailed error
      console.error(`Payment failed for order ${context.id}:`, paymentError);

      // Record failure in database
      await machine.database.resources.payment_failures.insert({
        order_id: context.id,
        error: paymentError.message,
        timestamp: new Date().toISOString()
      });

      // Don't throw - allow transition to error state instead
      await machine.send(context.id, 'PAYMENT_FAILED', {
        error: paymentError.message
      });

      return { payment_failed: true };
    }
  }
}

// Monitor action failures
stateMachinePlugin.on('plg:state-machine:action-error', (data) => {
  console.error(`Action ${data.actionName} failed:`, data.error);
  sendAlert({
    title: `State Machine Action Failed`,
    message: `Action ${data.actionName} failed for ${data.entityId}`,
    error: data.error
  });
});
```

#### Invalid State Configuration

**When**: State machine configuration is invalid
**Error**: `Invalid state machine configuration: {reason}`
**Recovery**:
```javascript
// Bad - Missing required fields
new StateMachinePlugin({
  stateMachines: {
    broken: {
      states: {  // Missing initialState!
        pending: { on: { CONFIRM: 'confirmed' } }
      }
    }
  }
})

// Good - Complete configuration
new StateMachinePlugin({
  stateMachines: {
    working: {
      initialState: 'pending',  // Required
      states: {
        pending: { on: { CONFIRM: 'confirmed' } },
        confirmed: { type: 'final' }
      }
    }
  }
})
```

### Error Recovery Patterns

#### Graceful State Recovery

Handle errors without corrupting state:
```javascript
async function safeStateTransition(machineId, entityId, event, eventData) {
  // Record current state before transition
  const beforeState = await stateMachine.getState(entityId);

  try {
    const result = await stateMachine.send(entityId, event, eventData);
    return { success: true, result };
  } catch (error) {
    console.error(`Transition failed from ${beforeState}:`, error);

    // Log failed transition
    await database.resources.failed_transitions.insert({
      machine_id: machineId,
      entity_id: entityId,
      from_state: beforeState,
      attempted_event: event,
      error: error.message,
      timestamp: new Date().toISOString()
    });

    // Verify state is still valid
    const currentState = await stateMachine.getState(entityId);
    if (currentState !== beforeState) {
      console.warn(`State changed unexpectedly: ${beforeState} → ${currentState}`);
    }

    return { success: false, error: error.message };
  }
}
```

#### Compensating Transactions

Rollback on failure:
```javascript
actions: {
  processOrder: async (context, event, machine) => {
    const rollbackActions = [];

    try {
      // Step 1: Reserve inventory
      await reserveInventory(context.items);
      rollbackActions.push(() => releaseInventory(context.items));

      // Step 2: Charge payment
      const paymentId = await chargePayment(context.amount);
      rollbackActions.push(() => refundPayment(paymentId));

      // Step 3: Create shipment
      const shipmentId = await createShipment(context);
      rollbackActions.push(() => cancelShipment(shipmentId));

      return { success: true, shipmentId };
    } catch (error) {
      // Execute rollback actions in reverse order
      console.error('Order processing failed, rolling back:', error);

      for (const rollback of rollbackActions.reverse()) {
        try {
          await rollback();
        } catch (rollbackError) {
          console.error('Rollback action failed:', rollbackError);
        }
      }

      throw error;
    }
  }
}
```

#### Circuit Breaker for Guards

Prevent cascading failures:
```javascript
import { StateMachineError } from 's3db.js';

class GuardCircuitBreaker {
  constructor(maxFailures = 5, resetTimeout = 60000) {
    this.failures = new Map();
    this.maxFailures = maxFailures;
    this.resetTimeout = resetTimeout;
  }

  async execute(guardName, guardFn, ...args) {
    const failureCount = this.failures.get(guardName) || 0;

    if (failureCount >= this.maxFailures) {
      throw new StateMachineError(`Guard ${guardName} circuit breaker open`, {
        statusCode: 429,
        retriable: true,
        suggestion: `Wait ${this.resetTimeout / 1000}s or investigate the guard failures before retrying.`,
        metadata: { guardName, failureCount, maxFailures: this.maxFailures },
        operation: 'guardCircuitBreaker'
      });
    }

    try {
      const result = await guardFn(...args);
      // Reset on success
      this.failures.delete(guardName);
      return result;
    } catch (error) {
      // Increment failure count
      this.failures.set(guardName, failureCount + 1);

      // Schedule reset
      setTimeout(() => {
        this.failures.delete(guardName);
      }, this.resetTimeout);

      throw error;
    }
  }
}

// Usage in guards
const circuitBreaker = new GuardCircuitBreaker();

guards: {
  checkInventory: async (context, event, machine) => {
    return circuitBreaker.execute('checkInventory', async () => {
      const inventory = await machine.database.resources.inventory.get(context.productId);
      return inventory && inventory.quantity >= context.quantity;
    });
  }
}
```

#### Retry Strategy

Retry transient failures:
```javascript
async function sendEventWithRetry(machineId, entityId, event, eventData, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await stateMachine.send(entityId, event, eventData);
    } catch (error) {
      // Don't retry invalid transitions or guard failures
      if (error.message.includes('Invalid transition') ||
          error.message.includes('Guard')) {
        throw error;
      }

      // Retry transient errors
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Retry attempt ${attempt} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

---

## Troubleshooting

### Issue: State transitions not persisting
**Solution**: Ensure the state field is properly configured and the database resource exists.

### Issue: Guard functions failing unexpectedly
**Solution**: Add proper error handling and logging to guard functions. Check async/await usage.

### Issue: Actions not executing
**Solution**: Verify action names match configuration. Check for errors in action functions.

### Issue: Invalid state transitions
**Solution**: Review state machine configuration and ensure all valid transitions are defined.

### Issue: Concurrent state modification conflicts
**Solution**: Implement optimistic locking or use database transactions for state updates.

---

## See Also

- [Plugin Development Guide](./plugin-development.md)
- [Audit Plugin](./audit.md) - Track state machine transitions
- [Scheduler Plugin](./scheduler.md) - Schedule state machine operations
- [Queue Consumer Plugin](./queue-consumer.md) - Trigger state changes from external events
## ❓ FAQ

### Basics

**Q: What does StateMachinePlugin do?**
A: Implements finite state machines (FSM) with controlled transitions, guards, and entry/exit actions.

**Q: What is it for?**
A: Manage complex workflows (e.g., orders, approvals, processes), ensuring valid transitions and auditing state changes.

**Q: How does it work?**
A: Define states, events that cause transitions, guards (validations), and actions (side effects).

### Configuration

**Q: How to define a state machine?**
A:
```javascript
new StateMachinePlugin({
  stateMachines: {
    order_processing: {
      initialState: 'pending',
      states: {
        pending: {
          on: { CONFIRM: 'confirmed', CANCEL: 'cancelled' }
        },
        confirmed: {
          on: { SHIP: 'shipped' },
          entry: 'onConfirmed',     // Executes on enter
          exit: 'onLeftConfirmed',  // Executes on exit
          guards: { SHIP: 'canShip' }  // Validation
        },
        shipped: { on: { DELIVER: 'delivered' } },
        delivered: { type: 'final' },
        cancelled: { type: 'final' }
      }
    }
  },
  actions: {
    onConfirmed: async (context, event, machine) => {
      // Decrement inventory, send email, etc.
    }
  },
  guards: {
    canShip: async (context, event, machine) => {
      return inventory.quantity >= context.quantity;
    }
  }
})
```

### Operations

**Q: How to send an event (trigger transition)?**
A: Use `send`:
```javascript
const result = await stateMachinePlugin.send(
  'order_processing',  // machineId
  'order-123',         // entityId
  'CONFIRM',           // event
  { paymentId: 'pay_123' }  // context
);
// Returns: { from: 'pending', to: 'confirmed', event: 'CONFIRM', timestamp }
```

**Q: How to get the current state of an entity?**
A: Use `getState`:
```javascript
const state = await stateMachinePlugin.getState('order_processing', 'order-123');
// Returns: 'confirmed'
```

**Q: How to get valid events for the current state?**
A: Use `getValidEvents`:
```javascript
const events = await stateMachinePlugin.getValidEvents('order_processing', 'confirmed');
// Returns: ['SHIP']
```

**Q: How to query transition history?**
A: Use `getTransitionHistory`:
```javascript
const history = await stateMachinePlugin.getTransitionHistory(
  'order_processing',
  'order-123',
  { limit: 50 }
);
// Returns array: [{ from, to, event, context, timestamp }, ...]
```

### Initialization

**Q: How to initialize the state of a new entity?**
A: Use `initializeEntity`:
```javascript
await stateMachinePlugin.initializeEntity(
  'order_processing',
  'order-456',
  { customerId: 'user-123' }
);
// Initial state: 'pending'
```

### Visualization

**Q: How to visualize the state machine?**
A: Use `visualize` to get DOT format (GraphViz):
```javascript
const dot = stateMachinePlugin.visualize('order_processing');
// Save to file .dot and convert to image
```

### Monitoring

**Q: How to get transition statistics?**
A: Use event listeners to track:
```javascript
let stats = { total: 0, success: 0, failed: 0 };

stateMachinePlugin.on('transition_completed', (data) => {
  stats.total++;
  stats.success++;
  console.log(`✅ ${data.entityId}: ${data.from} → ${data.to}`);
});

stateMachinePlugin.on('transition_failed', (data) => {
  stats.total++;
  stats.failed++;
  console.error(`❌ Transition failed: ${data.error}`);
});

console.log(`Success rate: ${(stats.success / stats.total * 100).toFixed(2)}%`);
```

**Q: How to monitor guards that fail frequently?**
A: Log guard failures for analysis:
```javascript
guards: {
  canShip: async (context, event, machine) => {
    const result = await checkInventory(context);

    if (!result) {
      // Log failed guard check
      await machine.database.resources.guard_failures.insert({
        machine: 'order_processing',
        guard: 'canShip',
        entity_id: context.id,
        reason: 'Insufficient inventory',
        timestamp: new Date().toISOString()
      });
    }

    return result;
  }
}
```

**Q: How to get performance metrics?**
A: Track execution time:
```javascript
actions: {
  onStateChange: async (context, event, machine) => {
    const startTime = Date.now();

    try {
      // Execute transition logic
      await processTransition(context, event);

      const duration = Date.now() - startTime;

      // Log performance metrics
      await machine.database.resources.transition_metrics.insert({
        machine: 'order_processing',
        entity_id: context.id,
        transition: `${event.from} → ${event.to}`,
        duration,
        success: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log failed transitions
      await machine.database.resources.transition_metrics.insert({
        machine: 'order_processing',
        entity_id: context.id,
        transition: `${event.from} → ${event.to}`,
        duration,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }
}
```

**Q: How to avoid race conditions in concurrent transitions?**
A: Use optimistic locking:
```javascript
actions: {
  safeTransition: async (context, event, machine) => {
    // Get current record with version
    const record = await machine.database.resources.orders.get(context.id);

    // Check state hasn't changed
    if (record._state !== context._state) {
      throw new StateMachineError('State conflict detected during safe transition', {
        statusCode: 409,
        retriable: false,
        suggestion: 'Reload the entity state before retrying the transition.',
        currentState: record._state,
        targetState: context._state,
        resourceName: 'orders',
        operation: 'safeTransition'
      });
    }

    // Update with version check (optimistic lock)
    await machine.database.resources.orders.update(context.id, {
      _state: event.to,
      updated_at: new Date().toISOString()
    }, {
      ifMatch: record._etag  // S3 conditional update
    });
  }
}
```

**Q: How to ensure atomicity in transitions with multiple operations?**
A: Use try-catch with rollback:
```javascript
actions: {
  processOrder: async (context, event, machine) => {
    const rollbackActions = [];

    try {
      // Step 1: Reserve inventory
      await reserveInventory(context.items);
      rollbackActions.push(() => releaseInventory(context.items));

      // Step 2: Charge payment
      const paymentId = await chargePayment(context.amount);
      rollbackActions.push(() => refundPayment(paymentId));

      // Step 3: Update order status
      await machine.database.resources.orders.update(context.id, {
        _state: 'paid',
        payment_id: paymentId
      });

      return { success: true };
    } catch (error) {
      // Rollback in reverse order
      for (const rollback of rollbackActions.reverse()) {
        await rollback().catch(console.error);
      }
      throw error;
    }
  }
}
```

### Troubleshooting

**Q: Transition is being rejected?**
A: Check:
1. Valid event for the current state
2. Guard is not returning false
3. Current state is correct (use `getState`)

**Q: Actions are not executing?**
A: Verify that the action name is correct and registered in `actions: {}`.

**Q: How to debug guards?**
A: Enable `verbose: true` and see guard error logs.

### Concurrency and Locks

**Q: How does the plugin prevent race conditions?**
A: The plugin uses **distributed locks** (via PluginStorage) automatically before each transition. A lock is acquired for `{machineId}-{entityId}`, preventing concurrent transitions for the same entity.

**Q: What happens if two concurrent transitions try to execute?**
A: One of them acquires the lock and executes the transition. The other waits until `lockTimeout` (default 1s) and then fails with error `Could not acquire transition lock`.

**Q: How to configure lock timeout?**
A:
```javascript
new StateMachinePlugin({
  stateMachines: { /* ... */ },
  lockTimeout: 2000,  // Wait up to 2s for lock
  lockTTL: 10         // Lock expires after 10s (prevents deadlock)
});
```

**Q: What happens if a worker crashes while holding a lock?**
A: The lock expires automatically after `lockTTL` seconds (default 5s). This prevents deadlocks if a worker fails during a transition.

**Q: Can I identify which worker acquired the lock?**
A: Yes, use `workerId`:
```javascript
new StateMachinePlugin({
  stateMachines: { /* ... */ },
  workerId: `worker-${process.env.POD_NAME || process.pid}`
});
```

**Q: Do locks affect performance?**
A: Minimally. PluginStorage uses direct S3 operations and automatic TTL. The overhead is ~10-20ms per transition.

**Q: Can I disable locks?**
A: Not directly, as locks are essential to prevent inconsistency. But you can reduce `lockTimeout: 0` to fail immediately if lock is not available.

---
