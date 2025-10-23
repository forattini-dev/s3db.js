import { describe, test, expect, afterEach } from '@jest/globals';
import MongoDBReplicator from '#src/plugins/replicators/mongodb-replicator.class.js';

describe('MongoDB Replicator Tests', () => {
  let replicator;

  afterEach(async () => {
    if (replicator && typeof replicator.stop === 'function') {
      await replicator.stop();
    }
  });

  describe('Configuration Tests', () => {
    test('should initialize with basic configuration', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        port: 27017,
        database: 'test_db',
        username: 'test_user',
        password: 'test_password'
      }, { users: 'users_collection' });

      expect(replicator.host).toBe('localhost');
      expect(replicator.port).toBe(27017);
      expect(replicator.database).toBe('test_db');
      expect(replicator.username).toBe('test_user');
      expect(replicator.password).toBe('test_password');
    });

    test('should initialize with connection string', () => {
      replicator = new MongoDBReplicator({
        connectionString: 'mongodb://user:pass@localhost:27017/test_db'
      }, { users: 'users_collection' });

      expect(replicator.connectionString).toBe('mongodb://user:pass@localhost:27017/test_db');
    });

    test('should initialize with default host and port', () => {
      replicator = new MongoDBReplicator({
        database: 'test_db'
      }, { users: 'users_collection' });

      expect(replicator.host).toBe('localhost');
      expect(replicator.port).toBe(27017);
    });

    test('should parse string resource configuration', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, {
        users: 'users_collection',
        orders: 'orders_collection'
      });

      expect(replicator.resources.users).toEqual([{
        collection: 'users_collection',
        actions: ['insert']
      }]);
      expect(replicator.resources.orders).toEqual([{
        collection: 'orders_collection',
        actions: ['insert']
      }]);
    });

    test('should parse array resource configuration', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, {
        users: [
          { collection: 'users_collection', actions: ['insert', 'update'] },
          { collection: 'users_archive', actions: ['insert'] }
        ]
      });

      expect(replicator.resources.users).toHaveLength(2);
      expect(replicator.resources.users[0].collection).toBe('users_collection');
      expect(replicator.resources.users[0].actions).toEqual(['insert', 'update']);
      expect(replicator.resources.users[1].collection).toBe('users_archive');
      expect(replicator.resources.users[1].actions).toEqual(['insert']);
    });

    test('should parse object resource configuration', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, {
        users: {
          collection: 'users_collection',
          actions: ['insert', 'update', 'delete']
        }
      });

      expect(replicator.resources.users).toEqual([{
        collection: 'users_collection',
        actions: ['insert', 'update', 'delete']
      }]);
    });

    test('should configure MongoDB client options', () => {
      const options = {
        useUnifiedTopology: true,
        maxPoolSize: 50
      };

      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db',
        options
      }, { users: 'users_collection' });

      expect(replicator.options).toEqual(options);
    });

    test('should configure log collection', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db',
        logCollection: 'replication_log'
      }, { users: 'users_collection' });

      expect(replicator.logCollection).toBe('replication_log');
    });
  });

  describe('Validation Tests', () => {
    test('validateConfig should pass with valid direct connection config', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        port: 27017,
        database: 'test_db'
      }, { users: 'users_collection' });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateConfig should pass with connection string', () => {
      replicator = new MongoDBReplicator({
        connectionString: 'mongodb://localhost:27017/test_db'
      }, { users: 'users_collection' });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateConfig should fail when database and connection string are missing', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost'
      }, { users: 'users_collection' });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Database name or connection string is required');
    });

    test('validateConfig should fail when no resources configured', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, {});

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one resource must be configured');
    });

    test('validateConfig should fail when resource has no collection name', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, {
        users: { actions: ['insert'] }
      });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Collection name is required'))).toBe(true);
    });

    test('validateConfig should fail when resource has no actions', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, {
        users: { collection: 'users_collection', actions: [] }
      });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Actions array is required'))).toBe(true);
    });
  });

  describe('Resource Management Tests', () => {
    test('shouldReplicateResource should return true for configured resource', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, {
        users: 'users_collection',
        orders: 'orders_collection'
      });

      expect(replicator.shouldReplicateResource('users')).toBe(true);
      expect(replicator.shouldReplicateResource('orders')).toBe(true);
    });

    test('shouldReplicateResource should return false for unconfigured resource', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, {
        users: 'users_collection'
      });

      expect(replicator.shouldReplicateResource('products')).toBe(false);
    });
  });

  describe('Base Functionality Tests', () => {
    test('should extend BaseReplicator', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, { users: 'users_collection' });

      expect(replicator.name).toBe('MongoDBReplicator');
      expect(typeof replicator.initialize).toBe('function');
      expect(typeof replicator.cleanup).toBe('function');
    });

    test('should have default port 27017', () => {
      replicator = new MongoDBReplicator({
        database: 'test_db'
      }, { users: 'users_collection' });

      expect(replicator.port).toBe(27017);
    });

    test('should have default host localhost', () => {
      replicator = new MongoDBReplicator({
        database: 'test_db'
      }, { users: 'users_collection' });

      expect(replicator.host).toBe('localhost');
    });
  });

  describe('Internal Field Cleaning', () => {
    test('_cleanInternalFields should remove $ prefixed fields', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, { users: 'users_collection' });

      const data = {
        _id: '123',
        name: 'John',
        $metadata: 'internal',
        $version: 1
      };

      const cleaned = replicator._cleanInternalFields(data);
      expect(cleaned._id).toBe('123'); // _id is allowed in MongoDB
      expect(cleaned.name).toBe('John');
      expect(cleaned.$metadata).toBeUndefined();
      expect(cleaned.$version).toBeUndefined();
    });

    test('_cleanInternalFields should remove _ prefixed fields except _id', () => {
      replicator = new MongoDBReplicator({
        host: 'localhost',
        database: 'test_db'
      }, { users: 'users_collection' });

      const data = {
        _id: '123',
        name: 'John',
        _internal: 'value',
        _createdAt: new Date()
      };

      const cleaned = replicator._cleanInternalFields(data);
      expect(cleaned._id).toBe('123'); // _id is the MongoDB primary key
      expect(cleaned.name).toBe('John');
      expect(cleaned._internal).toBeUndefined();
      expect(cleaned._createdAt).toBeUndefined();
    });
  });

  describe('Connection String Tests', () => {
    test('should handle connection string with authentication', () => {
      replicator = new MongoDBReplicator({
        connectionString: 'mongodb://admin:secret@localhost:27017/test_db?authSource=admin'
      }, { users: 'users_collection' });

      expect(replicator.connectionString).toContain('admin:secret');
      expect(replicator.connectionString).toContain('authSource=admin');
    });

    test('should handle MongoDB Atlas connection string', () => {
      const atlasUri = 'mongodb+srv://user:pass@cluster0.mongodb.net/test_db?retryWrites=true&w=majority';
      replicator = new MongoDBReplicator({
        connectionString: atlasUri
      }, { users: 'users_collection' });

      expect(replicator.connectionString).toBe(atlasUri);
    });

    test('should handle replica set connection string', () => {
      const replicaSetUri = 'mongodb://host1:27017,host2:27017,host3:27017/test_db?replicaSet=rs0';
      replicator = new MongoDBReplicator({
        connectionString: replicaSetUri
      }, { users: 'users_collection' });

      expect(replicator.connectionString).toBe(replicaSetUri);
    });
  });
});
