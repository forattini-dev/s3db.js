import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import S3DB from '../src/index.js';

describe('Configuration Migration Tests', () => {
  let db;
  let users;
  const testPrefix = `test-${Date.now()}`;

  beforeEach(async () => {
    db = new S3DB({
      verbose: false,
      connectionString: process.env.BUCKET_CONNECTION_STRING
        .replace('USER', process.env.MINIO_USER)
        .replace('PASSWORD', process.env.MINIO_PASSWORD)
        + `/${testPrefix}`,
      passphrase: 'test-secret-passphrase-123'
    });

    await db.connect();

    users = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        age: 'number|optional',
        password: 'secret|required',
        region: 'string|optional'
      },
      behavior: 'user-management',
      timestamps: true,
      partitions: {
        byRegion: {
          fields: { region: 'string' }
        }
      },
      paranoid: true,
      allNestedObjectsOptional: false,
      autoDecrypt: true,
      cache: false,
      hooks: {
        preInsert: [
          async (data) => {
            data.hookExecuted = true;
            return data;
          }
        ]
      }
    });
  });

  afterEach(async () => {
    if (users) {
      try {
        await users.deleteAllData();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  test('should create resource with new configuration structure', () => {
    expect(users).toBeDefined();
    expect(users.name).toBe('users');
    expect(users.config).toBeDefined();
    expect(users.config.timestamps).toBe(true);
    expect(users.config.paranoid).toBe(true);
    expect(users.config.autoDecrypt).toBe(true);
    expect(users.config.cache).toBe(false);
    expect(users.config.partitions).toBeDefined();
    expect(users.config.partitions.byRegion).toBeDefined();
  });

  test('should auto-generate passwords for secret fields', async () => {
    const user = await users.insert({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      region: 'us-east-1'
      // password not provided, should be auto-generated
    });

    expect(user.id).toBeDefined();
    expect(user.name).toBe('John Doe');
    expect(user.email).toBe('john@example.com');
    expect(user.password).toBeDefined();
    expect(user.password.length).toBe(12); // nanoid default length
    expect(user.hookExecuted).toBe(true); // Hook should be executed
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
  });

  test('should preserve custom passwords when provided', async () => {
    const customPassword = 'my-custom-password-123';
    const user = await users.insert({
      name: 'Jane Smith',
      email: 'jane@example.com',
      password: customPassword,
      region: 'us-west-1'
    });

    expect(user.password).toBe(customPassword);
  });

  test('should export resource with new structure', () => {
    const exported = users.export();
    
    expect(exported.name).toBe('users');
    expect(exported.behavior).toBe('user-management');
    expect(exported.timestamps).toBe(true);
    expect(exported.partitions).toBeDefined();
    expect(exported.paranoid).toBe(true);
    expect(exported.autoDecrypt).toBe(true);
    expect(exported.cache).toBe(false);
    expect(exported.hooks).toBeDefined();
    expect(exported.attributes).toBeDefined();
  });

  test('should update resource configuration', async () => {
    const updatedUsers = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        age: 'number|optional',
        password: 'secret|required',
        region: 'string|optional',
        department: 'string|optional' // New field
      },
      behavior: 'user-management',
      timestamps: true,
      partitions: {
        byRegion: {
          fields: { region: 'string' }
        },
        byDepartment: {
          fields: { department: 'string' }
        }
      },
      paranoid: false, // Changed
      cache: true, // Changed
      hooks: {
        preInsert: [
          async (data) => {
            data.updatedHookExecuted = true;
            return data;
          }
        ]
      }
    });

    expect(updatedUsers.config.paranoid).toBe(false);
    expect(updatedUsers.config.cache).toBe(true);
    expect(updatedUsers.config.partitions.byDepartment).toBeDefined();

    // Test with new field
    const user = await updatedUsers.insert({
      name: 'Bob Wilson',
      email: 'bob@example.com',
      region: 'us-central-1',
      department: 'Engineering'
    });

    expect(user.department).toBe('Engineering');
    expect(user.updatedHookExecuted).toBe(true);
  });

  test('should handle partition operations correctly', async () => {
    // Insert users in different regions
    await users.insert({
      name: 'User 1',
      email: 'user1@example.com',
      region: 'us-east-1'
    });

    await users.insert({
      name: 'User 2',
      email: 'user2@example.com',
      region: 'us-west-1'
    });

    await users.insert({
      name: 'User 3',
      email: 'user3@example.com',
      region: 'us-east-1'
    });

    // Test partition listing
    const eastUsers = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'us-east-1' }
    });

    const westUsers = await users.list({
      partition: 'byRegion',
      partitionValues: { region: 'us-west-1' }
    });

    expect(eastUsers.length).toBe(2);
    expect(westUsers.length).toBe(1);
  });

  test('should validate partitions against attributes', () => {
    expect(() => {
      db.createResource({
        name: 'invalid-users',
        attributes: {
          name: 'string|required',
          email: 'string|required'
        },
        partitions: {
          byInvalidField: {
            fields: { nonExistentField: 'string' }
          }
        }
      });
    }).toThrow();
  });

  test('should handle dangerous operations with paranoid mode', async () => {
    // Should fail with paranoid mode enabled
    await expect(users.deleteAll()).rejects.toThrow('paranoid: false');

    // Should succeed with paranoid mode disabled
    const nonParanoidUsers = await db.createResource({
      name: 'non-paranoid-users',
      attributes: {
        name: 'string|required',
        email: 'string|required'
      },
      paranoid: false
    });

    await expect(nonParanoidUsers.deleteAll()).resolves.toBeDefined();
  });
}); 