import { S3QueuePlugin } from '../../../src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '../../config.js';

describe('S3QueuePlugin - Metadata & Custom Partitions', () => {
  let database;
  let resource;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=plugins/queue-metadata');
    await database.connect();

    resource = await database.createResource({
      name: 'notifications',
      attributes: {
        id: 'string|optional',
        to: 'string|required',
        message: 'string|required',
        clientId: 'string|required'
      }
    });
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.stop();
    }
    if (database) {
      await database.disconnect();
    }
  });

  describe('with metadata and custom partitions', () => {
    beforeEach(async () => {
      plugin = new S3QueuePlugin({
        logLevel: 'silent',
        resource: 'notifications',
        autoStart: false,
        metadata: {
          clientId: 'string|required',
          priority: 'string|optional'
        },
        partitions: {
          byClient: { fields: { clientId: 'string' } },
          byStatusAndClient: { fields: { status: 'string', clientId: 'string' } }
        }
      });

      await plugin.install(database);
    });

    test('should create queue resource with custom metadata attributes', async () => {
      const queueResource = database.resources['notifications_queue'];
      expect(queueResource).toBeDefined();

      const entry = await resource.enqueue(
        { to: 'user@example.com', message: 'Hello', clientId: 'acme' },
        { metadata: { clientId: 'acme', priority: 'high' } }
      );

      expect(entry.id).toBeDefined();

      const queueEntries = await queueResource.list();
      expect(queueEntries.length).toBe(1);
      expect(queueEntries[0].clientId).toBe('acme');
      expect(queueEntries[0].priority).toBe('high');
      expect(queueEntries[0].status).toBe('pending');
    });

    test('should enqueue with metadata and query by custom partition', async () => {
      await resource.enqueue(
        { to: 'a@acme.com', message: 'Msg 1', clientId: 'acme' },
        { metadata: { clientId: 'acme' } }
      );
      await resource.enqueue(
        { to: 'b@acme.com', message: 'Msg 2', clientId: 'acme' },
        { metadata: { clientId: 'acme' } }
      );
      await resource.enqueue(
        { to: 'c@globex.com', message: 'Msg 3', clientId: 'globex' },
        { metadata: { clientId: 'globex' } }
      );

      const queueResource = database.resources['notifications_queue'];

      const acmeMessages = await queueResource.query({ clientId: 'acme' });
      expect(acmeMessages.length).toBe(2);

      const globexMessages = await queueResource.query({ clientId: 'globex' });
      expect(globexMessages.length).toBe(1);
    });

    test('should count messages by custom partition', async () => {
      await resource.enqueue(
        { to: 'a@acme.com', message: 'Msg 1', clientId: 'acme' },
        { metadata: { clientId: 'acme' } }
      );
      await resource.enqueue(
        { to: 'b@acme.com', message: 'Msg 2', clientId: 'acme' },
        { metadata: { clientId: 'acme' } }
      );
      await resource.enqueue(
        { to: 'c@globex.com', message: 'Msg 3', clientId: 'globex' },
        { metadata: { clientId: 'globex' } }
      );

      const acmeCount = await resource.countQueueBy({ clientId: 'acme' });
      expect(acmeCount).toBe(2);

      const globexCount = await resource.countQueueBy({ clientId: 'globex' });
      expect(globexCount).toBe(1);
    });

    test('should get stats by custom filter (queueStatsBy)', async () => {
      await resource.enqueue(
        { to: 'a@acme.com', message: 'Msg 1', clientId: 'acme' },
        { metadata: { clientId: 'acme' } }
      );
      await resource.enqueue(
        { to: 'b@acme.com', message: 'Msg 2', clientId: 'acme' },
        { metadata: { clientId: 'acme' } }
      );
      await resource.enqueue(
        { to: 'c@globex.com', message: 'Msg 3', clientId: 'globex' },
        { metadata: { clientId: 'globex' } }
      );

      const acmeStats = await resource.queueStatsBy({ clientId: 'acme' });
      expect(acmeStats.pending).toBe(2);
      expect(acmeStats.processing).toBe(0);
      expect(acmeStats.completed).toBe(0);
      expect(acmeStats.total).toBe(2);

      const globexStats = await resource.queueStatsBy({ clientId: 'globex' });
      expect(globexStats.pending).toBe(1);
      expect(globexStats.total).toBe(1);
    });

    test('should query by composite partition (status + clientId)', async () => {
      await resource.enqueue(
        { to: 'a@acme.com', message: 'Msg 1', clientId: 'acme' },
        { metadata: { clientId: 'acme' } }
      );
      await resource.enqueue(
        { to: 'b@globex.com', message: 'Msg 2', clientId: 'globex' },
        { metadata: { clientId: 'globex' } }
      );

      const queueResource = database.resources['notifications_queue'];

      const pendingAcme = await queueResource.query({ status: 'pending', clientId: 'acme' });
      expect(pendingAcme.length).toBe(1);
      expect(pendingAcme[0].clientId).toBe('acme');

      const pendingGlobex = await queueResource.query({ status: 'pending', clientId: 'globex' });
      expect(pendingGlobex.length).toBe(1);
      expect(pendingGlobex[0].clientId).toBe('globex');
    });

    test('should support countQueue (existing API) alongside new methods', async () => {
      await resource.enqueue(
        { to: 'a@acme.com', message: 'Msg 1', clientId: 'acme' },
        { metadata: { clientId: 'acme' } }
      );

      const pendingCount = await resource.countQueue('pending');
      expect(pendingCount).toBe(1);

      const byClientCount = await resource.countQueueBy({ clientId: 'acme' });
      expect(byClientCount).toBe(1);
    });
  });

  describe('without custom metadata (backwards compatibility)', () => {
    beforeEach(async () => {
      plugin = new S3QueuePlugin({
        logLevel: 'silent',
        resource: 'notifications',
        autoStart: false
      });

      await plugin.install(database);
    });

    test('should work with default partitions only', async () => {
      await resource.enqueue({ to: 'user@example.com', message: 'Hello', clientId: 'acme' });

      const queueResource = database.resources['notifications_queue'];
      const entries = await queueResource.list();
      expect(entries.length).toBe(1);
      expect(entries[0].status).toBe('pending');
    });

    test('should count by status without custom partitions', async () => {
      await resource.enqueue({ to: 'user@example.com', message: 'Hello', clientId: 'acme' });

      const count = await resource.countQueue('pending');
      expect(count).toBe(1);
    });
  });
});
