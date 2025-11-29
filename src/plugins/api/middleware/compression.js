/**
 * Create compression middleware (using Node.js zlib)
 * @param {object} compressionConfig - Compression configuration object
 * @param {object} logger - Pino logger instance
 * @returns {function} Hono middleware
 */
export async function createCompressionMiddleware(compressionConfig, logger) {
  const { threshold } = compressionConfig;
  const zlib = await import('node:zlib');

  // Content types that should NOT be compressed (already compressed)
  const skipContentTypes = [
    'image/', 'video/', 'audio/',
    'application/zip', 'application/gzip',
    'application/x-gzip', 'application/x-bzip2'
  ];

  // Cache-Control: no-transform regex (from Hono)
  const cacheControlNoTransformRegExp = /(?:^|,)\s*?no-transform\s*?(?:,|$)/i;

  return async (c, next) => {
    // IMPORTANT: Set Vary header BEFORE processing request
    // This ensures proxies/caches know the response varies by Accept-Encoding
    c.header('Vary', 'Accept-Encoding');

    await next();

    // Skip if response has no body
    if (!c.res || !c.res.body) {
      return;
    }

    // Skip if already compressed, Transfer-Encoding set, or HEAD request
    if (c.res.headers.has('content-encoding') ||
        c.res.headers.has('transfer-encoding') ||
        c.req.method === 'HEAD') {
      return;
    }

    // Skip if content-type should not be compressed
    const contentType = c.res.headers.get('content-type') || '';
    const isTextLike = contentType.startsWith('text/') || contentType.includes('json');
    if (skipContentTypes.some(type => contentType.startsWith(type)) || !isTextLike) {
      return;
    }

    // Respect Cache-Control: no-transform directive
    const cacheControl = c.res.headers.get('cache-control') || '';
    if (cacheControlNoTransformRegExp.test(cacheControl)) {
      return;
    }

    // Check Content-Length threshold
    const contentLength = c.res.headers.get('content-length');
    let payloadSize = contentLength ? Number(contentLength) : null;

    if ((!payloadSize || Number.isNaN(payloadSize)) && threshold > 0) {
      try {
        const clone = c.res.clone();
        const body = clone.body;
        if (body && typeof body.getReader === 'function') {
          const reader = body.getReader();
          let total = 0;
          try {
            while (total < threshold) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                total += value.byteLength;
              }
              if (total >= threshold) {
                total = threshold;
                break;
              }
            }
          } finally {
            reader.releaseLock?.();
          }
          payloadSize = total;
        }
      } catch {
        payloadSize = null;
      }
    }

    if (payloadSize !== null && payloadSize < threshold) {
      return;
    }

    // Check Accept-Encoding header
    const acceptEncoding = c.req.header('accept-encoding') || '';
    // Debug helper for tests - visible only when logLevel provided
    if (logger?.debug) {
      logger.debug({ acceptEncoding }, '[Compression] middleware invoked');
    }

    // Determine encoding (prioritize brotli > gzip > deflate)
    let encoding = null;
    if (acceptEncoding.includes('br')) {
      encoding = 'br';
    } else if (acceptEncoding.includes('gzip')) {
      encoding = 'gzip';
    } else if (acceptEncoding.includes('deflate')) {
      encoding = 'deflate';
    }

    // If client doesn't support compression, skip
    if (!encoding) {
      return;
    }

    try {
      const bodyBuffer = Buffer.from(await c.res.arrayBuffer());

      if (encoding === 'gzip' || encoding === 'deflate') {
        const compressed = encoding === 'gzip'
          ? zlib.gzipSync(bodyBuffer)
          : zlib.deflateSync(bodyBuffer);
        c.res = new Response(compressed, c.res);
        c.res.headers.delete('Content-Length');
        c.res.headers.set('Content-Encoding', encoding === 'deflate' ? 'deflate' : 'gzip');
      } else if (encoding === 'br') {
        // For brotli, fallback to gzip if supported by client
        if (acceptEncoding.includes('gzip')) {
          const compressed = zlib.gzipSync(bodyBuffer);
          c.res = new Response(compressed, c.res);
          c.res.headers.delete('Content-Length');
          c.res.headers.set('Content-Encoding', 'gzip');
        }
      }
    } catch (err) {
      if (logger) {
        logger.error({ error: err.message }, 'Compression error');
      }
    }
  };
}
