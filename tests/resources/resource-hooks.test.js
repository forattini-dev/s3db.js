import { describe, expect, test, beforeEach } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';

describe('Resource Hooks - Real Integration Tests', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=resources/hooks');
    await database.connect();
  });

  test('Basic Hook Registration and Execution', async () => {
    const resource = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'email|required'
      }
    });

    const hookCalls = [];

    // Register hooks
    resource.addHook('beforeInsert', (data) => {
      hookCalls.push({ event: 'beforeInsert', data: { ...data } });
      return data;
    });

    resource.addHook('afterInsert', (data) => {
      hookCalls.push({ event: 'afterInsert', data: { ...data } });
      return data;
    });

    resource.addHook('beforeUpdate', (data) => {
      hookCalls.push({ event: 'beforeUpdate', data: { ...data } });
      return data;
    });

    resource.addHook('afterUpdate', (data) => {
      hookCalls.push({ event: 'afterUpdate', data: { ...data } });
      return data;
    });

    resource.addHook('beforeDelete', (data) => {
      hookCalls.push({ event: 'beforeDelete', data: { ...data } });
      return data;
    });

    resource.addHook('afterDelete', (data) => {
      hookCalls.push({ event: 'afterDelete', data: { ...data } });
      return data;
    });

    // Test hook execution with real insert
    const testData = { id: 'user1', name: 'John Silva', email: 'john@example.com' };
    
    const result = await resource.insert(testData);
    expect(result.id).toBe('user1');
    expect(result.name).toBe('John Silva');
    expect(hookCalls).toHaveLength(2);
    expect(hookCalls[0].event).toBe('beforeInsert');
    expect(hookCalls[1].event).toBe('afterInsert');
    expect(hookCalls[1].data.id).toBe('user1');

    // Test update hooks
    const updateData = { name: 'John Silva Updated' };
    await resource.update('user1', { ...updateData, email: 'user1@example.com' });
    
    expect(hookCalls).toHaveLength(4);
    expect(hookCalls[2].event).toBe('beforeUpdate');
    expect(hookCalls[3].event).toBe('afterUpdate');

    // Test delete hooks
    await resource.delete('user1');
    
    expect(hookCalls).toHaveLength(6);
    expect(hookCalls[4].event).toBe('beforeDelete');
    expect(hookCalls[5].event).toBe('afterDelete');
  });

  test('Hook Data Modification', async () => {
    const resource = await database.createResource({
      name: 'products',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        price: 'number|required',
        category: 'string|optional'
      }
    });

    // Hook that modifies data
    resource.addHook('beforeInsert', (data) => {
      // Add default category if not provided
      if (!data.category) {
        data.category = 'default';
      }
      // Convert name to uppercase
      data.name = data.name.toUpperCase();
      return data;
    });

    resource.addHook('afterInsert', (data) => {
      // Add computed field
      data.fullName = `${data.name} (${data.category})`;
      return data;
    });

    // Test data modification with real insert
    const originalData = { id: 'prod1', name: 'laptop', price: 999.99 };
    
    const result = await resource.insert(originalData);
    expect(result.name).toBe('LAPTOP');
    expect(result.category).toBe('default');
    expect(result.fullName).toBe('LAPTOP (default)');
  });

  test('Multiple Hooks Execution Order', async () => {
    const resource = await database.createResource({
      name: 'events',
      attributes: {
        id: 'string|required',
        title: 'string|required',
        status: 'string|required'
      }
    });

    const executionOrder = [];

    // Add multiple hooks
    resource.addHook('beforeInsert', (data) => {
      executionOrder.push('beforeInsert-1');
      data.status = 'pending';
      return data;
    });

    resource.addHook('beforeInsert', (data) => {
      executionOrder.push('beforeInsert-2');
      data.title = data.title + ' (Processed)';
      return data;
    });

    resource.addHook('afterInsert', (data) => {
      executionOrder.push('afterInsert-1');
      data.processed = true;
      return data;
    });

    resource.addHook('afterInsert', (data) => {
      executionOrder.push('afterInsert-2');
      data.finalized = true;
      return data;
    });

    // Test execution order with real insert
    const testData = { id: 'event1', title: 'Test Event' };
    
    const result = await resource.insert(testData);

    // Verify execution order
    expect(executionOrder).toEqual([
      'beforeInsert-1',
      'beforeInsert-2',
      'afterInsert-1',
      'afterInsert-2'
    ]);

    // Verify data modifications
    expect(result.title).toBe('Test Event (Processed)');
    expect(result.status).toBe('pending');
    expect(result.processed).toBe(true);
    expect(result.finalized).toBe(true);
  });

  test('Hook Error Handling', async () => {
    const resource = await database.createResource({
      name: 'test',
      attributes: {
        id: 'string|required',
        name: 'string|required'
      }
    });

    // Hook that throws error
    resource.addHook('beforeInsert', (data) => {
      throw new Error('Hook validation failed');
    });

    // Test hook error with real insert
    try {
      await resource.insert({ id: 'test1', name: 'Test' });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Hook validation failed');
      expect(error.message).not.toContain('[object');
    }
  });

  test('Hook Context Binding', async () => {
    const resource = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'email|required'
      }
    });

    let hookContext = null;

    // Hook that checks context
    resource.addHook('beforeInsert', function(data) {
      hookContext = this;
      expect(this).toBe(resource);
      expect(this.name).toBe('users');
      return data;
    });

    await resource.insert({ id: 'user1', name: 'Test User', email: 'test@example.com' });
    expect(hookContext).toBe(resource);
  });

  test('Automatic Partition Hooks Setup', async () => {
    const resource = await database.createResource({
      name: 'products',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        region: 'string|required',
        category: 'string|required'
      },
      partitions: {
        byRegion: {
          fields: {
            region: 'string|maxlength:2'
          }
        },
        byCategory: {
          fields: {
            category: 'string'
          }
        }
      }
    });

    // Verify that partition hooks were automatically added
    expect(resource.hooks.afterInsert).toHaveLength(1);
    expect(resource.hooks.afterDelete).toHaveLength(1);

    // Test that hooks are functions
    expect(typeof resource.hooks.afterInsert[0]).toBe('function');
    expect(typeof resource.hooks.afterDelete[0]).toBe('function');

    // Test that partition hooks work with real data
    const product = await resource.insert({
      id: 'prod1',
      name: 'Laptop',
      region: 'US',
      category: 'electronics'
    });

    expect(product.id).toBe('prod1');
    expect(product.name).toBe('Laptop');
  });

  test('Hook with Async Operations', async () => {
    const resource = await database.createResource({
      name: 'orders',
      attributes: {
        id: 'string|required',
        orderId: 'string|required',
        amount: 'number|required'
      }
    });

    const asyncResults = [];

    // Async hook
    resource.addHook('beforeInsert', async (data) => {
      // Simulate async validation
      await new Promise(resolve => setTimeout(resolve, 10));
      asyncResults.push('beforeInsert-completed');
      return { ...data };
    });

    resource.addHook('afterInsert', async (data) => {
      // Simulate async notification
      await new Promise(resolve => setTimeout(resolve, 10));
      asyncResults.push('afterInsert-completed');
      // Add validation result and notification result
      data.validated = true;
      data.notified = true;
      return { ...data };
    });

    // Test async hooks with real insert
    const testData = { id: 'order1', orderId: 'ORD-001', amount: 100.50 };
    
    const result = await resource.insert(testData);

    // Verify async hooks completed
    expect(asyncResults).toEqual([
      'beforeInsert-completed',
      'afterInsert-completed'
    ]);

    // Verify data modifications
    expect(result.validated).toBe(true);
    expect(result.notified).toBe(true);
  });

  test('Hook Data Validation', async () => {
    const resource = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional'
      }
    });

    // Validation hook
    resource.addHook('beforeInsert', (data) => {
      // Validate email format
      if (data.email && !data.email.includes('@')) {
        throw new Error('Invalid email format');
      }

      // Validate age
      if (data.age && (data.age < 0 || data.age > 150)) {
        throw new Error('Invalid age');
      }

      // Sanitize name
      if (data.name) {
        data.name = data.name.trim();
      }

      return data;
    });

    // Test valid data with real insert
    const validData = { id: 'user1', name: '  John Silva  ', email: 'john@example.com', age: 30 };
    const validResult = await resource.insert(validData);
    
          expect(validResult.name).toBe('John Silva'); // Trimmed
      expect(validResult.email).toBe('john@example.com');
    expect(validResult.age).toBe(30);

    // Test invalid email
    try {
      await resource.insert({
        id: 'user2',
        name: 'Invalid User',
        email: 'invalid-email',
        age: 25
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Invalid email format');
      expect(error.message).not.toContain('[object');
    }

    // Test invalid age
    try {
      await resource.insert({
        id: 'user3',
        name: 'Invalid Age',
        email: 'age@example.com',
        age: 200
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Invalid age');
      expect(error.message).not.toContain('[object');
    }
  });

  test('Hook Event Emission', async () => {
    const resource = await database.createResource({
      name: 'events',
      attributes: {
        id: 'string|required',
        title: 'string|required',
        type: 'string|required'
      },
      asyncEvents: false // Use sync events for testing
    });

    const emittedEvents = [];

    // Listen to resource events
    resource.on('rs:inserted', (data) => {
      emittedEvents.push({ event: 'insert', data });
    });

    resource.on('rs:updated', (data) => {
      emittedEvents.push({ event: 'update', ...data });
    });

    resource.on('rs:deleted', (data) => {
      emittedEvents.push({ event: 'delete', ...data });
    });

    // Hook that emits custom events
    resource.addHook('afterInsert', (data) => {
      resource.emit('customInsert', { customData: data });
      return data;
    });

    resource.addHook('afterUpdate', (data) => {
      resource.emit('customUpdate', { customData: data });
      return data;
    });

    // Listen to custom events
    resource.on('customInsert', (data) => {
      emittedEvents.push({ event: 'customInsert', data });
    });

    resource.on('customUpdate', (data) => {
      emittedEvents.push({ event: 'customUpdate', data });
    });

    // Test event emission with real operations
    const testData = { id: 'event1', title: 'Test Event', type: 'meeting' };
    
    // Insert
    await resource.insert(testData);

    // Update
    const updateData = { title: 'Updated Test Event' };
    await resource.update('event1', { ...updateData, type: 'meeting' });

    // Delete
    await resource.delete('event1');
    
    // Wait a tiny bit for the delete event (seems to be an edge case)
    await new Promise(resolve => setImmediate(resolve));

    // Verify events were emitted
    expect(emittedEvents).toHaveLength(5);
    
    // Custom events are emitted during hook execution (before main events)
    expect(emittedEvents[0].event).toBe('customInsert');
    expect(emittedEvents[0].data.customData.title).toBe('Test Event');
    
    // Main events are emitted after hook execution
    expect(emittedEvents[1].event).toBe('insert');
    expect(emittedEvents[1].data.title).toBe('Test Event');
    
    expect(emittedEvents[2].event).toBe('customUpdate');
    expect(emittedEvents[2].data.customData.title).toBe('Updated Test Event');
    
    expect(emittedEvents[3].event).toBe('update');
    expect(emittedEvents[3].$after.title).toBe('Updated Test Event');
    
    expect(emittedEvents[4].event).toBe('delete');
    // Verify id in emitted object
    expect(emittedEvents[4].id).toBe('event1');
  });

  test('Hook Performance and Memory', async () => {
    const resource = await database.createResource({
      name: 'performance',
      attributes: {
        id: 'string|required',
        name: 'string|required',
        data: 'string|optional'
      }
    });

    const hookCallCount = { beforeInsert: 0, afterInsert: 0 };

    // Simple hooks for performance testing
    resource.addHook('beforeInsert', (data) => {
      hookCallCount.beforeInsert++;
      return data;
    });

    resource.addHook('afterInsert', (data) => {
      hookCallCount.afterInsert++;
      return data;
    });

    // Test multiple hook executions with real inserts
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
      data: `Data for item ${i}`
    }));

    const startTime = Date.now();
    
    // Execute hooks for all items
    for (const item of items) {
      await resource.insert(item);
    }
    
    const endTime = Date.now();

    // Verify all hooks were called
    expect(hookCallCount.beforeInsert).toBe(10);
    expect(hookCallCount.afterInsert).toBe(10);

    // Verify reasonable performance (should complete in under 5 seconds)
    expect(endTime - startTime).toBeLessThan(5000);
  });

  test('Hook with Complex Data Transformations', async () => {
    const resource = await database.createResource({
      name: 'complex',
      attributes: {
        id: 'string|required',
        user: 'object',
        settings: 'object',
        metadata: 'object'
      }
    });

    // Complex transformation hooks
    resource.addHook('beforeInsert', (data) => {
      // Transform user data
      if (data.user) {
        data.user.fullName = `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim();
        data.user.email = data.user.email?.toLowerCase();
      }

      // Transform settings
      if (data.settings) {
        data.settings.theme = data.settings.theme || 'light';
        data.settings.notifications = data.settings.notifications || false;
      }

      // Transform metadata
      if (data.metadata) {
        data.metadata.createdAt = new Date().toISOString();
        data.metadata.version = '1.0';
      }

      return data;
    });

    resource.addHook('afterInsert', (data) => {
      // Add computed fields
      data.computed = {
        userInitials: data.user?.firstName?.charAt(0) + data.user?.lastName?.charAt(0),
        settingsCount: Object.keys(data.settings || {}).length,
        metadataKeys: Object.keys(data.metadata || {})
      };
      return data;
    });

    // Test complex transformations with real insert
    const testData = {
      id: 'complex1',
      user: {
                  firstName: 'John',
          lastName: 'Silva',
          email: 'JOHN@EXAMPLE.COM'
      },
      settings: {
        theme: 'dark'
      },
      metadata: {
        category: 'premium'
      }
    };

    const result = await resource.insert(testData);

    // Verify transformations
          expect(result.user.fullName).toBe('John Silva');
      expect(result.user.email).toBe('john@example.com');
    expect(result.settings.theme).toBe('dark');
    expect(result.settings.notifications).toBe(false);
    expect(result.metadata.createdAt).toBeDefined();
    expect(result.metadata.version).toBe('1.0');
    expect(result.computed.userInitials).toBe('JS');
    expect(result.computed.settingsCount).toBe(2);
    expect(result.computed.metadataKeys).toContain('createdAt');
    expect(result.computed.metadataKeys).toContain('version');
  });
}); 