import { beforeEach, describe, expect, test } from '@jest/globals';

import { setupMemoryCacheSuite } from '../helpers.js';

describe('Cache Plugin - MemoryCache Driver - Cache Invalidation', () => {
  const ctx = setupMemoryCacheSuite();

  beforeEach(async () => {
    await ctx.seedUsers();
  });

  test('refreshes cached aggregates after inserts', async () => {
    const users = ctx.resource;

    const firstCount = await users.count();
    expect(firstCount).toBe(3);

    await users.insert({
      name: 'Diana',
      email: 'diana@example.com',
      department: 'Marketing',
      region: 'US',
      status: 'active'
    });

    const updatedCount = await users.count();
    expect(updatedCount).toBe(4);
  });

  test('drops cached entities when they are updated', async () => {
    const users = ctx.resource;
    const [userId] = await users.listIds();

    const cachedUser = await users.get(userId);
    expect(cachedUser).toBeDefined();

    await users.update(userId, { status: 'inactive' });

    const refreshedUser = await users.get(userId);
    expect(refreshedUser.status).toBe('inactive');
  });

  test('clears partition-specific caches affected by deletes', async () => {
    const users = ctx.resource;

    const itCount = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    expect(itCount).toBe(2);

    const engineeringUsers = await users.list({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });

    await Promise.all(engineeringUsers.map(user => users.delete(user.id)));

    const refreshedCount = await users.count({
      partition: 'byDepartment',
      partitionValues: { department: 'Engineering' }
    });
    expect(refreshedCount).toBe(0);
  });
});
