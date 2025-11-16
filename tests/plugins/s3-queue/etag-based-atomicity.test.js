import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { S3QueuePlugin } from '../../../src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '../../config.js';

describe('S3QueuePlugin - ETag-based Atomicity', () => {
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
      pollInterval: 10  // Very fast polling
    });

    await plugin.install(database);
  });

  test('should expose _etag field', async () => {
    const email = await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    const queueResource = database.resources['emails_queue'];
    const queueEntries = await queueResource.list();

    expect(queueEntries[0]._etag).toBeDefined();
    expect(typeof queueEntries[0]._etag).toBe('string');
  });

  test('updateConditional should succeed with correct ETag', async () => {
    const email = await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    const queueResource = database.resources['emails_queue'];
    const queueEntry = await queueResource.get(
      (await queueResource.list())[0].id
    );

    const result = await queueResource.updateConditional(
      queueEntry.id,
      { status: 'processing' },
      { ifMatch: queueEntry._etag }
    );

    expect(result.success).toBe(true);
    expect(result.etag).toBeDefined();
  });

  test('updateConditional should fail with wrong ETag', async () => {
    const email = await resource.enqueue({ to: 'user@example.com', subject: 'Test', body: 'Body' });

    const queueResource = database.resources['emails_queue'];
    const queueEntry = await queueResource.get(
      (await queueResource.list())[0].id
    );

    const result = await queueResource.updateConditional(
      queueEntry.id,
      { status: 'processing' },
      { ifMatch: '"wrong-etag"' }
    );

    expect(result.success).toBe(false);
    // Can be either "ETag mismatch" or "PreconditionFailed" depending on S3 implementation
    expect(result.error).toMatch(/ETag mismatch|PreconditionFailed|pre-conditions/i);
  });
});
