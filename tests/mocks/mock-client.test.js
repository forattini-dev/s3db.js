/**
 * MockClient Tests
 *
 * Validates that MockClient works correctly as a drop-in replacement
 * for real S3 clients in unit tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MockClient,
  createMockClient,
  createMockDatabase,
  createConnectedMockDatabase,
  createDatabaseWithResource,
  schemas,
  dataGenerators,
  generateMany,
  users,
  products,
  createTestContext,
  createSpy,
  createAsyncSpy,
  spyOnClient,
  trackEvents
} from './index.js';

describe('MockClient', () => {
  let client;

  beforeEach(() => {
    client = createMockClient({ bucket: 'test-bucket' });
  });

  afterEach(() => {
    client.destroy();
  });

  describe('Basic Operations', () => {
    it('should put and get objects', async () => {
      await client.putObject({
        key: 'test-key',
        body: Buffer.from('test content'),
        metadata: { foo: 'bar' }
      });

      const result = await client.getObject('test-key');

      expect(result.Metadata.foo).toBe('bar');

      // Read body
      const chunks = [];
      for await (const chunk of result.Body) {
        chunks.push(chunk);
      }
      expect(Buffer.concat(chunks).toString()).toBe('test content');
    });

    it('should head objects', async () => {
      await client.putObject({
        key: 'head-test',
        body: Buffer.from('data'),
        metadata: { type: 'test' }
      });

      const result = await client.headObject('head-test');

      expect(result.Metadata.type).toBe('test');
      expect(result.Body).toBeUndefined();
    });

    it('should copy objects', async () => {
      await client.putObject({
        key: 'source',
        body: Buffer.from('copy me'),
        metadata: { original: 'true' }
      });

      await client.copyObject({
        from: 'source',
        to: 'destination',
        metadataDirective: 'COPY'
      });

      const result = await client.getObject('destination');
      expect(result.Metadata.original).toBe('true');
    });

    it('should delete objects', async () => {
      await client.putObject({ key: 'to-delete', body: 'x' });

      expect(await client.exists('to-delete')).toBe(true);

      await client.deleteObject('to-delete');

      expect(await client.exists('to-delete')).toBe(false);
    });

    it('should list objects', async () => {
      await client.putObject({ key: 'items/a', body: '1' });
      await client.putObject({ key: 'items/b', body: '2' });
      await client.putObject({ key: 'other/c', body: '3' });

      const result = await client.listObjects({ prefix: 'items/' });

      expect(result.Contents).toHaveLength(2);
      expect(result.Contents.map(c => c.Key)).toContain('items/a');
      expect(result.Contents.map(c => c.Key)).toContain('items/b');
    });
  });

  describe('Preconditions', () => {
    it('should fail putObject with ifNoneMatch when object exists', async () => {
      await client.putObject({ key: 'existing', body: 'x' });

      await expect(
        client.putObject({ key: 'existing', body: 'y', ifNoneMatch: '*' })
      ).rejects.toThrow('PreconditionFailed');
    });

    it('should succeed putObject with ifNoneMatch when object does not exist', async () => {
      await expect(
        client.putObject({ key: 'new-key', body: 'y', ifNoneMatch: '*' })
      ).resolves.toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw NoSuchKey for non-existent objects', async () => {
      await expect(client.getObject('non-existent')).rejects.toThrow('NoSuchKey');
    });

    it('should throw NotFound for head on non-existent objects', async () => {
      await expect(client.headObject('non-existent')).rejects.toThrow('NotFound');
    });
  });

  describe('Mock Configuration', () => {
    it('should return mocked response', async () => {
      client.mockResponse('mocked-key', {
        Metadata: { mocked: 'true' },
        Body: { async *[Symbol.asyncIterator]() { yield Buffer.from('mocked'); } }
      });

      const result = await client.getObject('mocked-key');
      expect(result.Metadata.mocked).toBe('true');
    });

    it('should throw mocked error', async () => {
      client.mockError('error-key', new Error('Mocked error'));

      await expect(client.getObject('error-key')).rejects.toThrow('Mocked error');
    });
  });

  describe('Call Tracking', () => {
    it('should track method calls', async () => {
      await client.putObject({ key: 'track-1', body: 'a' });
      await client.putObject({ key: 'track-2', body: 'b' });
      await client.getObject('track-1');

      expect(client.getCalls('putObject')).toHaveLength(2);
      expect(client.getCalls('getObject')).toHaveLength(1);
      expect(client.assertCalled('putObject')).toBe(true);
    });

    it('should reset calls', async () => {
      await client.putObject({ key: 'x', body: 'y' });
      expect(client.getCalls('putObject')).toHaveLength(1);

      client.resetCalls();
      expect(client.getCalls('putObject')).toHaveLength(0);
    });
  });

  describe('Stats', () => {
    it('should track operation stats', async () => {
      await client.putObject({ key: 'a', body: '1' });
      await client.putObject({ key: 'b', body: '2' });
      await client.getObject('a');

      const stats = client.getStats();
      expect(stats.puts).toBe(2);
      expect(stats.gets).toBe(1);
      expect(stats.objectCount).toBe(2);
    });
  });

  describe('Snapshot/Restore', () => {
    it('should snapshot and restore state', async () => {
      await client.putObject({ key: 'snap-1', body: 'data' });
      const snapshot = client.snapshot();

      await client.deleteObject('snap-1');
      expect(await client.exists('snap-1')).toBe(false);

      client.restore(snapshot);
      expect(await client.exists('snap-1')).toBe(true);
    });
  });
});

describe('Test Factories', () => {
  describe('createMockDatabase', () => {
    it('should create a database with mock client', async () => {
      const db = createMockDatabase('factory-test');

      expect(db).toBeDefined();
      expect(db.client).toBeInstanceOf(MockClient);

      await db.disconnect();
    });

    it('should create connected database', async () => {
      const db = await createConnectedMockDatabase('connected-test');

      // Database is connected after connect() - verify by checking resources exist
      expect(db.resources).toBeDefined();

      await db.disconnect();
    });

    it('should create database with resource', async () => {
      const { database, resource } = await createDatabaseWithResource(
        'with-resource',
        schemas.user
      );

      expect(resource).toBeDefined();
      expect(resource.name).toBe('users');

      // Test CRUD
      const inserted = await resource.insert({
        name: 'Test User',
        email: 'test@example.com'
      });

      expect(inserted.id).toBeDefined();
      expect(inserted.name).toBe('Test User');

      await database.disconnect();
    });
  });

  describe('Schema Templates', () => {
    it('should provide common schema templates', () => {
      expect(schemas.user).toBeDefined();
      expect(schemas.user.attributes.email).toBe('email|required');

      expect(schemas.productWithPartitions).toBeDefined();
      expect(schemas.productWithPartitions.partitions).toBeDefined();

      expect(schemas.documentWithSecrets).toBeDefined();
      expect(schemas.documentWithSecrets.attributes.apiKey).toBe('secret|optional');
    });
  });

  describe('Data Generators', () => {
    it('should generate user data', () => {
      const user = dataGenerators.user();

      expect(user.name).toBeDefined();
      expect(user.email).toContain('@');
      expect(user.age).toBeGreaterThanOrEqual(18);
    });

    it('should generate multiple records', () => {
      const users = generateMany(dataGenerators.user, 5);

      expect(users).toHaveLength(5);
      expect(new Set(users.map(u => u.email)).size).toBe(5); // All unique
    });

    it('should accept overrides', () => {
      const user = dataGenerators.user({ name: 'Custom Name', age: 99 });

      expect(user.name).toBe('Custom Name');
      expect(user.age).toBe(99);
    });
  });
});

describe('Test Fixtures', () => {
  it('should provide user fixtures', () => {
    expect(users.john.name).toBe('John Doe');
    expect(users.jane.email).toBe('jane@example.com');
    expect(users.inactive.active).toBe(false);
  });

  it('should provide product fixtures', () => {
    expect(products.laptop.category).toBe('electronics');
    expect(products.discontinued.status).toBe('discontinued');
  });

  describe('createTestContext', () => {
    it('should create isolated test context', () => {
      const ctx = createTestContext('my-test');

      expect(ctx.id).toContain('my-test');
      expect(ctx.uniqueId('item')).toContain(ctx.id);
    });

    it('should clone fixtures with unique IDs', () => {
      const ctx = createTestContext('clone-test');

      const cloned = ctx.cloneWithUniqueIds(users.john);

      expect(cloned.id).toContain(ctx.id);
      expect(cloned.name).toBe(users.john.name);
      expect(cloned.id).not.toBe(users.john.id);
    });
  });
});

describe('Spies', () => {
  describe('createSpy', () => {
    it('should track calls', () => {
      const spy = createSpy('test-spy');

      spy('arg1', 'arg2');
      spy('arg3');

      expect(spy.wasCalled()).toBe(true);
      expect(spy.wasCalledTimes(2)).toBe(true);
      expect(spy.wasCalledWith('arg1', 'arg2')).toBe(true);
    });

    it('should return configured value', () => {
      const spy = createSpy().returns(42);

      expect(spy()).toBe(42);
    });

    it('should throw configured error', () => {
      const spy = createSpy().throws('Test error');

      expect(() => spy()).toThrow('Test error');
    });

    it('should use custom implementation', () => {
      const spy = createSpy().implements((x) => x * 2);

      expect(spy(5)).toBe(10);
    });
  });

  describe('createAsyncSpy', () => {
    it('should resolve with value', async () => {
      const spy = createAsyncSpy().resolves({ data: 'test' });

      const result = await spy();
      expect(result.data).toBe('test');
    });

    it('should reject with error', async () => {
      const spy = createAsyncSpy().rejects('Async error');

      await expect(spy()).rejects.toThrow('Async error');
    });
  });

  describe('spyOnClient', () => {
    it('should spy on all client methods', async () => {
      const client = createMockClient();
      const spies = spyOnClient(client);

      await client.putObject({ key: 'x', body: 'y' });

      expect(spies.putObject.wasCalled()).toBe(true);

      spies.restoreAll();
      client.destroy();
    });
  });

  describe('trackEvents', () => {
    it('should track emitted events', async () => {
      const client = createMockClient();
      const tracker = trackEvents(client, ['cl:response']);

      await client.putObject({ key: 'event-test', body: 'data' });

      expect(tracker.hasEvent('cl:response')).toBe(true);
      expect(tracker.getEvents('cl:response').length).toBeGreaterThan(0);

      client.destroy();
    });
  });
});

describe('Integration: Full CRUD with Mocks', () => {
  it('should perform complete CRUD operations', async () => {
    const { database, resource } = await createDatabaseWithResource(
      'crud-integration',
      schemas.userWithTimestamps
    );

    // Create
    const created = await resource.insert({
      name: 'Integration User',
      email: 'integration@test.com',
      age: 30
    });
    expect(created.id).toBeDefined();
    expect(created.createdAt).toBeDefined();

    // Read
    const fetched = await resource.get(created.id);
    expect(fetched.name).toBe('Integration User');

    // Update
    await resource.update(created.id, { age: 31 });
    const updated = await resource.get(created.id);
    expect(updated.age).toBe(31);

    // List
    const list = await resource.list();
    expect(list.length).toBeGreaterThan(0);

    // Delete
    await resource.delete(created.id);
    await expect(resource.get(created.id)).rejects.toThrow();

    await database.disconnect();
  });

  it('should handle batch operations', async () => {
    const { database, resource } = await createDatabaseWithResource(
      'batch-integration',
      { ...schemas.user, paranoid: false }  // Allow deleteAll
    );

    // Batch insert
    const users = generateMany(dataGenerators.user, 5);
    const inserted = await resource.insertMany(users);

    expect(inserted).toHaveLength(5);

    // Query
    const count = await resource.count();
    expect(count).toBe(5);

    // Delete all (allowed because paranoid: false in resource config)
    await resource.deleteAll();
    expect(await resource.count()).toBe(0);

    await database.disconnect();
  });
});
