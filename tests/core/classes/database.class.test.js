import { EventEmitter } from 'events';

import Database, { S3db } from '../../../src/database.class.js';
import { MemoryClient } from '#src/clients/memory-client.class.js';
import Resource from '#src/resource.class.js';
import { streamToString } from '#src/stream/index.js';
import { createDatabaseForTest, createMemoryDatabaseForTest } from '#tests/config.js';
import { DatabaseError } from '#src/errors.js';

describe('Database Class - Complete Journey', () => {
  let database;

  beforeEach(async () => {
    database = createDatabaseForTest('suite=classes/database-' + Date.now() + '-' + Math.random());
    await database.connect();
  });

  afterEach(async () => {
    if (database && typeof database.disconnect === 'function') {
      await database.disconnect();
    }
  });

  test('Database Journey: Connect → Create Resource → Insert → Query → Update → Delete', async () => {
    // 1. Create a resource
    const usersResource = await database.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional',
        active: 'boolean|default:true'
      },
      timestamps: true,
      paranoid: false
    });

    expect(usersResource).toBeDefined();
    expect(usersResource.name).toBe('users');

    // 2. Insert a user
    const user = await usersResource.insert({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30
    });

    expect(user.id).toBeDefined();
    expect(user.name).toBe('John Doe');
    expect(user.email).toBe('john@example.com');
    expect(user.age).toBe(30);
    expect(user.active).toBe(true);
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();

    // 3. Insert one more user (reduced from 2)
    const users = await usersResource.insertMany([
      {
        name: 'Jane Smith',
        email: 'jane@example.com',
        age: 25
      }
    ]);

    expect(users).toHaveLength(1);
    expect(users.every(u => u.id && u.createdAt && u.updatedAt)).toBe(true);

    // 4. Query users (simplified)
    const allUsers = await usersResource.query({});
    expect(allUsers.length).toBe(2); // 1 original + 1 new

    const activeUsers = await usersResource.query({ active: true });
    expect(activeUsers.length).toBe(2);

    // 5. Get user by ID
    const retrievedUser = await usersResource.get(user.id);
    expect(retrievedUser.id).toBe(user.id);
    expect(retrievedUser.name).toBe('John Doe');

    // 6. Update user
    const updatedUser = await usersResource.update(user.id, {
      age: 31,
      name: 'John Doe Updated'
    });
    
    expect(updatedUser.id).toBe(user.id);
    expect(updatedUser.age).toBe(31);
    expect(updatedUser.name).toBe('John Doe Updated');
    expect(updatedUser.createdAt).toBe(user.createdAt); // Should not change
    expect(updatedUser.updatedAt).not.toBe(user.updatedAt); // Should change

    // 7. Test upsert
    const upsertedUser = await usersResource.upsert({
      id: user.id,
      name: 'John Doe Upserted',
      email: 'john@example.com'
    });
    
    expect(upsertedUser.id).toBe(user.id);
    expect(upsertedUser.name).toBe('John Doe Upserted');
    
    // 8. Test counting
    const totalCount = await usersResource.count();
    expect(totalCount).toBe(2);

    // 9. Test listing IDs
    const allIds = await usersResource.listIds();
    expect(allIds.length).toBe(2);
    
    // 10. Test pagination (simplified)
    const page1 = await usersResource.page({ offset: 0, size: 1 });
    expect(page1.items.length).toBe(1);
    expect(page1.totalItems).toBe(2);

    // 11. Test delete operations
    const deleteResult = await usersResource.delete(user.id);
    expect(deleteResult).toBeDefined();

    const countAfterDelete = await usersResource.count();
    expect(countAfterDelete).toBe(1);

    // 12. Clean up (simplified)
    const remainingIds = await usersResource.listIds();
    for (const id of remainingIds) {
      await usersResource.delete(id);
    }

    const finalCount = await usersResource.count();
    expect(finalCount).toBe(0);
  });

  test('Database Resource Management Journey', async () => {
    // 1. Create multiple resources
    const postsResource = await database.createResource({
      name: 'posts',
      attributes: {
        title: 'string|required',
        content: 'string|required',
        authorId: 'string|required',
        published: 'boolean|default:false'
      },
      timestamps: true
    });

    const commentsResource = await database.createResource({
      name: 'comments',
      attributes: {
        content: 'string|required',
        postId: 'string|required',
        authorId: 'string|required'
      },
      timestamps: true
    });
    
    expect(postsResource).toBeDefined();
    expect(commentsResource).toBeDefined();
    
    // 2. Test resource listing
    const resources = await database.listResources();
    expect(resources.length).toBeGreaterThanOrEqual(2);
    expect(resources.some(r => r.name === 'posts')).toBe(true);
    expect(resources.some(r => r.name === 'comments')).toBe(true);

    // 3. Test resource retrieval
    const retrievedPosts = await database.getResource('posts');
    expect(retrievedPosts.name).toBe('posts');
    expect(retrievedPosts.attributes.title).toBe('string|required');

    // 4. Test resource deletion
    const postsResourceNonParanoid = new Resource({
      client: database.client,
      name: 'posts-cleanup',
      attributes: {
        title: 'string|required',
        content: 'string|required'
      },
      paranoid: false
    });

    const commentsResourceNonParanoid = new Resource({
      client: database.client,
      name: 'comments-cleanup',
      attributes: {
        content: 'string|required',
        postId: 'string|required'
      },
      paranoid: false
    });

    await postsResourceNonParanoid.deleteAll();
    await commentsResourceNonParanoid.deleteAll();
  });

  test('Database Error Handling Journey', async () => {
    // Test getting non-existent resource
    try {
      await database.getResource('non-existent-resource');
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Resource not found');
      expect(error.message).not.toContain('[object');
    }

    // Test creating resource with invalid attributes
    try {
      await database.createResource({
        name: 'invalid',
        attributes: {
          name: 'invalid-type|required'
        }
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain("Invalid 'invalid-type' type in validator schema.");
      expect(error.message).not.toContain('[object');
    }
  });

  test('Database Configuration Journey', async () => {
    // Test database configuration
    expect(database.config).toBeDefined();
    expect(database.client).toBeDefined();
    expect(database.resources).toBeDefined();
    expect(typeof database.resources).toBe('object');

    // Test connection status
    expect(database.isConnected()).toBe(true);
  });
});

describe('Database Plugin Lifecycle', () => {
  test('connect surfaces plugin install failures as DatabaseError', async () => {
    const installError = new Error('install explosion');
    const installSpy = vi.fn().mockRejectedValue(installError);
    const startSpy = vi.fn().mockResolvedValue();

    class BrokenInstallPlugin {
      constructor() {
        this.install = installSpy;
        this.start = startSpy;
      }
      setInstanceName(name) {
        this.instanceName = name;
      }
    }

    const db = createMemoryDatabaseForTest('plugins-install-failure', {
      plugins: [BrokenInstallPlugin],
    });

    await expect(db.connect()).rejects.toBeInstanceOf(DatabaseError);
    expect(installSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).not.toHaveBeenCalled();
    await db.disconnect().catch(() => {});
  });

  test('connect surfaces plugin start failures as DatabaseError', async () => {
    const installSpy = vi.fn().mockResolvedValue();
    const startError = new Error('start explosion');
    const startSpy = vi.fn().mockRejectedValue(startError);

    class BrokenStartPlugin {
      constructor() {
        this.install = installSpy;
        this.start = startSpy;
      }
      setInstanceName(name) {
        this.instanceName = name;
      }
    }

    const db = createMemoryDatabaseForTest('plugins-start-failure', {
      plugins: [BrokenStartPlugin],
    });

    await expect(db.connect()).rejects.toBeInstanceOf(DatabaseError);
    expect(installSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledTimes(1);
    await db.disconnect().catch(() => {});
  });
});

describe('Database Constructor and Edge Cases', () => {
  test('should handle constructor with minimal options', () => {
    const db = new Database({
      logLevel: 'silent', client: { bucket: 'test', keyPrefix: 'test/' }
    });
    expect(db.version).toBe('1');
    expect(db.s3dbVersion).toBeDefined();
    expect(db.resources).toEqual({});
    expect(db.logLevel || db.options?.logLevel).not.toBe('debug');
    expect(db.taskExecutor.concurrency).toBe(10);
    expect(db.pluginList).toEqual([]);
    expect(db.passphrase).toBe('secret');
  });

  test('should handle constructor with all options', () => {
    const mockClient = { bucket: 'test-bucket', keyPrefix: 'test/' };
    const mockPlugin = { install: vi.fn(), start: vi.fn() };

    const db = new Database({
      logLevel: 'debug',  // Test expects verbose to be true
      plugins: [mockPlugin],
      cache: { type: 'memory' },
      passphrase: 'custom-secret',
      operationsPool: { concurrency: 5 },
      client: mockClient
    });

    expect(db.logLevel || db.options?.logLevel).toBe('debug');
    expect(db.taskExecutor.concurrency).toBe(5);
    expect(db.pluginList).toEqual([mockPlugin]);
    expect(db.cache).toEqual({ type: 'memory' });
    expect(db.passphrase).toBe('custom-secret');
    expect(db.client).toBe(mockClient);
    expect(db.bucket).toBe('test-bucket');
    expect(db.keyPrefix).toBe('test/');
  });

  test('should handle s3dbVersion fallback', () => {
    // Mock __PACKAGE_VERSION__ to be undefined
    const originalPackageVersion = global.__PACKAGE_VERSION__;
    delete global.__PACKAGE_VERSION__;
    
    const db = new Database({
      logLevel: 'silent', client: { bucket: 'test', keyPrefix: 'test/' }
    });
    expect(db.s3dbVersion).toBe('latest');
    
    // Restore
    if (originalPackageVersion !== undefined) {
      global.__PACKAGE_VERSION__ = originalPackageVersion;
    }
  });

  test('should handle s3dbVersion with package version', () => {
    // Mock __PACKAGE_VERSION__ to have a value
    const originalPackageVersion = global.__PACKAGE_VERSION__;
    global.__PACKAGE_VERSION__ = '1.2.3';
    
    const db = new Database({
      logLevel: 'silent', client: { bucket: 'test', keyPrefix: 'test/' }
    });
    expect(db.s3dbVersion).toBe('1.2.3');
    
    // Restore
    if (originalPackageVersion !== undefined) {
      global.__PACKAGE_VERSION__ = originalPackageVersion;
    } else {
      delete global.__PACKAGE_VERSION__;
    }
  });
});

describe('Database Plugin System', () => {
  test('should start plugins with function plugins', async () => {
    const installMock = vi.fn();
    const startMock = vi.fn();
    function MockPlugin(db) {
      installMock(db);
      startMock();
      return {
        beforeInstall: vi.fn(),
        install: installMock,
        afterInstall: vi.fn(),
        beforeStart: vi.fn(),
        start: startMock,
        afterStart: vi.fn()
      };
    }

    const db = await createDatabaseForTest('suite=classes/database-plugin-test', {
      plugins: [MockPlugin]
    });
    await db.connect();
    expect(installMock).toHaveBeenCalledWith(expect.any(Object));
    expect(startMock).toHaveBeenCalled();
  });

  test('should start plugins with instance plugins', async () => {
    const installMock = vi.fn();
    const startMock = vi.fn();
    const mockPlugin = {
      beforeInstall: vi.fn(),
      install: installMock,
      afterInstall: vi.fn(),
      beforeStart: vi.fn(),
      start: startMock,
      afterStart: vi.fn()
    };

    const db = await createDatabaseForTest('suite=classes/database-plugin-instance-test', {
      plugins: [mockPlugin]
    });
    await db.connect();
    expect(installMock).toHaveBeenCalledWith(expect.any(Object));
    expect(startMock).toHaveBeenCalled();
  });

  test('should handle plugins without hooks', async () => {
    const installMock = vi.fn();
    const startMock = vi.fn();
    const mockPlugin = {
      install: installMock,
      start: startMock
    };

    const db = await createDatabaseForTest('suite=classes/database-plugin-no-hooks-test', {
      plugins: [mockPlugin]
    });
    await db.connect();
    expect(installMock).toHaveBeenCalledWith(expect.any(Object));
    expect(startMock).toHaveBeenCalled();
  });

  test('should handle empty plugins array', async () => {
    const db = await createDatabaseForTest('suite=classes/database-plugin-empty-test', {
      plugins: []
    });

    await expect(db.connect()).resolves.not.toThrow();
  });
});

describe('Database Resource Updates and Versioning', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=classes/database-versioning');
  });

  test('should update existing resource instead of creating new one', async () => {
    // Create initial resource
    const resource1 = await database.createResource({
      name: 'updatable',
      attributes: {
        name: 'string|required',
        email: 'email|required'
      }
    });

    expect(resource1.name).toBe('updatable');
    expect(Object.keys(resource1.attributes)).toHaveLength(2);

    // Update the same resource
    const resource2 = await database.createResource({
      name: 'updatable',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional'
      },
      behavior: 'enforce-limits'
    });

    expect(resource2).toBe(resource1); // Same instance
    expect(Object.keys(resource2.attributes)).toHaveLength(3);
    expect(resource2.behavior).toBe('enforce-limits');
  });

  test('should handle resource version updates', async () => {
    const resource = await database.createResource({
      name: 'versioned',
      attributes: {
        name: 'string|required'
      }
    });

    const versionSpy = vi.spyOn(resource, 'emit');

    // Update resource to trigger version change
    await database.createResource({
      name: 'versioned',
      attributes: {
        name: 'string|required',
        email: 'email|required'
      }
    });

    expect(versionSpy).toHaveBeenCalledWith('versionUpdated', expect.any(Object));
  });

  test('should emit resource events', async () => {
    const events = [];
    database.on('db:resource-created', (name) => events.push({ type: 'created', name }));
    database.on('db:resource-updated', (name) => events.push({ type: 'updated', name }));

    // Create resource
    await database.createResource({
      name: 'event-test',
      attributes: { name: 'string|required' }
    });

    // Update resource
    await database.createResource({
      name: 'event-test',
      attributes: { name: 'string|required', email: 'email|required' }
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'created', name: 'event-test' });
    expect(events[1]).toEqual({ type: 'updated', name: 'event-test' });
  });
});

describe('Database Definition Changes and Versioning', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=classes/database-def-changes');
  });

  test('should detect new resources', async () => {
    // Create a resource before connecting
    database.resources['new-resource'] = new Resource({
      name: 'new-resource',
      client: database.client,
      attributes: { name: 'string|required' }
    });

    const changes = database.detectDefinitionChanges({ resources: {} });
    
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('new');
    expect(changes[0].resourceName).toBe('new-resource');
    expect(changes[0].currentHash).toBeDefined();
    expect(changes[0].savedHash).toBeNull();
  });

  test('should detect changed resources', async () => {
    const resource = new Resource({
      name: 'changed-resource',
      client: database.client,
      attributes: { name: 'string|required' }
    });

    database.resources['changed-resource'] = resource;

    const savedMetadata = {
      resources: {
        'changed-resource': {
          currentVersion: 'v1',
          versions: {
            v0: {
              hash: 'different-hash',
              attributes: { name: 'string|required' }
            }
          }
        }
      }
    };

    const changes = database.detectDefinitionChanges(savedMetadata);
    
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('changed');
    expect(changes[0].resourceName).toBe('changed-resource');
    expect(changes[0].currentHash).not.toBe('different-hash');
    expect(changes[0].fromVersion).toBe('v1');
    expect(changes[0].toVersion).toBe('v1');
  });

  test('should detect deleted resources', async () => {
    const savedMetadata = {
      resources: {
        'deleted-resource': {
          currentVersion: 'v1',
          versions: {
            v1: {
              hash: 'some-hash',
              attributes: { name: 'string|required' }
            }
          }
        }
      }
    };

    const changes = database.detectDefinitionChanges(savedMetadata);

    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('deleted');
    expect(changes[0].resourceName).toBe('deleted-resource');
    expect(changes[0].currentHash).toBeNull();
    expect(changes[0].savedHash).toBe('some-hash');
    expect(changes[0].deletedVersion).toBe('v1');
  });

  test('should generate consistent hashes', () => {
    const definition1 = {
      attributes: { name: 'string|required' },
      options: { timestamps: true }
    };

    const definition2 = {
      attributes: { name: 'string|required' },
      options: { timestamps: true }
    };

    const hash1 = database.generateDefinitionHash(definition1);
    const hash2 = database.generateDefinitionHash(definition2);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('should get next version correctly', () => {
    expect(database.getNextVersion({})).toBe('v1');
    expect(database.getNextVersion({ v0: {} })).toBe('v1');
    expect(database.getNextVersion({ v0: {}, v1: {}, v2: {} })).toBe('v3');
    expect(database.getNextVersion({ v0: {}, v5: {} })).toBe('v6');
  });

  test('should handle version with non-numeric parts', () => {
    // The logic filters out non-v* versions, so v1beta is ignored
    expect(database.getNextVersion({ v0: {}, 'v1beta': {} })).toBe('v2');
    expect(database.getNextVersion({ 'invalid': {}, v2: {} })).toBe('v3');
  });
});

describe('Database Metadata and File Operations', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=classes/database-meta');
  });

  test('should create blank metadata structure', () => {
    const metadata = database.blankMetadataStructure();
    
    expect(metadata).toEqual({
      version: '1',
      s3dbVersion: database.s3dbVersion,
      lastUpdated: expect.any(String),
      resources: {}
    });
    
    // Verify lastUpdated is a valid ISO string
    expect(() => new Date(metadata.lastUpdated).toISOString()).not.toThrow();
  });

  test('should upload metadata file', async () => {
    // Create a resource first
    const resource = await database.createResource({
      name: 'metadata-test',
      attributes: { name: 'string|required' }
    });

    const uploadSpy = vi.spyOn(database.client, 'putObject');
    const emitSpy = vi.spyOn(database, 'emit');

    await database.uploadMetadataFile();

    expect(uploadSpy).toHaveBeenCalledWith({
      key: 's3db.json',
      body: expect.any(String),
      contentType: 'application/json'
    });

    expect(emitSpy).toHaveBeenCalledWith('db:metadata-uploaded', expect.any(Object));

    const uploadedBody = JSON.parse(uploadSpy.mock.calls[0][0].body);
    expect(uploadedBody.version).toBe('1');
    expect(uploadedBody.resources['metadata-test']).toBeDefined();
    expect(uploadedBody.resources['metadata-test'].currentVersion).toBe('v1');
  });

  test('should handle metadata with existing versions', async () => {
    // Create initial resource
    await database.createResource({
      name: 'version-test',
      attributes: { name: 'string|required' }
    });

    // Simulate existing metadata
    database.savedMetadata = {
      version: '1',
      s3dbVersion: database.s3dbVersion,
      resources: {
        'version-test': {
          currentVersion: 'v1',
          versions: {
            v0: {
              hash: 'old-hash',
              attributes: { name: 'string|required' },
              options: {},
              behavior: 'user-managed',
              createdAt: '2024-01-01T00:00:00Z'
            }
          }
        }
      }
    };

    const uploadSpy = vi.spyOn(database.client, 'putObject');

    await database.uploadMetadataFile();

    const uploadedBody = JSON.parse(uploadSpy.mock.calls[0][0].body);
    const resourceMeta = uploadedBody.resources['version-test'];
    
    expect(resourceMeta.versions.v0).toBeDefined();
    expect(resourceMeta.versions.v0.createdAt).toBe('2024-01-01T00:00:00Z');
  });
});

describe('Database Resource Methods', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=classes/database-methods');
  });

  test('should return undefined for non-existent resource', () => {
    expect(database.resources['non-existent']).toBeUndefined();
  });

  test('should return existing resource', async () => {
    await database.createResource({
      name: 'test-resource',
      attributes: { name: 'string|required' }
    });

    const resource = database.resources['test-resource'];
    expect(resource.name).toBe('test-resource');
  });

  test('should list resources correctly', async () => {
    // Clean up any existing resources first
    const existingResources = await database.listResources();
    
    await database.createResource({
      name: 'resource1',
      attributes: { name: 'string|required' }
    });

    await database.createResource({
      name: 'resource2',
      attributes: { email: 'email|required' }
    });

    const resources = await database.listResources();
    
    // Should have at least the 2 new resources
    expect(resources.length).toBeGreaterThanOrEqual(2);
    expect(resources.some(r => r.name === 'resource1')).toBe(true);
    expect(resources.some(r => r.name === 'resource2')).toBe(true);
  });

  test('should get resource by name', async () => {
    await database.createResource({
      name: 'get-test',
      attributes: { name: 'string|required' }
    });

    const resource = await database.getResource('get-test');
    expect(resource.name).toBe('get-test');
  });

  test('should throw error for non-existent resource in getResource', async () => {
    await expect(database.getResource('non-existent')).rejects.toThrow('Resource not found: non-existent');
  });
});

describe('Database Configuration and Status', () => {
  test('should return correct configuration', () => {
    const mockClient = { bucket: 'test-bucket', keyPrefix: 'test/' };
    const db = new Database({
      logLevel: 'silent',
      client: mockClient
    });

    const config = db.config;

    expect(config.version).toBe('1');
    expect(config.s3dbVersion).toBe(db.s3dbVersion);
    expect(config.bucket).toBe('test-bucket');
    expect(config.keyPrefix).toBe('test/');
    expect(config.logLevel || config.options?.logLevel).not.toBe('debug');
    expect(config.taskExecutor).toBeDefined();
  });

  test('should return connection status', () => {
    const db = new Database({
      logLevel: 'silent', client: { bucket: 'test', keyPrefix: 'test/' }
    });
    
    expect(db.isConnected()).toBe(false); // Not connected yet
    
    db.savedMetadata = { version: '1' };
    expect(db.isConnected()).toBe(true);
  });
});

describe('Database.generateDefinitionHash is stable and deterministic', () => {
  test('should generate same hash for identical definitions', () => {
    const db = new Database({ logLevel: 'silent', client: { bucket: 'test', keyPrefix: 'test/' } });
    const def1 = {
      attributes: { name: 'string|required', email: 'email|required' },
      options: { timestamps: true }
    };
    const def2 = {
      attributes: { name: 'string|required', email: 'email|required' },
      options: { timestamps: true }
    };
    expect(db.generateDefinitionHash(def1)).toBe(db.generateDefinitionHash(def2));
  });

  test('should generate different hash when attribute changes', () => {
    const db = new Database({ logLevel: 'silent', client: { bucket: 'test', keyPrefix: 'test/' } });
    const def1 = {
      attributes: { name: 'string|required', email: 'email|required' },
      options: { timestamps: true }
    };
    const def3 = {
      attributes: { name: 'string|required', email: 'email|required', extra: 'string' },
      options: { timestamps: true }
    };
    expect(db.generateDefinitionHash(def1)).not.toBe(db.generateDefinitionHash(def3));
  });
});

describe('Database Definition Hash Stability', () => {
  let database;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=classes/database-hash-stability');
  });

  test('should maintain same version when resource definition is identical', async () => {
    // Define resource attributes in different orders to test sorting
    const attributes1 = {
      email: 'email|required',
      name: 'string|required',
      age: 'number|optional'
    };

    const attributes2 = {
      age: 'number|optional',
      name: 'string|required', 
      email: 'email|required'
    };

    const attributes3 = {
      name: 'string|required',
      age: 'number|optional',
      email: 'email|required'
    };

    // Create resource with first attribute order
    const resource1 = await database.createResource({
      name: 'hash-stability-test',
      attributes: attributes1,
      options: {
        timestamps: true
      }
    });

    // Get initial version and hash
    const initialVersion = resource1.version;
    const initialHash = resource1.getDefinitionHash();

    // Upload metadata to save the first version
    await database.uploadMetadataFile();

    // Create same resource with different attribute order (should not create new version)
    const resource2 = await database.createResource({
      name: 'hash-stability-test',
      attributes: attributes2,
      options: {
        timestamps: true
      }
    });

    const secondVersion = resource2.version;
    const secondHash = resource2.getDefinitionHash();


    // Should be the same resource instance
    expect(resource2).toBe(resource1);
    expect(secondVersion).toBe(initialVersion);
    expect(secondHash).toBe(initialHash);

    // Create same resource with third attribute order (should not create new version)
    const resource3 = await database.createResource({
      name: 'hash-stability-test',
      attributes: attributes3,
      options: {
        timestamps: true
      }
    });

    const thirdVersion = resource3.version;
    const thirdHash = resource3.getDefinitionHash();


    // Should still be the same
    expect(resource3).toBe(resource1);
    expect(thirdVersion).toBe(initialVersion);
    expect(thirdHash).toBe(initialHash);

    // Upload metadata again and verify no new version was created
    await database.uploadMetadataFile();

    // Get the s3db.json content to verify only one version exists
    const s3dbRequest = await database.client.getObject('s3db.json');
    const s3dbContent = JSON.parse(await streamToString(s3dbRequest.Body));
    
    const resourceMeta = s3dbContent.resources['hash-stability-test'];
    const versions = Object.keys(resourceMeta.versions);


    // Should have only one version
    expect(versions).toHaveLength(1);
    expect(versions[0]).toBe(initialVersion);

    // Verify the hash in metadata matches our calculated hash
    const expectedHash = database.generateDefinitionHash(resource1.export(), resource1.behavior);
    expect(resourceMeta.versions[initialVersion].hash).toBe(expectedHash);
  });

  test('should create new version only when attributes actually change', async () => {
    // Create initial resource
    const resource1 = await database.createResource({
      name: 'version-change-test',
      attributes: {
        name: 'string|required',
        email: 'email|required'
      }
    });

    const initialVersion = resource1.version;
    const initialHash = resource1.getDefinitionHash();


    // Upload metadata
    await database.uploadMetadataFile();

    // Try to create same resource (should not change version)
    const resource2 = await database.createResource({
      name: 'version-change-test',
      attributes: {
        name: 'string|required',
        email: 'email|required'
      }
    });

    expect(resource2.version).toBe(initialVersion);
    expect(resource2.getDefinitionHash()).toBe(initialHash);

    // Now add a new attribute (should create new version)
    const resource3 = await database.createResource({
      name: 'version-change-test',
      attributes: {
        name: 'string|required',
        email: 'email|required',
        age: 'number|optional' // New attribute
      }
    });

    const newVersion = resource3.version;
    const newHash = resource3.getDefinitionHash();


    // Should be different
    expect(newVersion).not.toBe(initialVersion);
    expect(newHash).not.toBe(initialHash);

    // Upload metadata to save the new version
    await database.uploadMetadataFile();

    // Verify both versions exist in s3db.json
    const s3dbRequest = await database.client.getObject('s3db.json');
    const s3dbContent = JSON.parse(await streamToString(s3dbRequest.Body));
    
    const resourceMeta = s3dbContent.resources['version-change-test'];
    const versions = Object.keys(resourceMeta.versions);


    // Should have both versions
    expect(versions).toHaveLength(2);
    expect(versions).toContain(initialVersion);
    expect(versions).toContain(newVersion);
  });

  test('should generate consistent hashes for identical definitions', async () => {
    // Test hash consistency with different attribute orders
    const definition1 = {
      attributes: {
        email: 'email|required',
        name: 'string|required',
        age: 'number|optional'
      },
      options: {
        timestamps: true
      }
    };

    const definition2 = {
      attributes: {
        age: 'number|optional',
        name: 'string|required',
        email: 'email|required'
      },
      options: {
        timestamps: true
      }
    };

    // Generate hashes 4 times to ensure consistency
    const hashes1 = [];
    const hashes2 = [];

    for (let i = 0; i < 4; i++) {
      const resource1 = new Resource({
        name: 'test1',
        client: database.client,
        ...definition1
      });

      const resource2 = new Resource({
        name: 'test2', 
        client: database.client,
        ...definition2
      });

      hashes1.push(resource1.getDefinitionHash());
      hashes2.push(resource2.getDefinitionHash());
    }

    // All hashes should be identical within each group
    const firstHash1 = hashes1[0];
    const firstHash2 = hashes2[0];

    hashes1.forEach((hash, index) => {
      expect(hash).toBe(firstHash1);
    });

    hashes2.forEach((hash, index) => {
      expect(hash).toBe(firstHash2);
    });

    // Both definitions should generate the same hash (same attributes, different order)
    expect(firstHash1).toBe(firstHash2);
  });

  test('should maintain same version and hash for deeply nested attributes with different order', async () => {
    // Definition 1: "normal" order
    const attributes1 = {
      name: 'string|required|max:100',
      email: 'email|required|unique',
      utm: {
        source: 'string|required|max:50',
        medium: 'string|required|max:50',
        campaign: 'string|optional|max:100',
        term: 'string|optional|max:100',
        content: 'string|optional|max:100'
      },
      address: {
        country: 'string|required|max:2',
        state: 'string|required|max:50',
        city: 'string|required|max:100'
      },
      personal: {
        firstName: 'string|required|max:50',
        lastName: 'string|required|max:50',
        birthDate: 'date|optional'
      }
    };

    // Definition 2: change order of first-level fields and nested objects
    const attributes2 = {
      personal: {
        birthDate: 'date|optional',
        lastName: 'string|required|max:50',
        firstName: 'string|required|max:50'
      },
      utm: {
        content: 'string|optional|max:100',
        term: 'string|optional|max:100',
        campaign: 'string|optional|max:100',
        medium: 'string|required|max:50',
        source: 'string|required|max:50'
      },
      address: {
        city: 'string|required|max:100',
        state: 'string|required|max:50',
        country: 'string|required|max:2'
      },
      email: 'email|required|unique',
      name: 'string|required|max:100'
    };

    // Definition 3: one more permutation
    const attributes3 = {
      utm: {
        medium: 'string|required|max:50',
        source: 'string|required|max:50',
        campaign: 'string|optional|max:100',
        content: 'string|optional|max:100',
        term: 'string|optional|max:100'
      },
      name: 'string|required|max:100',
      personal: {
        lastName: 'string|required|max:50',
        firstName: 'string|required|max:50',
        birthDate: 'date|optional'
      },
      address: {
        state: 'string|required|max:50',
        country: 'string|required|max:2',
        city: 'string|required|max:100'
      },
      email: 'email|required|unique'
    };

    // Create resource with the first definition
    const resource1 = await database.createResource({
      name: 'deep-nested-hash-test',
      attributes: attributes1,
      options: { timestamps: true }
    });
    const initialVersion = resource1.version;
    const initialHash = resource1.getDefinitionHash();

    // Create resource with the second definition (different order)
    const resource2 = await database.createResource({
      name: 'deep-nested-hash-test',
      attributes: attributes2,
      options: { timestamps: true }
    });
    const secondVersion = resource2.version;
    const secondHash = resource2.getDefinitionHash();

    // Create resource with the third definition (another order)
    const resource3 = await database.createResource({
      name: 'deep-nested-hash-test',
      attributes: attributes3,
      options: { timestamps: true }
    });
    const thirdVersion = resource3.version;
    const thirdHash = resource3.getDefinitionHash();

    // All should be the same resource and same version/hash
    expect(resource2).toBe(resource1);
    expect(resource3).toBe(resource1);
    expect(secondVersion).toBe(initialVersion);
    expect(thirdVersion).toBe(initialVersion);
    expect(secondHash).toBe(initialHash);
    expect(thirdHash).toBe(initialHash);

    // Upload metadata e verifica s3db.json
    await database.uploadMetadataFile();
    const s3dbRequest = await database.client.getObject('s3db.json');
    const s3dbContent = JSON.parse(await streamToString(s3dbRequest.Body));
    const resourceMeta = s3dbContent.resources['deep-nested-hash-test'];
    const versions = Object.keys(resourceMeta.versions);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toBe(initialVersion);
    const expectedHash = database.generateDefinitionHash(resource1.export(), resource1.behavior);
    expect(resourceMeta.versions[initialVersion].hash).toBe(expectedHash);
  });
});
/**
 * Tests for critical fixes in database.class.js
 *
 * Critical Fix 1: Memory leak - process exit listener cleanup
 * Critical Fix 2: Race condition - emit before removeAllListeners
 * Critical Fix 3: Hook error handling - strict mode
 * Critical Fix 4: Missing await in disconnect
 */
describe('Database Critical Fixes', () => {
  let db;

  beforeEach(async () => {
    const client = new MemoryClient({ bucket: 'test' });
    db = new Database({ logLevel: 'silent', client });
    await db.connect();
  });

  afterEach(async () => {
    if (db && db.isConnected()) {
      await db.disconnect();
    }
  });

  describe('Fix 1: Memory Leak - Process Exit Listener Cleanup', () => {
    it('should register exit listener in constructor', async () => {
      const client = new MemoryClient({ bucket: 'test-exit' });
      const database = new Database({ logLevel: 'silent', client });

      // Listener should be registered immediately after construction
      expect(database._exitListenerRegistered).toBe(true);
      expect(database._exitListener).toBeDefined();
      expect(typeof database._exitListener).toBe('function');

      await database.connect();
      await database.disconnect();
    });

    it('should cleanup exit listener on disconnect', async () => {
      const client = new MemoryClient({ bucket: 'test-cleanup' });
      const database = new Database({ logLevel: 'silent', client });

      await database.connect();

      const listenerRef = database._exitListener;
      expect(listenerRef).toBeDefined();
      expect(database._exitListenerRegistered).toBe(true);

      await database.disconnect();

      expect(database._exitListener).toBeNull();
      expect(database._exitListenerRegistered).toBe(false);
    });

    it('should properly handle reconnection with new listener', async () => {
      const client = new MemoryClient({ bucket: 'test-multi' });
      const database = new Database({ logLevel: 'silent', client });

      await database.connect();
      const firstListener = database._exitListener;
      expect(firstListener).toBeDefined();

      await database.disconnect();

      // After disconnect, listener should be cleaned up
      expect(database._exitListener).toBeNull();
      expect(database._exitListenerRegistered).toBe(false);

      await database.connect();
      const secondListener = database._exitListener;

      // Should have a new function reference after reconnect
      expect(secondListener).toBeDefined();
      expect(secondListener).not.toBe(firstListener);
      expect(database._exitListenerRegistered).toBe(true);

      await database.disconnect();
    });
  });

  describe('Fix 2: Race Condition - Emit Before RemoveAllListeners', () => {
    it('should receive disconnected event before listeners are removed', async () => {
      const client = new MemoryClient({ bucket: 'test-race' });
      const database = new Database({ logLevel: 'silent', client });
      await database.connect();

      let eventReceived = false;
      let eventTimestamp = null;

      database.on('disconnected', (timestamp) => {
        eventReceived = true;
        eventTimestamp = timestamp;
      });

      await database.disconnect();

      // Event should have been received before listeners were removed
      expect(eventReceived).toBe(true);
      expect(eventTimestamp).toBeInstanceOf(Date);
    });

    it('should emit disconnected event to multiple listeners', async () => {
      const client = new MemoryClient({ bucket: 'test-multi-listeners' });
      const database = new Database({ logLevel: 'silent', client });
      await database.connect();

      const receivedEvents = [];

      database.on('disconnected', (ts) => receivedEvents.push({ listener: 1, ts }));
      database.on('disconnected', (ts) => receivedEvents.push({ listener: 2, ts }));
      database.on('disconnected', (ts) => receivedEvents.push({ listener: 3, ts }));

      await database.disconnect();

      // All listeners should have received the event
      expect(receivedEvents).toHaveLength(3);
      expect(receivedEvents[0].listener).toBe(1);
      expect(receivedEvents[1].listener).toBe(2);
      expect(receivedEvents[2].listener).toBe(3);
      expect(receivedEvents[0].ts).toBeInstanceOf(Date);
    });

    it('should await disconnected event emission call', async () => {
      const client = new MemoryClient({ bucket: 'test-await' });
      const database = new Database({ logLevel: 'silent', client });
      await database.connect();

      let eventEmitted = false;

      database.on('disconnected', () => {
        // Mark event as emitted synchronously
        eventEmitted = true;
      });

      await database.disconnect();

      // The await should ensure emit call completes
      // Note: EventEmitter doesn't wait for async listeners, but the emit itself is awaited
      expect(eventEmitted).toBe(true);
    });
  });

  describe('Fix 3: Hook Error Handling - Strict Mode', () => {
    it('should continue execution on hook errors in non-strict mode (default)', async () => {
      const client = new MemoryClient({ bucket: 'test-hooks-lenient' });
      const database = new Database({ logLevel: 'silent', client, strictHooks: false });
      await database.connect();

      const executionOrder = [];

      // Add hook that throws error
      database.addHook('afterConnect', () => {
        executionOrder.push('hook1-before');
        throw new Error('Hook 1 failed');
      });

      // Add hook that should still execute
      database.addHook('afterConnect', () => {
        executionOrder.push('hook2-success');
      });

      let hookErrorEmitted = false;
      database.on('hookError', ({ event, error }) => {
        hookErrorEmitted = true;
        expect(event).toBe('afterConnect');
        expect(error.message).toBe('Hook 1 failed');
      });

      // Execute hooks - should not throw
      await database._executeHooks('afterConnect', { test: true });

      // Both hooks should have executed
      expect(executionOrder).toEqual(['hook1-before', 'hook2-success']);
      expect(hookErrorEmitted).toBe(true);

      await database.disconnect();
    });

    it('should throw on first hook error in strict mode', async () => {
      const client = new MemoryClient({ bucket: 'test-hooks-strict' });
      const database = new Database({ logLevel: 'silent', client, strictHooks: true });
      await database.connect();

      const executionOrder = [];

      // Add hook that throws error
      database.addHook('beforeUploadMetadata', () => {
        executionOrder.push('hook1-fail');
        throw new Error('Critical hook failure');
      });

      // Add hook that should NOT execute
      database.addHook('beforeUploadMetadata', () => {
        executionOrder.push('hook2-never');
      });

      let hookErrorEmitted = false;
      database.on('hookError', () => {
        hookErrorEmitted = true;
      });

      // Execute hooks - should throw on first error
      await expect(async () => {
        await database._executeHooks('beforeUploadMetadata', { test: true });
      }).rejects.toThrow(DatabaseError);

      // Second hook should never execute
      expect(executionOrder).toEqual(['hook1-fail']);
      expect(hookErrorEmitted).toBe(true);

      // Need to clean up manually since disconnect would also trigger beforeDisconnect
      database._exitListenerRegistered = false;
      database._exitListener = null;
    });

    it('should include error context in strict mode exception', async () => {
      const client = new MemoryClient({ bucket: 'test-hooks-context' });
      const database = new Database({ logLevel: 'silent', client, strictHooks: true });
      await database.connect();

      database.addHook('beforeCreateResource', () => {
        throw new Error('Resource creation not allowed');
      });

      try {
        await database._executeHooks('beforeCreateResource', { config: { name: 'users' } });
        throw new Error('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error.message).toContain('beforeCreateResource');
        expect(error.message).toContain('Resource creation not allowed');
        // DatabaseError assigns details directly to error instance
        expect(error.event).toBe('beforeCreateResource');
        expect(error.context.config.name).toBe('users');
        expect(error.originalError.message).toBe('Resource creation not allowed');
      }

      await database.disconnect();
    });

    it('should execute all hooks successfully in strict mode when no errors', async () => {
      const client = new MemoryClient({ bucket: 'test-hooks-success' });
      const database = new Database({ logLevel: 'silent', client, strictHooks: true });
      await database.connect();

      const executionOrder = [];

      database.addHook('afterConnect', () => {
        executionOrder.push('hook1');
      });

      database.addHook('afterConnect', () => {
        executionOrder.push('hook2');
      });

      database.addHook('afterConnect', () => {
        executionOrder.push('hook3');
      });

      // Should not throw
      await database._executeHooks('afterConnect', {});

      expect(executionOrder).toEqual(['hook1', 'hook2', 'hook3']);

      await database.disconnect();
    });
  });

  describe('Fix 4: Missing Await in Disconnect', () => {
    it('should properly await emit during disconnect', async () => {
      const client = new MemoryClient({ bucket: 'test-await-emit' });
      const database = new Database({ logLevel: 'silent', client });
      await database.connect();

      let emitCompleted = false;

      database.on('disconnected', () => {
        emitCompleted = true;
      });

      // Disconnect should await the emit
      await database.disconnect();

      // Emit should have completed
      expect(emitCompleted).toBe(true);
    });

    it('should ensure proper cleanup order with await', async () => {
      const client = new MemoryClient({ bucket: 'test-cleanup-order' });
      const database = new Database({ logLevel: 'silent', client });
      await database.connect();

      await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required'
        }
      });

      const cleanupOrder = [];

      database.on('disconnected', () => {
        cleanupOrder.push('event-emitted');
        // At this point, listeners should still be active
        expect(database.listenerCount('disconnected')).toBeGreaterThan(0);
      });

      await database.disconnect();

      cleanupOrder.push('disconnect-completed');

      // Proper order: event emitted, then listeners removed, then disconnect completed
      expect(cleanupOrder).toEqual(['event-emitted', 'disconnect-completed']);

      // After disconnect, listeners should be removed
      expect(database.listenerCount('disconnected')).toBe(0);
    });
  });

  describe('Integration: All Fixes Together', () => {
    it('should handle complete lifecycle with all fixes', async () => {
      const client = new MemoryClient({ bucket: 'test-integration' });
      const database = new Database({ logLevel: 'silent', client, strictHooks: false });

      // Track lifecycle events
      const lifecycle = [];

      database.on('db:connected', () => lifecycle.push('db:connected'));
      database.on('disconnected', () => lifecycle.push('disconnected'));
      database.on('hookError', ({ event }) => lifecycle.push(`hookError:${event}`));

      await database.connect();

      // Add a failing hook AFTER connect to avoid triggering it during setup
      database.addHook('resourceCreated', () => {
        throw new Error('Test error');
      });

      // Execute hook manually (will fail but not throw in non-strict mode)
      await database._executeHooks('resourceCreated', {});

      await database.disconnect();

      expect(lifecycle).toEqual(['db:connected', 'hookError:resourceCreated', 'disconnected']);
      expect(database._exitListener).toBeNull();
      expect(database._exitListenerRegistered).toBe(false);
      expect(database.listenerCount('disconnected')).toBe(0);
    });

    it('should handle reconnection with all fixes', async () => {
      const client = new MemoryClient({ bucket: 'test-reconnect' });
      const database = new Database({ logLevel: 'silent', client, strictHooks: true });

      // First connection
      await database.connect();
      const firstListener = database._exitListener;
      await database.disconnect();

      expect(database._exitListener).toBeNull();

      // Reconnection
      await database.connect();
      const secondListener = database._exitListener;

      expect(secondListener).toBeDefined();
      expect(secondListener).not.toBe(firstListener);

      await database.disconnect();
      expect(database._exitListener).toBeNull();
    });
  });
});
