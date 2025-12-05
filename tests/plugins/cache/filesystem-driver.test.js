import { rm } from 'fs/promises';

import { FilesystemCache } from '../../../src/plugins/cache/filesystem-cache.class.js';
import { createTemporaryPathForTest } from '../../config.js';

async function createCacheDirectory(prefix) {
  return createTemporaryPathForTest(prefix);
}

describe('FilesystemCache driver', () => {
  let cache;
  let directory;

  const destroyCache = async () => {
    if (!cache) return;
    try {
      await cache.clear?.();
    } catch {
      // ignore clear failures during teardown
    }
    try {
      cache.destroy?.();
    } catch {
      // ignore destroy failures during teardown
    }
    cache = undefined;
  };

  beforeEach(async () => {
    directory = await createCacheDirectory('filesystem-cache');
  });

  afterEach(async () => {
    await destroyCache();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  const initCache = async (options = {}) => {
    cache = new FilesystemCache({ directory, enableCleanup: false, ...options });
    await cache._initPromise;
    return cache;
  };

  test('persists values to disk and retrieves them', async () => {
    const driver = await initCache();
    await driver.set('user:1', { id: 1, name: 'Jane' });

    const value = await driver.get('user:1');
    expect(value).toEqual({ id: 1, name: 'Jane' });

    const missing = await driver.get('user:missing');
    expect(missing).toBeNull();
  });

  test('supports delete and clear operations', async () => {
    const driver = await initCache();
    await driver.set('key1', 'value1');
    await driver.set('key2', 'value2');

    expect(await driver.del('key1')).toBe(true);
    expect(await driver.get('key1')).toBeNull();

    await driver.clear();
    expect(await driver.size()).toBe(0);
  });

  test('tracks statistics when enabled', async () => {
    const driver = await initCache({ enableStats: true });
    await driver.set('stats', 'value');
    await driver.get('stats'); // hit
    await driver.get('missing'); // miss

    const stats = driver.getStats();
    expect(stats.sets).toBeGreaterThan(0);
    expect(stats.hits).toBeGreaterThan(0);
    expect(stats.misses).toBeGreaterThan(0);
  });

  test('keeps statistics disabled when requested', async () => {
    const driver = await initCache({ enableStats: false });
    await driver.set('stats', 'value');
    await driver.get('stats');

    const stats = driver.getStats();
    expect(stats.sets).toBe(0);
    expect(stats.hits).toBe(0);
  });

  test('throws when directory is missing and createDirectory is disabled', async () => {
    const missingDir = await createCacheDirectory('filesystem-cache-missing');
    await rm(missingDir, { recursive: true, force: true });

    const failingCache = new FilesystemCache({
      directory: missingDir,
      createDirectory: false,
      enableCleanup: false
    });

    await failingCache._initPromise;
    await expect(failingCache.set('missing', 'value')).rejects.toThrow(/createDirectory/i);
  });
});
