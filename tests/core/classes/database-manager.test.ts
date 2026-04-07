import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseManager } from '#src/database-manager.class.js';
import { DatabaseError } from '#src/errors.js';
import { createMockClient } from '../../mocks/index.js';
import { Database } from '#src/database.class.js';
import { ProcessManager } from '#src/concerns/process-manager.js';
import { CronManager } from '#src/concerns/cron-manager.js';

const sharedProcessManager = new ProcessManager({ logLevel: 'silent', exitOnSignal: false });
const sharedCronManager = new CronManager({ disabled: true, logLevel: 'silent' });

function mockDbOptions(name: string) {
  const client = createMockClient({ bucket: `test-${name}` });
  return {
    client,
    logLevel: 'silent' as const,
    processManager: sharedProcessManager,
    cronManager: sharedCronManager,
    loggerOptions: { level: 'silent' as const },
  };
}

describe('DatabaseManager', () => {
  let manager: DatabaseManager;

  afterEach(async () => {
    if (manager) {
      try {
        if (manager.isConnected()) {
          await manager.disconnect();
        }
      } catch {
        // ignore cleanup errors
      }
    }
  });

  describe('constructor', () => {
    it('should create databases from connections map', () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('primary'),
          secondary: mockDbOptions('secondary'),
        },
      });

      expect(manager.connectionNames).toEqual(['primary', 'secondary']);
    });

    it('should use the first connection as default when not specified', () => {
      manager = new DatabaseManager({
        connections: {
          alpha: mockDbOptions('alpha'),
          beta: mockDbOptions('beta'),
        },
      });

      const defaultDb = manager.defaultConnection;
      const alphaDb = manager.connection('alpha');
      expect(defaultDb).toBe(alphaDb);
    });

    it('should use specified default connection', () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('primary'),
          secondary: mockDbOptions('secondary'),
        },
        default: 'secondary',
      });

      const defaultDb = manager.defaultConnection;
      const secondaryDb = manager.connection('secondary');
      expect(defaultDb).toBe(secondaryDb);
    });

    it('should throw when no connections provided', () => {
      expect(() => {
        new DatabaseManager({ connections: {} });
      }).toThrow(DatabaseError);
      expect(() => {
        new DatabaseManager({ connections: {} });
      }).toThrow(/at least one connection/);
    });

    it('should throw when connections is undefined', () => {
      expect(() => {
        new DatabaseManager({ connections: undefined as any });
      }).toThrow(DatabaseError);
    });

    it('should throw when default connection name does not exist', () => {
      expect(() => {
        new DatabaseManager({
          connections: {
            primary: mockDbOptions('primary'),
          },
          default: 'nonexistent',
        });
      }).toThrow(DatabaseError);
      expect(() => {
        new DatabaseManager({
          connections: {
            primary: mockDbOptions('primary'),
          },
          default: 'nonexistent',
        });
      }).toThrow(/nonexistent.*not found/);
    });

    it('should work with a single connection', () => {
      manager = new DatabaseManager({
        connections: {
          only: mockDbOptions('only'),
        },
      });

      expect(manager.connectionNames).toEqual(['only']);
      expect(manager.defaultConnection).toBe(manager.connection('only'));
    });
  });

  describe('connection(name)', () => {
    beforeEach(() => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('primary'),
          secondary: mockDbOptions('secondary'),
        },
      });
    });

    it('should return correct Database instance', () => {
      const primary = manager.connection('primary');
      const secondary = manager.connection('secondary');

      expect(primary).toBeInstanceOf(Database);
      expect(secondary).toBeInstanceOf(Database);
      expect(primary).not.toBe(secondary);
    });

    it('should return the same instance on repeated calls', () => {
      const first = manager.connection('primary');
      const second = manager.connection('primary');
      expect(first).toBe(second);
    });

    it('should throw for unknown connection name', () => {
      expect(() => manager.connection('unknown')).toThrow(DatabaseError);
      expect(() => manager.connection('unknown')).toThrow(/unknown.*not found/i);
    });

    it('should include available connections in error suggestion', () => {
      try {
        manager.connection('missing');
      } catch (err: any) {
        expect(err.suggestion).toMatch(/primary/);
        expect(err.suggestion).toMatch(/secondary/);
      }
    });
  });

  describe('defaultConnection getter', () => {
    it('should return the default database', () => {
      manager = new DatabaseManager({
        connections: {
          first: mockDbOptions('first'),
          second: mockDbOptions('second'),
        },
        default: 'second',
      });

      expect(manager.defaultConnection).toBe(manager.connection('second'));
    });

    it('should return first connection when no default specified', () => {
      manager = new DatabaseManager({
        connections: {
          aaa: mockDbOptions('aaa'),
          bbb: mockDbOptions('bbb'),
        },
      });

      expect(manager.defaultConnection).toBe(manager.connection('aaa'));
    });
  });

  describe('connectionNames getter', () => {
    it('should return all connection names', () => {
      manager = new DatabaseManager({
        connections: {
          db1: mockDbOptions('db1'),
          db2: mockDbOptions('db2'),
          db3: mockDbOptions('db3'),
        },
      });

      expect(manager.connectionNames).toEqual(['db1', 'db2', 'db3']);
    });

    it('should return a single name for single connection', () => {
      manager = new DatabaseManager({
        connections: {
          solo: mockDbOptions('solo'),
        },
      });

      expect(manager.connectionNames).toEqual(['solo']);
    });
  });

  describe('createResource(config)', () => {
    beforeEach(async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('cr-primary'),
          secondary: mockDbOptions('cr-secondary'),
        },
        default: 'primary',
      });
      await manager.connect();
    });

    it('should create resource on default connection when no connection field', async () => {
      const resource = await manager.createResource({
        name: 'users',
        attributes: { name: 'string' },
      });

      expect(resource).toBeDefined();
      expect(resource.name).toBe('users');
      expect(manager.getConnectionForResource('users')).toBe('primary');
    });

    it('should create resource on specified connection', async () => {
      const resource = await manager.createResource({
        name: 'logs',
        attributes: { message: 'string' },
        connection: 'secondary',
      });

      expect(resource).toBeDefined();
      expect(resource.name).toBe('logs');
      expect(manager.getConnectionForResource('logs')).toBe('secondary');
    });

    it('should throw on duplicate resource name across different connections', async () => {
      await manager.createResource({
        name: 'items',
        attributes: { title: 'string' },
        connection: 'primary',
      });

      await expect(
        manager.createResource({
          name: 'items',
          attributes: { title: 'string' },
          connection: 'secondary',
        })
      ).rejects.toThrow(DatabaseError);

      await expect(
        manager.createResource({
          name: 'items',
          attributes: { title: 'string' },
          connection: 'secondary',
        })
      ).rejects.toThrow(/already exists.*primary/);
    });

    it('should allow re-creating same resource on same connection (update behavior)', async () => {
      await manager.createResource({
        name: 'products',
        attributes: { title: 'string' },
        connection: 'primary',
      });

      const updated = await manager.createResource({
        name: 'products',
        attributes: { title: 'string', price: 'number' },
        connection: 'primary',
      });

      expect(updated).toBeDefined();
      expect(updated.name).toBe('products');
    });

    it('should make resource accessible via manager.resource() after creation', async () => {
      await manager.createResource({
        name: 'orders',
        attributes: { total: 'number' },
      });

      const fetched = manager.resource('orders');
      expect(fetched).toBeDefined();
      expect(fetched.name).toBe('orders');
    });

    it('should throw when target connection does not exist', async () => {
      await expect(
        manager.createResource({
          name: 'test',
          attributes: { x: 'string' },
          connection: 'nonexistent',
        })
      ).rejects.toThrow(DatabaseError);
    });

    it('should create resources on different connections independently', async () => {
      await manager.createResource({
        name: 'users',
        attributes: { name: 'string' },
        connection: 'primary',
      });

      await manager.createResource({
        name: 'logs',
        attributes: { message: 'string' },
        connection: 'secondary',
      });

      expect(manager.getConnectionForResource('users')).toBe('primary');
      expect(manager.getConnectionForResource('logs')).toBe('secondary');
    });
  });

  describe('resource(name)', () => {
    beforeEach(async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('res-primary'),
          secondary: mockDbOptions('res-secondary'),
        },
      });
      await manager.connect();
    });

    it('should return resource from correct connection', async () => {
      await manager.createResource({
        name: 'users',
        attributes: { name: 'string' },
        connection: 'primary',
      });

      await manager.createResource({
        name: 'logs',
        attributes: { message: 'string' },
        connection: 'secondary',
      });

      const users = manager.resource('users');
      const logs = manager.resource('logs');

      expect(users.name).toBe('users');
      expect(logs.name).toBe('logs');
    });

    it('should throw for unknown resource name', () => {
      expect(() => manager.resource('nonexistent')).toThrow(DatabaseError);
      expect(() => manager.resource('nonexistent')).toThrow(/not found in any connection/);
    });

    it('should include available resources in error suggestion', async () => {
      await manager.createResource({
        name: 'myresource',
        attributes: { x: 'string' },
      });

      try {
        manager.resource('missing');
      } catch (err: any) {
        expect(err.suggestion).toMatch(/myresource/);
      }
    });

    it('should show (none) when no resources exist', () => {
      try {
        manager.resource('missing');
      } catch (err: any) {
        expect(err.suggestion).toMatch(/\(none\)/);
      }
    });

    it('should discover resources restored from metadata (not just created via manager)', async () => {
      const db = manager.connection('primary');
      await db.createResource({
        name: 'directResource',
        attributes: { value: 'string' },
      });

      const resource = manager.resource('directResource');
      expect(resource).toBeDefined();
      expect(resource.name).toBe('directResource');
    });

    it('should cache connection for discovered resources in the index', async () => {
      const db = manager.connection('secondary');
      await db.createResource({
        name: 'discovered',
        attributes: { value: 'string' },
      });

      manager.resource('discovered');
      expect(manager.getConnectionForResource('discovered')).toBe('secondary');
    });
  });

  describe('resources getter', () => {
    beforeEach(async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('rg-primary'),
          secondary: mockDbOptions('rg-secondary'),
        },
      });
      await manager.connect();
    });

    it('should return merged view from all connections', async () => {
      await manager.createResource({
        name: 'users',
        attributes: { name: 'string' },
        connection: 'primary',
      });

      await manager.createResource({
        name: 'logs',
        attributes: { message: 'string' },
        connection: 'secondary',
      });

      const allResources = manager.resources;
      expect(allResources).toHaveProperty('users');
      expect(allResources).toHaveProperty('logs');
      expect(allResources.users.name).toBe('users');
      expect(allResources.logs.name).toBe('logs');
    });

    it('should return empty object when no resources exist', () => {
      const allResources = manager.resources;
      expect(Object.keys(allResources)).toHaveLength(0);
    });
  });

  describe('resourceNames getter', () => {
    beforeEach(async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('rn-primary'),
          secondary: mockDbOptions('rn-secondary'),
        },
      });
      await manager.connect();
    });

    it('should return all resource names across connections', async () => {
      await manager.createResource({
        name: 'users',
        attributes: { name: 'string' },
        connection: 'primary',
      });

      await manager.createResource({
        name: 'logs',
        attributes: { message: 'string' },
        connection: 'secondary',
      });

      const names = manager.resourceNames;
      expect(names).toContain('users');
      expect(names).toContain('logs');
      expect(names).toHaveLength(2);
    });

    it('should return empty array when no resources exist', () => {
      expect(manager.resourceNames).toEqual([]);
    });
  });

  describe('getConnectionForResource(name)', () => {
    beforeEach(async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('gcr-primary'),
          secondary: mockDbOptions('gcr-secondary'),
        },
      });
      await manager.connect();
    });

    it('should return correct connection name for indexed resource', async () => {
      await manager.createResource({
        name: 'users',
        attributes: { name: 'string' },
        connection: 'primary',
      });

      expect(manager.getConnectionForResource('users')).toBe('primary');
    });

    it('should discover and return connection for resource created directly on database', async () => {
      const db = manager.connection('secondary');
      await db.createResource({
        name: 'directItem',
        attributes: { val: 'string' },
      });

      expect(manager.getConnectionForResource('directItem')).toBe('secondary');
    });

    it('should throw for unknown resource', () => {
      expect(() => manager.getConnectionForResource('unknown')).toThrow(DatabaseError);
      expect(() => manager.getConnectionForResource('unknown')).toThrow(/not found in any connection/);
    });
  });

  describe('connect()', () => {
    it('should connect all databases in parallel', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('conn-primary'),
          secondary: mockDbOptions('conn-secondary'),
        },
      });

      await manager.connect();

      expect(manager.isConnected()).toBe(true);
      expect(manager.connection('primary').isConnected()).toBe(true);
      expect(manager.connection('secondary').isConnected()).toBe(true);
    });

    it('should rebuild resource index from restored resources after connect', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('rebuild-primary'),
        },
      });

      await manager.connect();

      await manager.connection('primary').createResource({
        name: 'preExisting',
        attributes: { x: 'string' },
      });

      const manager2 = new DatabaseManager({
        connections: {
          primary: {
            client: manager.connection('primary').client,
            logLevel: 'silent' as const,
            processManager: sharedProcessManager,
            cronManager: sharedCronManager,
            loggerOptions: { level: 'silent' as const },
          },
        },
      });

      await manager2.connect();

      expect(manager2.resourceNames).toContain('preExisting');

      if (manager2.isConnected()) {
        await manager2.disconnect();
      }
    });

    it('should throw with connection name on failure', async () => {
      const badClient = createMockClient({ bucket: 'bad' });
      badClient.headObject = async () => {
        throw new Error('S3 unavailable');
      };
      badClient.getObject = async () => {
        throw new Error('S3 unavailable');
      };
      badClient.putObject = async () => {
        throw new Error('S3 unavailable');
      };
      badClient.listObjects = async () => {
        throw new Error('S3 unavailable');
      };

      manager = new DatabaseManager({
        connections: {
          failing: {
            client: badClient,
            logLevel: 'silent' as const,
            processManager: sharedProcessManager,
            cronManager: sharedCronManager,
            loggerOptions: { level: 'silent' as const },
          },
        },
      });

      await expect(manager.connect()).rejects.toThrow(/Failed to connect "failing"/);
    });
  });

  describe('disconnect()', () => {
    it('should disconnect all databases', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('disc-primary'),
          secondary: mockDbOptions('disc-secondary'),
        },
      });

      await manager.connect();
      expect(manager.isConnected()).toBe(true);

      await manager.disconnect();
      expect(manager.isConnected()).toBe(false);
    });

    it('should clear resource index', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('disc-clear'),
        },
      });

      await manager.connect();
      await manager.createResource({
        name: 'users',
        attributes: { name: 'string' },
      });

      expect(manager.getConnectionForResource('users')).toBe('primary');

      await manager.disconnect();

      expect(() => manager.getConnectionForResource('users')).toThrow();
    });

    it('should be safe to call disconnect when not connected', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('disc-safe'),
        },
      });

      await expect(manager.disconnect()).resolves.not.toThrow();
    });
  });

  describe('isConnected()', () => {
    it('should return true when all databases are connected', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('ic-primary'),
          secondary: mockDbOptions('ic-secondary'),
        },
      });

      expect(manager.isConnected()).toBe(false);
      await manager.connect();
      expect(manager.isConnected()).toBe(true);
    });

    it('should return false when not connected', () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('ic-not'),
        },
      });

      expect(manager.isConnected()).toBe(false);
    });

    it('should return false after disconnect', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('ic-after'),
        },
      });

      await manager.connect();
      expect(manager.isConnected()).toBe(true);

      await manager.disconnect();
      expect(manager.isConnected()).toBe(false);
    });

    it('should return false when any database is disconnected', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('ic-partial-a'),
          secondary: mockDbOptions('ic-partial-b'),
        },
      });

      await manager.connect();
      expect(manager.isConnected()).toBe(true);

      await manager.connection('primary').disconnect();
      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('event forwarding', () => {
    beforeEach(async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('ev-primary'),
          secondary: mockDbOptions('ev-secondary'),
        },
      });
    });

    it('should emit prefixed events: connectionName:eventName', async () => {
      const handler = vi.fn();
      manager.on('primary:db:connected', handler);

      await manager.connect();

      expect(handler).toHaveBeenCalled();
    });

    it('should emit generic events with connectionName as first arg', async () => {
      const handler = vi.fn();
      manager.on('db:connected', handler);

      await manager.connect();

      expect(handler).toHaveBeenCalled();
      const calls = handler.mock.calls;
      const connectionNames = calls.map((c: any[]) => c[0]);
      expect(connectionNames).toContain('primary');
      expect(connectionNames).toContain('secondary');
    });

    it('should emit disconnected events', async () => {
      await manager.connect();

      const prefixedHandler = vi.fn();
      const genericHandler = vi.fn();
      manager.on('secondary:db:disconnected', prefixedHandler);
      manager.on('db:disconnected', genericHandler);

      await manager.disconnect();

      expect(prefixedHandler).toHaveBeenCalled();
      expect(genericHandler).toHaveBeenCalled();
    });

    it('should emit resource-created events', async () => {
      await manager.connect();

      const prefixedHandler = vi.fn();
      const genericHandler = vi.fn();
      manager.on('primary:db:resource-created', prefixedHandler);
      manager.on('db:resource-created', genericHandler);

      await manager.createResource({
        name: 'events-test',
        attributes: { value: 'string' },
        connection: 'primary',
      });

      expect(prefixedHandler).toHaveBeenCalled();
      expect(genericHandler).toHaveBeenCalled();
      expect(genericHandler).toHaveBeenCalledWith('primary', expect.anything());
    });

    it('should forward events from the correct connection only', async () => {
      await manager.connect();

      const primaryHandler = vi.fn();
      const secondaryHandler = vi.fn();
      manager.on('primary:db:resource-created', primaryHandler);
      manager.on('secondary:db:resource-created', secondaryHandler);

      await manager.createResource({
        name: 'on-primary',
        attributes: { x: 'string' },
        connection: 'primary',
      });

      expect(primaryHandler).toHaveBeenCalled();
      expect(secondaryHandler).not.toHaveBeenCalled();
    });

    it('should forward all listed event types', async () => {
      const events = [
        'db:connected',
        'db:disconnected',
      ];

      const handlers: Record<string, ReturnType<typeof vi.fn>> = {};
      for (const event of events) {
        handlers[event] = vi.fn();
        manager.on(`primary:${event}`, handlers[event]);
      }

      await manager.connect();
      await manager.disconnect();

      expect(handlers['db:connected']).toHaveBeenCalled();
      expect(handlers['db:disconnected']).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle many connections', () => {
      const connections: Record<string, any> = {};
      for (let i = 0; i < 10; i++) {
        connections[`db${i}`] = mockDbOptions(`many-${i}`);
      }

      manager = new DatabaseManager({ connections });
      expect(manager.connectionNames).toHaveLength(10);
    });

    it('should extend EventEmitter', () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('ee'),
        },
      });

      expect(typeof manager.on).toBe('function');
      expect(typeof manager.emit).toBe('function');
      expect(typeof manager.removeListener).toBe('function');
    });

    it('should handle createResource with no connection field defaulting to first connection', async () => {
      manager = new DatabaseManager({
        connections: {
          alpha: mockDbOptions('ec-alpha'),
          beta: mockDbOptions('ec-beta'),
        },
      });
      await manager.connect();

      await manager.createResource({
        name: 'implicitDefault',
        attributes: { x: 'string' },
      });

      expect(manager.getConnectionForResource('implicitDefault')).toBe('alpha');
    });

    it('should rebuild resource index after connect picks up resources created on databases directly', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('reconnect'),
          secondary: mockDbOptions('reconnect-s'),
        },
      });
      await manager.connect();

      await manager.connection('primary').createResource({
        name: 'directA',
        attributes: { val: 'string' },
      });

      await manager.connection('secondary').createResource({
        name: 'directB',
        attributes: { val: 'string' },
      });

      expect(manager.getConnectionForResource('directA')).toBe('primary');
      expect(manager.getConnectionForResource('directB')).toBe('secondary');
    });

    it('should return resource from index cache when available', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('cache-hit'),
          secondary: mockDbOptions('cache-hit-s'),
        },
      });
      await manager.connect();

      await manager.createResource({
        name: 'cached',
        attributes: { val: 'string' },
        connection: 'primary',
      });

      const first = manager.resource('cached');
      const second = manager.resource('cached');
      expect(first).toBe(second);
    });

    it('should handle resource() fallback when index entry points to stale connection', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('fallback-p'),
          secondary: mockDbOptions('fallback-s'),
        },
      });
      await manager.connect();

      const db = manager.connection('secondary');
      await db.createResource({
        name: 'fallbackTest',
        attributes: { x: 'string' },
      });

      // Manually poison the resource index to point at the wrong connection
      // so the first lookup (line 120-122) finds no resource on 'primary',
      // triggering the fallback scan across all databases.
      (manager as any)._resourceIndex.set('fallbackTest', 'primary');

      const resource = manager.resource('fallbackTest');
      expect(resource.name).toBe('fallbackTest');
      // After fallback, the index should be corrected to 'secondary'
      expect(manager.getConnectionForResource('fallbackTest')).toBe('secondary');
    });

    it('should handle getConnectionForResource fallback scan when not in index', async () => {
      manager = new DatabaseManager({
        connections: {
          primary: mockDbOptions('gcr-scan-p'),
          secondary: mockDbOptions('gcr-scan-s'),
        },
      });
      await manager.connect();

      const db = manager.connection('secondary');
      await db.createResource({
        name: 'scanTarget',
        attributes: { val: 'string' },
      });

      const connName = manager.getConnectionForResource('scanTarget');
      expect(connName).toBe('secondary');
    });
  });
});
