import { generateCookie, getCookie, setCookie } from 'hono/cookie';
import { createLogger } from '../../../concerns/logger.js';
const logger = createLogger({ name: 'CookieChunking', level: 'info' });
const MAX_COOKIE_SIZE = 4000;
const MAX_CHUNKS = 10;
const CHUNK_SUFFIX_PATTERN = /^\d+$/;
export class CookieChunkOverflowError extends Error {
    name = 'CookieChunkOverflowError';
    code = 'COOKIE_CHUNK_OVERFLOW';
    details;
    constructor(details) {
        super(`Cookie "${details.cookieName}" requires ${details.chunkCount} chunks (limit ${details.chunkLimit}). ` +
            `Payload size: ${details.payloadBytes} bytes.`);
        this.details = details;
    }
}
function getEncodedLength(value) {
    return encodeURIComponent(value).length;
}
function getCookieJar(context) {
    try {
        const cookies = getCookie(context);
        if (cookies && typeof cookies === 'object' && !Array.isArray(cookies)) {
            return cookies;
        }
    }
    catch (err) {
        logger.warn({ error: err.message }, '[Cookie Chunking] Failed to read cookies from request');
    }
    return {};
}
function getChunkEntriesFromJar(cookieJar, baseName) {
    const prefix = `${baseName}.`;
    return Object.entries(cookieJar)
        .map(([cookieName, cookieValue]) => {
        if (!cookieName.startsWith(prefix)) {
            return null;
        }
        const suffix = cookieName.slice(prefix.length);
        if (!CHUNK_SUFFIX_PATTERN.test(suffix)) {
            return null;
        }
        return {
            name: cookieName,
            value: cookieValue,
            index: parseInt(suffix, 10)
        };
    })
        .filter((entry) => entry !== null)
        .sort((a, b) => a.index - b.index);
}
function calculateChunkSize(name, options) {
    const sampleCookie = generateCookie(`${name}.0`, '', options);
    const overhead = Buffer.byteLength(sampleCookie);
    const chunkSize = MAX_COOKIE_SIZE - overhead;
    if (chunkSize <= 0) {
        throw new Error(`[Cookie Chunking] Cookie "${name}" cannot fit any data (overhead ${overhead} bytes). ` +
            'Reduce cookie attributes or move session data to an external store.');
    }
    return chunkSize;
}
function splitValueIntoChunks(name, value, chunkSize) {
    const chunks = [];
    let currentChunk = '';
    let currentLength = 0;
    for (const char of value) {
        const charLength = getEncodedLength(char);
        if (charLength > chunkSize) {
            throw new Error(`[Cookie Chunking] Unable to chunk value for "${name}". ` +
                'Reduce cookie attributes or session payload size.');
        }
        if (currentChunk && currentLength + charLength > chunkSize) {
            chunks.push(currentChunk);
            currentChunk = '';
            currentLength = 0;
        }
        currentChunk += char;
        currentLength += charLength;
    }
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    return chunks;
}
function reassembleChunksFromJar(context, name, expectedCount = null, cookieJar = null) {
    const chunkEntries = getChunkEntriesFromJar(cookieJar || getCookieJar(context), name);
    if (chunkEntries.length === 0) {
        return null;
    }
    const targetLength = expectedCount ?? chunkEntries.length;
    if (expectedCount !== null && chunkEntries.length < expectedCount) {
        logger.warn(`[Cookie Chunking] Missing chunks for "${name}" (expected ${expectedCount}, found ${chunkEntries.length})`);
        return null;
    }
    for (let i = 0; i < targetLength; i++) {
        const entry = chunkEntries[i];
        if (!entry || entry.index !== i) {
            logger.warn(`[Cookie Chunking] Missing chunk ${i} for "${name}"`);
            return null;
        }
    }
    return chunkEntries.slice(0, targetLength).map((entry) => entry.value).join('');
}
export function setChunkedCookie(context, name, value, options = {}, chunkingOptions = {}) {
    if (!value) {
        deleteChunkedCookie(context, name, options);
        return;
    }
    const chunkSize = calculateChunkSize(name, options);
    const encodedLength = getEncodedLength(value);
    const requestCookies = getCookieJar(context);
    if (encodedLength <= chunkSize) {
        deleteChunkedCookie(context, name, options, requestCookies);
        setCookie(context, name, value, options);
        return;
    }
    const chunks = splitValueIntoChunks(name, value, chunkSize);
    if (chunks.length > MAX_CHUNKS) {
        const overflowDetails = {
            cookieName: name,
            chunkCount: chunks.length,
            chunkLimit: MAX_CHUNKS,
            payloadBytes: Buffer.byteLength(value, 'utf8')
        };
        const error = new CookieChunkOverflowError(overflowDetails);
        logger.error(overflowDetails, '[Cookie Chunking] Chunk overflow');
        if (typeof chunkingOptions.onOverflow === 'function') {
            try {
                const handled = chunkingOptions.onOverflow({ ...overflowDetails, value });
                if (handled === true) {
                    return;
                }
            }
            catch (hookErr) {
                logger.error({ error: hookErr }, '[Cookie Chunking] Overflow handler error');
            }
        }
        throw error;
    }
    chunks.forEach((chunk, index) => {
        setCookie(context, `${name}.${index}`, chunk, options);
    });
    setCookie(context, `${name}.__chunks`, String(chunks.length), options);
    if (Object.prototype.hasOwnProperty.call(requestCookies, name)) {
        setCookie(context, name, '', {
            ...options,
            maxAge: 0,
        });
    }
    const existingChunks = getChunkEntriesFromJar(requestCookies, name);
    existingChunks.forEach(({ name: chunkName, index }) => {
        if (index >= chunks.length) {
            setCookie(context, chunkName, '', {
                ...options,
                maxAge: 0,
            });
        }
    });
}
export function getChunkedCookie(context, name, cookieJarOverride = null) {
    const cookieJar = cookieJarOverride || getCookieJar(context);
    const chunkCountStr = cookieJar[`${name}.__chunks`];
    if (!chunkCountStr) {
        const fallback = reassembleChunksFromJar(context, name, null, cookieJar);
        if (fallback) {
            return fallback;
        }
        return cookieJar[name] || null;
    }
    const chunkCount = parseInt(chunkCountStr, 10);
    if (isNaN(chunkCount) || chunkCount <= 0 || chunkCount > MAX_CHUNKS) {
        logger.warn(`[Cookie Chunking] Invalid chunk count for "${name}": ${chunkCountStr}`);
        return reassembleChunksFromJar(context, name, null, cookieJar);
    }
    const chunks = [];
    for (let i = 0; i < chunkCount; i++) {
        const chunk = cookieJar[`${name}.${i}`];
        if (!chunk) {
            logger.warn(`[Cookie Chunking] Missing chunk ${i} for "${name}"`);
            return reassembleChunksFromJar(context, name, chunkCount, cookieJar);
        }
        chunks.push(chunk);
    }
    return chunks.join('');
}
export function deleteChunkedCookie(context, name, options = {}, cookieJar = null) {
    const jar = cookieJar || getCookieJar(context);
    const namesToDelete = new Set();
    if (Object.prototype.hasOwnProperty.call(jar, name)) {
        namesToDelete.add(name);
    }
    if (Object.prototype.hasOwnProperty.call(jar, `${name}.__chunks`)) {
        namesToDelete.add(`${name}.__chunks`);
    }
    getChunkEntriesFromJar(jar, name).forEach(({ name: chunkName }) => {
        namesToDelete.add(chunkName);
    });
    if (namesToDelete.size === 0) {
        return;
    }
    namesToDelete.forEach((cookieName) => {
        setCookie(context, cookieName, '', {
            ...options,
            maxAge: 0,
        });
    });
}
export function isChunkedCookie(context, name) {
    return !!getCookie(context, `${name}.__chunks`);
}
//# sourceMappingURL=cookie-chunking.js.map