import { generateCookie, getCookie, setCookie } from 'hono/cookie';

/**
 * Cookie Chunking Utilities
 *
 * Handles splitting large cookies into multiple chunks to avoid browser
 * size limits (typically 4KB per cookie).
 *
 * This is critical for OIDC sessions which can contain large tokens that
 * exceed browser limits, causing "431 Request Header Fields Too Large" errors.
 *
 * @module api/concerns/cookie-chunking
 */

/**
 * Maximum safe cookie size in bytes
 * Browser limit is 4096, but we reserve space for cookie metadata
 * (name, domain, path, expires, etc.)
 */
const MAX_COOKIE_SIZE = 4000;

/**
 * Maximum number of chunks to prevent abuse
 */
const MAX_CHUNKS = 10;
const CHUNK_SUFFIX_PATTERN = /^\d+$/;

function getEncodedLength(value) {
  return encodeURIComponent(value).length;
}

function getCookieJar(context) {
  try {
    const cookies = getCookie(context);
    if (cookies && typeof cookies === 'object' && !Array.isArray(cookies)) {
      return cookies;
    }
  } catch (err) {
    console.warn('[Cookie Chunking] Failed to read cookies from request:', err.message);
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
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);
}

function calculateChunkSize(name, options) {
  const sampleCookie = generateCookie(`${name}.0`, '', options);
  const overhead = Buffer.byteLength(sampleCookie);
  const chunkSize = MAX_COOKIE_SIZE - overhead;
  if (chunkSize <= 0) {
    throw new Error(
      `[Cookie Chunking] Cookie "${name}" cannot fit any data (overhead ${overhead} bytes). ` +
      'Reduce cookie attributes or move session data to an external store.'
    );
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
      throw new Error(
        `[Cookie Chunking] Unable to chunk value for "${name}". ` +
        'Reduce cookie attributes or session payload size.'
      );
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

function reassembleChunksFromJar(context, name, expectedCount = null) {
  const chunkEntries = getChunkEntriesFromJar(getCookieJar(context), name);
  if (chunkEntries.length === 0) {
    return null;
  }

  const targetLength = expectedCount ?? chunkEntries.length;
  if (expectedCount !== null && chunkEntries.length < expectedCount) {
    console.warn(
      `[Cookie Chunking] Missing chunks for "${name}" (expected ${expectedCount}, found ${chunkEntries.length})`
    );
    return null;
  }

  for (let i = 0; i < targetLength; i++) {
    if (!chunkEntries[i] || chunkEntries[i].index !== i) {
      console.warn(`[Cookie Chunking] Missing chunk ${i} for "${name}"`);
      return null;
    }
  }

  return chunkEntries.slice(0, targetLength).map((entry) => entry.value).join('');
}

/**
 * Set a cookie with automatic chunking if value exceeds size limit
 *
 * If the cookie value is smaller than MAX_COOKIE_SIZE, sets a single cookie.
 * If larger, splits into multiple cookies named `{name}.0`, `{name}.1`, etc.,
 * and sets a metadata cookie `{name}.__chunks` with the chunk count.
 *
 * @param {Object} context - Hono context (c)
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value (can be any length)
 * @param {Object} options - Cookie options (httpOnly, secure, sameSite, maxAge, etc.)
 *
 * @example
 * // Small cookie (< 4KB) - sets single cookie
 * setChunkedCookie(c, 'session', 'small-value', { httpOnly: true });
 *
 * // Large cookie (> 4KB) - sets multiple chunks
 * setChunkedCookie(c, 'session', largeTokenString, { httpOnly: true });
 * // Results in: session.__chunks, session.0, session.1, session.2, ...
 */
export function setChunkedCookie(context, name, value, options = {}) {
  if (!value) {
    // Empty value - delete cookie
    deleteChunkedCookie(context, name, options);
    return;
  }

  const chunkSize = calculateChunkSize(name, options);
  const encodedLength = getEncodedLength(value);

  // If value fits in single cookie, use standard cookie
  if (encodedLength <= chunkSize) {
    // Clean up any existing chunks
    deleteChunkedCookie(context, name, options);
    // Set single cookie
    setCookie(context, name, value, options);
    return;
  }

  const chunks = splitValueIntoChunks(name, value, chunkSize);
  const requestCookies = getCookieJar(context);

  // Safety check
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(
      `Cookie "${name}" value too large (${chunks.length} chunks, max ${MAX_CHUNKS}). ` +
      `Consider using session store (Redis) to reduce cookie size.`
    );
  }

  // Set chunk cookies
  chunks.forEach((chunk, index) => {
    setCookie(context, `${name}.${index}`, chunk, options);
  });

  // Set metadata cookie with chunk count
  setCookie(context, `${name}.__chunks`, String(chunks.length), {
    ...options,
    // Metadata cookie can have same expiry
  });

  // Remove legacy single-cookie session if present
  if (Object.prototype.hasOwnProperty.call(requestCookies, name)) {
    setCookie(context, name, '', {
      ...options,
      maxAge: 0,
    });
  }

  // Delete only the chunk cookies that previously existed beyond the new length
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

/**
 * Get a chunked cookie value by reassembling all chunks
 *
 * Reads the metadata cookie to determine chunk count, then reads and
 * concatenates all chunk cookies in order.
 *
 * @param {Object} context - Hono context (c)
 * @param {string} name - Cookie name
 * @returns {string|null} Reassembled cookie value or null if not found
 *
 * @example
 * const session = getChunkedCookie(c, 'session');
 * if (session) {
 *   const data = await decodeSession(session);
 * }
 */
export function getChunkedCookie(context, name) {
  // Try to get metadata cookie
  const chunkCountStr = getCookie(context, `${name}.__chunks`);

  // No metadata - try single cookie
  if (!chunkCountStr) {
    const fallback = reassembleChunksFromJar(context, name);
    if (fallback) {
      return fallback;
    }
    return getCookie(context, name) || null;
  }

  // Parse chunk count
  const chunkCount = parseInt(chunkCountStr, 10);
  if (isNaN(chunkCount) || chunkCount <= 0 || chunkCount > MAX_CHUNKS) {
    console.warn(`[Cookie Chunking] Invalid chunk count for "${name}": ${chunkCountStr}`);
    return reassembleChunksFromJar(context, name);
  }

  // Reassemble chunks
  const chunks = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunk = getCookie(context, `${name}.${i}`);
    if (!chunk) {
      console.warn(`[Cookie Chunking] Missing chunk ${i} for "${name}"`);
      return reassembleChunksFromJar(context, name, chunkCount);
    }
    chunks.push(chunk);
  }

  return chunks.join('');
}

/**
 * Delete a chunked cookie (all chunks and metadata)
 *
 * Deletes the main cookie, metadata cookie, and all possible chunk cookies.
 *
 * @param {Object} context - Hono context (c)
 * @param {string} name - Cookie name
 * @param {Object} options - Cookie options (domain, path for proper deletion)
 *
 * @example
 * deleteChunkedCookie(c, 'session', { domain: '.example.com', path: '/' });
 */
export function deleteChunkedCookie(context, name, options = {}) {
  const cookieJar = getCookieJar(context);
  const namesToDelete = new Set();

  if (Object.prototype.hasOwnProperty.call(cookieJar, name)) {
    namesToDelete.add(name);
  }

  if (Object.prototype.hasOwnProperty.call(cookieJar, `${name}.__chunks`)) {
    namesToDelete.add(`${name}.__chunks`);
  }

  getChunkEntriesFromJar(cookieJar, name).forEach(({ name: chunkName }) => {
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

/**
 * Check if a cookie is chunked
 *
 * @param {Object} context - Hono context (c)
 * @param {string} name - Cookie name
 * @returns {boolean} True if cookie is chunked
 */
export function isChunkedCookie(context, name) {
  return !!getCookie(context, `${name}.__chunks`);
}
