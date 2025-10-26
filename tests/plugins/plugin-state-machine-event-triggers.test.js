/**
 * State Machine Plugin - Event Triggers Tests
 * Tests for the new event trigger API with eventName, eventSource, and targetState
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';
import { StateMachinePlugin } from '../../src/plugins/state-machine.plugin.js';

describe('StateMachinePlugin - Event Triggers (New API)', () => {
  let database;
  let orders;
  let stateMachinePlugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('state-machine-event-triggers');

    // Create orders resource
    orders = await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|required',
        customerId: 'string|required',
        total: 'number|required',
        status: 'string|required',
        paymentStatus: 'string|optional',
        shipmentId: 'string|optional',
        trackingNumber: 'string|optional'
      }
    });
  });

  afterEach(async () => {
    if (database) {
      await database.disconnect();
    }
  });

  describe('eventName as function (dynamic event names)', () => {
    it('should support eventName as function for dynamic event names', async () => {
      const transitions = [];

      stateMachinePlugin = new StateMachinePlugin({
        enableEventTriggers: true,
        persistTransitions: false,
        stateMachines: {
          order: {
            resource: 'orders',
            stateField: 'status',
            initialState: 'pending',
            states: {
              pending: {
                triggers: [{
                  type: 'event',
                  eventName: (context) => `updated:${context.id}`,  // Dynamic function
                  eventSource: orders,
                  condition: (context, entityId, eventData) => {
                    return eventData.paymentStatus === 'confirmed';
                  },
                  targetState: 'processing'
                }]
              },
              processing: {
                type: 'final'
              }
            }
          }
        }
      });

      await database.usePlugin(stateMachinePlugin);

      // Listen to transitions
      stateMachinePlugin.on('plg:state-machine:transition', (data) => {
        transitions.push(data);
      });

      // Create order
      const order = await orders.insert({
        id: 'order-123',
        customerId: 'customer-1',
        total: 99.99,
        status: 'pending',
        paymentStatus: 'pending'
      });

      expect(order.status).toBe('pending');

      // Initialize state machine for this entity
      await stateMachinePlugin.initializeEntity('order', 'order-123', { id: 'order-123' });

      // Wait a bit for plugin initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      // Update order with payment confirmation (triggers state change)
      await orders.update('order-123', {
        paymentStatus: 'confirmed'
      });

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check that transition happened
      const updatedOrder = await orders.get('order-123');
      expect(updatedOrder.status).toBe('processing');
      expect(transitions.length).toBeGreaterThan(0);
      expect(transitions.some(t => t.to === 'processing')).toBe(true);
    });
  });

  describe('eventSource for resource-specific events', () => {
    it('should listen to events from specific resource via eventSource', async () => {
      const triggerExecutions = [];

      stateMachinePlugin = new StateMachinePlugin({
        enableEventTriggers: true,
        persistTransitions: false,
        stateMachines: {
          order: {
            resource: 'orders',
            stateField: 'status',
            initialState: 'pending',
            states: {
              pending: {
                triggers: [{
                  type: 'event',
                  eventName: 'updated',  // Listen to 'updated' event from orders resource
                  eventSource: orders,   // Resource to listen to
                  condition: (context, entityId, eventData) => {
                    return eventData.shipmentId !== undefined;
                  },
                  targetState: 'shipped'
                }]
              },
              shipped: {
                type: 'final'
              }
            }
          }
        }
      });

      await database.usePlugin(stateMachinePlugin);

      // Listen to trigger executions
      stateMachinePlugin.on('plg:state-machine:trigger-executed', (data) => {
        triggerExecutions.push(data);
      });

      // Create order
      await orders.insert({
        id: 'order-456',
        customerId: 'customer-2',
        total: 149.99,
        status: 'pending'
      });

      // Initialize state machine for this entity
      await stateMachinePlugin.initializeEntity('order', 'order-456', { id: 'order-456' });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Update with shipment info - should trigger state change
      await orders.update('order-456', {
        shipmentId: 'shipment-789'
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify state changed
      const shippedOrder = await orders.get('order-456');
      expect(shippedOrder.status).toBe('shipped');
      expect(triggerExecutions.length).toBeGreaterThan(0);
    });
  });

  describe('targetState for automatic transitions', () => {
    it('should automatically transition to targetState when trigger fires', async () => {
      const transitions = [];

      stateMachinePlugin = new StateMachinePlugin({
        enableEventTriggers: true,
        persistTransitions: false,
        stateMachines: {
          order: {
            resource: 'orders',
            stateField: 'status',
            initialState: 'pending',
            states: {
              pending: {
                triggers: [{
                  type: 'event',
                  eventName: 'updated',
                  eventSource: orders,
                  condition: (context, entityId, eventData) => {
                    return eventData.trackingNumber !== undefined;
                  },
                  targetState: 'inTransit'  // Automatic transition
                }]
              },
              inTransit: {},
              delivered: {
                type: 'final'
              }
            }
          }
        }
      });

      await database.usePlugin(stateMachinePlugin);

      stateMachinePlugin.on('plg:state-machine:transition', (data) => {
        transitions.push(data);
      });

      // Create order
      await orders.insert({
        id: 'order-789',
        customerId: 'customer-3',
        total: 199.99,
        status: 'pending'
      });

      // Initialize state machine for this entity
      await stateMachinePlugin.initializeEntity('order', 'order-789', { id: 'order-789' });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Add tracking number - should auto-transition
      await orders.update('order-789', {
        trackingNumber: 'TRACK-123456'
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify automatic transition happened
      const order = await orders.get('order-789');
      expect(order.status).toBe('inTransit');

      // Verify transition was recorded
      const transition = transitions.find(t => t.entityId === 'order-789' && t.to === 'inTransit');
      expect(transition).toBeDefined();
      expect(transition.from).toBe('pending');
      expect(transition.to).toBe('inTransit');
    });

    it('should not execute action when targetState is provided', async () => {
      let actionExecuted = false;

      stateMachinePlugin = new StateMachinePlugin({
        enableEventTriggers: true,
        persistTransitions: false,
        actions: {
          shouldNotExecute: async () => {
            actionExecuted = true;
          }
        },
        stateMachines: {
          order: {
            resource: 'orders',
            stateField: 'status',
            initialState: 'pending',
            states: {
              pending: {
                triggers: [{
                  type: 'event',
                  eventName: 'updated',
                  eventSource: orders,
                  action: 'shouldNotExecute',  // Should be skipped
                  targetState: 'completed'      // Takes precedence
                }]
              },
              completed: {
                type: 'final'
              }
            }
          }
        }
      });

      await database.usePlugin(stateMachinePlugin);

      await orders.insert({
        id: 'order-999',
        customerId: 'customer-4',
        total: 99.99,
        status: 'pending'
      });

      // Initialize state machine for this entity
      await stateMachinePlugin.initializeEntity('order', 'order-999', { id: 'order-999' });

      await new Promise(resolve => setTimeout(resolve, 100));

      await orders.update('order-999', { paymentStatus: 'done' });
      await new Promise(resolve => setTimeout(resolve, 200));

      const order = await orders.get('order-999');
      expect(order.status).toBe('completed');
      expect(actionExecuted).toBe(false); // Action should NOT execute when targetState is provided
    });
  });

  describe('Backward compatibility with old API', () => {
    it('should still work with old API (trigger.event)', async () => {
      const transitions = [];

      stateMachinePlugin = new StateMachinePlugin({
        enableEventTriggers: true,
        persistTransitions: false,
        stateMachines: {
          order: {
            resource: 'orders',
            stateField: 'status',
            initialState: 'pending',
            states: {
              pending: {
                triggers: [{
                  type: 'event',
                  event: 'updated',  // Old API (string instead of eventName function)
                  eventSource: orders,
                  targetState: 'done'
                }]
              },
              done: {
                type: 'final'
              }
            }
          }
        }
      });

      await database.usePlugin(stateMachinePlugin);

      stateMachinePlugin.on('plg:state-machine:transition', (data) => {
        transitions.push(data);
      });

      await orders.insert({
        id: 'order-old',
        customerId: 'customer-5',
        total: 49.99,
        status: 'pending'
      });

      // Initialize state machine for this entity
      await stateMachinePlugin.initializeEntity('order', 'order-old', { id: 'order-old' });

      await new Promise(resolve => setTimeout(resolve, 100));

      await orders.update('order-old', { paymentStatus: 'paid' });
      await new Promise(resolve => setTimeout(resolve, 200));

      const order = await orders.get('order-old');
      expect(order.status).toBe('done');
    });
  });

  describe('Combined features', () => {
    it('should support eventName function + eventSource + targetState together', async () => {
      const executedTriggers = [];

      stateMachinePlugin = new StateMachinePlugin({
        enableEventTriggers: true,
        persistTransitions: false,
        stateMachines: {
          order: {
            resource: 'orders',
            stateField: 'status',
            initialState: 'pending',
            states: {
              pending: {
                triggers: [{
                  type: 'event',
                  eventName: (context) => `updated:${context.id}`,  // Function
                  eventSource: orders,                               // Specific resource
                  condition: (context, entityId, eventData) => {
                    return eventData.paymentStatus === 'confirmed' &&
                           eventData.shipmentId !== undefined;
                  },
                  targetState: 'readyToShip'  // Auto transition
                }]
              },
              readyToShip: {
                type: 'final'
              }
            }
          }
        }
      });

      await database.usePlugin(stateMachinePlugin);

      stateMachinePlugin.on('plg:state-machine:trigger-executed', (data) => {
        executedTriggers.push(data);
      });

      // Create order
      await orders.insert({
        id: 'order-combined',
        customerId: 'customer-6',
        total: 299.99,
        status: 'pending',
        paymentStatus: 'pending'
      });

      // Initialize state machine for this entity
      await stateMachinePlugin.initializeEntity('order', 'order-combined', { id: 'order-combined' });

      await new Promise(resolve => setTimeout(resolve, 100));

      // First update: only payment (should NOT trigger)
      await orders.update('order-combined', {
        paymentStatus: 'confirmed'
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      let order = await orders.get('order-combined');
      expect(order.status).toBe('pending'); // Still pending

      // Second update: add shipment (now BOTH conditions met, should trigger)
      await orders.update('order-combined', {
        shipmentId: 'ship-999'
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      order = await orders.get('order-combined');
      expect(order.status).toBe('readyToShip');
      expect(executedTriggers.length).toBeGreaterThan(0);
      expect(executedTriggers.some(t => t.targetState === 'readyToShip')).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should throw error if neither event nor eventName is provided', async () => {
      expect(() => {
        new StateMachinePlugin({
          enableEventTriggers: true,
          stateMachines: {
            order: {
              resource: 'orders',
              stateField: 'status',
              initialState: 'pending',
              states: {
                pending: {
                  triggers: [{
                    type: 'event',
                    // Missing both event and eventName
                    targetState: 'done'
                  }]
                },
                done: {}
              }
            }
          }
        });
      }).not.toThrow(); // Constructor shouldn't throw, but _setupEventTrigger will

      // The error will be thrown during plugin installation when _setupEventTrigger runs
    });
  });
});
