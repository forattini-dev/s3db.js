import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { EventualConsistencyPlugin } from '../../../src/plugins/eventual-consistency/index.js';
import { createDatabaseForTest } from '../../config.js';
import tryFn from '../../../src/concerns/try-fn.js';
import { sleep } from './helpers.js';

describe('EventualConsistencyPlugin - Utils Coverage', () => {
  let database;
  let urls;
  let plugin;

  beforeEach(async () => {
    database = createDatabaseForTest('eventual-consistency-utils-coverage');
    await database.connect();
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  it('should handle timezone offset calculation', async () => {
    urls = await database.createResource({
      name: 'urls',
      attributes: {
        id: 'string|optional',
        clicks: 'number|default:0'
      }
    });

    // Test with various timezones
    plugin = new EventualConsistencyPlugin({
      resources: { urls: ['clicks'] },
      cohort: { timezone: 'America/Sao_Paulo' }
    });

    await database.usePlugin(plugin);

    const cohortInfo = plugin.getCohortInfo(new Date());
    expect(cohortInfo).toBeDefined();
    expect(cohortInfo.date).toBeDefined();
    expect(cohortInfo.hour).toBeDefined();
    expect(cohortInfo.month).toBeDefined();
  });

});
