import { rm } from 'fs/promises';

import { FilesystemCache } from '../../../src/plugins/cache/filesystem-cache.class.js';
import { createTemporaryPathForTest } from '../../config.js';

async function createCacheDirectory(prefix) {
  return createTemporaryPathForTest(prefix);
}

describe('FilesystemCache maxBytes eviction', () => {
  let cache;
  let directory;

  const destroyCache = async () => {
    if (!cache) return;
    try {
      await cache.clear?.();
    } catch {
      // ignore
    }
    try {
      cache.destroy?.();
    } catch {
      // ignore
    }
    cache = undefined;
  };

  beforeEach(async () => {
    directory = await createCacheDirectory('fs-maxbytes');
  });

  afterEach(async () => {
    await destroyCache();
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  const initCache = async (options = {}) => {
    cache = new FilesystemCache({
      directory,
      enableCleanup: false,
      enableCompression: false,
      enableMetadata: true,
      ...options
    });
    await cache._initPromise;
    return cache;
  };

  const bigPayload = (sizeApprox: number) => {
    return 'x'.repeat(sizeApprox);
  };

  test('basic enforcement — evicts entries when maxBytes exceeded', async () => {
    const driver = await initCache({ maxBytes: 2000 });

    await driver.set('k1', bigPayload(400));
    await driver.set('k2', bigPayload(400));
    await driver.set('k3', bigPayload(400));

    const keysBefore = await driver.keys();
    expect(keysBefore.length).toBe(3);
    expect(driver.currentBytes).toBeGreaterThan(0);
    expect(driver.currentBytes).toBeLessThanOrEqual(2000);

    await driver.set('k4', bigPayload(800));

    const keysAfter = await driver.keys();
    expect(driver.currentBytes).toBeLessThanOrEqual(2000);
    expect(keysAfter.length).toBeLessThan(keysBefore.length + 1);
    expect(driver.evictedDueToSize).toBeGreaterThan(0);
  });

  test('LRU order — recently accessed entries are kept', async () => {
    const driver = await initCache({ maxBytes: 3000, evictionPolicy: 'lru' });

    await driver.set('a', bigPayload(400));
    await driver.set('b', bigPayload(400));
    await driver.set('c', bigPayload(400));

    await driver.get('a');

    await driver.set('d', bigPayload(1200));

    const keys = await driver.keys();
    expect(keys).toContain('a');
    expect(keys).not.toContain('b');
  });

  test('FIFO order — oldest entry evicted first', async () => {
    const driver = await initCache({ maxBytes: 3000, evictionPolicy: 'fifo' });

    await driver.set('first', bigPayload(400));
    await driver.set('second', bigPayload(400));
    await driver.set('third', bigPayload(400));

    await driver.get('first');

    await driver.set('fourth', bigPayload(1200));

    const keys = await driver.keys();
    expect(keys).not.toContain('first');
    expect(keys).toContain('third');
  });

  test('entry too large for cache — silent skip', async () => {
    const driver = await initCache({ maxBytes: 500 });

    await driver.set('huge', bigPayload(5000));

    const value = await driver.get('huge');
    expect(value).toBeNull();
    expect(driver.currentBytes).toBe(0);
  });

  test('size decreases after delete', async () => {
    const driver = await initCache({ maxBytes: 10000 });

    await driver.set('x', bigPayload(200));
    const bytesAfterSet = driver.currentBytes;
    expect(bytesAfterSet).toBeGreaterThan(0);

    await driver.del('x');
    expect(driver.currentBytes).toBe(0);
  });

  test('size resets after clear', async () => {
    const driver = await initCache({ maxBytes: 10000 });

    await driver.set('a', bigPayload(200));
    await driver.set('b', bigPayload(200));
    expect(driver.currentBytes).toBeGreaterThan(0);

    await driver.clear();
    expect(driver.currentBytes).toBe(0);
    expect(driver._sizeIndex.size).toBe(0);
  });

  test('rebuild on init — picks up existing files', async () => {
    const driver1 = await initCache({ maxBytes: 10000 });
    await driver1.set('persist1', bigPayload(200));
    await driver1.set('persist2', bigPayload(200));
    const bytesDriver1 = driver1.currentBytes;
    driver1.destroy();

    const driver2 = new FilesystemCache({
      directory,
      enableCleanup: false,
      enableCompression: false,
      enableMetadata: true,
      maxBytes: 10000
    });
    await driver2._initPromise;
    cache = driver2;

    expect(driver2.currentBytes).toBe(bytesDriver1);
    expect(driver2._sizeIndex.size).toBe(2);
  });

  test('getStats returns currentBytes, maxBytes, evictedDueToSize', async () => {
    const driver = await initCache({ maxBytes: 5000, enableStats: true });
    await driver.set('s1', bigPayload(200));

    const stats = driver.getStats();
    expect(stats).toHaveProperty('currentBytes');
    expect(stats).toHaveProperty('maxBytes', 5000);
    expect(stats).toHaveProperty('evictedDueToSize');
    expect(stats.currentBytes).toBeGreaterThan(0);
  });

  test('maxBytes=0 means unlimited — no eviction', async () => {
    const driver = await initCache({ maxBytes: 0 });

    await driver.set('u1', bigPayload(1000));
    await driver.set('u2', bigPayload(1000));
    await driver.set('u3', bigPayload(1000));

    const keys = await driver.keys();
    expect(keys.length).toBe(3);
    expect(driver.evictedDueToSize).toBe(0);
  });

  test('overwriting existing key reclaims old size', async () => {
    const driver = await initCache({ maxBytes: 3000 });

    await driver.set('reuse', bigPayload(400));
    const bytes1 = driver.currentBytes;

    await driver.set('reuse', bigPayload(200));
    expect(driver.currentBytes).toBeLessThan(bytes1);
    expect(driver._sizeIndex.size).toBe(1);
  });
});
