import { S3QueuePlugin } from '../../../src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '../../config.js';

describe('S3QueuePlugin - Process Messages', () => {
  let database;
  let resource;
  let plugin;

  beforeEach(async () => {
    database = await createDatabaseForTest('suite=plugins/transactions');
    await database.connect();

    resource = await database.createResource({
      name: 'emails',
      attributes: {
        id: 'string|optional',
        to: 'string|required',
        subject: 'string',
        body: 'string'
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

  beforeEach(async () => {
    plugin = new S3QueuePlugin({
      logLevel: 'silent',
      resource: 'emails',
      autoStart: false,
      pollInterval: 100,  // Fast polling for tests
      visibilityTimeout: 5000
    });

    await plugin.install(database);
  });

  test('should process a message', async () => {
    const processed = [];

    await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    // Start processing
    await resource.startProcessing(async (email) => {
      processed.push(email);
      return { sent: true };
    }, { concurrency: 1 });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 500));

    // Stop processing
    await resource.stopProcessing();

    expect(processed.length).toBe(1);
    expect(processed[0].to).toBe('user@example.com');

    // Check queue entry is completed
    const queueResource = database.resources['emails_queue'];
    const queueEntries = await queueResource.list();

    const completed = queueEntries.filter(e => e.status === 'completed');
    expect(completed.length).toBe(1);
  });

  test('should process multiple messages', async () => {
    const processed = [];

    await resource.enqueue({ to: 'user1@example.com', subject: 'Test 1', body: 'Body 1' });
    await resource.enqueue({ to: 'user2@example.com', subject: 'Test 2', body: 'Body 2' });
    await resource.enqueue({ to: 'user3@example.com', subject: 'Test 3', body: 'Body 3' });

    await resource.startProcessing(async (email) => {
      processed.push(email);
      return { sent: true };
    }, { concurrency: 1 });

    // Wait for processing (increased to ensure all 3 messages are processed)
    await new Promise(resolve => setTimeout(resolve, 2000));

    await resource.stopProcessing();

    expect(processed.length).toBe(3);
  });

  test('should emit completed event', async () => {
    const events = [];

    plugin.on('plg:s3-queue:message-completed', (event) => {
      events.push(event);
    });

    await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    await resource.startProcessing(async (email) => {
      return { sent: true };
    }, { concurrency: 1 });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 500));

    await resource.stopProcessing();

    expect(events.length).toBe(1);
    expect(events[0].queueId).toBeDefined();
    expect(events[0].duration).toBeGreaterThanOrEqual(0);
  });

  test('should call onComplete callback', async () => {
    let completeCalled = false;
    let completeRecord = null;
    let completeResult = null;

    plugin.config.onComplete = (record, result) => {
      completeCalled = true;
      completeRecord = record;
      completeResult = result;
    };

    await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    await resource.startProcessing(async (email) => {
      return { sent: true };
    }, { concurrency: 1 });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 500));

    await resource.stopProcessing();

    expect(completeCalled).toBe(true);
    expect(completeRecord.to).toBe('user@example.com');
    expect(completeResult.sent).toBe(true);
  });
});
