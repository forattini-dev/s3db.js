import { rm } from 'fs/promises';

import { createTemporaryPathForTest } from '#tests/config.js';
import { FileSystemStorage } from '../../../src/clients/filesystem-storage.class.js';
import { FileSystemClient } from '../../../src/clients/filesystem-client.class.js';

const repeatText = (size: number): string => 'x'.repeat(size);

describe('FileSystemStorage', () => {
  test('list with delimiter should paginate without skipping common prefixes', async () => {
    const basePath = await createTemporaryPathForTest('s3db-filesystem-storage');
    const storage = new FileSystemStorage({ basePath });

    try {
      await storage.put('photos/a.txt', { body: repeatText(1), contentType: 'text/plain' });
      await storage.put('videos/b.txt', { body: repeatText(1), contentType: 'text/plain' });

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
    } finally {
      await storage.clear();
      await rm(basePath, { recursive: true, force: true });
    }
  });

  test('destroy should remove listeners from client API surface', async () => {
    const basePath = await createTemporaryPathForTest('s3db-filesystem-storage-destroy');
    const client = new FileSystemClient({ basePath, bucket: 'test-bucket' });
    const listener = () => undefined;

    client.on('cl:response', listener);
    expect(client.listenerCount('cl:response')).toBe(1);

    client.destroy();
    expect(client.listenerCount('cl:response')).toBe(0);

    await rm(basePath, { recursive: true, force: true });
  });

  test('list should normalize Prefix for keyPrefix-aware clients', async () => {
    const basePath = await createTemporaryPathForTest('s3db-filesystem-storage-prefix');
    const client = new FileSystemClient({ basePath, bucket: 'test-bucket', keyPrefix: 'tenant/' });

    await client.putObject({ key: 'alpha/file.txt', body: 'ok', contentType: 'text/plain' });

    const result = await client.listObjects({ prefix: 'alpha/' });

    expect(result.Prefix).toBe('alpha/');
    expect(result.Contents).toHaveLength(1);
    expect(result.Contents[0].Key).toBe('alpha/file.txt');

    client.destroy();
    await rm(basePath, { recursive: true, force: true });
  });
});
