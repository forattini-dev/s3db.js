import DynamoDBReplicator from '#src/plugins/replicators/dynamodb-replicator.class.js';

describe('DynamoDB Replicator Tests', () => {
  let replicator;

  afterEach(async () => {
    if (replicator && typeof replicator.stop === 'function') {
      await replicator.stop();
    }
  });

  describe('Configuration Tests', () => {
    test('should initialize with basic configuration', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      }, { users: 'UsersTable' });

      expect(replicator.region).toBe('us-east-1');
      expect(replicator.accessKeyId).toBe('test-key');
      expect(replicator.secretAccessKey).toBe('test-secret');
    });

    test('should initialize with default region', () => {
      replicator = new DynamoDBReplicator({
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      }, { users: 'UsersTable' });

      expect(replicator.region).toBe('us-east-1');
    });

    test('should initialize with custom endpoint for DynamoDB Local', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1',
        endpoint: 'http://localhost:8000'
      }, { users: 'UsersTable' });

      expect(replicator.endpoint).toBe('http://localhost:8000');
    });

    test('should initialize with credentials object', () => {
      const credentials = {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-token'
      };

      replicator = new DynamoDBReplicator({
        region: 'us-east-1',
        credentials
      }, { users: 'UsersTable' });

      expect(replicator.credentials).toEqual(credentials);
    });

    test('should parse string resource configuration', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {
        users: 'UsersTable',
        orders: 'OrdersTable'
      });

      expect(replicator.resources.users).toEqual([{
        table: 'UsersTable',
        actions: ['insert'],
        primaryKey: 'id'
      }]);
      expect(replicator.resources.orders).toEqual([{
        table: 'OrdersTable',
        actions: ['insert'],
        primaryKey: 'id'
      }]);
    });

    test('should parse array resource configuration', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {
        users: [
          { table: 'UsersTable', actions: ['insert', 'update'], primaryKey: 'userId' },
          { table: 'UsersArchive', actions: ['insert'], primaryKey: 'id' }
        ]
      });

      expect(replicator.resources.users).toHaveLength(2);
      expect(replicator.resources.users[0].table).toBe('UsersTable');
      expect(replicator.resources.users[0].actions).toEqual(['insert', 'update']);
      expect(replicator.resources.users[0].primaryKey).toBe('userId');
      expect(replicator.resources.users[1].table).toBe('UsersArchive');
      expect(replicator.resources.users[1].actions).toEqual(['insert']);
      expect(replicator.resources.users[1].primaryKey).toBe('id');
    });

    test('should parse object resource configuration', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {
        users: {
          table: 'UsersTable',
          actions: ['insert', 'update', 'delete'],
          primaryKey: 'email'
        }
      });

      expect(replicator.resources.users).toEqual([{
        table: 'UsersTable',
        actions: ['insert', 'update', 'delete'],
        primaryKey: 'email'
      }]);
    });

    test('should parse resource configuration with sort key', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {
        orders: {
          table: 'OrdersTable',
          actions: ['insert', 'update'],
          primaryKey: 'customerId',
          sortKey: 'orderId'
        }
      });

      expect(replicator.resources.orders[0].primaryKey).toBe('customerId');
      expect(replicator.resources.orders[0].sortKey).toBe('orderId');
    });

    test('should use default primaryKey when not specified', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {
        users: { table: 'UsersTable', actions: ['insert'] }
      });

      expect(replicator.resources.users[0].primaryKey).toBe('id');
    });
  });

  describe('Validation Tests', () => {
    test('validateConfig should pass with valid configuration', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret'
      }, { users: 'UsersTable' });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateConfig should pass with region only (uses AWS SDK default chain)', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-west-2'
      }, { users: 'UsersTable' });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateConfig should pass when region not specified (uses default)', () => {
      replicator = new DynamoDBReplicator({}, { users: 'UsersTable' });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(true); // Default region is 'us-east-1'
      expect(replicator.region).toBe('us-east-1');
    });

    test('validateConfig should fail when no resources configured', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {});

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one resource must be configured');
    });

    test('validateConfig should fail when resource has no table name', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {
        users: { actions: ['insert'], primaryKey: 'id' }
      });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Table name is required'))).toBe(true);
    });

    test('validateConfig should fail when resource has no actions', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {
        users: { table: 'UsersTable', actions: [], primaryKey: 'id' }
      });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Actions array is required'))).toBe(true);
    });
  });

  describe('Resource Management Tests', () => {
    test('shouldReplicateResource should return true for configured resource', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {
        users: 'UsersTable',
        orders: 'OrdersTable'
      });

      expect(replicator.shouldReplicateResource('users')).toBe(true);
      expect(replicator.shouldReplicateResource('orders')).toBe(true);
    });

    test('shouldReplicateResource should return false for unconfigured resource', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {
        users: 'UsersTable'
      });

      expect(replicator.shouldReplicateResource('products')).toBe(false);
    });
  });

  describe('Base Functionality Tests', () => {
    test('should extend BaseReplicator', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, { users: 'UsersTable' });

      expect(replicator.name).toBe('DynamoDBReplicator');
      expect(typeof replicator.initialize).toBe('function');
      expect(typeof replicator.cleanup).toBe('function');
    });

    test('should have default region us-east-1', () => {
      replicator = new DynamoDBReplicator({}, { users: 'UsersTable' });
      expect(replicator.region).toBe('us-east-1');
    });
  });

  describe('Internal Field Cleaning', () => {
    test('_cleanInternalFields should remove $ prefixed fields', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, { users: 'UsersTable' });

      const data = {
        id: '123',
        name: 'John',
        $metadata: 'internal',
        $version: 1
      };

      const cleaned = replicator._cleanInternalFields(data);
      expect(cleaned.id).toBe('123');
      expect(cleaned.name).toBe('John');
      expect(cleaned.$metadata).toBeUndefined();
      expect(cleaned.$version).toBeUndefined();
    });

    test('_cleanInternalFields should remove _ prefixed fields', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, { users: 'UsersTable' });

      const data = {
        id: '123',
        name: 'John',
        _internal: 'value',
        _createdAt: new Date()
      };

      const cleaned = replicator._cleanInternalFields(data);
      expect(cleaned.id).toBe('123');
      expect(cleaned.name).toBe('John');
      expect(cleaned._internal).toBeUndefined();
      expect(cleaned._createdAt).toBeUndefined();
    });
  });

  describe('Key Configuration Tests', () => {
    test('should support composite keys (primaryKey + sortKey)', () => {
      replicator = new DynamoDBReplicator({
        region: 'us-east-1'
      }, {
        orders: {
          table: 'OrdersTable',
          actions: ['insert', 'update', 'delete'],
          primaryKey: 'userId',
          sortKey: 'orderId'
        }
      });

      const config = replicator.resources.orders[0];
      expect(config.primaryKey).toBe('userId');
      expect(config.sortKey).toBe('orderId');
      expect(config.actions).toContain('insert');
      expect(config.actions).toContain('update');
      expect(config.actions).toContain('delete');
    });
  });
});
