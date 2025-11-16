/**
 * Compression Middleware
 *
 * Compresses HTTP responses using gzip or brotli compression.
 * Automatically skips already compressed content and small payloads.
 */

import { gzip, brotliCompress } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

/**
 * Create compression middleware
 * @param {Object} config - Compression configuration
 * @param {number} config.threshold - Minimum size in bytes to compress
 * @param {number} config.level - Compression level (1-9)
 * @param {boolean} config.logLevel - Enable verbose logging
 * @returns {Function} Hono middleware
 */
export function createCompressionMiddleware(config = {}) {
  const {
    threshold = 1024, // 1KB
    level = 6,
    logLevel = 'info'
  } = config;

  // Content types that should NOT be compressed (already compressed)
  const skipContentTypes = [
    'image/', 'video/', 'audio/',
    'application/zip', 'application/gzip',
    'application/x-gzip', 'application/x-bzip2'
  ];

  return async (c, next) => {
    await next();

    // Skip if response has no body
    if (!c.res || !c.res.body) {
      return;
    }

    // Skip if already compressed
    if (c.res.headers.has('content-encoding')) {
      return;
    }

    // Skip if content-type should not be compressed
    const contentType = c.res.headers.get('content-type') || '';
    if (skipContentTypes.some(type => contentType.startsWith(type))) {
      return;
    }

    // Check Accept-Encoding header
    const acceptEncoding = c.req.header('accept-encoding') || '';
    const supportsBrotli = acceptEncoding.includes('br');
    const supportsGzip = acceptEncoding.includes('gzip');

    if (!supportsBrotli && !supportsGzip) {
      return; // Client doesn't support compression
    }

    // Get response body as buffer
    let body;
    try {
      const text = await c.res.text();
      body = Buffer.from(text, 'utf-8');
    } catch (err) {
      // If body is already consumed or not text, skip compression
      return;
    }

    // Skip if body is too small
    if (body.length < threshold) {
      return;
    }

    // Compress with brotli (better) or gzip (fallback)
    let compressed;
    let encoding;

    try {
      if (supportsBrotli) {
        compressed = await brotliAsync(body);
        encoding = 'br';
      } else {
        compressed = await gzipAsync(body, { level });
        encoding = 'gzip';
      }

      // Only use compressed if it's actually smaller
      if (compressed.length >= body.length) {
        return; // Compression didn't help, use original
      }

      // Create new response with compressed body
      const headers = new Headers(c.res.headers);
      headers.set('Content-Encoding', encoding);
      headers.set('Content-Length', compressed.length.toString());
      headers.set('Vary', 'Accept-Encoding');

      // Replace response
      c.res = new Response(compressed, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers
      });

    } catch (err) {
      // Compression failed, log and continue with uncompressed response
      if (logLevel === 'debug' || logLevel === 'trace') {
        this.logger.error('[Compression] Error:', err.message);
      }
    }
  };
}
