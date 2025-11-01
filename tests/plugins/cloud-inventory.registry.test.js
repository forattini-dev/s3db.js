import { describe, test, expect } from '@jest/globals';
import {
  registerCloudDriver,
  createCloudDriver,
  listCloudDrivers,
  BaseCloudDriver
} from '../../src/plugins/cloud-inventory/index.js';

describe('Cloud Inventory driver registry', () => {
  test('does not expose legacy mock driver aliases', () => {
    const drivers = listCloudDrivers();
    expect(drivers).not.toContain('aws-mock');
    expect(drivers).not.toContain('gcp-mock');
    expect(drivers).not.toContain('azure-mock');
  });

  test('registerCloudDriver accepts custom drivers', () => {
    class FixtureDriver extends BaseCloudDriver {
      async listResources() {
        return [{ provider: 'fixture', resourceId: 'fixture-1' }];
      }
    }

    const driverName = `fixture-${Date.now()}`;
    registerCloudDriver(driverName, (options = {}) => new FixtureDriver(options));

    const drivers = listCloudDrivers();
    expect(drivers).toContain(driverName);

    const driver = createCloudDriver(driverName, { config: { foo: 'bar' } });
    expect(driver).toBeInstanceOf(FixtureDriver);
  });
});
