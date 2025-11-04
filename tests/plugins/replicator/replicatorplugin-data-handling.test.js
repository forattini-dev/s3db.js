import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { ReplicatorPlugin } from '../../../src/plugins/replicator.plugin.js';

describe('ReplicatorPlugin - data handling', () => {
  test('filters internal fields from data', () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const data = {
      id: '123',
      name: 'test',
      _internal: 'hidden',
      $overflow: 'hidden'
    };

    const filtered = plugin.filterInternalFields(data);
    expect(filtered).toEqual({
      id: '123',
      name: 'test'
    });
  });

  test('processReplicatorEvent sanitizes payload before invoking replicator', async () => {
    const plugin = new ReplicatorPlugin({
      replicators: [{ driver: 's3db', config: { connectionString: 's3://test' }, resources: { users: 'users' } }]
    });

    const replicator = {
      name: 'test-replicator',
      shouldReplicateResource: jest.fn().mockReturnValue(true),
      replicate: jest.fn().mockResolvedValue({ success: true })
    };

    plugin.replicators = [replicator];

    await plugin.processReplicatorEvent('insert', 'users', '1', {
      id: '1',
      _internal: 'ignore'
    });

    expect(replicator.replicate).toHaveBeenCalledWith(
      'users',
      'insert',
      { id: '1' },
      '1',
      null
    );
  });
}
