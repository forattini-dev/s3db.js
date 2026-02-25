import MemoryStorage from '../../../src/clients/memory-storage.class.js';
import type { StorageSnapshot } from '../../../src/clients/types.js';

const repeatText = (size: number): string => 'x'.repeat(size);

describe('MemoryStorage', () => {
  test('list with delimiter should paginate without skipping common prefixes', async () => {
    const storage = new MemoryStorage({ maxMemoryMB: 1, evictionEnabled: false });

    await storage.put('photos/a.txt', { body: 'photo-1', contentType: 'text/plain' });
    await storage.put('videos/b.txt', { body: 'video-1', contentType: 'text/plain' });

    const firstPage = await storage.list({
      delimiter: '/',
      maxKeys: 1
    });

    expect(firstPage.IsTruncated).toBe(true);
    expect(firstPage.CommonPrefixes).toEqual([{ Prefix: 'photos/' }]);
    expect(firstPage.NextContinuationToken).toBeTruthy();

    const secondPage = await storage.list({
      delimiter: '/',
      maxKeys: 1,
      continuationToken: firstPage.NextContinuationToken
    });

    expect(secondPage.IsTruncated).toBe(false);
    expect(secondPage.CommonPrefixes).toEqual([{ Prefix: 'videos/' }]);
    expect(secondPage.NextContinuationToken).toBeNull();
  });

  test('restore should enforce memory limits after loading a snapshot', () => {
    const maxMemoryBytes = Math.floor(0.0005 * 1024 * 1024);
    const snapshot: StorageSnapshot = {
      timestamp: new Date().toISOString(),
      bucket: 's3db',
      objectCount: 2,
      objects: {
        alpha: {
          body: repeatText(500).toString(),
          contentType: 'text/plain',
          metadata: {},
          etag: 'alpha',
          lastModified: new Date().toISOString(),
          size: 500,
          contentLength: 500
        },
        beta: {
          body: repeatText(300).toString(),
          contentType: 'text/plain',
          metadata: {},
          etag: 'beta',
          lastModified: new Date().toISOString(),
          size: 300,
          contentLength: 300
        }
      }
    };

    // keep object values base64-encoded
    snapshot.objects.alpha.body = Buffer.from(snapshot.objects.alpha.body).toString('base64');
    snapshot.objects.beta.body = Buffer.from(snapshot.objects.beta.body).toString('base64');

    const storage = new MemoryStorage({
      maxMemoryMB: 0.0005
    });

    storage.restore(snapshot);

    const stats = storage.getStats();
    expect(stats.objectCount).toBe(1);
    expect(stats.totalSize).toBeLessThanOrEqual(maxMemoryBytes);
    expect(stats.keys).toEqual(['beta']);
    expect(stats.evictions).toBe(1);
    expect(stats.evictedBytes).toBe(500);
    expect(stats.peakMemoryBytes).toBe(300);
  });

  test('clear should reset memory stats', async () => {
    const storage = new MemoryStorage({ maxMemoryMB: 0.0005 });

    await storage.put('alpha', { body: repeatText(500), contentType: 'text/plain' });
    await storage.put('beta', { body: repeatText(300), contentType: 'text/plain' });
    const statsBeforeClear = storage.getStats();
    expect(statsBeforeClear.evictions).toBe(1);
    expect(statsBeforeClear.evictedBytes).toBe(500);
    expect(statsBeforeClear.totalSize).toBe(300);

    storage.clear();

    const statsAfterClear = storage.getStats();
    expect(statsAfterClear.objectCount).toBe(0);
    expect(statsAfterClear.totalSize).toBe(0);
    expect(statsAfterClear.evictions).toBe(0);
    expect(statsAfterClear.evictedBytes).toBe(0);
    expect(statsAfterClear.peakMemoryBytes).toBe(0);
  });
});
