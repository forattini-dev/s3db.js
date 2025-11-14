# 🤖 State Machine Plugin

> **Enforce complex workflow transitions with guards, events, and audit trails.**
>
> **Navigation:** [← Plugin Index](../README.md) | [Guides ↓](#-documentation-index) | [FAQ ↓](./guides/best-practices-errors.md#-faq)

---

## ⚡ IMPORTANT: Event Handling

**Race condition prevention:**
The plugin tracks pending event handlers and provides `waitForPendingEvents()` method to ensure all state transitions complete before continuing.

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

## 📋 Documentation Index

Complete documentation organized by topic. Start here to find what you need.

### Quick Start
- [⚡ TLDR](#-tldr) - 30-second overview
- [⚡ Quick Start](#-quick-start) - Get running in minutes
- [📦 Dependencies](#-dependencies) - What you need

### By Guide

| Guide | Focus |
|-------|-------|
| **[Event-Based Triggers](./guides/event-triggers.md)** | Automatic transitions based on data changes |
| **[Configuration](./guides/configuration.md)** | Plugin options & state definitions |
| **[Usage Patterns](./guides/usage-patterns.md)** | Examples, API reference, advanced patterns |
| **[Best Practices & Errors](./guides/best-practices-errors.md)** | Error handling, FAQ, troubleshooting |

### Getting Help

1. **Quick questions?** Check [FAQ](./guides/best-practices-errors.md#-faq)
2. **Configuration help?** See [Configuration Guide](./guides/configuration.md)
3. **Event-based workflows?** See [Event-Based Triggers Guide](./guides/event-triggers.md)
4. **Troubleshooting?** See [Best Practices Guide](./guides/best-practices-errors.md#troubleshooting)

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
- Add guard functions for conditional transitions (see [Usage Patterns Guide](./guides/usage-patterns.md))
- Add action handlers for transition side-effects (see [Usage Patterns Guide](./guides/usage-patterns.md#advanced-patterns))
- Enable audit trail for state changes (see [Configuration Guide](./guides/configuration.md))

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

> **Interactive Visualization**: Use the `visualize()` method to generate GraphViz diagrams. See [Usage Patterns Guide](./guides/usage-patterns.md#visualize) for details.

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

## See Also

- [Event-Based Triggers Guide](./guides/event-triggers.md) - Automatic transitions
- [Configuration Guide](./guides/configuration.md) - Complete options reference
- [Usage Patterns Guide](./guides/usage-patterns.md) - Examples & API
- [Best Practices Guide](./guides/best-practices-errors.md) - Production deployment
- [Plugin Development Guide](../plugin-development.md) - Extend functionality
