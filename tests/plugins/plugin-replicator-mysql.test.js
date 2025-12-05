import MySQLReplicator from '#src/plugins/replicators/mysql-replicator.class.js';

describe('MySQL Replicator Tests', () => {
  let replicator;

  afterEach(async () => {
    if (replicator && typeof replicator.stop === 'function') {
      await replicator.stop();
    }
  });

  describe('Configuration Tests', () => {
    test('should initialize with basic configuration', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        port: 3306,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });

      expect(replicator.host).toBe('localhost');
      expect(replicator.port).toBe(3306);
      expect(replicator.database).toBe('test_db');
      expect(replicator.user).toBe('test_user');
      expect(replicator.password).toBe('test_password');
    });

    test('should initialize with default host and port', () => {
      replicator = new MySQLReplicator({
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });

      expect(replicator.host).toBe('localhost');
      expect(replicator.port).toBe(3306);
    });

    test('should parse string resource configuration', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, {
        users: 'users_table',
        orders: 'orders_table'
      });

      expect(replicator.resources.users).toEqual([{
        table: 'users_table',
        actions: ['insert']
      }]);
      expect(replicator.resources.orders).toEqual([{
        table: 'orders_table',
        actions: ['insert']
      }]);
    });

    test('should parse array resource configuration', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, {
        users: [
          { table: 'users_table', actions: ['insert', 'update'] },
          { table: 'users_archive', actions: ['insert'] }
        ]
      });

      expect(replicator.resources.users).toHaveLength(2);
      expect(replicator.resources.users[0].table).toBe('users_table');
      expect(replicator.resources.users[0].actions).toEqual(['insert', 'update']);
      expect(replicator.resources.users[1].table).toBe('users_archive');
      expect(replicator.resources.users[1].actions).toEqual(['insert']);
    });

    test('should parse object resource configuration', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, {
        users: {
          table: 'users_table',
          actions: ['insert', 'update', 'delete']
        }
      });

      expect(replicator.resources.users).toEqual([{
        table: 'users_table',
        actions: ['insert', 'update', 'delete']
      }]);
    });

    test('should configure connection pool settings', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
        connectionLimit: 20
      }, { users: 'users_table' });

      expect(replicator.connectionLimit).toBe(20);
    });

    test('should configure SSL settings', () => {
      const sslConfig = { rejectUnauthorized: true };
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
        ssl: sslConfig
      }, { users: 'users_table' });

      expect(replicator.ssl).toEqual(sslConfig);
    });

    test('should configure log table', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password',
        logTable: 'replication_log'
      }, { users: 'users_table' });

      expect(replicator.logTable).toBe('replication_log');
    });
  });

  describe('Validation Tests', () => {
    test('validateConfig should pass with valid configuration', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        port: 3306,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateConfig should fail when database is missing', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Database name is required');
    });

    test('validateConfig should fail when user is missing', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        password: 'test_password'
      }, { users: 'users_table' });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Database user is required');
    });

    test('validateConfig should fail when password is missing', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user'
      }, { users: 'users_table' });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Database password is required');
    });

    test('validateConfig should fail when no resources configured', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, {});

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('At least one resource must be configured');
    });

    test('validateConfig should fail when resource has no table name', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, {
        users: { actions: ['insert'] }
      });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Table name is required'))).toBe(true);
    });

    test('validateConfig should fail when resource has no actions', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, {
        users: { table: 'users_table', actions: [] }
      });

      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Actions array is required'))).toBe(true);
    });
  });

  describe('Resource Management Tests', () => {
    test('shouldReplicateResource should return true for configured resource', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, {
        users: 'users_table',
        orders: 'orders_table'
      });

      expect(replicator.shouldReplicateResource('users')).toBe(true);
      expect(replicator.shouldReplicateResource('orders')).toBe(true);
    });

    test('shouldReplicateResource should return false for unconfigured resource', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, {
        users: 'users_table'
      });

      expect(replicator.shouldReplicateResource('products')).toBe(false);
    });
  });

  describe('Base Functionality Tests', () => {
    test('should extend BaseReplicator', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });

      expect(replicator.name).toBe('MySQLReplicator');
      expect(typeof replicator.initialize).toBe('function');
      expect(typeof replicator.cleanup).toBe('function');
    });

    test('should have default port 3306', () => {
      replicator = new MySQLReplicator({
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });

      expect(replicator.port).toBe(3306);
    });

    test('should have default connection limit 10', () => {
      replicator = new MySQLReplicator({
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });

      expect(replicator.connectionLimit).toBe(10);
    });
  });

  describe('Internal Field Cleaning', () => {
    test('_cleanInternalFields should remove $ prefixed fields', () => {
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });

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
      replicator = new MySQLReplicator({
        host: 'localhost',
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });

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
});
