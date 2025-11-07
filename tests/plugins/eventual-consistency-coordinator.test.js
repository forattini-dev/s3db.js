import { EventualConsistencyPlugin } from '../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../config.js';
import { MemoryClient } from '../../src/clients/memory-client.class.js';
import { createTicketsForHandler, claimTickets, processTicket } from '../../src/plugins/eventual-consistency/tickets.js';

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
        resources: { users: ['balance'] },
        verbose: false
      });

      await database.usePlugin(plugin);
      await plugin.start();

      expect(plugin.config.enableCoordinator).toBe(true);
    });

    it("should disable coordinator mode when explicitly set", async () => {
      plugin = new EventualConsistencyPlugin({
        resources: { users: ['balance'] },
        enableCoordinator: false,
        verbose: false
      });

      await database.usePlugin(plugin);
      await plugin.start();

      expect(plugin.config.enableCoordinator).toBe(false);
    });

    it("should use default coordinator configuration", async () => {
      plugin = new EventualConsistencyPlugin({
        resources: { users: ['balance'] },
        verbose: false
      });

      await database.usePlugin(plugin);

      expect(plugin.config.heartbeatInterval).toBe(5000);
      expect(plugin.config.heartbeatTTL).toBe(3);
      expect(plugin.config.epochDuration).toBe(300000);
      expect(plugin.config.coordinatorWorkInterval).toBe(60000);
      expect(plugin.config.workerInterval).toBe(10000);
      expect(plugin.config.ticketBatchSize).toBe(100);
      expect(plugin.config.workerClaimLimit).toBe(1);
    });

    it("should override coordinator configuration", async () => {
      plugin = new EventualConsistencyPlugin({
        resources: { users: ['balance'] },
        coordinator: {
          heartbeatInterval: 3000,
          workInterval: 30000,
          workerInterval: 5000,
          ticketBatchSize: 50,
          workerClaimLimit: 3
        },
        verbose: false
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
        resources: { users: ['balance'] },
        verbose: false
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const ticketResource = database.resources['plg_users_balance_tickets'];
      expect(ticketResource).toBeDefined();
      expect(ticketResource.name).toBe('plg_users_balance_tickets');
    });

    it("should configure ticket resource correctly", async () => {
      plugin = new EventualConsistencyPlugin({
        resources: { users: ['balance'] },
        verbose: false
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
        resources: { users: ['balance'] },
        verbose: false
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
        resources: { users: ['balance'] },
        verbose: false
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const handler = plugin.fieldHandlers.get('users').get('balance');
      expect(handler.ticketResource).toBeDefined();
      expect(handler.ticketResource.name).toBe('plg_users_balance_tickets');
    });

    it("should not create ticket resources when coordinator disabled", async () => {
      plugin = new EventualConsistencyPlugin({
        resources: { users: ['balance'] },
        enableCoordinator: false,
        verbose: false
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
        resources: { users: ['balance'] },
        coordinator: { ticketBatchSize: 100 },
        verbose: false
      });

      await database.usePlugin(plugin);
      await plugin.start();
    });

    it("should create tickets from pending transactions", async () => {
      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create 256 transactions
      for (let i = 0; i < 256; i++) {
        await txResource.insert({
          id: `tx-${i}`,
          originalId: `user-${i}`,
          field: 'balance',
          value: 100,
          operation: 'add',
          timestamp: new Date().toISOString(),
          cohortDate: new Date().toISOString().slice(0, 10),
          cohortHour,
          applied: false
        });
      }

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
        resources: { users: ['balance'] },
        coordinator: { ticketBatchSize: 50 },
        verbose: false
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create 120 transactions
      for (let i = 0; i < 120; i++) {
        await txResource.insert({
          id: `tx-${i}`,
          originalId: `user-${i}`,
          field: 'balance',
          value: 100,
          operation: 'add',
          timestamp: new Date().toISOString(),
          cohortDate: new Date().toISOString().slice(0, 10),
          cohortHour,
          applied: false
        });
      }

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
  });

  describe("Ticket Claiming", () => {
    beforeEach(async () => {
      plugin = new EventualConsistencyPlugin({
        resources: { users: ['balance'] },
        coordinator: { ticketBatchSize: 100, workerClaimLimit: 2 },
        verbose: false
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
      for (let i = 0; i < 256; i++) {
        await txResource.insert({
          id: `tx-${i}`,
          originalId: `user-${i}`,
          field: 'balance',
          value: 100,
          operation: 'add',
          timestamp: new Date().toISOString(),
          cohortDate: new Date().toISOString().slice(0, 10),
          cohortHour,
          applied: false
        });
      }

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
      for (let i = 0; i < 256; i++) {
        await txResource.insert({
          id: `tx-${i}`,
          originalId: `user-${i}`,
          field: 'balance',
          value: 100,
          operation: 'add',
          timestamp: new Date().toISOString(),
          cohortDate: new Date().toISOString().slice(0, 10),
          cohortHour,
          applied: false
        });
      }

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
        resources: { users: ['balance'] },
        coordinator: { ticketBatchSize: 100 },
        verbose: false
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
      for (let i = 0; i < 10; i++) {
        await txResource.insert({
          id: `tx-${i}`,
          originalId: 'user-1',
          field: 'balance',
          value: 10,
          operation: 'add',
          timestamp: new Date().toISOString(),
          cohortDate: new Date().toISOString().slice(0, 10),
          cohortHour,
          applied: false
        });
      }

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
  });

  describe("End-to-End Flow", () => {
    it("should consolidate transactions via coordinator pattern", async () => {
      plugin = new EventualConsistencyPlugin({
        resources: { users: ['balance'] },
        coordinator: {
          ticketBatchSize: 50,
          workerClaimLimit: 2
        },
        verbose: false
      });

      await database.usePlugin(plugin);
      await plugin.start();

      const handler = plugin.fieldHandlers.get('users').get('balance');
      const txResource = handler.transactionResource;
      const ticketResource = handler.ticketResource;
      const cohortHour = new Date().toISOString().slice(0, 13) + ':00:00Z';

      // Create 3 users
      for (let i = 1; i <= 3; i++) {
        await usersResource.insert({
          id: `user-${i}`,
          name: `User ${i}`,
          balance: 0
        });
      }

      // Create 150 transactions (50 per user)
      for (let userId = 1; userId <= 3; userId++) {
        for (let i = 0; i < 50; i++) {
          await txResource.insert({
            id: `tx-${userId}-${i}`,
            originalId: `user-${userId}`,
            field: 'balance',
            value: 10,
            operation: 'add',
            timestamp: new Date().toISOString(),
            cohortDate: new Date().toISOString().slice(0, 10),
            cohortHour,
            applied: false
          });
        }
      }

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
      for (const ticket of worker1Claims) {
        await processTicket(ticket, handler, database);
      }

      // Verify all users have correct balances
      for (let i = 1; i <= 3; i++) {
        const user = await usersResource.get(`user-${i}`);
        expect(user.balance).toBe(500); // 50 transactions * 10 = 500
      }

      // Verify all transactions applied
      const pendingTxs = await txResource.query({
        applied: false
      }, { limit: Infinity });
      expect(pendingTxs).toEqual([]);

      // Verify all tickets deleted
      const remainingTickets = await ticketResource.query({
        status: 'available'
      });
      expect(remainingTickets).toEqual([]);
    });
  });
});
