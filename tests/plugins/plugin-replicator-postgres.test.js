import PostgresReplicator from '#src/plugins/replicators/postgres-replicator.class.js';

describe('Postgres Replicator Tests', () => {
  let replicator;
  
  afterEach(async () => {
    if (replicator && typeof replicator.stop === 'function') {
      await replicator.stop();
    }
  });

  describe('Configuration Tests', () => {
    test('should initialize with basic configuration', () => {
      replicator = new PostgresReplicator({
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });

      expect(replicator.host).toBe('localhost');
      expect(replicator.port).toBe(5432);
      expect(replicator.database).toBe('test_db');
      expect(replicator.user).toBe('test_user');
      expect(replicator.password).toBe('test_password');
    });

    test('should initialize with connection string', () => {
      replicator = new PostgresReplicator({
        connectionString: 'postgresql://user:pass@localhost:5432/db'
      }, { users: 'users_table' });

      expect(replicator.connectionString).toBe('postgresql://user:pass@localhost:5432/db');
    });

    test('should parse string resource configuration', () => {
      replicator = new PostgresReplicator({
        host: 'localhost',
        database: 'test_db'
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
  });

  describe('Validation Tests', () => {
    test('validateConfig should pass with valid direct connection config', () => {
      replicator = new PostgresReplicator({
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        user: 'test_user',
        password: 'test_password'
      }, { users: 'users_table' });
      
      const result = replicator.validateConfig();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateConfig should pass with connection string', () => {
      replicator = new PostgresReplicator({
        connectionString: 'postgresql://user:pass@localhost:5432/db'
      }, { users: 'users_table' });
      
      const result = replicator.validateConfig();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateConfig should return errors for missing required fields', () => {
      replicator = new PostgresReplicator({}, { users: 'users_table' });
      
      const result = replicator.validateConfig();
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Resource Management Tests', () => {
    test('shouldReplicateResource should return true for configured resource', () => {
      replicator = new PostgresReplicator({
        host: 'localhost',
        database: 'test_db'
      }, {
        users: 'users_table',
        orders: 'orders_table'
      });

      expect(replicator.shouldReplicateResource('users')).toBe(true);
      expect(replicator.shouldReplicateResource('orders')).toBe(true);
    });

    test('shouldReplicateResource should return false for unconfigured resource', () => {
      replicator = new PostgresReplicator({
        host: 'localhost',
        database: 'test_db'
      }, {
        users: 'users_table'
      });

      expect(replicator.shouldReplicateResource('products')).toBe(false);
    });
  });

  describe('Base Functionality Tests', () => {
    test('should extend BaseReplicator', () => {
      replicator = new PostgresReplicator({
        host: 'localhost',
        database: 'test_db'
      }, { users: 'users_table' });

      expect(replicator.name).toBe('PostgresReplicator');
      expect(typeof replicator.initialize).toBe('function');
      expect(typeof replicator.cleanup).toBe('function');
    });

    test('should have default port 5432', () => {
      replicator = new PostgresReplicator({
        host: 'localhost',
        database: 'test_db'
      }, { users: 'users_table' });

      expect(replicator.port).toBe(5432);
    });
  });
}); 