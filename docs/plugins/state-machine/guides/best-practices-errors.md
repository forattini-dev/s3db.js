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
A: Enable `logLevel: 'debug'` and see guard error logs.

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
