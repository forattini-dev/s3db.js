const skipContentTypes = [
    'image/', 'video/', 'audio/',
    'application/zip', 'application/gzip',
    'application/x-gzip', 'application/x-bzip2'
];
const cacheControlNoTransformRegExp = /(?:^|,)\s*?no-transform\s*?(?:,|$)/i;
export async function createCompressionMiddleware(compressionConfig, logger) {
    const { threshold } = compressionConfig;
    const zlib = await import('node:zlib');
    return async (c, next) => {
        c.header('Vary', 'Accept-Encoding');
        await next();
        if (!c.res || !c.res.body) {
            return;
        }
        if (c.res.headers.has('content-encoding') ||
            c.res.headers.has('transfer-encoding') ||
            c.req.method === 'HEAD') {
            return;
        }
        const contentType = c.res.headers.get('content-type') || '';
        const isTextLike = contentType.startsWith('text/') || contentType.includes('json');
        if (skipContentTypes.some(type => contentType.startsWith(type)) || !isTextLike) {
            return;
        }
        const cacheControl = c.res.headers.get('cache-control') || '';
        if (cacheControlNoTransformRegExp.test(cacheControl)) {
            return;
        }
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
                            if (done)
                                break;
                            if (value) {
                                total += value.byteLength;
                            }
                            if (total >= threshold) {
                                total = threshold;
                                break;
                            }
                        }
                    }
                    finally {
                        reader.releaseLock?.();
                    }
                    payloadSize = total;
                }
            }
            catch {
                payloadSize = null;
            }
        }
        if (payloadSize !== null && payloadSize < threshold) {
            return;
        }
        const acceptEncoding = c.req.header('accept-encoding') || '';
        if (logger?.debug) {
            logger.debug({ acceptEncoding }, '[Compression] middleware invoked');
        }
        let encoding = null;
        if (acceptEncoding.includes('br')) {
            encoding = 'br';
        }
        else if (acceptEncoding.includes('gzip')) {
            encoding = 'gzip';
        }
        else if (acceptEncoding.includes('deflate')) {
            encoding = 'deflate';
        }
        if (!encoding) {
            return;
        }
        try {
            const bodyBuffer = Buffer.from(await c.res.arrayBuffer());
            if (encoding === 'gzip' || encoding === 'deflate') {
                const compressed = encoding === 'gzip'
                    ? zlib.gzipSync(bodyBuffer)
                    : zlib.deflateSync(bodyBuffer);
                c.res = new Response(new Uint8Array(compressed), c.res);
                c.res.headers.delete('Content-Length');
                c.res.headers.set('Content-Encoding', encoding === 'deflate' ? 'deflate' : 'gzip');
            }
            else if (encoding === 'br') {
                if (acceptEncoding.includes('gzip')) {
                    const compressed = zlib.gzipSync(bodyBuffer);
                    c.res = new Response(new Uint8Array(compressed), c.res);
                    c.res.headers.delete('Content-Length');
                    c.res.headers.set('Content-Encoding', 'gzip');
                }
            }
        }
        catch (err) {
            if (logger) {
                logger.error({ error: err.message }, 'Compression error');
            }
        }
    };
}
//# sourceMappingURL=compression.js.map