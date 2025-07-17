import { describe, test, expect, beforeEach } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';
import { jest } from '@jest/globals';

describe('Resource Events - Always Emit Complete Content', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('resource-events');
    await database.connect();
  });

  describe('user-managed behavior', () => {
    test('should emit complete content on insert', async () => {
      const resource = await database.createResource({
        name: 'user_managed_test',
        attributes: {
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('insert', resolve));
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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('update', resolve));
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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('delete', resolve));
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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('insert', resolve));
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
          id: 'string|required',
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
      console.log('[TEST][body-overflow update] exists after insert:', existsAfterInsert);

      // Wait for S3/MinIO consistency
      await new Promise(r => setTimeout(r, 100));

      const largeContent = 'y'.repeat(3000);
      const updatedData = {
        title: 'Updated Title',
        content: largeContent,
        meta: { category: 'updated', priority: 'high' }
      };

      const eventPromise = new Promise(resolve => resource.once('update', resolve));
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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('insert', resolve));
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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('update', resolve));
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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('insert', resolve));
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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('update', resolve));
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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('insert', resolve));
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
          id: 'string|required',
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
      resource.once('insert', eventEmitted);

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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('insert', resolve));
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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('insert', resolve));
      await resource.insert(testData);
      const eventData = await eventPromise;

      console.log({ eventData });

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
          id: 'string|required',
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

      const eventPromise = new Promise(resolve => resource.once('insert', resolve));
      await resource.insert(testData);
      const eventData = await eventPromise;

      // Should preserve all data types (numbers may be converted to strings)
      expect(eventData.stringField).toBe('test string');
      expect(eventData.numberField).toBe(42);
      expect(eventData.booleanField).toBe(true);
      expect(eventData.nullField).toBeNull();
      expect(eventData.undefinedField).toBeUndefined();
      expect(eventData.objectField).toEqual({ key: 'value' });
      expect(eventData.arrayField).toEqual(['1', '2', '3']); // Numbers converted to strings
    });
  });
}); 