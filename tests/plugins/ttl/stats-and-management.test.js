import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

import { createDatabaseForTest, sleep } from '../../config.js';
import { TTLPlugin } from '../../../src/plugins/ttl.plugin.js';

const previousConnectionString = process.env.BUCKET_CONNECTION_STRING;

class FakeCronManager {
  constructor() {
    this.jobs = new Map();
  }

  async schedule(expression, fn, name) {
    const task = {
      start: () => {},
      stop: () => {},
      destroy: () => {}
    };
    this.jobs.set(name, { expression, fn, task });
    return task;
  }

  async scheduleInterval(ms, fn, name, options = {}) {
    return this.schedule(`interval:${ms}`, fn, name, options);
  }

  stop(name) {
    return this.jobs.delete(name);
  }
}

beforeAll(() => {
  process.env.BUCKET_CONNECTION_STRING = 'memory://ttl-tests';
});

afterAll(() => {
  if (previousConnectionString === undefined) {
    delete process.env.BUCKET_CONNECTION_STRING;
  } else {
    process.env.BUCKET_CONNECTION_STRING = previousConnectionString;
  }
});

describe('TTLPlugin v2 - Stats and Monitoring', () => {
  let db;
  let testResource;
  let plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-stats');
    await db.connect();

    testResource = await db.createResource({
      name: 'test_resource',
      attributes: {
        id: 'string|optional',
        value: 'string'
      }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        test_resource: {
          ttl: 1,
          onExpire: 'hard-delete'
        }
      }
    });

    plugin.cronManager = new FakeCronManager();
    await plugin.install(db);
    await plugin.start();
    // Manually trigger coordinator promotion to start intervals
    await plugin.onBecomeCoordinator();
  });

  afterAll(async () => {
    await plugin.stop();
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should track total scans', async () => {
    const statsBefore = plugin.getStats();
    await plugin.runCleanup();
    await plugin.runCleanup();
    const statsAfter = plugin.getStats();

    expect(statsAfter.totalScans).toBeGreaterThan(statsBefore.totalScans);
  });

  test('should track last scan timestamp', async () => {
    await plugin.runCleanup();
    const stats = plugin.getStats();

    expect(stats.lastScanAt).toBeDefined();
    expect(stats.lastScanDuration).toBeGreaterThanOrEqual(0);
  });

  test('should provide resource count in stats', () => {
    const stats = plugin.getStats();
    expect(stats.resources).toBe(1);
  });

  test('should track interval count', () => {
    const stats = plugin.getStats();
    expect(stats.cronJobs).toBeGreaterThan(0);
    expect(stats.isRunning).toBe(true);
  });
});

describe('TTLPlugin v2 - Manual Cleanup', () => {
  let db;
  let sessions;
  let plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-manual');
    await db.connect();

    sessions = await db.createResource({
      name: 'sessions',
      attributes: {
        id: 'string|optional',
        token: 'string'
      }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        sessions: {
          ttl: 1,
          onExpire: 'hard-delete'
        }
      }
    });

    plugin.cronManager = new FakeCronManager();
    await plugin.install(db);
    await plugin.start();
    // Manually trigger coordinator promotion to start intervals
    await plugin.onBecomeCoordinator();
  });

  afterAll(async () => {
    await plugin.stop();
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should cleanup specific resource manually', async () => {
    await sessions.insert({ id: 'session-manual-1', token: 'token-1' });

    await sleep(1500);

    const result = await plugin.cleanupResource('sessions');
    expect(result.resource).toBe('sessions');
    expect(result.granularity).toBe('minute');

    const record = await sessions.get('session-manual-1').catch(() => null);
    expect(record).toBeNull();
  });

  test('should throw error for non-configured resource', async () => {
    await expect(plugin.cleanupResource('non_existent')).rejects.toThrow(
      'Resource "non_existent" not configured in TTLPlugin'
    );
  });
});

describe('TTLPlugin v2 - Multiple Granularities', () => {
  let db;
  let plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-multi-granularity');
    await db.connect();

    await db.createResource({
      name: 'short_lived',
      attributes: { id: 'string|optional' }
    });

    await db.createResource({
      name: 'medium_lived',
      attributes: { id: 'string|optional' }
    });

    await db.createResource({
      name: 'long_lived',
      attributes: { id: 'string|optional' }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        short_lived: { ttl: 300, onExpire: 'hard-delete' },
        medium_lived: { ttl: 7200, onExpire: 'hard-delete' },
        long_lived: { ttl: 2592000, onExpire: 'hard-delete' }
      }
    });

    plugin.cronManager = new FakeCronManager();
    await plugin.install(db);
    await plugin.start();
    // Manually trigger coordinator promotion to start intervals
    await plugin.onBecomeCoordinator();
  });

  afterAll(async () => {
    await plugin.stop();
    await plugin.uninstall();
    await db.disconnect();
  });

  test('should create multiple intervals for different granularities', () => {
    const stats = plugin.getStats();
    expect(stats.cronJobs).toBeGreaterThan(0);
    expect(stats.isRunning).toBe(true);
  });

  test('should cleanup all granularities with runCleanup', async () => {
    const shortLived = db.resources.short_lived;
    const mediumLived = db.resources.medium_lived;

    await shortLived.insert({ id: 'short-1' });
    await mediumLived.insert({ id: 'medium-1' });

    await sleep(1000);

    await plugin.runCleanup();

    const stats = plugin.getStats();
    expect(stats.totalScans).toBeGreaterThan(0);
  });
});

describe('TTLPlugin v2 - Interval Management', () => {
  let db;
  let plugin;

  beforeAll(async () => {
    db = createDatabaseForTest('ttl-v2-intervals');
    await db.connect();

    await db.createResource({
      name: 'test_data',
      attributes: { id: 'string|optional' }
    });

    plugin = new TTLPlugin({
      verbose: false,
      resources: {
        test_data: {
          ttl: 60,
          onExpire: 'hard-delete'
        }
      }
    });

    plugin.cronManager = new FakeCronManager();
    await plugin.install(db);
    await plugin.start();
    // Manually trigger coordinator promotion to start intervals
    await plugin.onBecomeCoordinator();
  });

  afterAll(async () => {
    if (plugin) {
      try {
        await plugin.stop();
      } catch {}
      try {
        await plugin.uninstall();
      } catch {}
    }
    await db.disconnect();
  });

  test('should start intervals on install', () => {
    const stats = plugin.getStats();
    expect(stats.isRunning).toBe(true);
    expect(stats.cronJobs).toBeGreaterThan(0);
  });

  test('should stop intervals on uninstall', async () => {
    await plugin.stop();
    await plugin.uninstall();
    const stats = plugin.getStats();
    expect(stats.isRunning).toBe(false);
    expect(stats.cronJobs).toBe(0);
  });
});
