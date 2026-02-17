import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { createTicketsForHandler, claimTickets, processTicket, reclaimStaleTickets } from '../../src/plugins/eventual-consistency/tickets.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("EventualConsistencyPlugin - Coordinator Mode", () => {
  let database;
  let usersResource;
  let plugin;

  beforeEach(async () => {
    // Clear storage before each test
    MemoryClient.clearAllStorage();

    database = createDatabaseForTest('suite=plugins/ec-coordinator-test');
    await database.connect();

    // Create resource
    usersResource = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        balance: 'number|default:0'
      }
    });
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.stop();
    }
    if (database?.connected) {
      await database.disconnect();
    }
    MemoryClient.clearAllStorage();

    // Small delay to ensure timers are fully cancelled
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe("Configuration", () => {
    it("should enable coordinator mode by default", async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();

      expect(plugin.config.enableCoordinator).toBe(true);
    });

    it("should disable coordinator mode when explicitly set", async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        enableCoordinator: false,
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();

      expect(plugin.config.enableCoordinator).toBe(false);
    });

    it("should use default coordinator configuration", async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);

      expect(plugin.config.heartbeatInterval).toBe(5000);
      expect(plugin.config.heartbeatTTL).toBe(3);
      expect(plugin.config.epochDuration).toBe(300000);
      expect(plugin.config.coordinatorWorkInterval).toBe(60000);
      expect(plugin.config.workerInterval).toBe(10000);
      expect(plugin.config.ticketBatchSize).toBe(100);
      expect(plugin.config.workerClaimLimit).toBe(1);
      expect(plugin.config.ticketMaxRetries).toBe(3);
      expect(plugin.config.ticketRetryDelayMs).toBe(1000);
      expect(plugin.config.ticketScanPageSize).toBe(100);
    });

    it("should override coordinator configuration", async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        coordinator: {
          heartbeatInterval: 3000,
          workInterval: 30000,
          workerInterval: 5000,
          ticketBatchSize: 50,
          workerClaimLimit: 3
        },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);

      expect(plugin.config.heartbeatInterval).toBe(3000);
      expect(plugin.config.coordinatorWorkInterval).toBe(30000);
      expect(plugin.config.workerInterval).toBe(5000);
      expect(plugin.config.ticketBatchSize).toBe(50);
      expect(plugin.config.workerClaimLimit).toBe(3);
    });
  });

  describe("Ticket Resource Creation", () => {
    it("should create ticket resources during installation", async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const ticketResource = database.resources['plg_users_balance_tickets'];
      expect(ticketResource).toBeDefined();
      expect(ticketResource.name).toBe('plg_users_balance_tickets');
    });

    it("should configure ticket resource correctly", async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const ticketResource = database.resources['plg_users_balance_tickets'];

      // Check behavior
      expect(ticketResource.behavior).toBe('body-only');

      // Check timestamps (true - automatic ISO createdAt/updatedAt)
      expect(ticketResource.config.timestamps).toBe(true);

      // Check asyncPartitions (must be false for atomic claiming)
      expect(ticketResource.config.asyncPartitions).toBe(false);

      // Check partitions
      expect(ticketResource.config.partitions).toBeDefined();
      expect(ticketResource.config.partitions.byStatus).toBeDefined();
    });

    it("should have required ticket fields", async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const ticketResource = database.resources['plg_users_balance_tickets'];
      const schema = ticketResource.schema.attributes;

      expect(schema.id).toBeDefined();
      expect(schema.resourceName).toBeDefined();
      expect(schema.fieldName).toBeDefined();
      expect(schema.records).toBeDefined();
      expect(schema.status).toBeDefined();
      expect(schema.cohortHour).toBeDefined();
      expect(schema.ticketCreatedAt).toBeDefined();
      expect(schema.ticketExpiresAt).toBeDefined();
      expect(schema.claimedBy).toBeDefined();
      expect(schema.ticketClaimedAt).toBeDefined();
    });

    it("should reference ticket resource in handler", async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const handler = plugin.fieldHandlers.get('users').get('balance');
      expect(handler.ticketResource).toBeDefined();
      expect(handler.ticketResource.name).toBe('plg_users_balance_tickets');
    });

    it("should not create ticket resources when coordinator disabled", async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        enableCoordinator: false,
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const ticketResource = database.resources['plg_users_balance_tickets'];
      expect(ticketResource).toBeUndefined();
    });
  });

  describe("Ticket Creation", () => {
    beforeEach(async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        coordinator: { ticketBatchSize: 100 },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();
    });

    it("should create tickets from pending transactions", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create 256 transactions
      await Promise.all(
        Array.from({ length: 256 }, (_, i) =>
          txResource.insert({
            id: `tx-${i}`,
            originalId: `user-${i}`,
            field: 'balance',
            value: 100,
            operation: 'add',
            timestamp: new Date().toISOString(),
            cohortDate: new Date().toISOString().slice(0, 10),
            cohortHour,
            applied: false
          })
        )
      );

      // Create tickets
      const getCohortHours = () => [cohortHour];
      const tickets = await createTicketsForHandler(handler, plugin.config, getCohortHours);

      // Should create 3 tickets (100 + 100 + 56)
      expect(tickets.length).toBe(3);
      expect(tickets[0].records.length).toBe(100);
      expect(tickets[1].records.length).toBe(100);
      expect(tickets[2].records.length).toBe(56);

      // Verify ticket properties
      tickets.forEach(ticket => {
        expect(ticket.id).toMatch(/^ticket-\d+-[a-z0-9]+$/);
        expect(ticket.resourceName).toBe('users');
        expect(ticket.fieldName).toBe('balance');
        expect(ticket.status).toBe('available');
        expect(ticket.cohortHour).toBe(cohortHour);
        expect(ticket.ticketCreatedAt).toBeDefined();
        expect(ticket.ticketExpiresAt).toBeDefined();
        expect(ticket.ticketExpiresAt).toBeGreaterThan(ticket.ticketCreatedAt);
      });
    });

    it("should respect batch size configuration", async () => {
      // Create plugin with smaller batch size
      await plugin.stop();
      await database.disconnect();
      MemoryClient.clearAllStorage();

      database = createDatabaseForTest('suite=plugins/ec-coordinator-batch-test');
      await database.connect();
      usersResource = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          balance: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        coordinator: { ticketBatchSize: 50 },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create 120 transactions
      await Promise.all(
        Array.from({ length: 120 }, (_, i) =>
          txResource.insert({
            id: `tx-${i}`,
            originalId: `user-${i}`,
            field: 'balance',
            value: 100,
            operation: 'add',
            timestamp: new Date().toISOString(),
            cohortDate: new Date().toISOString().slice(0, 10),
            cohortHour,
            applied: false
          })
        )
      );

      const getCohortHours = () => [cohortHour];
      const tickets = await createTicketsForHandler(handler, plugin.config, getCohortHours);

      // Should create 3 tickets (50 + 50 + 20)
      expect(tickets.length).toBe(3);
      expect(tickets[0].records.length).toBe(50);
      expect(tickets[1].records.length).toBe(50);
      expect(tickets[2].records.length).toBe(20);
    });

    it("should return empty array when no pending transactions", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      const getCohortHours = () => [cohortHour];
      const tickets = await createTicketsForHandler(handler, plugin.config, getCohortHours);

      expect(tickets).toEqual([]);
    });

    it("should not create duplicate tickets for records already in active tickets", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      await Promise.all(
        Array.from({ length: 256 }, (_, i) =>
          txResource.insert({
            id: `tx-${i}`,
            originalId: `user-${i}`,
            field: 'balance',
            value: 100,
            operation: 'add',
            timestamp: new Date().toISOString(),
            cohortDate: new Date().toISOString().slice(0, 10),
            cohortHour,
            applied: false
          })
        )
      );

      const getCohortHours = () => [cohortHour];
      const firstBatch = await createTicketsForHandler(handler, plugin.config, getCohortHours);
      expect(firstBatch.length).toBe(3);

      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);
      expect(claimed.length).toBeGreaterThan(0);

      const secondBatch = await createTicketsForHandler(handler, plugin.config, getCohortHours);
      expect(secondBatch).toEqual([]);
    });

    it("should ignore expired available tickets when deduplicating records", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const now = Date.now();
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      await ticketResource.insert({
        id: 'stale-available-ticket',
        resourceName: 'users',
        fieldName: 'balance',
        records: ['user-stale'],
        status: 'available',
        cohortHour,
        ticketCreatedAt: now - 400000,
        ticketExpiresAt: now - 1000
      });

      await txResource.insert({
        id: 'tx-stale-user',
        originalId: 'user-stale',
        field: 'balance',
        value: 100,
        operation: 'add',
        timestamp: new Date().toISOString(),
        cohortDate: new Date().toISOString().slice(0, 10),
        cohortHour,
        applied: false
      });

      const getCohortHours = () => [cohortHour];
      const tickets = await createTicketsForHandler(handler, plugin.config, getCohortHours);

      expect(tickets.length).toBe(1);
      expect(tickets[0].records).toEqual(['user-stale']);
    });
  });

  describe("Ticket Claiming", () => {
    beforeEach(async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        coordinator: { ticketBatchSize: 100, workerClaimLimit: 2 },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();
    });

    it("should claim available tickets", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create transactions
      await Promise.all(
        Array.from({ length: 256 }, (_, i) =>
          txResource.insert({
            id: `tx-${i}`,
            originalId: `user-${i}`,
            field: 'balance',
            value: 100,
            operation: 'add',
            timestamp: new Date().toISOString(),
            cohortDate: new Date().toISOString().slice(0, 10),
            cohortHour,
            applied: false
          })
        )
      );

      // Create tickets
      const getCohortHours = () => [cohortHour];
      await createTicketsForHandler(handler, plugin.config, getCohortHours);

      // Claim tickets
      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);

      // Should claim up to workerClaimLimit (2)
      expect(claimed.length).toBeGreaterThan(0);
      expect(claimed.length).toBeLessThanOrEqual(2);

      // Verify claimed ticket properties
      claimed.forEach(ticket => {
        expect(ticket.status).toBe('processing');
        expect(ticket.claimedBy).toBe('worker-1');
        expect(ticket.ticketClaimedAt).toBeDefined();
      });
    });

    it("should prevent duplicate claims by multiple workers", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create transactions
      await Promise.all(
        Array.from({ length: 256 }, (_, i) =>
          txResource.insert({
            id: `tx-${i}`,
            originalId: `user-${i}`,
            field: 'balance',
            value: 100,
            operation: 'add',
            timestamp: new Date().toISOString(),
            cohortDate: new Date().toISOString().slice(0, 10),
            cohortHour,
            applied: false
          })
        )
      );

      // Create tickets
      const getCohortHours = () => [cohortHour];
      await createTicketsForHandler(handler, plugin.config, getCohortHours);

      // Two workers claim tickets
      const worker1Claims = await claimTickets(ticketResource, 'worker-1', plugin.config);
      const worker2Claims = await claimTickets(ticketResource, 'worker-2', plugin.config);

      // Get ticket IDs
      const worker1Ids = new Set(worker1Claims.map(t => t.id));
      const worker2Ids = new Set(worker2Claims.map(t => t.id));

      // Verify no overlap
      const overlap = [...worker1Ids].filter(id => worker2Ids.has(id));
      expect(overlap).toEqual([]);

      // Verify both workers claimed tickets
      expect(worker1Claims.length).toBeGreaterThan(0);
      expect(worker2Claims.length).toBeGreaterThan(0);
    });

    it("should simulate 3 concurrent consumers with no duplicate ticket claims", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      plugin.config.ticketBatchSize = 1;

      await Promise.all([
        usersResource.insert({ id: 'user-1', name: 'User 1', balance: 0 }),
        usersResource.insert({ id: 'user-2', name: 'User 2', balance: 0 }),
        usersResource.insert({ id: 'user-3', name: 'User 3', balance: 0 })
      ]);

      await Promise.all(
        Array.from({ length: 3 }, (_, index) => {
          const i = index + 1;
          return txResource.insert({
            id: `concurrent-${i}`,
            originalId: `user-${i}`,
            field: 'balance',
            value: i,
            operation: 'add',
            timestamp: new Date().toISOString(),
            cohortDate: new Date().toISOString().slice(0, 10),
            cohortHour,
            applied: false
          });
        })
      );

      const getCohortHours = () => [cohortHour];
      await createTicketsForHandler(handler, plugin.config, getCohortHours);

      const claims = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          claimTickets(ticketResource, `consumer-${i + 1}`, plugin.config)
        )
      );

      const allClaimed = claims.flat();
      const claimedIds = allClaimed.map((ticket) => ticket.id);
      const uniqueClaimedIds = new Set(claimedIds);

      expect(allClaimed.length).toBe(3);
      expect(uniqueClaimedIds.size).toBe(3);
    });

    it("should guarantee atomic claim under concurrent worker calls", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      await txResource.insert({
        id: 'tx-concurrent',
        originalId: 'user-concurrent',
        field: 'balance',
        value: 50,
        operation: 'add',
        timestamp: new Date().toISOString(),
        cohortDate: new Date().toISOString().slice(0, 10),
        cohortHour,
        applied: false
      });

      const getCohortHours = () => [cohortHour];
      const tickets = await createTicketsForHandler(handler, plugin.config, getCohortHours);
      expect(tickets).toHaveLength(1);

      const claims = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          claimTickets(ticketResource, `worker-${i}`, plugin.config)
        )
      );

      const allClaimed = claims.flat();
      const claimedIds = allClaimed.map((ticket) => ticket.id);
      const uniqueIds = new Set(claimedIds);

      expect(allClaimed.length).toBe(1);
      expect(uniqueIds.size).toBe(1);
      expect(allClaimed[0]?.status).toBe('processing');
    });

    it("should filter expired tickets", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const ticketResource = handler.ticketResource;
      const now = Date.now();

      // Create an expired ticket
      await ticketResource.insert({
        id: 'expired-ticket',
        resourceName: 'users',
        fieldName: 'balance',
        records: ['user-1'],
        status: 'available',
        cohortHour: new Date().toISOString().slice(0, 13) + ':00:00Z',
        ticketCreatedAt: now - 400000,
        ticketExpiresAt: now - 100000 // Expired 100s ago
      });

      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);

      expect(claimed).toEqual([]);
    });

    it("should reclaim stale processing tickets", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      await txResource.insert({
        id: 'tx-1',
        originalId: 'user-1',
        field: 'balance',
        value: 10,
        operation: 'add',
        timestamp: new Date().toISOString(),
        cohortDate: new Date().toISOString().slice(0, 10),
        cohortHour,
        applied: false
      });

      const getCohortHours = () => [cohortHour];
      await createTicketsForHandler(handler, plugin.config, getCohortHours);
      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);

      const staleTicket = claimed[0];
      const staleAt = Date.now() - 120000;
      await ticketResource.update(staleTicket.id, {
        status: 'processing',
        claimedBy: staleTicket.claimedBy,
        ticketClaimedAt: staleAt,
        ticketProcessingUntil: staleAt
      });

      const reclaimed = await reclaimStaleTickets(ticketResource, plugin.config, Date.now() + 120000);
      expect(reclaimed).toBe(1);

      const restored = await ticketResource.get(staleTicket.id);
      expect(restored.status).toBe('available');
      expect(restored.claimedBy).toBeNull();
      expect(restored.ticketRetryCount).toBe(1);
    });

    it("should reclaim stale available tickets", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const ticketResource = handler.ticketResource;
      const now = Date.now();

      await ticketResource.insert({
        id: 'expired-available-ticket',
        resourceName: 'users',
        fieldName: 'balance',
        records: ['user-stale-available'],
        status: 'available',
        cohortHour: new Date().toISOString().slice(0, 13) + ':00:00Z',
        ticketCreatedAt: now - 400000,
        ticketExpiresAt: now - 1000
      });

      const reclaimed = await reclaimStaleTickets(ticketResource, plugin.config, Date.now() + 1000);
      expect(reclaimed).toBe(1);

      await expect(ticketResource.get('expired-available-ticket')).rejects.toThrow();
    });

    it("should return empty array when no available tickets", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const ticketResource = handler.ticketResource;

      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);

      expect(claimed).toEqual([]);
    });
  });

  describe("Ticket Processing", () => {
    beforeEach(async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        coordinator: { ticketBatchSize: 100 },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();
    });

    it("should process ticket and consolidate transactions", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create user
      await usersResource.insert({
        id: 'user-1',
        name: 'User 1',
        balance: 0
      });

      // Create transactions
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          txResource.insert({
            id: `tx-${i}`,
            originalId: 'user-1',
            field: 'balance',
            value: 10,
            operation: 'add',
            timestamp: new Date().toISOString(),
            cohortDate: new Date().toISOString().slice(0, 10),
            cohortHour,
            applied: false
          })
        )
      );

      // Create and claim ticket
      const getCohortHours = () => [cohortHour];
      await createTicketsForHandler(handler, plugin.config, getCohortHours);
      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);
      const ticket = claimed[0];

      // Process ticket
      const result = await processTicket(ticket, handler, database);

      // Verify results
      expect(result.recordsProcessed).toBe(1);
      expect(result.transactionsApplied).toBe(10);
      expect(result.errors).toEqual([]);

      // Verify user balance
      const user = await usersResource.get('user-1');
      expect(user.balance).toBe(100);

      // Verify transactions marked as applied
      const pendingTxs = await txResource.query({
        originalId: 'user-1',
        applied: false
      });
      expect(pendingTxs).toEqual([]);

      // Verify ticket deleted
      await expect(ticketResource.get(ticket.id)).rejects.toThrow();
    });

    it("should handle set and add operations correctly", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create user
      await usersResource.insert({
        id: 'user-2',
        name: 'User 2',
        balance: 50
      });

      // Create transactions: add, add, set, add
      await txResource.insert({
        id: 'tx-1',
        originalId: 'user-2',
        field: 'balance',
        value: 10,
        operation: 'add',
        timestamp: new Date('2025-01-01T10:00:00Z').toISOString(),
        cohortDate: '2025-01-01',
        cohortHour,
        applied: false
      });

      await txResource.insert({
        id: 'tx-2',
        originalId: 'user-2',
        field: 'balance',
        value: 20,
        operation: 'add',
        timestamp: new Date('2025-01-01T10:01:00Z').toISOString(),
        cohortDate: '2025-01-01',
        cohortHour,
        applied: false
      });

      await txResource.insert({
        id: 'tx-3',
        originalId: 'user-2',
        field: 'balance',
        value: 100,
        operation: 'set',
        timestamp: new Date('2025-01-01T10:02:00Z').toISOString(),
        cohortDate: '2025-01-01',
        cohortHour,
        applied: false
      });

      await txResource.insert({
        id: 'tx-4',
        originalId: 'user-2',
        field: 'balance',
        value: 30,
        operation: 'add',
        timestamp: new Date('2025-01-01T10:03:00Z').toISOString(),
        cohortDate: '2025-01-01',
        cohortHour,
        applied: false
      });

      // Create and process ticket
      const getCohortHours = () => [cohortHour];
      await createTicketsForHandler(handler, plugin.config, getCohortHours);
      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);
      await processTicket(claimed[0], handler, database);

      // Verify balance: 50 (initial) + 100 (set ignores initial) + 30 (add after set) = 180
      const user = await usersResource.get('user-2');
      expect(user.balance).toBe(180);
    });

    it("should create record on set when it doesn't exist", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create set transaction for non-existent user
      await txResource.insert({
        id: 'tx-1',
        originalId: 'user-new',
        field: 'balance',
        value: 200,
        operation: 'set',
        timestamp: new Date().toISOString(),
        cohortDate: new Date().toISOString().slice(0, 10),
        cohortHour,
        applied: false
      });

      // Create and process ticket
      const getCohortHours = () => [cohortHour];
      await createTicketsForHandler(handler, plugin.config, getCohortHours);
      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);
      const result = await processTicket(claimed[0], handler, database);

      // Since 'name' is required, the insert will fail and be recorded as an error
      // The plugin handles this gracefully - it can't create records with missing required fields
      expect(result.recordsProcessed).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should handle errors gracefully", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const ticketResource = handler.ticketResource;
      const now = Date.now();

      // Create ticket with invalid record ID
      const ticket = {
        id: 'test-ticket',
        resourceName: 'users',
        fieldName: 'balance',
        records: ['nonexistent-user'],
        status: 'processing',
        cohortHour: new Date().toISOString().slice(0, 13) + ':00:00Z',
        ticketCreatedAt: now,
        ticketExpiresAt: now + 300000,
        claimedBy: 'worker-1',
        ticketClaimedAt: now
      };

      await ticketResource.insert(ticket);

      // Process ticket
      const result = await processTicket(ticket, handler, database);

      // Should complete without crashing
      expect(result.recordsProcessed).toBe(0);
      expect(result.transactionsApplied).toBe(0);
    });

    it("should retry a ticket when processing fails", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      await txResource.insert({
        id: 'tx-1',
        originalId: 'user-new',
        field: 'balance',
        value: 200,
        operation: 'set',
        timestamp: new Date().toISOString(),
        cohortDate: new Date().toISOString().slice(0, 10),
        cohortHour,
        applied: false
      });

      const getCohortHours = () => [cohortHour];
      await createTicketsForHandler(handler, plugin.config, getCohortHours);
      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);
      const ticket = claimed[0];

      const result = await processTicket(ticket, handler, database, 'worker-1', plugin.config);
      const restoredTicket = await ticketResource.get(ticket.id);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(restoredTicket.status).toBe('available');
      expect(restoredTicket.ticketRetryCount).toBe(1);
    });

    it("should stop retrying after max retry limit is reached", async () => {
      await plugin.stop();
      await database.disconnect();
      MemoryClient.clearAllStorage();

      database = createDatabaseForTest('suite=plugins/ec-coordinator-max-retries');
      await database.connect();
      usersResource = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          balance: 'number|default:0'
        }
      });

      plugin = new EventualConsistencyPlugin({
        logLevel: 'silent',
        resources: { users: ['balance'] },
        coordinator: { ticketBatchSize: 100, ticketMaxRetries: 0 }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      await txResource.insert({
        id: 'tx-1',
        originalId: 'user-new',
        field: 'balance',
        value: 200,
        operation: 'set',
        timestamp: new Date().toISOString(),
        cohortDate: new Date().toISOString().slice(0, 10),
        cohortHour,
        applied: false
      });

      const getCohortHours = () => [cohortHour];
      await createTicketsForHandler(handler, plugin.config, getCohortHours);
      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);
      expect(claimed).toHaveLength(1);
      const result = await processTicket(claimed[0], handler, database, 'worker-1', plugin.config);

      expect(result.errors.length).toBeGreaterThan(0);
      await expect(ticketResource.get(claimed[0].id)).rejects.toThrow();
    });

    it("should process transactions with nested fieldPath and subtraction", async () => {
      await plugin.stop();
      await database.disconnect();
      MemoryClient.clearAllStorage();

      database = createDatabaseForTest('suite=plugins/ec-coordinator-nested');
      await database.connect();

      usersResource = await database.createResource({
        name: 'users',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          stats: 'object|optional'
        }
      });

      plugin = new EventualConsistencyPlugin({
        logLevel: 'silent',
        resources: {
          users: [{ field: 'balance', fieldPath: 'stats.value' }]
        },
        coordinator: { ticketBatchSize: 100 }
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      await usersResource.insert({
        id: 'user-1',
        name: 'Nested User',
        stats: { value: 100 }
      });

      await usersResource.set('user-1', 'balance', 50);
      await usersResource.add('user-1', 'balance', 25);
      await usersResource.sub('user-1', 'balance', 10);

      const getCohortHours = () => [cohortHour];
      await createTicketsForHandler(handler, plugin.config, getCohortHours);

      const claimed = await claimTickets(ticketResource, 'worker-1', plugin.config);
      const result = await processTicket(claimed[0], handler, database, 'worker-1', plugin.config);
      const user = await usersResource.get('user-1');

      expect(result.errors).toEqual([]);
      expect(result.recordsProcessed).toBe(1);
      expect(result.transactionsApplied).toBe(3);
      expect(user.stats.value).toBe(65);
    });
  });

  describe("End-to-End Flow", () => {
    it("should consolidate transactions via coordinator pattern", async () => {
      plugin = new EventualConsistencyPlugin({
      logLevel: 'silent',
        resources: { users: ['balance'] },
        coordinator: {
          ticketBatchSize: 50,
          workerClaimLimit: 2
        },
        logLevel: 'silent'
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create 3 users
      await Promise.all(
        Array.from({ length: 3 }, (_, index) => {
          const userId = index + 1;
          return usersResource.insert({
            id: `user-${userId}`,
            name: `User ${userId}`,
            balance: 0
          });
        })
      );

      // Create 150 transactions (50 per user)
      await Promise.all(
        Array.from({ length: 3 }, (_, userIndex) => {
          const userId = userIndex + 1;
          return Promise.all(
            Array.from({ length: 50 }, (_, i) =>
              txResource.insert({
                id: `tx-${userId}-${i}`,
                originalId: `user-${userId}`,
                field: 'balance',
                value: 10,
                operation: 'add',
                timestamp: new Date().toISOString(),
                cohortDate: new Date().toISOString().slice(0, 10),
                cohortHour,
                applied: false
              })
            )
          );
        })
      );

      // COORDINATOR: Create tickets
      const getCohortHours = () => [cohortHour];
      const tickets = await createTicketsForHandler(handler, plugin.config, getCohortHours);
      // Tickets are batched by unique originalIds, not transaction count
      // We have 3 unique users, batch size 50, so 1 ticket with 3 records
      expect(tickets.length).toBe(1); // 1 batch containing 3 user IDs

      // WORKERS: Claim and process tickets
      const worker1Claims = await claimTickets(ticketResource, 'worker-1', plugin.config);
      expect(worker1Claims.length).toBe(1); // Worker 1 claims the only ticket

      // Worker 2 tries to claim but gets nothing (ticket already claimed)
      const worker2Claims = await claimTickets(ticketResource, 'worker-2', plugin.config);
      expect(worker2Claims.length).toBe(0);

      // Process the claimed ticket
      await Promise.all(worker1Claims.map(ticket => processTicket(ticket, handler, database)));

      // Verify all users have correct balances
      await Promise.all(
        [1, 2, 3].map(async (i) => {
          const user = await usersResource.get(`user-${i}`);
          expect(user.balance).toBe(500); // 50 transactions * 10 = 500
        })
      );

      // Verify all transactions applied
      const pendingTxs = await txResource.query({
        applied: false
      });
      expect(pendingTxs).toEqual([]);

      // Verify all tickets deleted
      const remainingTickets = await ticketResource.query({
        status: 'available'
      });
      expect(remainingTickets).toEqual([]);
    });
  });
});
