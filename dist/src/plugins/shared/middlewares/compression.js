import { gzip, brotliCompress } from 'zlib';
import { promisify } from 'util';
const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);
const skipContentTypes = [
    'image/', 'video/', 'audio/',
    'application/zip', 'application/gzip',
    'application/x-gzip', 'application/x-bzip2'
];
export function createCompressionMiddleware(config = {}, context) {
    const { threshold = 1024, level = 6, logLevel = 'info' } = config;
    return async function (c, next) {
        await next();
        if (!c.res || !c.res.body) {
            return;
        }
        if (c.res.headers.has('content-encoding')) {
            return;
        }
        const contentType = c.res.headers.get('content-type') || '';
        if (skipContentTypes.some(type => contentType.startsWith(type))) {
            return;
        }
        const acceptEncoding = c.req.header('accept-encoding') || '';
        const supportsBrotli = acceptEncoding.includes('br');
        const supportsGzip = acceptEncoding.includes('gzip');
        if (!supportsBrotli && !supportsGzip) {
            return;
        }
        let body;
        try {
            const text = await c.res.text();
            body = Buffer.from(text, 'utf-8');
        }
        catch {
            return;
        }
        if (body.length < threshold) {
            return;
        }
        let compressed;
        let encoding;
        try {
            if (supportsBrotli) {
                compressed = await brotliAsync(body);
                encoding = 'br';
            }
            else {
                compressed = await gzipAsync(body, { level });
                encoding = 'gzip';
            }
            if (compressed.length >= body.length) {
                return;
            }
            const headers = new Headers(c.res.headers);
            headers.set('Content-Encoding', encoding);
            headers.set('Content-Length', compressed.length.toString());
            headers.set('Vary', 'Accept-Encoding');
            c.res = new Response(new Uint8Array(compressed), {
                status: c.res.status,
                statusText: c.res.statusText,
                headers
            });
        }
        catch (err) {
            const logger = context?.logger || this?.logger;
            if (logger && (logLevel === 'debug' || logLevel === 'trace')) {
                logger.error({ error: err.message }, '[Compression] Error');
            }
        }
    };
}
//# sourceMappingURL=compression.js.map