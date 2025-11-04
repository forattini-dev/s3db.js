/**
 * ETag utility for optimistic concurrency control and caching
 *
 * ETag format: W/"<hash>-<timestamp>" (weak ETag)
 * - W/ prefix indicates weak validator (content semantically equivalent)
 * - hash: First 16 chars of SHA-256 hash of JSON content
 * - timestamp: Last modified timestamp for extra validation
 *
 * Usage:
 * - Generate ETag from record data
 * - Validate If-Match/If-None-Match headers
 * - Support 304 Not Modified responses
 * - Prevent lost updates with 412 Precondition Failed
 */

import { createHash } from 'crypto';

/**
 * Generate ETag from data
 * @param {Object|string} data - Data to generate ETag from
 * @param {Object} options - Options
 * @param {boolean} options.weak - Use weak ETag (default: true)
 * @param {Date|string} options.lastModified - Last modified timestamp
 * @returns {string} ETag value
 */
export function generateETag(data, options = {}) {
  const { weak = true, lastModified } = options;

  // Serialize data to JSON if object
  const content = typeof data === 'string' ? data : JSON.stringify(data);

  // Generate SHA-256 hash (first 16 chars for brevity)
  const hash = createHash('sha256')
    .update(content)
    .digest('hex')
    .substring(0, 16);

  // Add timestamp if provided (helps with time-based validation)
  const timestamp = lastModified
    ? `-${new Date(lastModified).getTime()}`
    : '';

  // Weak ETag: content semantically equivalent but may differ in formatting
  const prefix = weak ? 'W/' : '';

  return `${prefix}"${hash}${timestamp}"`;
}

/**
 * Parse ETag from header value
 * @param {string} etagHeader - ETag header value
 * @returns {Object} Parsed ETag { weak, hash, timestamp, raw }
 */
export function parseETag(etagHeader) {
  if (!etagHeader) return null;

  const weak = etagHeader.startsWith('W/');
  const raw = etagHeader.replace(/^W\//, '').replace(/"/g, '');
  const parts = raw.split('-');

  return {
    weak,
    hash: parts[0],
    timestamp: parts[1] ? parseInt(parts[1], 10) : null,
    raw: etagHeader
  };
}

/**
 * Check if ETag matches
 * @param {string} etag1 - First ETag
 * @param {string} etag2 - Second ETag
 * @param {Object} options - Options
 * @param {boolean} options.weakComparison - Allow weak comparison (default: true)
 * @returns {boolean} True if ETags match
 */
export function etagMatches(etag1, etag2, options = {}) {
  const { weakComparison = true } = options;

  if (!etag1 || !etag2) return false;

  const parsed1 = parseETag(etag1);
  const parsed2 = parseETag(etag2);

  // Strong comparison: exact match required
  if (!weakComparison) {
    return parsed1.raw === parsed2.raw;
  }

  // Weak comparison: hash must match (ignore weak prefix and timestamp)
  return parsed1.hash === parsed2.hash;
}

/**
 * Validate If-Match header (for PUT/PATCH/DELETE)
 * Returns true if request should proceed, false if 412 Precondition Failed
 *
 * If-Match: "*" matches any ETag
 * If-Match: "etag1", "etag2" matches if current ETag is in list
 *
 * @param {string} ifMatchHeader - If-Match header value
 * @param {string} currentETag - Current resource ETag
 * @returns {boolean} True if condition met
 */
export function validateIfMatch(ifMatchHeader, currentETag) {
  if (!ifMatchHeader) return true; // No condition = proceed

  // "*" matches any existing resource
  if (ifMatchHeader.trim() === '*') {
    return !!currentETag;
  }

  // Parse comma-separated list of ETags
  const requestedETags = ifMatchHeader
    .split(',')
    .map(e => e.trim());

  // Check if any requested ETag matches current
  return requestedETags.some(reqETag => etagMatches(reqETag, currentETag));
}

/**
 * Validate If-None-Match header (for GET/HEAD)
 * Returns true if resource modified (200), false if not modified (304)
 *
 * If-None-Match: "*" matches any ETag
 * If-None-Match: "etag1", "etag2" returns 304 if current ETag is in list
 *
 * @param {string} ifNoneMatchHeader - If-None-Match header value
 * @param {string} currentETag - Current resource ETag
 * @returns {boolean} True if resource was modified
 */
export function validateIfNoneMatch(ifNoneMatchHeader, currentETag) {
  if (!ifNoneMatchHeader) return true; // No condition = proceed normally

  // "*" never matches (used for PUT to ensure resource doesn't exist)
  if (ifNoneMatchHeader.trim() === '*') {
    return !currentETag;
  }

  // Parse comma-separated list of ETags
  const requestedETags = ifNoneMatchHeader
    .split(',')
    .map(e => e.trim());

  // Return false (304) if any requested ETag matches current
  return !requestedETags.some(reqETag => etagMatches(reqETag, currentETag));
}

/**
 * Helper: Generate ETag from s3db.js record
 * Uses _updatedAt timestamp if available, falls back to _createdAt
 *
 * @param {Object} record - s3db.js record
 * @returns {string} ETag value
 */
export function generateRecordETag(record) {
  if (!record) return null;

  const lastModified = record._updatedAt || record._createdAt;

  return generateETag(record, {
    weak: true,
    lastModified
  });
}
