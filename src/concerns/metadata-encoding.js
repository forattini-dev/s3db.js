/**
 * Metadata encoding for S3
 * Chooses optimal encoding based on content analysis
 */

/**
 * Analyze string content to determine best encoding strategy
 * @param {string} str - String to analyze
 * @returns {Object} Analysis result with encoding recommendation
 */
export function analyzeString(str) {
  if (!str || typeof str !== 'string') {
    return { type: 'none', safe: true };
  }

  let hasAscii = false;
  let hasLatin1 = false;
  let hasMultibyte = false;
  let asciiCount = 0;
  let latin1Count = 0;
  let multibyteCount = 0;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    
    if (code >= 0x20 && code <= 0x7E) {
      // Safe ASCII printable characters
      hasAscii = true;
      asciiCount++;
    } else if (code < 0x20 || code === 0x7F) {
      // Control characters - treat as multibyte since they need encoding
      hasMultibyte = true;
      multibyteCount++;
    } else if (code >= 0x80 && code <= 0xFF) {
      // Latin-1 extended characters
      hasLatin1 = true;
      latin1Count++;
    } else {
      // Multibyte UTF-8 characters
      hasMultibyte = true;
      multibyteCount++;
    }
  }

  // Pure ASCII - no encoding needed
  if (!hasLatin1 && !hasMultibyte) {
    return { 
      type: 'ascii',
      safe: true,
      stats: { ascii: asciiCount, latin1: 0, multibyte: 0 }
    };
  }

  // Has multibyte characters (emoji, CJK, etc)
  // These MUST be encoded as S3 rejects them
  if (hasMultibyte) {
    // If mostly multibyte, base64 is more efficient
    const multibyteRatio = multibyteCount / str.length;
    if (multibyteRatio > 0.3) {
      return {
        type: 'base64',
        safe: false,
        reason: 'high multibyte content',
        stats: { ascii: asciiCount, latin1: latin1Count, multibyte: multibyteCount }
      };
    }
    // Mixed content with some multibyte - use URL encoding
    return {
      type: 'url',
      safe: false,
      reason: 'contains multibyte characters',
      stats: { ascii: asciiCount, latin1: latin1Count, multibyte: multibyteCount }
    };
  }

  // Only Latin-1 extended characters
  // These get corrupted but don't cause errors
  // Choose based on efficiency: if Latin-1 is >50% of string, use base64
  const latin1Ratio = latin1Count / str.length;
  if (latin1Ratio > 0.5) {
    return {
      type: 'base64',
      safe: false,
      reason: 'high Latin-1 content',
      stats: { ascii: asciiCount, latin1: latin1Count, multibyte: 0 }
    };
  }
  
  return {
    type: 'url',
    safe: false,
    reason: 'contains Latin-1 extended characters',
    stats: { ascii: asciiCount, latin1: latin1Count, multibyte: 0 }
  };
}

/**
 * Encode a string for S3 metadata
 * @param {string} value - Value to encode
 * @returns {Object} Encoded value with metadata
 */
export function metadataEncode(value) {
  // Preserve null and undefined as special string values
  if (value === null) {
    return { encoded: 'null', encoding: 'special' };
  }
  if (value === undefined) {
    return { encoded: 'undefined', encoding: 'special' };
  }

  const stringValue = String(value);
  const analysis = analyzeString(stringValue);

  switch (analysis.type) {
    case 'none':
    case 'ascii':
      // No encoding needed
      return { 
        encoded: stringValue, 
        encoding: 'none',
        analysis 
      };

    case 'url':
      // URL encoding - prefix with 'u:' to indicate encoding
      return { 
        encoded: 'u:' + encodeURIComponent(stringValue),
        encoding: 'url',
        analysis
      };

    case 'base64':
      // Base64 encoding - prefix with 'b:' to indicate encoding
      return {
        encoded: 'b:' + Buffer.from(stringValue, 'utf8').toString('base64'),
        encoding: 'base64',
        analysis
      };

    default:
      // Fallback to base64 for safety
      return {
        encoded: 'b:' + Buffer.from(stringValue, 'utf8').toString('base64'),
        encoding: 'base64',
        analysis
      };
  }
}

/**
 * Decode a string from S3 metadata
 * @param {string} value - Value to decode
 * @returns {string} Decoded value
 */
export function metadataDecode(value) {
  // Handle special values
  if (value === 'null') {
    return null;
  }
  if (value === 'undefined') {
    return undefined;
  }
  
  if (value === null || value === undefined || typeof value !== 'string') {
    return value;
  }

  // Check for encoding prefix
  if (value.startsWith('u:')) {
    // URL encoded - but check if there's content after prefix
    if (value.length === 2) return value; // Just "u:" without content
    try {
      return decodeURIComponent(value.substring(2));
    } catch (err) {
      // If decode fails, return original
      return value;
    }
  }

  if (value.startsWith('b:')) {
    // Base64 encoded - but check if there's content after prefix
    if (value.length === 2) return value; // Just "b:" without content
    try {
      const decoded = Buffer.from(value.substring(2), 'base64').toString('utf8');
      return decoded;
    } catch (err) {
      // If decode fails, return original
      return value;
    }
  }

  // No prefix - return as is (backwards compatibility)
  // Try to detect if it's base64 without prefix (legacy)
  if (value.length > 0 && /^[A-Za-z0-9+/]+=*$/.test(value)) {
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      // Verify it's valid UTF-8 with special chars
      if (/[^\x00-\x7F]/.test(decoded) && Buffer.from(decoded, 'utf8').toString('base64') === value) {
        return decoded;
      }
    } catch {
      // Not base64, return as is
    }
  }

  return value;
}

/**
 * Calculate the encoded size for a given value
 * @param {string} value - Value to calculate size for
 * @returns {Object} Size information
 */
// Backwards compatibility exports
export { metadataEncode as smartEncode, metadataDecode as smartDecode };

export function calculateEncodedSize(value) {
  const analysis = analyzeString(value);
  const originalSize = Buffer.byteLength(value, 'utf8');
  
  let encodedSize;
  switch (analysis.type) {
    case 'none':
    case 'ascii':
      encodedSize = originalSize;
      break;
    case 'url':
      encodedSize = 2 + encodeURIComponent(value).length; // 'u:' prefix
      break;
    case 'base64':
      encodedSize = 2 + Buffer.from(value, 'utf8').toString('base64').length; // 'b:' prefix
      break;
    default:
      encodedSize = 2 + Buffer.from(value, 'utf8').toString('base64').length;
  }

  return {
    original: originalSize,
    encoded: encodedSize,
    overhead: encodedSize - originalSize,
    ratio: encodedSize / originalSize,
    encoding: analysis.type
  };
}