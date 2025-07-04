import { join } from 'path';
import { describe, expect, test, beforeEach } from '@jest/globals';

import Client from '../src/client.class.js';
import Resource from '../src/resource.class.js';

const testPrefix = join('s3db', 'tests', new Date().toISOString().substring(0, 10), 'resource-hooks-' + Date.now());

describe('Resource Hooks', () => {
  let client;

  beforeEach(async () => {
    client = new Client({
      verbose: true,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`
    })
  });

  test('Basic Hook Registration and Execution', async () => {
    const resource = new Resource({
      client,
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      }
    });

    const hookCalls = [];

    // Register hooks
    resource.addHook('preInsert', (data) => {
      hookCalls.push({ event: 'preInsert', data: { ...data } });
      return data;
    });

    resource.addHook('afterInsert', (data) => {
      hookCalls.push({ event: 'afterInsert', data: { ...data } });
      return data;
    });

    resource.addHook('preUpdate', (data) => {
      hookCalls.push({ event: 'preUpdate', data: { ...data } });
      return data;
    });

    resource.addHook('afterUpdate', (data) => {
      hookCalls.push({ event: 'afterUpdate', data: { ...data } });
      return data;
    });

    resource.addHook('preDelete', (data) => {
      hookCalls.push({ event: 'preDelete', data: { ...data } });
      return data;
    });

    resource.addHook('afterDelete', (data) => {
      hookCalls.push({ event: 'afterDelete', data: { ...data } });
      return data;
    });

    // Test hook execution without actual S3 operations
    const testData = { name: 'João Silva', email: 'joao@example.com' };
    
    // Simulate preInsert hook
    const preInsertResult = await resource.executeHooks('preInsert', testData);
    expect(preInsertResult).toEqual(testData);
    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0].event).toBe('preInsert');

    // Simulate afterInsert hook
    const afterInsertData = { id: 'test-id', ...testData };
    const afterInsertResult = await resource.executeHooks('afterInsert', afterInsertData);
    expect(afterInsertResult).toEqual(afterInsertData);
    expect(hookCalls).toHaveLength(2);
    expect(hookCalls[1].event).toBe('afterInsert');
    expect(hookCalls[1].data.id).toBe('test-id');
  });

  test('Hook Data Modification', async () => {
    const resource = new Resource({
      client,
      name: 'products',
      attributes: {
        name: 'string|required',
        price: 'number|required',
        category: 'string|optional'
      }
    });

    // Hook that modifies data
    resource.addHook('preInsert', (data) => {
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

    // Test data modification without S3 operations
    const originalData = { name: 'laptop', price: 999.99 };
    
    const preInsertResult = await resource.executeHooks('preInsert', originalData);
    expect(preInsertResult.name).toBe('LAPTOP');
    expect(preInsertResult.category).toBe('default');

    const afterInsertData = { id: 'test-id', ...preInsertResult };
    const afterInsertResult = await resource.executeHooks('afterInsert', afterInsertData);
    expect(afterInsertResult.fullName).toBe('LAPTOP (default)');
  });

  test('Multiple Hooks Execution Order', async () => {
    const resource = new Resource({
      client,
      name: 'events',
      attributes: {
        title: 'string|required',
        status: 'string|required'
      }
    });

    const executionOrder = [];

    // Add multiple hooks
    resource.addHook('preInsert', (data) => {
      executionOrder.push('preInsert-1');
      data.status = 'pending';
      return data;
    });

    resource.addHook('preInsert', (data) => {
      executionOrder.push('preInsert-2');
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

    // Test execution order without S3 operations
    const testData = { title: 'Test Event' };
    
    const preInsertResult = await resource.executeHooks('preInsert', testData);
    const afterInsertResult = await resource.executeHooks('afterInsert', { id: 'test-id', ...preInsertResult });

    // Verify execution order
    expect(executionOrder).toEqual([
      'preInsert-1',
      'preInsert-2',
      'afterInsert-1',
      'afterInsert-2'
    ]);

    // Verify data modifications
    expect(afterInsertResult.title).toBe('Test Event (Processed)');
    expect(afterInsertResult.status).toBe('pending');
    expect(afterInsertResult.processed).toBe(true);
    expect(afterInsertResult.finalized).toBe(true);
  });

  test('Hook Error Handling', async () => {
    const resource = new Resource({
      client,
      name: 'test',
      attributes: {
        name: 'string|required'
      }
    });

    // Hook that throws error
    resource.addHook('preInsert', (data) => {
      throw new Error('Hook validation failed');
    });

    // Test hook error without S3 operations
    try {
      await resource.executeHooks('preInsert', { name: 'Test' });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Hook validation failed');
    }
  });

  test('Hook Context Binding', async () => {
    const resource = new Resource({
      client,
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      }
    });

    let hookContext = null;

    // Hook that checks context
    resource.addHook('preInsert', function(data) {
      hookContext = this;
      expect(this).toBe(resource);
      expect(this.name).toBe('users');
      return data;
    });

    await resource.executeHooks('preInsert', { name: 'Test User', email: 'test@example.com' });
    expect(hookContext).toBe(resource);
  });

  test('Automatic Partition Hooks Setup', async () => {
    const resource = new Resource({
      client,
      name: 'products',
      attributes: {
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
  });

  test('Hook with Async Operations', async () => {
    const resource = new Resource({
      client,
      name: 'orders',
      attributes: {
        orderId: 'string|required',
        amount: 'number|required'
      }
    });

    const asyncResults = [];

    // Async hook
    resource.addHook('preInsert', async (data) => {
      // Simulate async validation
      await new Promise(resolve => setTimeout(resolve, 10));
      asyncResults.push('preInsert-completed');
      
      // Add validation result
      data.validated = true;
      return data;
    });

    resource.addHook('afterInsert', async (data) => {
      // Simulate async notification
      await new Promise(resolve => setTimeout(resolve, 10));
      asyncResults.push('afterInsert-completed');
      
      // Add notification result
      data.notified = true;
      return data;
    });

    // Test async hooks without S3 operations
    const testData = { orderId: 'ORD-001', amount: 100.50 };
    
    const preInsertResult = await resource.executeHooks('preInsert', testData);
    const afterInsertResult = await resource.executeHooks('afterInsert', { id: 'test-id', ...preInsertResult });

    // Verify async hooks completed
    expect(asyncResults).toEqual([
      'preInsert-completed',
      'afterInsert-completed'
    ]);

    // Verify data modifications
    expect(afterInsertResult.validated).toBe(true);
    expect(afterInsertResult.notified).toBe(true);
  });

  test('Hook Data Validation', async () => {
    const resource = new Resource({
      client,
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        age: 'number|optional'
      }
    });

    // Validation hook
    resource.addHook('preInsert', (data) => {
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

    // Test valid data without S3 operations
    const validData = { name: '  João Silva  ', email: 'joao@example.com', age: 30 };
    const validResult = await resource.executeHooks('preInsert', validData);
    
    expect(validResult.name).toBe('João Silva'); // Trimmed
    expect(validResult.email).toBe('joao@example.com');
    expect(validResult.age).toBe(30);

    // Test invalid email
    try {
      await resource.executeHooks('preInsert', {
        name: 'Invalid User',
        email: 'invalid-email',
        age: 25
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Invalid email format');
    }

    // Test invalid age
    try {
      await resource.executeHooks('preInsert', {
        name: 'Invalid Age',
        email: 'age@example.com',
        age: 200
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Invalid age');
    }
  });

  test('Hook Event Emission', async () => {
    const resource = new Resource({
      client,
      name: 'events',
      attributes: {
        title: 'string|required',
        type: 'string|required'
      }
    });

    const emittedEvents = [];

    // Listen to resource events
    resource.on('insert', (data) => {
      emittedEvents.push({ event: 'insert', data });
    });

    resource.on('update', (oldData, newData) => {
      emittedEvents.push({ event: 'update', oldData, newData });
    });

    resource.on('delete', (id) => {
      emittedEvents.push({ event: 'delete', id });
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

    // Test event emission without S3 operations
    const testData = { title: 'Test Event', type: 'meeting' };
    
    // Simulate insert
    resource.emit('insert', testData);
    await resource.executeHooks('afterInsert', { id: 'test-id', ...testData });

    // Simulate update
    const updateData = { title: 'Updated Test Event' };
    resource.emit('update', updateData, { id: 'test-id', ...testData, ...updateData });
    await resource.executeHooks('afterUpdate', { id: 'test-id', ...testData, ...updateData });

    // Simulate delete
    resource.emit('delete', 'test-id');

    // Verify events were emitted
    expect(emittedEvents).toHaveLength(5);
    
    expect(emittedEvents[0].event).toBe('insert');
    expect(emittedEvents[0].data.title).toBe('Test Event');
    
    expect(emittedEvents[1].event).toBe('customInsert');
    expect(emittedEvents[1].data.customData.title).toBe('Test Event');
    
    expect(emittedEvents[2].event).toBe('update');
    expect(emittedEvents[2].newData.title).toBe('Updated Test Event');
    
    expect(emittedEvents[3].event).toBe('customUpdate');
    expect(emittedEvents[3].data.customData.title).toBe('Updated Test Event');
    
    expect(emittedEvents[4].event).toBe('delete');
    expect(emittedEvents[4].id).toBe('test-id');
  });

  test('Hook Performance and Memory', async () => {
    const resource = new Resource({
      client,
      name: 'performance',
      attributes: {
        name: 'string|required',
        data: 'string|optional'
      }
    });

    const hookCallCount = { preInsert: 0, afterInsert: 0 };

    // Simple hooks for performance testing
    resource.addHook('preInsert', (data) => {
      hookCallCount.preInsert++;
      return data;
    });

    resource.addHook('afterInsert', (data) => {
      hookCallCount.afterInsert++;
      return data;
    });

    // Test multiple hook executions without S3 operations
    const items = Array.from({ length: 100 }, (_, i) => ({
      name: `Item ${i}`,
      data: `Data for item ${i}`
    }));

    const startTime = Date.now();
    
    // Execute hooks for all items
    for (const item of items) {
      await resource.executeHooks('preInsert', item);
      await resource.executeHooks('afterInsert', { id: `id-${item.name}`, ...item });
    }
    
    const endTime = Date.now();

    // Verify all hooks were called
    expect(hookCallCount.preInsert).toBe(100);
    expect(hookCallCount.afterInsert).toBe(100);

    // Verify reasonable performance (should complete in under 1 second)
    expect(endTime - startTime).toBeLessThan(1000);
  });
}); 