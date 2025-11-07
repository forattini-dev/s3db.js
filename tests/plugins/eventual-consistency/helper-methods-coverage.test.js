import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Helper Methods Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-helper-methods-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should throw error when consolidate without field parameter', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: { urls: ['clicks'] }
    });

    await database.usePlugin(plugin);

    await expect(
      urls.consolidate('url1') // Missing field parameter
    ).rejects.toThrow('Field parameter is required');
  });

  it('should throw error when field not found', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    plugin = new EventualConsistencyPlugin({
      verbose: false,
      resources: { urls: ['clicks'] }
    });

    await database.usePlugin(plugin);

    await expect(
      urls.consolidate('url1', 'invalidfield')
    ).rejects.toThrow('No eventual consistency plugin found');
  });

});
