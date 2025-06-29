import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import S3DB from '../src/index.js';

describe('Configuration Validation Tests', () => {
  let db;
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
  });

  test('should accept valid configuration', async () => {
    const users = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        password: 'secret|required'
      },
      behavior: 'user-management',
      timestamps: true,
      partitions: {
        byRegion: {
          fields: { region: 'string' }
        }
      },
      paranoid: true,
      hooks: {
        preInsert: [
          async (data) => {
            data.hookExecuted = true;
            return data;
          }
        ]
      }
    });

    expect(users).toBeDefined();
    expect(users.name).toBe('users');
    expect(users.config.timestamps).toBe(true);
    expect(users.config.paranoid).toBe(true);
  });

  test('should reject missing name', async () => {
    await expect(db.createResource({
      attributes: { name: 'string' }
    })).rejects.toThrow("Resource 'name' is required");
  });

  test('should reject missing attributes', async () => {
    await expect(db.createResource({
      name: 'users'
    })).rejects.toThrow("Resource 'attributes' are required");
  });

  test('should reject empty name', async () => {
    await expect(db.createResource({
      name: '',
      attributes: { name: 'string' }
    })).rejects.toThrow("Resource 'name' cannot be empty");
  });

  test('should reject empty attributes', async () => {
    await expect(db.createResource({
      name: 'users',
      attributes: {}
    })).rejects.toThrow("Resource 'attributes' cannot be empty");
  });

  test('should reject invalid name type', async () => {
    await expect(db.createResource({
      name: 123,
      attributes: { name: 'string' }
    })).rejects.toThrow("Resource 'name' must be a string");
  });

  test('should reject invalid attributes type', async () => {
    await expect(db.createResource({
      name: 'users',
      attributes: 'not-an-object'
    })).rejects.toThrow("Resource 'attributes' must be an object");
  });

  test('should reject invalid boolean fields', async () => {
    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      timestamps: 'not-a-boolean'
    })).rejects.toThrow("Resource 'timestamps' must be a boolean");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      paranoid: 'not-a-boolean'
    })).rejects.toThrow("Resource 'paranoid' must be a boolean");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      cache: 'not-a-boolean'
    })).rejects.toThrow("Resource 'cache' must be a boolean");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      autoDecrypt: 'not-a-boolean'
    })).rejects.toThrow("Resource 'autoDecrypt' must be a boolean");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      allNestedObjectsOptional: 'not-a-boolean'
    })).rejects.toThrow("Resource 'allNestedObjectsOptional' must be a boolean");
  });

  test('should reject invalid parallelism', async () => {
    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      parallelism: 'not-a-number'
    })).rejects.toThrow("Resource 'parallelism' must be an integer");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      parallelism: 0
    })).rejects.toThrow("Resource 'parallelism' must be greater than 0");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      parallelism: -1
    })).rejects.toThrow("Resource 'parallelism' must be greater than 0");
  });

  test('should reject invalid string fields', async () => {
    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      version: 123
    })).rejects.toThrow("Resource 'version' must be a string");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      behavior: 123
    })).rejects.toThrow("Resource 'behavior' must be a string");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      passphrase: 123
    })).rejects.toThrow("Resource 'passphrase' must be a string");
  });

  test('should reject invalid observers', async () => {
    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      observers: 'not-an-array'
    })).rejects.toThrow("Resource 'observers' must be an array");
  });

  test('should reject invalid partitions', async () => {
    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      partitions: 'not-an-object'
    })).rejects.toThrow("Resource 'partitions' must be an object");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      partitions: {
        byRegion: 'not-an-object'
      }
    })).rejects.toThrow("Partition 'byRegion' must be an object");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      partitions: {
        byRegion: {
          // Missing fields property
        }
      }
    })).rejects.toThrow("Partition 'byRegion' must have a 'fields' property");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      partitions: {
        byRegion: {
          fields: 'not-an-object'
        }
      }
    })).rejects.toThrow("Partition 'byRegion.fields' must be an object");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      partitions: {
        byRegion: {
          fields: {
            region: 123 // Should be string
          }
        }
      }
    })).rejects.toThrow("Partition 'byRegion.fields.region' must be a string");
  });

  test('should reject invalid hooks', async () => {
    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      hooks: 'not-an-object'
    })).rejects.toThrow("Resource 'hooks' must be an object");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      hooks: {
        invalidEvent: []
      }
    })).rejects.toThrow("Invalid hook event 'invalidEvent'");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      hooks: {
        preInsert: 'not-an-array'
      }
    })).rejects.toThrow("Resource 'hooks.preInsert' must be an array");

    await expect(db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      hooks: {
        preInsert: [
          'not-a-function'
        ]
      }
    })).rejects.toThrow("Resource 'hooks.preInsert[0]' must be a function");
  });

  test('should accept valid hooks', async () => {
    const users = await db.createResource({
      name: 'users',
      attributes: { name: 'string' },
      hooks: {
        preInsert: [
          async (data) => {
            data.hook1 = true;
            return data;
          },
          async (data) => {
            data.hook2 = true;
            return data;
          }
        ],
        afterInsert: [
          async (data) => {
            data.hook3 = true;
            return data;
          }
        ],
        preUpdate: [
          async (data) => {
            data.hook4 = true;
            return data;
          }
        ],
        afterUpdate: [
          async (data) => {
            data.hook5 = true;
            return data;
          }
        ],
        preDelete: [
          async (data) => {
            data.hook6 = true;
            return data;
          }
        ],
        afterDelete: [
          async (data) => {
            data.hook7 = true;
            return data;
          }
        ]
      }
    });

    expect(users).toBeDefined();
    expect(users.hooks.preInsert).toHaveLength(2);
    expect(users.hooks.afterInsert).toHaveLength(1);
    expect(users.hooks.preUpdate).toHaveLength(1);
    expect(users.hooks.afterUpdate).toHaveLength(1);
    expect(users.hooks.preDelete).toHaveLength(1);
    expect(users.hooks.afterDelete).toHaveLength(1);
  });

  test('should accept complex valid configuration', async () => {
    const users = await db.createResource({
      name: 'complex-users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        password: 'secret|required',
        age: 'number|optional',
        profile: {
          bio: 'string|optional',
          avatar: 'url|optional'
        },
        tags: 'array|items:string',
        metadata: 'object|optional'
      },
      behavior: 'body-overflow',
      timestamps: true,
      partitions: {
        byRegion: {
          fields: { region: 'string' }
        },
        byDepartment: {
          fields: { department: 'string' }
        },
        byAge: {
          fields: { age: 'number' }
        }
      },
      paranoid: false,
      allNestedObjectsOptional: true,
      autoDecrypt: true,
      cache: true,
      parallelism: 25,
      hooks: {
        preInsert: [
          async (data) => {
            data.complexHook = true;
            return data;
          }
        ]
      }
    });

    expect(users).toBeDefined();
    expect(users.name).toBe('complex-users');
    expect(users.behavior).toBe('body-overflow');
    expect(users.config.timestamps).toBe(true);
    expect(users.config.paranoid).toBe(false);
    expect(users.config.cache).toBe(true);
    expect(users.config.allNestedObjectsOptional).toBe(true);
    expect(users.config.autoDecrypt).toBe(true);
    expect(users.parallelism).toBe(25);
    expect(Object.keys(users.config.partitions)).toHaveLength(3);
    expect(users.hooks.preInsert).toHaveLength(1);
  });

  test('should provide detailed error messages for multiple issues', async () => {
    try {
      await db.createResource({
        name: 123, // Invalid type
        attributes: {}, // Empty
        timestamps: 'not-boolean', // Invalid type
        parallelism: 'not-number' // Invalid type
      });
      fail('Should have thrown an error');
    } catch (error) {
      const message = error.message;
      expect(message).toContain("Resource 'name' must be a string");
      expect(message).toContain("Resource 'attributes' cannot be empty");
      expect(message).toContain("Resource 'timestamps' must be a boolean");
      expect(message).toContain("Resource 'parallelism' must be an integer");
    }
  });
}); 