
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

#### `deleteEntity(recordId)`
Delete an entity's state and transition history. Useful for cleanup when removing records.

```javascript
// Manual cleanup
await machine.deleteEntity('order-123');

// Emits 'plg:state-machine:entity-deleted' event
```

**What gets deleted:**
- In-memory state cache
- Persisted state record (`plg_entity_states`)
- All transition history (`plg_state_transitions`) if `persistTransitions: true`

> **Note:** When using `autoCleanup: true` (default), this is called automatically when the attached resource's record is deleted. See [Auto Cleanup](#auto-cleanup-on-delete) below.

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

## Resource State API

When a state machine is attached to a resource (via the `resource` option), the resource gets a convenient `state` property with shorthand methods:

```javascript
const orders = db.resources.orders;

// Instead of: db.stateMachine('order').send('order-123', 'PAY')
await orders.state.send('order-123', 'PAY');

// Instead of: db.stateMachine('order').getState('order-123')
const state = await orders.state.get('order-123');

// Instead of: db.stateMachine('order').canTransition('order-123', 'SHIP')
const canShip = await orders.state.canTransition('order-123', 'SHIP');

// Instead of: db.stateMachine('order').getValidEvents('order-123')
const validEvents = await orders.state.getValidEvents('order-123');

// Instead of: db.stateMachine('order').initializeEntity('order-123', context)
await orders.state.initialize('order-123', { customerId: 'user-1' });

// Instead of: db.stateMachine('order').getTransitionHistory('order-123')
const history = await orders.state.history('order-123');

// Instead of: db.stateMachine('order').deleteEntity('order-123')
await orders.state.delete('order-123');
```

---

## Auto Cleanup on Delete

When a state machine is attached to a resource, it can automatically clean up state and transition history when records are deleted.

### Configuration

```javascript
const stateMachinePlugin = new StateMachinePlugin({
  stateMachines: {
    order: {
      resource: 'orders',
      stateField: 'status',
      initialState: 'pending',
      autoCleanup: true,  // Default: true
      states: { /* ... */ }
    }
  }
});
```

### Behavior

When `autoCleanup: true` (the default):
- An `afterDelete` hook is registered on the attached resource
- When a record is deleted, the plugin automatically:
  1. Removes the entity from in-memory cache
  2. Deletes the persisted state record
  3. Deletes all transition history (if `persistTransitions: true`)
  4. Emits `plg:state-machine:entity-deleted` event

### Example

```javascript
// Create order with state machine
const order = await orders.insert({
  id: 'order-123',
  customerId: 'customer-1',
  status: 'pending'
});

// Make some transitions
await orders.state.send('order-123', 'PAY');
await orders.state.send('order-123', 'SHIP');

// Delete the order - state machine cleanup happens automatically!
await orders.delete('order-123');
// ✅ Order record deleted
// ✅ State record (plg_entity_states) deleted
// ✅ Transition history (plg_state_transitions) deleted
```

### Disabling Auto Cleanup

If you need to manage cleanup manually:

```javascript
const stateMachinePlugin = new StateMachinePlugin({
  stateMachines: {
    order: {
      resource: 'orders',
      autoCleanup: false,  // Disable automatic cleanup
      // ...
    }
  }
});

// Now you must clean up manually
await orders.delete('order-123');
await db.stateMachine('order').deleteEntity('order-123');
```

---
