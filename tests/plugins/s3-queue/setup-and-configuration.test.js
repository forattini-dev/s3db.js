import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { S3QueuePlugin } from '../../../src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '../../config.js';

describe('S3QueuePlugin - Setup and Configuration', () => {
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

  test('should require resource option', () => {
    expect(() => {
      new S3QueuePlugin({});
    }).toThrow('S3QueuePlugin requires "resource" option');
  });

  test('should setup queue resource', async () => {
    plugin = new S3QueuePlugin({
      verbose: false,
      resource: 'emails',
      autoStart: false
    });

    await plugin.install(database);

    // Check that queue resource was created (now has plugin prefix)
    const queueResource = database.resources['plg_s3queue_emails_queue'];
    expect(queueResource).toBeDefined();
    expect(queueResource.name).toBe('plg_s3queue_emails_queue');
  });

  test('should add helper methods to target resource', async () => {
    plugin = new S3QueuePlugin({
      verbose: false,
      resource: 'emails',
      autoStart: false
    });

    await plugin.install(database);

    expect(typeof resource.enqueue).toBe('function');
    expect(typeof resource.queueStats).toBe('function');
    expect(typeof resource.startProcessing).toBe('function');
    expect(typeof resource.stopProcessing).toBe('function');
  });

  test('should throw error if target resource not found', async () => {
    plugin = new S3QueuePlugin({
      verbose: false,
      resource: 'nonexistent',
      autoStart: false
    });

    await expect(plugin.install(database)).rejects.toThrow(
      "Resource 'nonexistent' not found"
    );
  });
});
