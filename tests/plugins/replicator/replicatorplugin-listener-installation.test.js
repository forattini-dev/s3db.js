import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { ReplicatorPlugin } from '../../../src/plugins/replicator.plugin.js';

describe('ReplicatorPlugin - listener installation', () => {
  test('installs listeners for insert, update, delete', () => {
    const resource = {
      name: 'users',
      on: jest.fn(),
      database: {}
    };
    const plugin = new ReplicatorPlugin({
      replicators: [
        { driver: 's3db', resources: ['users'] }
      ]
    });
    plugin.database = resource.database;
    plugin.installEventListeners(resource);
    
    expect(resource.on).toHaveBeenCalledWith('inserted', expect.any(Function));
    expect(resource.on).toHaveBeenCalledWith('updated', expect.any(Function));
    expect(resource.on).toHaveBeenCalledWith('deleted', expect.any(Function));
  });

  test('does not install listeners for replicator log resource', () => {
    const resource = {
      name: 'plg_replicator_logs',
      on: jest.fn(),
      database: {}
    };
    const plugin = new ReplicatorPlugin({
      replicatorLogResource: 'replicator_logs',
      replicators: [
        { driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }
      ]
    });
    plugin.database = resource.database;
    plugin.installEventListeners(resource);

    expect(resource.on).not.toHaveBeenCalled();
  });

  test('does not install listeners multiple times on same resource', () => {
    const resource = {
      name: 'users',
      on: jest.fn(),
      database: {}
    };
    const plugin = new ReplicatorPlugin({
      replicators: [
        { driver: 's3db', resources: ['users'] }
      ]
    });
    plugin.database = resource.database;
    
    plugin.installEventListeners(resource);
    plugin.installEventListeners(resource);
    
    expect(resource.on).toHaveBeenCalledTimes(3); // Once each for insert/update/delete
  });
}
