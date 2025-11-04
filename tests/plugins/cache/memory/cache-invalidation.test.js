import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals';
import { createDatabaseForTest } from '../../../config.js';
import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { MemoryCache } from '../../../../src/plugins/cache/index.js';


describe('Cache Plugin - MemoryCache Driver - Cache Invalidation', () => {
  let db;
  let cachePlugin;
  let users;

  beforeEach(async () => {
    db = createDatabaseForTest('suite=plugins/cache-memory');
    await db.connect();

    cachePlugin = new CachePlugin({
      driver: 'memory',
      ttl: 60000,
      maxSize: 100,
    });
    await cachePlugin.install(db);

    users = await db.createResource({
      name: 'users',
      asyncPartitions: false,
      attributes: {
        name: 'string|required',
        email: 'string|required',
        department: 'string|required',
        region: 'string|required',
        status: 'string|required',
      },
      partitions: {
        byDepartment: { fields: { department: 'string' } },
        byRegion: { fields: { region: 'string' } },
      },
    });
  });

  afterEach(async () => {
    if (cachePlugin && cachePlugin.driver) {
      await cachePlugin.clearAllCache();
    }
    if (db) {
      await db.disconnect();
    }
  });

  beforeEach(async () => {
    await users.insert({
      name: 'Test User',
      email: 'test@example.com',
      department: 'IT',
      region: 'US',
      status: 'active'
    });
  });

  test('should invalidate cache on insert', async () => {
    // Cache count
    const initialCount = await users.count();
    expect(initialCount).toBe(1);

    // Insert new user
    await users.insert({
      name: 'New User',
      email: 'new@example.com',
      department: 'HR',
      region: 'US',
      status: 'active'
    });

    // Count should reflect new data
    const newCount = await users.count();
    expect(newCount).toBe(2);
  });

  test('should invalidate cache on update', async () => {
    const userId = (await users.listIds())[0];

    // Cache user data
    const originalUser = await users.get(userId);
    expect(originalUser.name).toBe('Test User');

    // Update user
    await users.update(userId, { name: 'Updated User' });

    // Cache should be invalidated
    const updatedUser = await users.get(userId);
    expect(updatedUser.name).toBe('Updated User');
  });

  test('should invalidate cache on delete', async () => {
    const userId = (await users.listIds())[0];

    // Cache count
    const initialCount = await users.count();
    expect(initialCount).toBe(1);

    // Delete user
    await users.delete(userId);

    // Cache should be invalidated
    const newCount = await users.count();
    expect(newCount).toBe(0);
  });

  test('should invalidate cache on deleteMany', async () => {
    // Insert more users
    await users.insertMany([
      { name: 'User 2', email: 'user2@example.com', department: 'HR', region: 'US', status: 'active' },
      { name: 'User 3', email: 'user3@example.com', department: 'IT', region: 'EU', status: 'active' }
    ]);

    const initialCount = await users.count();
    expect(initialCount).toBe(3);

    const allIds = await users.listIds();
    await users.deleteMany(allIds.slice(0, 2));

    const newCount = await users.count();
    expect(newCount).toBe(1);
  });

  test('should invalidate partition cache appropriately', async () => {
    // Insert more IT users
    await users.insertMany([
      { name: 'IT User 2', email: 'it2@example.com', department: 'IT', region: 'US', status: 'active' },
      { name: 'HR User 1', email: 'hr1@example.com', department: 'HR', region: 'US', status: 'active' }
    ]);

    // Small delay to ensure partition indexes are ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // Cache IT department count
    const itCount1 = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'IT' }
    });
    expect(itCount1).toBe(2);

    // Cache HR department count
    const hrCount1 = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'HR' }
    });
    expect(hrCount1).toBe(1);

    // Insert new IT user
    await users.insert({
      name: 'IT User 3',
      email: 'it3@example.com',
      department: 'IT',
      region: 'EU',
      status: 'active'
    });

    // Small delay to ensure partition indexes are ready
    await new Promise(resolve => setTimeout(resolve, 100));

    // IT count should be updated
    const itCount2 = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'IT' }
    });
    expect(itCount2).toBe(3);

    // HR count should remain the same (cache still valid)
    const hrCount2 = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'HR' }
    });
    expect(hrCount2).toBe(1);
  });
});
