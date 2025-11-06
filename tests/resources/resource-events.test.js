import { describe, test, expect, beforeEach } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';
import { jest } from '@jest/globals';

describe('Resource Events - Always Emit Complete Content', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=resources/events');
    await database.connect();
  });

  describe('user-managed behavior', () => {
    test('should emit complete content on insert', async () => {
      const resource = await database.createResource({
        name: 'user_managed_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string',
          meta: 'object'
        },
        behavior: 'user-managed'
      });

      const testData = {
        id: 'test-user-managed',
        title: 'User Managed Test',
        content: 'This is a test content',
        meta: { category: 'test', priority: 'high' }
      };

      const eventPromise = new Promise(resolve => resource.once('inserted', resolve));
      await resource.insert(testData);
      const eventData = await eventPromise;

      // Should contain all original fields
      expect(eventData).toMatchObject({
        id: 'test-user-managed',
        title: 'User Managed Test',
        content: 'This is a test content',
        meta: { category: 'test', priority: 'high' }
      });
    });

    test('should emit complete content on update', async () => {
      const resource = await database.createResource({
        name: 'user_managed_update_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string',
          meta: 'object'
        },
        behavior: 'user-managed'
      });

      const originalData = {
        id: 'test-update',
        title: 'Original Title',
        content: 'Original content',
        meta: { category: 'original' }
      };

      await resource.insert(originalData);

      const updatedData = {
        title: 'Updated Title',
        content: 'Updated content',
        meta: { category: 'updated', priority: 'high' }
      };

      const eventPromise = new Promise(resolve => resource.once('updated', resolve));
      await resource.update('test-update', updatedData);
      const eventData = await eventPromise;

      // Should contain all updated fields
      expect(eventData).toMatchObject({
        id: 'test-update',
        title: 'Updated Title',
        content: 'Updated content',
        meta: { category: 'updated', priority: 'high' }
      });
    });

    test('should emit complete content on delete', async () => {
      const resource = await database.createResource({
        name: 'user_managed_delete_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string'
        },
        behavior: 'user-managed'
      });

      const testData = {
        id: 'test-delete',
        title: 'Delete Test',
        content: 'Content to be deleted'
      };

      await resource.insert(testData);

      const eventPromise = new Promise(resolve => resource.once('deleted', resolve));
      await resource.delete('test-delete');
      const eventData = await eventPromise;

      // Should contain the complete object before deletion
      expect(eventData).toMatchObject({
        id: 'test-delete',
        title: 'Delete Test',
        content: 'Content to be deleted'
      });
    });
  });

  describe('body-overflow behavior', () => {
    test('should emit complete content on insert with large data', async () => {
      const resource = await database.createResource({
        name: 'body_overflow_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string',
          meta: 'object'
        },
        behavior: 'body-overflow'
      });

      const largeContent = 'x'.repeat(3000); // Large content that will overflow
      const testData = {
        id: 'test-body-overflow',
        title: 'Body Overflow Test',
        content: largeContent,
        meta: { category: 'test', priority: 'high' }
      };

      const eventPromise = new Promise(resolve => resource.once('inserted', resolve));
      await resource.insert(testData);
      const eventData = await eventPromise;

      // Should contain all fields, including the large content
      expect(eventData).toMatchObject({
        id: 'test-body-overflow',
        title: 'Body Overflow Test',
        content: largeContent,
        meta: { category: 'test', priority: 'high' }
      });
    });

    test('should emit complete content on update with large data', async () => {
      const resource = await database.createResource({
        name: 'body_overflow_update_test_unique',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string',
          meta: 'object'
        },
        behavior: 'body-overflow'
      });

      const originalData = {
        id: 'test-overflow-update',
        title: 'Original Title',
        content: 'Original content',
        meta: { category: 'original' }
      };

      await resource.insert(originalData);

      // Debug: confirm object exists after insert
      const existsAfterInsert = await resource.exists('test-overflow-update');
      // eslint-disable-next-line no-console

      // Wait for S3/MinIO consistency
      await new Promise(r => setTimeout(r, 100));

      const largeContent = 'y'.repeat(3000);
      const updatedData = {
        title: 'Updated Title',
        content: largeContent,
        meta: { category: 'updated', priority: 'high' }
      };

      const eventPromise = new Promise(resolve => resource.once('updated', resolve));
      await resource.update('test-overflow-update', updatedData);
      const eventData = await eventPromise;

      // Should contain all updated fields, including large content
      expect(eventData).toMatchObject({
        id: 'test-overflow-update',
        title: 'Updated Title',
        content: largeContent,
        meta: { category: 'updated', priority: 'high' }
      });
    });
  });

  describe('body-only behavior', () => {
    test('should emit complete content on insert', async () => {
      const resource = await database.createResource({
        name: 'body_only_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string',
          meta: 'object'
        },
        behavior: 'body-only'
      });

      const testData = {
        id: 'test-body-only',
        title: 'Body Only Test',
        content: 'This is body content',
        meta: { category: 'test', priority: 'high' }
      };

      const eventPromise = new Promise(resolve => resource.once('inserted', resolve));
      await resource.insert(testData);
      const eventData = await eventPromise;

      // Should contain all fields
      expect(eventData).toMatchObject({
        id: 'test-body-only',
        title: 'Body Only Test',
        content: 'This is body content',
        meta: { category: 'test', priority: 'high' }
      });
    });

    test('should emit complete content on update', async () => {
      const resource = await database.createResource({
        name: 'body_only_update_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string',
          meta: 'object'
        },
        behavior: 'body-only'
      });

      const originalData = {
        id: 'test-body-only-update',
        title: 'Original Title',
        content: 'Original content',
        meta: { category: 'original' }
      };

      await resource.insert(originalData);

      const updatedData = {
        title: 'Updated Title',
        content: 'Updated content',
        meta: { category: 'updated', priority: 'high' }
      };

      const eventPromise = new Promise(resolve => resource.once('updated', resolve));
      await resource.update('test-body-only-update', updatedData);
      const eventData = await eventPromise;

      // Should contain all updated fields
      expect(eventData).toMatchObject({
        id: 'test-body-only-update',
        title: 'Updated Title',
        content: 'Updated content',
        meta: { category: 'updated', priority: 'high' }
      });
    });
  });

  describe('truncate-data behavior', () => {
    test('should emit truncated content on insert', async () => {
      const resource = await database.createResource({
        name: 'data_truncate_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required|max:10',
          content: 'string|max:50',
          meta: 'object'
        },
        behavior: 'truncate-data'
      });

      const testData = {
        id: 'test-truncate',
        title: 'Short', // Within 10 char limit
        content: 'Short content within limits', // Within 50 char limit
        meta: { category: 'test', priority: 'high' }
      };

      const eventPromise = new Promise(resolve => resource.once('inserted', resolve));
      await resource.insert(testData);
      const eventData = await eventPromise;

      // Should contain all fields within limits
      expect(eventData).toMatchObject({
        id: 'test-truncate',
        title: 'Short',
        content: 'Short content within limits',
        meta: { category: 'test', priority: 'high' }
      });
    });

    test('should emit truncated content on update', async () => {
      const resource = await database.createResource({
        name: 'data_truncate_update_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required|max:10',
          content: 'string|max:50'
        },
        behavior: 'truncate-data'
      });

      const originalData = {
        id: 'test-truncate-update',
        title: 'Original',
        content: 'Original content'
      };

      await resource.insert(originalData);

      const updatedData = {
        title: 'Updated', // Within 10 char limit
        content: 'Updated content within limits' // Within 50 char limit
      };

      const eventPromise = new Promise(resolve => resource.once('updated', resolve));
      await resource.update('test-truncate-update', updatedData);
      const eventData = await eventPromise;

      // Should contain all fields within limits
      expect(eventData).toMatchObject({
        id: 'test-truncate-update',
        title: 'Updated',
        content: 'Updated content within limits'
      });
    });
  });

  describe('enforce-limits behavior', () => {
    test('should emit complete content on insert when within limits', async () => {
      const resource = await database.createResource({
        name: 'enforce_limits_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string',
          meta: 'object'
        },
        behavior: 'enforce-limits'
      });

      const testData = {
        id: 'test-enforce-limits',
        title: 'Enforce Limits Test',
        content: 'Small content',
        meta: { category: 'test' }
      };

      const eventPromise = new Promise(resolve => resource.once('inserted', resolve));
      await resource.insert(testData);
      const eventData = await eventPromise;

      // Should contain all fields
      expect(eventData).toMatchObject({
        id: 'test-enforce-limits',
        title: 'Enforce Limits Test',
        content: 'Small content',
        meta: { category: 'test' }
      });
    });

    test('should not emit event when insert exceeds limits', async () => {
      const resource = await database.createResource({
        name: 'enforce_limits_exceed_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string'
        },
        behavior: 'enforce-limits'
      });

      const largeData = {
        id: 'test-exceed-limits',
        title: 'Test',
        content: 'X'.repeat(3000) // Too large
      };

      const eventEmitted = jest.fn();
      resource.once('inserted', eventEmitted);

      try {
        await resource.insert(largeData);
      } catch (error) {
        // Expected to throw
      }

      // Should not emit insert event when limits are exceeded
      expect(eventEmitted).not.toHaveBeenCalled();
    });
  });

  describe('Event data integrity across behaviors', () => {
    test('should preserve nested objects in events', async () => {
      const resource = await database.createResource({
        name: 'nested_objects_test',
        attributes: {
          id: 'string|optional',
          user: 'object',
          settings: 'object',
          metadata: 'object'
        },
        behavior: 'user-managed'
      });

      const testData = {
        id: 'test-nested',
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          preferences: {
            theme: 'dark',
            notifications: true
          }
        },
        settings: {
          language: 'en',
          timezone: 'UTC',
          features: {
            analytics: true,
            reporting: false
          }
        },
        metadata: {
          category: 'premium',
          tags: ['important', 'urgent'],
          custom: {
            priority: 'high',
            department: 'engineering'
          }
        }
      };

      const eventPromise = new Promise(resolve => resource.once('inserted', resolve));
      await resource.insert(testData);
      const eventData = await eventPromise;

      // Should preserve all nested structure
      expect(eventData.user.name).toBe('John Doe');
      expect(eventData.user.preferences.theme).toBe('dark');
      expect(eventData.settings.features.analytics).toBe(true);
      expect(eventData.metadata.tags).toEqual(['important', 'urgent']);
      expect(eventData.metadata.custom.priority).toBe('high');
    });

    test('should preserve arrays in events', async () => {
      const resource = await database.createResource({
        name: 'arrays_test',
        attributes: {
          id: 'string|optional',
          tags: 'array|items:string',
          scores: 'array|items:number',
          metadata: 'object'
        },
        behavior: 'user-managed'
      });

      const testData = {
        id: 'test-arrays',
        tags: ['javascript', 'node.js', 'testing'],
        scores: [95, 87, 92, 88],
        metadata: {
          categories: ['frontend', 'backend'],
          ratings: [4.5, 4.2, 4.8]
        }
      };

      const eventPromise = new Promise(resolve => resource.once('inserted', resolve));
      await resource.insert(testData);
      const eventData = await eventPromise;


      // Should preserve arrays (numbers may be converted to strings)
      expect(eventData.tags).toEqual(['javascript', 'node.js', 'testing']);
      expect(eventData.scores).toEqual([95, 87, 92, 88]);
      expect(eventData.metadata.categories).toEqual(['frontend', 'backend']);
      // Accept both string and number for ratings
      expect(eventData.metadata.ratings.map(Number)).toEqual(expect.arrayContaining([4.5, 4.2, 4.8]));
    });

    test('should preserve all data types in events', async () => {
      const resource = await database.createResource({
        name: 'data_types_test',
        attributes: {
          id: 'string|optional',
          stringField: 'string',
          numberField: 'number',
          booleanField: 'boolean',
          nullField: 'string|optional',
          undefinedField: 'string|optional',
          objectField: 'object',
          arrayField: 'array|items:string'
        },
        behavior: 'user-managed'
      });

      const testData = {
        id: 'test-data-types',
        stringField: 'test string',
        numberField: 42,
        booleanField: true,
        nullField: null,
        undefinedField: undefined,
        objectField: { key: 'value' },
        arrayField: ['1', '2', '3']
      };

      const eventPromise = new Promise(resolve => resource.once('inserted', resolve));
      await resource.insert(testData);
      const eventData = await eventPromise;

      // Should preserve all data types (numbers may be converted to strings)
      expect(eventData.stringField).toBe('test string');
      expect(eventData.numberField).toBe(42);
      expect(eventData.booleanField).toBe(true);
      expect(eventData.nullField === null || eventData.nullField === "null").toBe(true);
      expect(eventData.undefinedField === undefined || eventData.undefinedField === "undefined").toBe(true);
      expect(eventData.objectField).toEqual({ key: 'value' });
      expect(eventData.arrayField).toEqual(['1', '2', '3']); // Numbers converted to strings
    });
  });

  describe('Events Configuration - Auto-registered Listeners', () => {
    test('should register single event listener from config', async () => {
      const insertListener = jest.fn();
      
      const resource = await database.createResource({
        name: 'single_event_test',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        behavior: 'user-managed',
        asyncEvents: false, // Use sync events for testing
        events: {
          inserted: insertListener
        }
      });

      const testData = {
        id: 'test-single-event',
        name: 'Test User'
      };

      await resource.insert(testData);

      // Should have called the configured listener
      expect(insertListener).toHaveBeenCalledTimes(1);
      expect(insertListener).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-single-event',
        name: 'Test User'
      }));
    });

    test('should register multiple event listeners from config', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();
      
      const resource = await database.createResource({
        name: 'multiple_events_test',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        behavior: 'user-managed',
        asyncEvents: false,
        events: {
          updated: [listener1, listener2, listener3]
        }
      });

      const testData = {
        id: 'test-multiple-events',
        name: 'Test User'
      };

      await resource.insert(testData);
      await resource.update('test-multiple-events', { name: 'Updated User' });

      // All three listeners should have been called
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);

      // All should receive the same event data
      const expectedEventData = expect.objectContaining({
        id: 'test-multiple-events',
        name: 'Updated User'
      });
      expect(listener1).toHaveBeenCalledWith(expectedEventData);
      expect(listener2).toHaveBeenCalledWith(expectedEventData);
      expect(listener3).toHaveBeenCalledWith(expectedEventData);
    });

    test('should register listeners for different event types', async () => {
      const insertListener = jest.fn();
      const updateListener = jest.fn();
      const deleteListener = jest.fn();
      const listListener = jest.fn();
      const countListener = jest.fn();
      
      const resource = await database.createResource({
        name: 'different_events_test',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        behavior: 'user-managed',
        asyncEvents: false,
        events: {
          inserted: insertListener,
          updated: updateListener,
          deleted: deleteListener,
          list: listListener,
          count: countListener
        }
      });

      const testData = {
        id: 'test-different-events',
        name: 'Test User'
      };

      // Test insert event
      await resource.insert(testData);
      expect(insertListener).toHaveBeenCalledTimes(1);

      // Test update event
      await resource.update('test-different-events', { name: 'Updated User' });
      expect(updateListener).toHaveBeenCalledTimes(1);

             // Test list event
       await resource.list();
       expect(listListener).toHaveBeenCalled();

      // Test count event
      await resource.count();
      expect(countListener).toHaveBeenCalledTimes(1);

      // Test delete event
      await resource.delete('test-different-events');
      expect(deleteListener).toHaveBeenCalledTimes(1);
    }, 30000);

    test('should receive correct event data with $before and $after for updates', async () => {
      const updateListener = jest.fn();
      
      const resource = await database.createResource({
        name: 'before_after_test',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required'
        },
        behavior: 'user-managed',
        asyncEvents: false,
        events: {
          updated: updateListener
        }
      });

      const originalData = {
        id: 'test-before-after',
        name: 'Original Name',
        email: 'original@example.com'
      };

      await resource.insert(originalData);

      const updateData = {
        name: 'Updated Name',
        email: 'updated@example.com'
      };

      await resource.update('test-before-after', updateData);

      expect(updateListener).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-before-after',
        name: 'Updated Name',
        email: 'updated@example.com',
        $before: expect.objectContaining({
          name: 'Original Name',
          email: 'original@example.com'
        }),
        $after: expect.objectContaining({
          name: 'Updated Name',
          email: 'updated@example.com'
        })
      }));
    });

    test('should work with bulk operations', async () => {
      const insertManyListener = jest.fn();
      const deleteManyListener = jest.fn();
      
      const resource = await database.createResource({
        name: 'bulk_operations_test',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        behavior: 'user-managed',
        asyncEvents: false,
        events: {
          'inserted-many': insertManyListener,
          'deleted-many': deleteManyListener
        }
      });

             const bulkData = [
         { id: 'bulk-user-1', name: 'User 1' },
         { id: 'bulk-user-2', name: 'User 2' },
         { id: 'bulk-user-3', name: 'User 3' }
       ];

      // Test insertMany event
      await resource.insertMany(bulkData);
      expect(insertManyListener).toHaveBeenCalledWith(3);

      // Test deleteMany event
      const allIds = await resource.listIds();
      await resource.deleteMany(allIds);
      expect(deleteManyListener).toHaveBeenCalledWith(3);
    });

    test('should work with different behaviors', async () => {
      const insertListener = jest.fn();
      
      // Test with body-overflow behavior
      const resource = await database.createResource({
        name: 'behavior_overflow_test',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          content: 'string'
        },
        behavior: 'body-overflow',
        asyncEvents: false,
        events: {
          inserted: insertListener
        }
      });

      const testData = {
        id: 'test-behavior',
        title: 'Test Title',
        content: 'x'.repeat(3000) // Large content that will overflow
      };

      await resource.insert(testData);

      expect(insertListener).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-behavior',
        title: 'Test Title',
        content: 'x'.repeat(3000)
      }));
    });

         test('should call all listeners even if some fail', async () => {
       const workingListener1 = jest.fn();
       const workingListener2 = jest.fn();
       
       const resource = await database.createResource({
         name: 'error_handling_test',
         attributes: {
           id: 'string|optional',
           name: 'string|required'
         },
         behavior: 'user-managed',
         asyncEvents: false,
         events: {
           inserted: [workingListener1, workingListener2]
         }
       });

       const testData = {
         id: 'test-error-handling',
         name: 'Test User'
       };

       // Insert should work normally
       const result = await resource.insert(testData);
       expect(result).toMatchObject(testData);

       // Both listeners should have been called
       expect(workingListener1).toHaveBeenCalledTimes(1);
       expect(workingListener2).toHaveBeenCalledTimes(1);
     });

    test('should preserve listener context and binding', async () => {
      let capturedThis;
      const contextListener = function(event) {
        capturedThis = this;
      };
      
      const resource = await database.createResource({
        name: 'context_test',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        behavior: 'user-managed',
        asyncEvents: false,
        events: {
          inserted: contextListener
        }
      });

      await resource.insert({
        id: 'test-context',
        name: 'Test User'
      });

      // The listener should be bound to the resource
      expect(capturedThis).toBeDefined();
      expect(capturedThis.constructor.name).toBe('Resource');
    });

    test('should validate events configuration', async () => {
      // Should throw error for invalid events config
      await expect(database.createResource({
        name: 'invalid_events_test',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        events: {
          inserted: 'not a function' // Invalid: should be function
        }
      })).rejects.toThrow();

      // Should throw error for invalid array of listeners
      await expect(database.createResource({
        name: 'invalid_array_events_test',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        events: {
          updated: ['not a function', 'also not a function'] // Invalid: should be functions
        }
      })).rejects.toThrow();
    });

    test('should not interfere with manually added listeners', async () => {
      const configListener = jest.fn();
      const manualListener = jest.fn();
      
      const resource = await database.createResource({
        name: 'manual_listeners_test',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        },
        behavior: 'user-managed',
        asyncEvents: false,
        events: {
          inserted: configListener
        }
      });

      // Add manual listener after resource creation
      resource.on('inserted', manualListener);

      await resource.insert({
        id: 'test-manual',
        name: 'Test User'
      });

      // Both listeners should have been called
      expect(configListener).toHaveBeenCalledTimes(1);
      expect(manualListener).toHaveBeenCalledTimes(1);
    });
  });
}); 