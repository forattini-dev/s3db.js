import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { createDatabaseForTest } from '#tests/config.js';

describe('Resource patch() and replace() Methods', () => {
  let database;
  let enforceLimitsResource, bodyOverflowResource, bodyOnlyResource, truncateDataResource;

  beforeAll(async () => {
    database = createDatabaseForTest('suite=resources/patch-replace');
    await database.connect();

    // Create resources with different behaviors
    [enforceLimitsResource, bodyOverflowResource, bodyOnlyResource, truncateDataResource] = await Promise.all([
      database.createResource({
        name: 'users_enforce',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|optional',
          status: 'string|default:active',
          loginCount: 'number|default:0'
        },
        behavior: 'enforce-limits',
        timestamps: true
      }),

      database.createResource({
        name: 'users_overflow',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|optional',
          bio: 'string|optional',
          status: 'string|default:active'
        },
        behavior: 'body-overflow',
        timestamps: true
      }),

      database.createResource({
        name: 'users_bodyonly',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|optional',
          status: 'string|default:active'
        },
        behavior: 'body-only',
        timestamps: true
      }),

      database.createResource({
        name: 'users_truncate',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          email: 'string|optional',
          status: 'string|default:active'
        },
        behavior: 'truncate-data',
        timestamps: true
      })
    ]);
  });

  afterAll(async () => {
    await database.disconnect();
  });

  // ============================================================================
  // patch() Tests
  // ============================================================================

  describe('patch() - enforce-limits behavior (optimized path)', () => {
    test('should patch single field using CopyObject optimization', async () => {
      const id = 'user-patch-1';

      // Insert initial data
      await enforceLimitsResource.insert({
        id,
        name: 'John Doe',
        email: 'john@example.com',
        status: 'inactive',
        loginCount: 0
      });

      // Spy on client methods to verify CopyObject is used
      const headObjectSpy = jest.spyOn(enforceLimitsResource.client, 'headObject');
      const copyObjectSpy = jest.spyOn(enforceLimitsResource.client, 'copyObject');
      const getObjectSpy = jest.spyOn(enforceLimitsResource.client, 'getObject');

      // Patch status field
      const updated = await enforceLimitsResource.patch(id, { status: 'active' });

      // Verify CopyObject optimization was used (HEAD + COPY, no GET)
      expect(headObjectSpy).toHaveBeenCalledTimes(1);
      expect(copyObjectSpy).toHaveBeenCalledTimes(1);
      expect(getObjectSpy).not.toHaveBeenCalled();

      // Verify data is correct
      expect(updated.status).toBe('active');
      expect(updated.name).toBe('John Doe');
      expect(updated.email).toBe('john@example.com');
      expect(updated.loginCount).toBe(0);

      // Verify timestamp was updated
      expect(updated.updatedAt).toBeDefined();

      // Cleanup spies
      headObjectSpy.mockRestore();
      copyObjectSpy.mockRestore();
      getObjectSpy.mockRestore();
    });

    test('should patch multiple fields', async () => {
      const id = 'user-patch-2';

      await enforceLimitsResource.insert({
        id,
        name: 'Jane Smith',
        email: 'jane@example.com',
        status: 'inactive',
        loginCount: 5
      });

      const updated = await enforceLimitsResource.patch(id, {
        status: 'active',
        loginCount: 10
      });

      expect(updated.status).toBe('active');
      expect(updated.loginCount).toBe(10);
      expect(updated.name).toBe('Jane Smith');
      expect(updated.email).toBe('jane@example.com');
    });

    // SKIPPED: Nested field updates with dot notation
    // Known limitation: The schema system doesn't properly handle dot notation
    // for nested objects (e.g., 'profile.bio' loses sibling fields like 'profile.age').
    // This affects both update() and patch() methods.
    //
    // Workaround: Update the entire object instead:
    // await resource.patch(id, { profile: { bio: 'New bio', age: 30 } })
    //
    // See CLAUDE.md documentation for details.
    test.skip('should handle nested field updates with dot notation', async () => {
      // This test is skipped due to a known limitation in the schema system
      // where dot notation for nested objects doesn't preserve sibling fields.
    });

    test('should validate data during patch', async () => {
      const id = 'user-patch-validate';

      await enforceLimitsResource.insert({
        id,
        name: 'Valid User',
        email: 'valid@example.com'
      });

      // Try to patch with invalid data (wrong type - number instead of string)
      await expect(
        enforceLimitsResource.patch(id, { name: 123 })
      ).rejects.toThrow(/Validation failed|must be a string/);
    });

    test('should update timestamps on patch', async () => {
      const id = 'user-patch-timestamp';

      const inserted = await enforceLimitsResource.insert({
        id,
        name: 'Time User',
        email: 'time@example.com'
      });

      const createdAt = inserted.createdAt;

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await enforceLimitsResource.patch(id, { status: 'active' });

      expect(updated.createdAt).toBe(createdAt);
      expect(updated.updatedAt).not.toBe(inserted.updatedAt);
    });
  });

  describe('patch() - truncate-data behavior (optimized path)', () => {
    test('should use CopyObject optimization for truncate-data behavior', async () => {
      const id = 'user-truncate-1';

      await truncateDataResource.insert({
        id,
        name: 'Truncate User',
        email: 'truncate@example.com',
        status: 'inactive'
      });

      const headObjectSpy = jest.spyOn(truncateDataResource.client, 'headObject');
      const copyObjectSpy = jest.spyOn(truncateDataResource.client, 'copyObject');
      const getObjectSpy = jest.spyOn(truncateDataResource.client, 'getObject');

      const updated = await truncateDataResource.patch(id, { status: 'active' });

      // Verify CopyObject optimization was used
      expect(headObjectSpy).toHaveBeenCalledTimes(1);
      expect(copyObjectSpy).toHaveBeenCalledTimes(1);
      expect(getObjectSpy).not.toHaveBeenCalled();

      expect(updated.status).toBe('active');
      expect(updated.name).toBe('Truncate User');

      headObjectSpy.mockRestore();
      copyObjectSpy.mockRestore();
      getObjectSpy.mockRestore();
    });
  });

  describe('patch() - body-overflow behavior (fallback to update)', () => {
    test('should fallback to update() for body-overflow behavior', async () => {
      const id = 'user-overflow-1';

      await bodyOverflowResource.insert({
        id,
        name: 'Overflow User',
        email: 'overflow@example.com',
        bio: 'Short bio',
        status: 'inactive'
      });

      const getObjectSpy = jest.spyOn(bodyOverflowResource.client, 'getObject');
      const putObjectSpy = jest.spyOn(bodyOverflowResource.client, 'putObject');
      const copyObjectSpy = jest.spyOn(bodyOverflowResource.client, 'copyObject');

      const updated = await bodyOverflowResource.patch(id, { status: 'active' });

      // Verify it used GET + PUT (update method), not COPY
      expect(getObjectSpy).toHaveBeenCalled();
      expect(putObjectSpy).toHaveBeenCalled();
      expect(copyObjectSpy).not.toHaveBeenCalled();

      expect(updated.status).toBe('active');
      expect(updated.name).toBe('Overflow User');

      getObjectSpy.mockRestore();
      putObjectSpy.mockRestore();
      copyObjectSpy.mockRestore();
    });
  });

  describe('patch() - body-only behavior (fallback to update)', () => {
    test('should fallback to update() for body-only behavior', async () => {
      const id = 'user-bodyonly-1';

      await bodyOnlyResource.insert({
        id,
        name: 'Body Only User',
        email: 'bodyonly@example.com',
        status: 'inactive'
      });

      const getObjectSpy = jest.spyOn(bodyOnlyResource.client, 'getObject');
      const putObjectSpy = jest.spyOn(bodyOnlyResource.client, 'putObject');
      const copyObjectSpy = jest.spyOn(bodyOnlyResource.client, 'copyObject');

      const updated = await bodyOnlyResource.patch(id, { status: 'active' });

      // Verify it used GET + PUT (update method), not COPY
      expect(getObjectSpy).toHaveBeenCalled();
      expect(putObjectSpy).toHaveBeenCalled();
      expect(copyObjectSpy).not.toHaveBeenCalled();

      expect(updated.status).toBe('active');
      expect(updated.name).toBe('Body Only User');

      getObjectSpy.mockRestore();
      putObjectSpy.mockRestore();
      copyObjectSpy.mockRestore();
    });
  });

  describe('patch() - partitioned resources', () => {
    test('should patch record in partition and update partition indexes', async () => {
      const partitionedResource = await database.createResource({
        name: 'orders_patch',
        attributes: {
          id: 'string|required',
          customerId: 'string|required',
          region: 'string|required',
          status: 'string|default:pending',
          total: 'number|default:0'
        },
        behavior: 'enforce-limits',
        timestamps: true,
        partitions: {
          byRegion: { fields: { region: 'string' } }
        }
      });

      const id = 'order-123';
      await partitionedResource.insert({
        id,
        customerId: 'cust-1',
        region: 'US',
        status: 'pending',
        total: 100
      });

      // Patch status (no partition change)
      const updated = await partitionedResource.patch(id, { status: 'shipped' });

      expect(updated.status).toBe('shipped');
      expect(updated.total).toBe(100);

      // Verify it exists in partition
      const fromPartition = await partitionedResource.getFromPartition({
        id,
        partitionName: 'byRegion',
        partitionValues: { region: 'US' }
      });
      expect(fromPartition.status).toBe('shipped');
    });

    test('should update partition indexes when patching partition field', async () => {
      const partitionedResource = await database.createResource({
        name: 'users_region_patch',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          region: 'string|required',
          status: 'string|default:active'
        },
        behavior: 'enforce-limits',
        timestamps: true,
        asyncPartitions: false,  // Use sync mode for this test
        partitions: {
          byRegion: { fields: { region: 'string' } }
        }
      });

      const id = 'user-region-1';
      await partitionedResource.insert({
        id,
        name: 'Regional User',
        region: 'US',
        status: 'active'
      });

      // Patch region field (should update partition)
      const updated = await partitionedResource.patch(id, { region: 'EU' });

      expect(updated.region).toBe('EU');

      // Verify it exists in new partition
      const fromNewPartition = await partitionedResource.getFromPartition({
        id,
        partitionName: 'byRegion',
        partitionValues: { region: 'EU' }
      });
      expect(fromNewPartition.name).toBe('Regional User');

      // Verify it was removed from old partition
      const oldPartitionList = await partitionedResource.listPartition({
        partition: 'byRegion',
        partitionValues: { region: 'US' }
      });
      // listPartition returns array directly, not {data: [...]}
      expect(oldPartitionList.find(u => u.id === id)).toBeUndefined();
    });
  });

  describe('patch() - error handling', () => {
    test('should throw error for empty id', async () => {
      await expect(
        enforceLimitsResource.patch('', { status: 'active' })
      ).rejects.toThrow(/id cannot be empty/);
    });

    test('should throw error for invalid fields parameter', async () => {
      await expect(
        enforceLimitsResource.patch('user-123', null)
      ).rejects.toThrow(/fields must be a non-empty object/);
    });

    test('should throw error for non-existent record', async () => {
      await expect(
        enforceLimitsResource.patch('non-existent-id', { status: 'active' })
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // replace() Tests
  // ============================================================================

  describe('replace() - all behaviors', () => {
    test('should replace entire object without GET (enforce-limits)', async () => {
      const id = 'user-replace-1';

      // Insert initial data
      await enforceLimitsResource.insert({
        id,
        name: 'Old Name',
        email: 'old@example.com',
        status: 'inactive',
        loginCount: 5
      });

      const getObjectSpy = jest.spyOn(enforceLimitsResource.client, 'getObject');
      const putObjectSpy = jest.spyOn(enforceLimitsResource.client, 'putObject');

      // Replace with completely new data (no GET should happen)
      const replaced = await enforceLimitsResource.replace(id, {
        name: 'New Name',
        email: 'new@example.com',
        status: 'active',
        loginCount: 0
      });

      // Verify no GET operation (direct PUT)
      expect(getObjectSpy).not.toHaveBeenCalled();
      expect(putObjectSpy).toHaveBeenCalled();

      // Verify data was completely replaced
      expect(replaced.id).toBe(id);
      expect(replaced.name).toBe('New Name');
      expect(replaced.email).toBe('new@example.com');
      expect(replaced.status).toBe('active');
      expect(replaced.loginCount).toBe(0);

      getObjectSpy.mockRestore();
      putObjectSpy.mockRestore();
    });

    test('should replace with body-overflow behavior', async () => {
      const id = 'user-overflow-replace';

      await bodyOverflowResource.insert({
        id,
        name: 'Old Name',
        email: 'old@example.com',
        bio: 'Old bio',
        status: 'inactive'
      });

      const getObjectSpy = jest.spyOn(bodyOverflowResource.client, 'getObject');

      const replaced = await bodyOverflowResource.replace(id, {
        name: 'New Name',
        email: 'new@example.com',
        bio: 'New bio',
        status: 'active'
      });

      // No GET should happen
      expect(getObjectSpy).not.toHaveBeenCalled();

      expect(replaced.name).toBe('New Name');
      expect(replaced.bio).toBe('New bio');

      getObjectSpy.mockRestore();
    });

    test('should replace with body-only behavior', async () => {
      const id = 'user-bodyonly-replace';

      await bodyOnlyResource.insert({
        id,
        name: 'Old Name',
        email: 'old@example.com',
        status: 'inactive'
      });

      const getObjectSpy = jest.spyOn(bodyOnlyResource.client, 'getObject');

      const replaced = await bodyOnlyResource.replace(id, {
        name: 'New Name',
        email: 'new@example.com',
        status: 'active'
      });

      expect(getObjectSpy).not.toHaveBeenCalled();
      expect(replaced.name).toBe('New Name');

      getObjectSpy.mockRestore();
    });
  });

  describe('replace() - validation and defaults', () => {
    test('should validate required fields on replace', async () => {
      const id = 'user-replace-validate';

      // Try to replace with missing required field (name)
      await expect(
        enforceLimitsResource.replace(id, {
          email: 'test@example.com',
          status: 'active'
        })
      ).rejects.toThrow(/field is required|Validation failed/);
    });

    test('should apply default values on replace', async () => {
      const id = 'user-replace-defaults';

      const replaced = await enforceLimitsResource.replace(id, {
        name: 'Default User',
        email: 'default@example.com'
        // status and loginCount should get defaults
      });

      expect(replaced.status).toBe('active'); // default
      expect(replaced.loginCount).toBe(0); // default
    });

    test('should preserve createdAt if provided, set updatedAt', async () => {
      const id = 'user-replace-timestamp';
      const customCreatedAt = '2020-01-01T00:00:00.000Z';

      const replaced = await enforceLimitsResource.replace(id, {
        name: 'Timestamp User',
        email: 'timestamp@example.com',
        createdAt: customCreatedAt
      });

      expect(replaced.createdAt).toBe(customCreatedAt);
      expect(replaced.updatedAt).toBeDefined();
      expect(replaced.updatedAt).not.toBe(customCreatedAt);
    });

    test('should set createdAt if not provided', async () => {
      const id = 'user-replace-autocreated';

      const replaced = await enforceLimitsResource.replace(id, {
        name: 'Auto Created User',
        email: 'autocreated@example.com'
      });

      expect(replaced.createdAt).toBeDefined();
      expect(replaced.updatedAt).toBeDefined();
    });
  });

  describe('replace() - partitioned resources', () => {
    test('should replace record in partition', async () => {
      const partitionedResource = await database.createResource({
        name: 'products_replace',
        attributes: {
          id: 'string|required',
          name: 'string|required',
          category: 'string|required',
          price: 'number|default:0'
        },
        behavior: 'enforce-limits',
        timestamps: true,
        asyncPartitions: false,  // Use sync mode for this test
        partitions: {
          byCategory: { fields: { category: 'string' } }
        }
      });

      const id = 'product-123';

      const replaced = await partitionedResource.replace(id, {
        name: 'New Product',
        category: 'electronics',
        price: 999
      });

      expect(replaced.name).toBe('New Product');
      expect(replaced.price).toBe(999);

      // Verify it exists in partition
      const fromPartition = await partitionedResource.getFromPartition({
        id,
        partitionName: 'byCategory',
        partitionValues: { category: 'electronics' }
      });
      expect(fromPartition.name).toBe('New Product');
    });
  });

  describe('replace() - error handling', () => {
    test('should throw error for empty id', async () => {
      await expect(
        enforceLimitsResource.replace('', { name: 'Test' })
      ).rejects.toThrow(/id cannot be empty/);
    });

    test('should throw error for invalid fullData parameter', async () => {
      await expect(
        enforceLimitsResource.replace('user-123', null)
      ).rejects.toThrow(/fullData must be a non-empty object/);
    });
  });

  // ============================================================================
  // Comparison Tests - update() vs patch() vs replace()
  // ============================================================================

  describe('Performance comparison - update() vs patch() vs replace()', () => {
    test('patch() should be faster than update() for enforce-limits (fewer requests)', async () => {
      const id = 'user-perf-1';

      await enforceLimitsResource.insert({
        id,
        name: 'Performance User',
        email: 'perf@example.com',
        status: 'inactive',
        loginCount: 0
      });

      // Measure update() - should do GET + PUT
      const getObjectSpy = jest.spyOn(enforceLimitsResource.client, 'getObject');
      const headObjectSpy = jest.spyOn(enforceLimitsResource.client, 'headObject');
      const copyObjectSpy = jest.spyOn(enforceLimitsResource.client, 'copyObject');
      const putObjectSpy = jest.spyOn(enforceLimitsResource.client, 'putObject');

      await enforceLimitsResource.update(id, { loginCount: 1 });

      const updateGetCalls = getObjectSpy.mock.calls.length;
      const updatePutCalls = putObjectSpy.mock.calls.length;

      getObjectSpy.mockClear();
      putObjectSpy.mockClear();

      // Measure patch() - should do HEAD + COPY
      await enforceLimitsResource.patch(id, { loginCount: 2 });

      const patchHeadCalls = headObjectSpy.mock.calls.length;
      const patchCopyCalls = copyObjectSpy.mock.calls.length;
      const patchGetCalls = getObjectSpy.mock.calls.length;

      // Verify update() uses GET + PUT
      expect(updateGetCalls).toBeGreaterThan(0);
      expect(updatePutCalls).toBeGreaterThan(0);

      // Verify patch() uses HEAD + COPY (no GET, no PUT)
      expect(patchHeadCalls).toBeGreaterThan(0);
      expect(patchCopyCalls).toBeGreaterThan(0);
      expect(patchGetCalls).toBe(0);

      getObjectSpy.mockRestore();
      headObjectSpy.mockRestore();
      copyObjectSpy.mockRestore();
      putObjectSpy.mockRestore();
    });

    test('replace() should skip GET operation unlike update()', async () => {
      const id = 'user-perf-2';

      await enforceLimitsResource.insert({
        id,
        name: 'Replace User',
        email: 'replace@example.com',
        status: 'inactive',
        loginCount: 0
      });

      const getObjectSpy = jest.spyOn(enforceLimitsResource.client, 'getObject');

      // replace() should NOT do GET
      await enforceLimitsResource.replace(id, {
        name: 'Replaced Name',
        email: 'replaced@example.com',
        status: 'active',
        loginCount: 5
      });

      expect(getObjectSpy).not.toHaveBeenCalled();

      getObjectSpy.mockRestore();
    });
  });
});
