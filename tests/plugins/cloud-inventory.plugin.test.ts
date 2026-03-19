import { createMemoryDatabaseForTest } from '../config.js';
import { CloudInventoryPlugin } from '../../src/plugins/cloud-inventory.plugin.js';
import { registerCloudDriver, BaseCloudDriver } from '../../src/plugins/cloud-inventory/index.js';

describe('CloudInventoryPlugin', () => {
  test('creates clouds summary resource as body-only', async () => {
    class FixtureCloudDriver extends BaseCloudDriver {
      async *listResources() {
        return;
      }
    }

    const driverName = `fixture-cloud-${Date.now()}`;
    registerCloudDriver(driverName, (options = {}) => new FixtureCloudDriver({
      driver: driverName,
      ...options
    }));

    const database = createMemoryDatabaseForTest('suite=plugins/cloud-inventory');

    const plugin = new CloudInventoryPlugin({
      logLevel: 'silent',
      discovery: {
        runOnInstall: false
      },
      clouds: [
        {
          id: 'fixture-cloud',
          driver: driverName,
          credentials: {}
        }
      ]
    });

    await plugin.install(database);

    expect(database.resources[plugin.internalResourceNames.clouds].behavior).toBe('body-only');

    await plugin.stop();
    await database.disconnect();
  });
});
