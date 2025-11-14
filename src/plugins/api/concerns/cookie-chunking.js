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

  // Calculate chunk size (reserve space for cookie name and metadata)
  const cookieNameLength = name.length + 10; // ".0" suffix + metadata
  const chunkSize = MAX_COOKIE_SIZE - cookieNameLength;

  // If value fits in single cookie, use standard cookie
  if (value.length <= chunkSize) {
    // Clean up any existing chunks
    deleteChunkedCookie(context, name, options);
    // Set single cookie
    context.cookie(name, value, options);
    return;
  }

  // Split into chunks
  const chunks = [];
  for (let i = 0; i < value.length; i += chunkSize) {
    chunks.push(value.slice(i, i + chunkSize));
  }

  // Safety check
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(
      `Cookie "${name}" value too large (${chunks.length} chunks, max ${MAX_CHUNKS}). ` +
      `Consider using session store (Redis) to reduce cookie size.`
    );
  }

  // Set chunk cookies
  chunks.forEach((chunk, index) => {
    context.cookie(`${name}.${index}`, chunk, options);
  });

  // Set metadata cookie with chunk count
  context.cookie(`${name}.__chunks`, String(chunks.length), {
    ...options,
    // Metadata cookie can have same expiry
  });

  // Delete any old chunks beyond current count
  // (e.g., if previous session had 5 chunks, now has 3)
  for (let i = chunks.length; i < MAX_CHUNKS; i++) {
    try {
      context.cookie(`${name}.${i}`, '', {
        ...options,
        maxAge: 0, // Delete
      });
    } catch (err) {
      // Ignore errors deleting non-existent cookies
    }
  }
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
  const chunkCountStr = context.req.cookie(`${name}.__chunks`);

  // No metadata - try single cookie
  if (!chunkCountStr) {
    return context.req.cookie(name) || null;
  }

  // Parse chunk count
  const chunkCount = parseInt(chunkCountStr, 10);
  if (isNaN(chunkCount) || chunkCount <= 0 || chunkCount > MAX_CHUNKS) {
    console.warn(`[Cookie Chunking] Invalid chunk count for "${name}": ${chunkCountStr}`);
    return null;
  }

  // Reassemble chunks
  const chunks = [];
  for (let i = 0; i < chunkCount; i++) {
    const chunk = context.req.cookie(`${name}.${i}`);
    if (!chunk) {
      console.warn(`[Cookie Chunking] Missing chunk ${i} for "${name}"`);
      return null;
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
  // Delete main cookie
  context.cookie(name, '', {
    ...options,
    maxAge: 0,
  });

  // Delete metadata cookie
  context.cookie(`${name}.__chunks`, '', {
    ...options,
    maxAge: 0,
  });

  // Delete all possible chunk cookies
  for (let i = 0; i < MAX_CHUNKS; i++) {
    context.cookie(`${name}.${i}`, '', {
      ...options,
      maxAge: 0,
    });
  }
}

/**
 * Check if a cookie is chunked
 *
 * @param {Object} context - Hono context (c)
 * @param {string} name - Cookie name
 * @returns {boolean} True if cookie is chunked
 */
export function isChunkedCookie(context, name) {
  return !!context.req.cookie(`${name}.__chunks`);
}
