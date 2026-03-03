import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database } from '../../../src/database.class.js';
import { CoordinatorPlugin } from '../../../src/plugins/concerns/coordinator-plugin.class.js';
import { SchedulerPlugin } from '../../../src/plugins/scheduler.plugin.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

class TestCoordinatorCleanupPlugin extends CoordinatorPlugin {
  slug = 'test-coordinator-cleanup';
}

describe('Coordinator Cleanup', () => {
  let db: Database;

  beforeEach(async () => {
    db = new Database({
      connectionString: `memory://test/coordinator-cleanup/${Date.now()}-${Math.random()}`,
      logLevel: 'silent'
    });
    await db.connect();
  });

  afterEach(async () => {
    await db.disconnect();
  });

  it('should unsubscribe plugin worker on stopCoordination', async () => {
    const plugin = new TestCoordinatorCleanupPlugin({
      startupJitterMax: 0,
      skipColdStart: true,
      heartbeatInterval: 250,
      logLevel: 'silent'
    });

    await plugin.install(db);
    await plugin.startCoordination();

    const coordinator = await db.getGlobalCoordinator('default');
    expect(coordinator.subscribedPlugins.size).toBe(1);

    await plugin.stopCoordination();

    expect(coordinator.subscribedPlugins.size).toBe(0);
  });

  it('should clear scheduler timers when coordinator is demoted', async () => {
    const plugin = new SchedulerPlugin({
      logLevel: 'silent',
      jobs: {
        cleanup: {
          schedule: '@hourly',
          action: async () => {}
        }
      }
    });

    plugin.timers.set('cleanup', setTimeout(() => {}, 60_000));
    expect(plugin.timers.size).toBe(1);

    await plugin.onStopBeingCoordinator();

    expect(plugin.timers.size).toBe(0);
  });

  it('should stop ttl cron jobs when coordinator is demoted', async () => {
    const plugin = new TTLPlugin({ logLevel: 'silent' });
    const stop = vi.fn(() => true);

    plugin.cronManager = { stop } as any;
    (plugin as any)._cronJobs = ['ttl-cleanup-a', 'ttl-cleanup-b'];
    plugin.isRunning = true;

    await plugin.onStopBeingCoordinator();

    expect(stop).toHaveBeenCalledTimes(2);
    expect((plugin as any)._cronJobs).toEqual([]);
    expect(plugin.isRunning).toBe(false);
  });
});
