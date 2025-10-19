/**
 * Dictionary Encoding for Common Metadata Values
 *
 * Provides massive compression for frequently-used long strings:
 * - Content-Types: application/json (16B) → j (1B) = -93.75%
 * - URL Prefixes: https://api.example.com/ (24B) → @a (2B) = -91.7%
 * - Status Messages: processing (10B) → p (1B) = -90%
 *
 * Encoding format: 'd:{code}' where {code} is 1-2 characters
 * Example: 'd:j' = application/json (3B vs 16B = -81% with prefix!)
 */

/**
 * Content-Type Dictionary
 * Most common MIME types with massive savings potential
 * Format: 'original_value' → 'single_char_code'
 */
const CONTENT_TYPE_DICT = {
  // JSON/XML (most common, highest savings)
  'application/json': 'j',              // 16B → 1B = -93.75%
  'application/xml': 'X',               // 15B → 1B = -93.3% (changed from 'x' to avoid conflict)
  'application/ld+json': 'J',           // 20B → 1B = -95%

  // Text types
  'text/html': 'H',                     // 9B → 1B = -88.9% (changed from 'h' to avoid conflict)
  'text/plain': 'T',                    // 10B → 1B = -90% (changed from 'p' to avoid conflict)
  'text/css': 'C',                      // 8B → 1B = -87.5% (changed from 'c' to avoid conflict)
  'text/javascript': 'V',               // 15B → 1B = -93.3% (changed from 's' to avoid conflict)
  'text/csv': 'v',                      // 8B → 1B = -87.5%

  // Images
  'image/png': 'P',                     // 9B → 1B = -88.9%
  'image/jpeg': 'I',                    // 10B → 1B = -90%
  'image/gif': 'G',                     // 9B → 1B = -88.9%
  'image/svg+xml': 'S',                 // 13B → 1B = -92.3%
  'image/webp': 'W',                    // 10B → 1B = -90%

  // Application types
  'application/pdf': 'Q',               // 15B → 1B = -93.3% (changed from 'd' to avoid conflict)
  'application/zip': 'z',               // 15B → 1B = -93.3%
  'application/octet-stream': 'o',      // 24B → 1B = -95.8%
  'application/x-www-form-urlencoded': 'u', // 33B → 1B = -97%
  'multipart/form-data': 'F',           // 19B → 1B = -94.7% (changed from 'f' to avoid conflict)

  // Font types
  'font/woff': 'w',                     // 9B → 1B = -88.9%
  'font/woff2': 'f'                     // 10B → 1B = -90% (changed from 'F')
};

/**
 * URL Prefix Dictionary
 * Common URL prefixes that appear in paths, webhooks, API endpoints
 * Format: 'prefix' → '@{code}'
 */
const URL_PREFIX_DICT = {
  // API endpoints (very common)
  '/api/v1/': '@1',                     // 8B → 2B = -75%
  '/api/v2/': '@2',                     // 8B → 2B = -75%
  '/api/v3/': '@3',                     // 8B → 2B = -75%
  '/api/': '@a',                        // 5B → 2B = -60%

  // HTTPS prefixes
  'https://api.example.com/': '@A',     // 24B → 2B = -91.7%
  'https://api.': '@H',                 // 11B → 2B = -81.8%
  'https://www.': '@W',                 // 12B → 2B = -83.3%
  'https://': '@h',                     // 8B → 2B = -75%
  'http://': '@t',                      // 7B → 2B = -71.4%

  // AWS/S3 (common in s3db.js context)
  'https://s3.amazonaws.com/': '@s',    // 26B → 2B = -92.3%
  'https://s3-': '@S',                  // 10B → 2B = -80%

  // Localhost (development)
  'http://localhost:': '@L',            // 17B → 2B = -88.2%
  'http://localhost': '@l',             // 16B → 2B = -87.5%

  // Common paths
  '/v1/': '@v',                         // 4B → 2B = -50%
  '/users/': '@u',                      // 7B → 2B = -71.4%
  '/products/': '@p'                    // 10B → 2B = -80%
};

/**
 * Status Message Dictionary
 * Common status/state strings
 * Format: 'status' → 'code'
 */
const STATUS_MESSAGE_DICT = {
  // Processing states (very common, good savings)
  'processing': 'p',                    // 10B → 1B = -90%
  'completed': 'c',                     // 9B → 1B = -88.9%
  'succeeded': 's',                     // 9B → 1B = -88.9%
  'failed': 'f',                        // 6B → 1B = -83.3%
  'cancelled': 'x',                     // 9B → 1B = -88.9%
  'timeout': 't',                       // 7B → 1B = -85.7%
  'retrying': 'r',                      // 8B → 1B = -87.5%

  // Payment states
  'authorized': 'a',                    // 10B → 1B = -90%
  'captured': 'K',                      // 8B → 1B = -87.5% (changed from C to avoid conflict)
  'refunded': 'R',                      // 8B → 1B = -87.5%
  'declined': 'd',                      // 8B → 1B = -87.5%

  // Order/delivery states
  'shipped': 'h',                       // 7B → 1B = -85.7% (changed from S to avoid conflict)
  'delivered': 'D',                     // 9B → 1B = -88.9%
  'returned': 'e',                      // 8B → 1B = -87.5% (changed from T to avoid conflict)
  'in_transit': 'i',                    // 10B → 1B = -90%

  // Generic states
  'initialized': 'n',                   // 11B → 1B = -90.9% (changed from I to avoid conflict)
  'terminated': 'm'                     // 10B → 1B = -90% (changed from X to avoid conflict)
};

/**
 * Reverse dictionaries for decoding
 * Built automatically from forward dictionaries
 */
const CONTENT_TYPE_REVERSE = Object.fromEntries(
  Object.entries(CONTENT_TYPE_DICT).map(([k, v]) => [v, k])
);

const URL_PREFIX_REVERSE = Object.fromEntries(
  Object.entries(URL_PREFIX_DICT).map(([k, v]) => [v, k])
);

const STATUS_MESSAGE_REVERSE = Object.fromEntries(
  Object.entries(STATUS_MESSAGE_DICT).map(([k, v]) => [v, k])
);

/**
 * Combined dictionaries for easier lookup
 * All dictionaries merged into one for encoding
 */
const COMBINED_DICT = {
  ...CONTENT_TYPE_DICT,
  ...STATUS_MESSAGE_DICT
  // URL prefixes handled separately (prefix matching)
};

const COMBINED_REVERSE = {
  ...CONTENT_TYPE_REVERSE,
  ...STATUS_MESSAGE_REVERSE
  // URL prefixes handled separately
};

/**
 * Encode a value using dictionary if available
 * @param {string} value - Value to encode
 * @returns {Object|null} Encoded result or null if not in dictionary
 */
export function dictionaryEncode(value) {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  // Check exact match first (content-types, status messages)
  if (COMBINED_DICT[value]) {
    return {
      encoded: 'd:' + COMBINED_DICT[value],
      encoding: 'dictionary',
      originalLength: value.length,
      encodedLength: 2 + COMBINED_DICT[value].length,
      dictionaryType: 'exact',
      savings: value.length - (2 + COMBINED_DICT[value].length)
    };
  }

  // Check URL prefix matching (for paths, URLs)
  // Sort prefixes by length (longest first) to prioritize specific matches
  const sortedPrefixes = Object.entries(URL_PREFIX_DICT)
    .sort(([a], [b]) => b.length - a.length);

  for (const [prefix, code] of sortedPrefixes) {
    if (value.startsWith(prefix)) {
      const remainder = value.substring(prefix.length);
      const encoded = 'd:' + code + remainder;

      return {
        encoded,
        encoding: 'dictionary',
        originalLength: value.length,
        encodedLength: encoded.length,
        dictionaryType: 'prefix',
        prefix,
        remainder,
        savings: value.length - encoded.length
      };
    }
  }

  // Not in dictionary
  return null;
}

/**
 * Decode a dictionary-encoded value
 * @param {string} encoded - Encoded value (starts with 'd:')
 * @returns {string|null} Decoded value or null if not dictionary-encoded
 */
export function dictionaryDecode(encoded) {
  if (typeof encoded !== 'string' || !encoded.startsWith('d:')) {
    return null;
  }

  const payload = encoded.substring(2); // Remove 'd:' prefix

  if (payload.length === 0) {
    return null;
  }

  // Try exact match first (single character codes)
  if (payload.length === 1) {
    const decoded = COMBINED_REVERSE[payload];
    if (decoded) {
      return decoded;
    }
  }

  // Try URL prefix match (starts with @)
  if (payload.startsWith('@')) {
    // Extract prefix code (1-2 chars after @)
    const prefixCode = payload.substring(0, 2); // '@' + 1 char
    const remainder = payload.substring(2);

    const prefix = URL_PREFIX_REVERSE[prefixCode];
    if (prefix) {
      return prefix + remainder;
    }
  }

  // Unknown dictionary code - return null (fall back to original)
  return null;
}

/**
 * Calculate compression ratio for a value
 * @param {string} value - Original value
 * @returns {Object} Compression statistics
 */
export function calculateDictionaryCompression(value) {
  const result = dictionaryEncode(value);

  if (!result) {
    return {
      compressible: false,
      original: value.length,
      encoded: value.length,
      savings: 0,
      ratio: 1.0
    };
  }

  return {
    compressible: true,
    original: result.originalLength,
    encoded: result.encodedLength,
    savings: result.savings,
    ratio: result.encodedLength / result.originalLength,
    savingsPercent: ((result.savings / result.originalLength) * 100).toFixed(1) + '%'
  };
}

/**
 * Get dictionary statistics (for debugging/monitoring)
 * @returns {Object} Statistics about dictionaries
 */
export function getDictionaryStats() {
  return {
    contentTypes: Object.keys(CONTENT_TYPE_DICT).length,
    urlPrefixes: Object.keys(URL_PREFIX_DICT).length,
    statusMessages: Object.keys(STATUS_MESSAGE_DICT).length,
    total: Object.keys(COMBINED_DICT).length + Object.keys(URL_PREFIX_DICT).length,
    avgSavingsContentType:
      Object.keys(CONTENT_TYPE_DICT).reduce((sum, key) =>
        sum + (key.length - (2 + CONTENT_TYPE_DICT[key].length)), 0
      ) / Object.keys(CONTENT_TYPE_DICT).length,
    avgSavingsStatus:
      Object.keys(STATUS_MESSAGE_DICT).reduce((sum, key) =>
        sum + (key.length - (2 + STATUS_MESSAGE_DICT[key].length)), 0
      ) / Object.keys(STATUS_MESSAGE_DICT).length
  };
}

export default {
  dictionaryEncode,
  dictionaryDecode,
  calculateDictionaryCompression,
  getDictionaryStats,
  // Export dictionaries for testing
  CONTENT_TYPE_DICT,
  URL_PREFIX_DICT,
  STATUS_MESSAGE_DICT
};
