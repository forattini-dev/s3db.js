# 🤖 State Machine Plugin

## ⚡ TLDR

**Finite state machine** for complex workflows with controlled transitions and business rule validation.

**Usage example:**
```javascript
await db.usePlugin(new StateMachinePlugin({ stateMachines: { order: { initialState: 'pending', states: { pending: { on: { PAY: 'paid' }}, paid: { type: 'final' }}}}}));
await db.stateMachine('order').send('order-123', 'PAY');
```

**Main features:**
- ✅ Well-defined states and transitions
- ✅ Guard functions (conditional validation)
- ✅ Action handlers (transition logic)
- ✅ Automatic audit trail
- ✅ State persistence in DB

**When to use:**
- 🛒 Order processing
- 👤 User onboarding
- ✅ Approval workflows
- 📦 Delivery status
- 💳 Payment processing

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [API Reference](#api-reference)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

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
          const inventory = await machine.database.resource('inventory').get(context.productId);
          return inventory && inventory.quantity >= context.quantity;
        }
      }
    })
  ]
});

await s3db.connect();

// Use state machine with your resources
const orders = s3db.resource('orders');
await orders.insert({
  id: 'order-123',
  productId: 'prod-456',
  quantity: 2,
  _state: 'pending' // Initial state
});

// Trigger state transitions
await s3db.stateMachine('order_processing').send('order-123', 'CONFIRM');
```

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
  stateField: string                   // Field name for state (default: '_state')
}
```

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
      await machine.database.resource('orders').update(context.id, {
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
        const inventory = await machine.database.resource('inventory').get(item.product_id);
        if (!inventory || inventory.quantity < item.quantity) {
          return false;
        }
      }
      
      return true;
    }
  }
});

// Usage
const orders = s3db.resource('orders');

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
      await machine.database.resource('user_rewards').insert({
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
      
      await machine.database.resource('user_preferences').insert({
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
      const approvers = await machine.database.resource('approvers').list({
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
      await machine.database.resource('requests').update(context.id, {
        approved_by: event.approver_id,
        approved_at: new Date().toISOString(),
        approval_comments: event.comments
      });
      
      return { processed: true };
    }
  },
  
  guards: {
    hasApprovalAuthority: async (context, event, machine) => {
      const approver = await machine.database.resource('approvers').get(event.approver_id);
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

### Action Functions

Action functions receive `(context, event, machine)` parameters:

```javascript
actions: {
  myAction: async (context, event, machine) => {
    // context: Current record data
    // event: Event data passed to send()
    // machine: State machine instance with database access
    
    // Perform actions
    await machine.database.resource('logs').insert({
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
    const user = await machine.database.resource('users').get(event.user_id);
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
    const user = await machine.database.resource('users').get(event.user_id);
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
      const inventory = await machine.database.resource('inventory').get(item.product_id);
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
    await machine.database.resource('state_transitions').insert({
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
// Implement optimistic locking for concurrent updates
actions: {
  safeStateUpdate: async (context, event, machine) => {
    const currentRecord = await machine.database.resource('orders').get(context.id);
    
    // Check if state has changed since we started
    if (currentRecord._state !== context._state) {
      throw new Error(`State conflict: expected ${context._state}, got ${currentRecord._state}`);
    }
    
    // Proceed with update using version check
    await machine.database.resource('orders').update(context.id, {
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
// Define guard with clear error messages
guards: {
  canShip: async (context, event, machine) => {
    const inventory = await machine.database.resource('inventory').get(context.productId);

    if (!inventory) {
      throw new Error('Product not found in inventory');
    }

    if (inventory.quantity < context.quantity) {
      throw new Error(`Insufficient inventory: need ${context.quantity}, have ${inventory.quantity}`);
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
      await machine.database.resource('payment_failures').insert({
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
stateMachinePlugin.on('action_error', (data) => {
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
    await database.resource('failed_transitions').insert({
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
class GuardCircuitBreaker {
  constructor(maxFailures = 5, resetTimeout = 60000) {
    this.failures = new Map();
    this.maxFailures = maxFailures;
    this.resetTimeout = resetTimeout;
  }

  async execute(guardName, guardFn, ...args) {
    const failureCount = this.failures.get(guardName) || 0;

    if (failureCount >= this.maxFailures) {
      throw new Error(`Guard ${guardName} circuit breaker open (${failureCount} failures)`);
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
      const inventory = await machine.database.resource('inventory').get(context.productId);
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

### Básico

**P: O que o StateMachinePlugin faz?**
R: Implementa máquinas de estado finitas (FSM) com transições controladas, guards e ações de entrada/saída.

**P: Para que serve?**
R: Gerenciar workflows complexos (ex: pedidos, aprovações, processos), garantindo transições válidas e auditando mudanças de estado.

**P: Como funciona?**
R: Define estados, eventos que causam transições, guards (validações) e actions (efeitos colaterais).

### Configuração

**P: Como definir uma máquina de estados?**
R:
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
          entry: 'onConfirmed',     // Executa ao entrar
          exit: 'onLeftConfirmed',  // Executa ao sair
          guards: { SHIP: 'canShip' }  // Validação
        },
        shipped: { on: { DELIVER: 'delivered' } },
        delivered: { type: 'final' },
        cancelled: { type: 'final' }
      }
    }
  },
  actions: {
    onConfirmed: async (context, event, machine) => {
      // Decrementa estoque, envia email, etc.
    }
  },
  guards: {
    canShip: async (context, event, machine) => {
      return inventory.quantity >= context.quantity;
    }
  }
})
```

### Operações

**P: Como enviar um evento (trigger transition)?**
R: Use `send`:
```javascript
const result = await stateMachinePlugin.send(
  'order_processing',  // machineId
  'order-123',         // entityId
  'CONFIRM',           // event
  { paymentId: 'pay_123' }  // context
);
// Retorna: { from: 'pending', to: 'confirmed', event: 'CONFIRM', timestamp }
```

**P: Como obter o estado atual de uma entidade?**
R: Use `getState`:
```javascript
const state = await stateMachinePlugin.getState('order_processing', 'order-123');
// Retorna: 'confirmed'
```

**P: Como obter eventos válidos para o estado atual?**
R: Use `getValidEvents`:
```javascript
const events = await stateMachinePlugin.getValidEvents('order_processing', 'confirmed');
// Retorna: ['SHIP']
```

**P: Como consultar histórico de transições?**
R: Use `getTransitionHistory`:
```javascript
const history = await stateMachinePlugin.getTransitionHistory(
  'order_processing',
  'order-123',
  { limit: 50 }
);
// Retorna array: [{ from, to, event, context, timestamp }, ...]
```

### Inicialização

**P: Como inicializar o estado de uma nova entidade?**
R: Use `initializeEntity`:
```javascript
await stateMachinePlugin.initializeEntity(
  'order_processing',
  'order-456',
  { customerId: 'user-123' }
);
// Estado inicial: 'pending'
```

### Visualização

**P: Como visualizar a máquina de estados?**
R: Use `visualize` para obter DOT format (GraphViz):
```javascript
const dot = stateMachinePlugin.visualize('order_processing');
// Salve em arquivo .dot e converta para imagem
```

### Troubleshooting

**P: Transição está sendo rejeitada?**
R: Verifique:
1. Evento válido para o estado atual
2. Guard não está retornando false
3. Estado atual correto (use `getState`)

**P: Actions não estão executando?**
R: Verifique se o nome da action está correto e registrado em `actions: {}`.

**P: Como debugar guards?**
R: Ative `verbose: true` e veja logs de erros de guards.

---
