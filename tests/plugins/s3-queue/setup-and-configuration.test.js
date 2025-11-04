import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { S3QueuePlugin } from '../../../src/plugins/s3-queue.plugin.js';
import { createDatabaseForTest } from '../../config.js';

describe.skip('S3QueuePlugin - Setup and Configuration', () => {
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
      resource: 'emails',
      autoStart: false
    });

    await plugin.install(database);

    // Check that queue resource was created
    const queueResource = database.resources['emails_queue'];
    expect(queueResource).toBeDefined();
    expect(queueResource.name).toBe('emails_queue');
  });

  test('should add helper methods to target resource', async () => {
    plugin = new S3QueuePlugin({
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
      resource: 'nonexistent',
      autoStart: false
    });

    await expect(plugin.install(database)).rejects.toThrow(
      "S3QueuePlugin: resource 'nonexistent' not found"
    );
  });
});
