/**
 * Advanced metadata encoding for S3
 * Pattern-specific optimizations for common data types
 */

import { encode as toBase62, decode as fromBase62 } from './base62.js';

// Common dictionary values mapping
const DICTIONARY = {
  // Status values
  'active': '\x01',
  'inactive': '\x02',
  'pending': '\x03',
  'completed': '\x04',
  'failed': '\x05',
  'deleted': '\x06',
  'archived': '\x07',
  'draft': '\x08',
  
  // Booleans
  'true': '\x10',
  'false': '\x11',
  'yes': '\x12',
  'no': '\x13',
  '1': '\x14',
  '0': '\x15',
  
  // HTTP methods (lowercase for matching)
  'get': '\x20',
  'post': '\x21',
  'put': '\x22',
  'delete': '\x23',
  'patch': '\x24',
  'head': '\x25',
  'options': '\x26',
  
  // Common words
  'enabled': '\x30',
  'disabled': '\x31',
  'success': '\x32',
  'error': '\x33',
  'warning': '\x34',
  'info': '\x35',
  'debug': '\x36',
  'critical': '\x37',
  
  // Null-like values
  'null': '\x40',
  'undefined': '\x41',
  'none': '\x42',
  'empty': '\x43',
  'nil': '\x44',
};

// Reverse dictionary for decoding
const REVERSE_DICTIONARY = Object.fromEntries(
  Object.entries(DICTIONARY).map(([k, v]) => [v, k])
);

/**
 * Detect if string is a UUID
 */
function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * Detect if string is hexadecimal
 */
function isHexString(str) {
  return /^[0-9a-f]+$/i.test(str) && str.length >= 8 && str.length % 2 === 0;
}

/**
 * Detect if string is a timestamp (Unix or milliseconds)
 */
function isTimestamp(str) {
  if (!/^\d+$/.test(str)) return false;
  const num = parseInt(str);
  // Unix timestamps: 1000000000 (2001) to 2000000000 (2033)
  // Millisecond timestamps: 1000000000000 (2001) to 2000000000000 (2033)
  return (num >= 1000000000 && num <= 2000000000) || 
         (num >= 1000000000000 && num <= 2000000000000);
}

/**
 * Detect if string is an ISO 8601 timestamp
 */
function isISOTimestamp(str) {
  // Match ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ or ±HH:MM
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/.test(str);
}

/**
 * Detect if string is an integer that would benefit from base62
 */
function isBeneficialInteger(str) {
  if (!/^\d+$/.test(str)) return false;
  // Only beneficial if base62 would be shorter
  const num = parseInt(str);
  return toBase62(num).length < str.length;
}

/**
 * Encode a value using pattern detection
 */
export function advancedEncode(value) {
  // Handle null and undefined
  if (value === null) return { encoded: DICTIONARY['null'], method: 'dictionary' };
  if (value === undefined) return { encoded: DICTIONARY['undefined'], method: 'dictionary' };
  
  const str = String(value);
  
  // Empty string
  if (str === '') return { encoded: '', method: 'none' };
  
  // Check dictionary first (most efficient)
  const lowerStr = str.toLowerCase();
  if (DICTIONARY[lowerStr]) {
    return { 
      encoded: 'd' + DICTIONARY[lowerStr], 
      method: 'dictionary',
      original: str 
    };
  }
  
  // ISO Timestamp optimization - convert to Unix timestamp with base62
  if (isISOTimestamp(str)) {
    const unixMs = new Date(str).getTime();
    const hasMillis = str.includes('.');
    const encoded = toBase62(unixMs);  // Use milliseconds to preserve precision
    // Add a flag for whether original had milliseconds: m = with millis, s = without
    const flag = hasMillis ? 'm' : 's';
    return {
      encoded: 'i' + flag + encoded,  // 'i' prefix + flag + encoded timestamp
      method: 'iso-timestamp',
      original: str,
      savings: `${Math.round((1 - (encoded.length + 2)/str.length) * 100)}%`
    };
  }
  
  // Numeric timestamp optimization with base62 (check before hex)
  if (isTimestamp(str)) {
    const encoded = toBase62(parseInt(str));
    if (encoded.length < str.length) {
      return { 
        encoded: 't' + encoded,
        method: 'timestamp',
        original: str,
        savings: `${Math.round((1 - encoded.length/str.length) * 100)}%`
      };
    }
  }
  
  // UUID optimization: 36 chars → 16 bytes
  if (isUUID(str)) {
    const hex = str.replace(/-/g, '');
    const binary = Buffer.from(hex, 'hex');
    return { 
      encoded: 'u' + binary.toString('base64'), 
      method: 'uuid',
      original: str,
      savings: `${Math.round((1 - 24/36) * 100)}%` // base64 of 16 bytes = ~24 chars
    };
  }
  
  // Hex string optimization (MD5, SHA, ObjectId): 50% compression
  if (isHexString(str)) {
    const binary = Buffer.from(str, 'hex');
    return { 
      encoded: 'h' + binary.toString('base64'),
      method: 'hex',
      original: str,
      savings: '33%' // hex to base64 is ~33% savings
    };
  }
  
  // Integer optimization with base62
  if (isBeneficialInteger(str)) {
    const encoded = toBase62(parseInt(str));
    return { 
      encoded: 'n' + encoded,
      method: 'number',
      original: str,
      savings: `${Math.round((1 - encoded.length/str.length) * 100)}%`
    };
  }
  
  // Check if it's pure ASCII
  if (/^[\x20-\x7E]*$/.test(str)) {
    // Check for common prefixes we could optimize
    const prefixes = ['user_', 'sess_', 'item_', 'order_', 'tx_', 'id_', 'http://', 'https://'];
    for (const prefix of prefixes) {
      if (str.startsWith(prefix)) {
        // Could implement prefix table, but for now just mark it
        // In future: return { encoded: 'p' + prefixCode + str.slice(prefix.length), method: 'prefix' };
      }
    }
    
    // Pure ASCII, no encoding needed
    return { encoded: str, method: 'none' };
  }
  
  // Has special characters - fallback to smart encoding
  // Check for Latin-1 vs multibyte
  const hasMultibyte = /[^\x00-\xFF]/.test(str);
  
  if (hasMultibyte) {
    // Use base64 for emoji/CJK
    return { 
      encoded: 'b' + Buffer.from(str, 'utf8').toString('base64'),
      method: 'base64'
    };
  }
  
  // Latin-1 characters - use URL encoding
  return { 
    encoded: '%' + encodeURIComponent(str),
    method: 'url'
  };
}

/**
 * Decode an advanced-encoded value
 */
export function advancedDecode(value) {
  if (!value || typeof value !== 'string') return value;
  if (value.length === 0) return '';
  
  const prefix = value[0];
  const content = value.slice(1);
  
  switch (prefix) {
    case 'd': // Dictionary
      return REVERSE_DICTIONARY[content] || value;
    
    case 'i': // ISO timestamp
      try {
        const flag = content[0];  // 'm' = with millis, 's' = without
        const unixMs = fromBase62(content.slice(1));  // Now stored as milliseconds
        const date = new Date(unixMs);
        let iso = date.toISOString();
        // Format based on original
        if (flag === 's' && iso.endsWith('.000Z')) {
          iso = iso.replace('.000', '');
        }
        return iso;
      } catch {
        return value;
      }
    
    case 'u': // UUID
      try {
        const binary = Buffer.from(content, 'base64');
        const hex = binary.toString('hex');
        // Reconstruct UUID format
        return [
          hex.slice(0, 8),
          hex.slice(8, 12),
          hex.slice(12, 16),
          hex.slice(16, 20),
          hex.slice(20, 32)
        ].join('-');
      } catch {
        return value;
      }
    
    case 'h': // Hex string
      try {
        const binary = Buffer.from(content, 'base64');
        return binary.toString('hex');
      } catch {
        return value;
      }
    
    case 't': // Timestamp
    case 'n': // Number
      try {
        return String(fromBase62(content));
      } catch {
        return value;
      }
    
    case 'b': // Base64
      try {
        return Buffer.from(content, 'base64').toString('utf8');
      } catch {
        return value;
      }
    
    case '%': // URL encoded
      try {
        return decodeURIComponent(content);
      } catch {
        return value;
      }
    
    default:
      // No prefix - return as is
      return value;
  }
}

/**
 * Calculate size for advanced encoding
 */
export function calculateAdvancedSize(value) {
  const result = advancedEncode(value);
  const originalSize = Buffer.byteLength(String(value), 'utf8');
  const encodedSize = Buffer.byteLength(result.encoded, 'utf8');
  
  return {
    original: originalSize,
    encoded: encodedSize,
    method: result.method,
    savings: originalSize > 0 ? Math.round((1 - encodedSize/originalSize) * 100) : 0,
    ratio: originalSize > 0 ? encodedSize / originalSize : 1
  };
}

/**
 * Encode all values in a metadata object
 */
export function encodeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return metadata;
  
  const encoded = {};
  
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) {
      encoded[key] = value;
    } else if (Array.isArray(value)) {
      encoded[key] = value.map(v => {
        if (typeof v === 'string') {
          return advancedEncode(v).encoded;
        }
        return v;
      });
    } else if (typeof value === 'object' && !(value instanceof Date)) {
      encoded[key] = encodeMetadata(value);
    } else if (typeof value === 'string') {
      encoded[key] = advancedEncode(value).encoded;
    } else if (value instanceof Date) {
      encoded[key] = advancedEncode(value.toISOString()).encoded;
    } else {
      encoded[key] = value;
    }
  }
  
  return encoded;
}

/**
 * Decode all values in a metadata object
 */
export function decodeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return metadata;
  
  const decoded = {};
  
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) {
      decoded[key] = value;
    } else if (Array.isArray(value)) {
      decoded[key] = value.map(v => {
        if (typeof v === 'string') {
          return advancedDecode(v);
        }
        return v;
      });
    } else if (typeof value === 'object') {
      decoded[key] = decodeMetadata(value);
    } else if (typeof value === 'string') {
      decoded[key] = advancedDecode(value);
    } else {
      decoded[key] = value;
    }
  }
  
  return decoded;
}

/**
 * Batch optimize an object's values
 */
export function optimizeObjectValues(obj) {
  const optimized = {};
  const stats = {
    totalOriginal: 0,
    totalOptimized: 0,
    methods: {}
  };
  
  for (const [key, value] of Object.entries(obj)) {
    const result = advancedEncode(value);
    optimized[key] = result.encoded;
    
    const originalSize = Buffer.byteLength(String(value), 'utf8');
    const optimizedSize = Buffer.byteLength(result.encoded, 'utf8');
    
    stats.totalOriginal += originalSize;
    stats.totalOptimized += optimizedSize;
    stats.methods[result.method] = (stats.methods[result.method] || 0) + 1;
  }
  
  stats.savings = stats.totalOriginal > 0 ? 
    Math.round((1 - stats.totalOptimized/stats.totalOriginal) * 100) : 0;
  
  return { optimized, stats };
}

// Backwards compatibility exports
export { 
  advancedEncode as ultraEncode, 
  advancedDecode as ultraDecode,
  calculateAdvancedSize as calculateUltraSize,
  optimizeObjectValues as ultraOptimizeObject
};