import { describe, expect, test } from '@jest/globals';

import { CachePlugin } from '../../../../src/plugins/cache.plugin.js';
import { PartitionAwareFilesystemCache } from '../../../../src/plugins/cache/index.js';
import { setupPartitionAwareCacheSuite } from '../helpers.js';

describe('Cache Plugin - PartitionAwareFilesystemCache - Driver Setup and Configuration', () => {
  const ctx = setupPartitionAwareCacheSuite({ createResource: false });

  test('installs partition-aware filesystem driver with configured directory', () => {
    expect(ctx.cachePlugin.driver).toBeInstanceOf(PartitionAwareFilesystemCache);
    expect(ctx.cachePlugin.driver.directory).toBe(ctx.directory);
    expect(ctx.cachePlugin.database).toBe(ctx.db);
  });

  test('allows overriding driver options during install', async () => {
    const plugin = new CachePlugin({
      driver: 'filesystem',
      partitionAware: true,
      partitionStrategy: 'temporal',
      config: {
        directory: ctx.directory,
        enableStats: true
      }
    });

    await plugin.install(ctx.db);

    expect(plugin.driver.partitionStrategy).toBe('temporal');
    expect(plugin.driver.enableStats).toBe(true);
  });
});
