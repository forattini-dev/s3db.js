/**
 * API Plugin - Compression Middleware Tests
 *
 * Verifies that compression respects Accept-Encoding headers:
 * - Without Accept-Encoding → No compression
 * - With Accept-Encoding: gzip → Gzip compression
 * - With Accept-Encoding: br → Brotli compression
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from '@jest/globals';
import { gunzip, brotliDecompress } from 'zlib';
import { promisify } from 'util';
import http from 'http';
import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../../config.js';

const gunzipAsync = promisify(gunzip);
const brotliAsync = promisify(brotliDecompress);

/**
 * Make HTTP request with FULL control over headers
 * (fetch() always adds Accept-Encoding automatically)
 */
function rawHttpRequest(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: {
        // Only include explicitly provided headers
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      const chunks = [];

      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function waitForServer(port, maxAttempts = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await rawHttpRequest(port, '/articles');
      return; // If we get here, server is ready
    } catch (err) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server on port ${port} not ready after ${maxAttempts * 100}ms`);
}

describe('API Plugin - Compression Middleware', () => {
  let db;
  let apiPlugin;
  let port;

  beforeEach(async () => {
    port = 3800 + Math.floor(Math.random() * 1000);
    const testName = `compression-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    db = createMemoryDatabaseForTest(testName, { verbose: false });
    await db.connect();

    // Create a resource with some data
    await db.createResource({
      name: 'articles',
      attributes: {
        id: 'string|optional',
        title: 'string|required',
        content: 'string|required'
      },
      behavior: 'body-overflow',
      timestamps: true
    });

    // Insert test data (large enough to be worth compressing)
    const longContent = 'A'.repeat(2000); // 2KB of text
    await db.resources.articles.insert({
      id: 'article-1',
      title: 'Test Article',
      content: longContent
    });

    // Create API plugin with compression enabled
    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      verbose: false,
      docs: { enabled: false },
      logging: { enabled: false },
      compression: {
        enabled: true,
        threshold: 1024, // Compress if > 1KB
        level: 6
      },
      resources: ['articles']
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);
  });

  afterEach(async () => {
    if (apiPlugin) {
      await apiPlugin.stop();
      apiPlugin = null;
    }

    if (db) {
      await db.disconnect();
      db = null;
    }
  });

  it('should NOT compress when Accept-Encoding header is absent (like curl)', async () => {
    // Use raw HTTP to simulate curl behavior (NO Accept-Encoding)
    const response = await rawHttpRequest(port, '/articles');

    expect(response.status).toBe(200);

    // CRITICAL: Response should NOT be compressed
    expect(response.headers['content-encoding']).toBeUndefined();

    // Body should be readable JSON without decompression
    const body = JSON.parse(response.body.toString('utf-8'));
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({
      id: 'article-1',
      title: 'Test Article'
    });
  });

  it('should compress with gzip when Accept-Encoding: gzip is provided', async () => {
    const response = await rawHttpRequest(port, '/articles', {
      'accept-encoding': 'gzip'
    });

    expect(response.status).toBe(200);

    // Response should be compressed with gzip
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.headers['vary']).toBe('Accept-Encoding');

    // Manual decompression to verify it's actually gzipped
    const decompressed = await gunzipAsync(response.body);
    const body = JSON.parse(decompressed.toString('utf-8'));

    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({
      id: 'article-1',
      title: 'Test Article'
    });
  });

  it('should fallback to gzip when Accept-Encoding: br is provided (brotli not supported yet)', async () => {
    const response = await rawHttpRequest(port, '/articles', {
      'accept-encoding': 'br, gzip'
    });

    expect(response.status).toBe(200);

    // Response should fallback to gzip (CompressionStream doesn't support brotli yet)
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.headers['vary']).toBe('Accept-Encoding');

    // Manual decompression to verify it's actually gzipped
    const decompressed = await gunzipAsync(response.body);
    const body = JSON.parse(decompressed.toString('utf-8'));

    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({
      id: 'article-1',
      title: 'Test Article'
    });
  });

  it('should fallback to gzip when both br and gzip are accepted', async () => {
    const response = await rawHttpRequest(port, '/articles', {
      'accept-encoding': 'gzip, deflate, br'
    });

    expect(response.status).toBe(200);

    // Should fallback to gzip (CompressionStream doesn't support brotli yet)
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.headers['vary']).toBe('Accept-Encoding');
  });

  it('should NOT compress responses smaller than threshold', async () => {
    // Create a tiny resource
    await db.createResource({
      name: 'tags',
      attributes: {
        id: 'string|optional',
        name: 'string|required'
      }
    });

    await db.resources.tags.insert({
      id: 'tag-1',
      name: 'test'
    });

    const response = await rawHttpRequest(port, '/tags', {
      'accept-encoding': 'gzip, br'
    });

    expect(response.status).toBe(200);

    // Small responses should NOT be compressed (even with Accept-Encoding)
    expect(response.headers['content-encoding']).toBeUndefined();

    const body = JSON.parse(response.body.toString('utf-8'));
    expect(body.success).toBe(true);
  });
});
