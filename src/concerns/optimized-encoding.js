/**
 * Optimized encoding for S3 metadata without prefixes where possible
 * Uses heuristics to minimize overhead while maintaining reliability
 */

/**
 * Check if a string looks like base64
 */
function looksLikeBase64(str) {
  if (!str || str.length < 4) return false;
  // Base64 pattern with optional padding
  return /^[A-Za-z0-9+/]+=*$/.test(str) && str.length % 4 === 0;
}

/**
 * Smart encode with minimal overhead
 */
export function optimizedEncode(value) {
  // Handle special values
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  
  const str = String(value);
  
  // Empty string
  if (str === '') return '';
  
  // Check if pure ASCII (printable characters only)
  if (/^[\x20-\x7E]*$/.test(str)) {
    // Pure ASCII - but check if it looks like base64 to avoid confusion
    if (looksLikeBase64(str)) {
      // Add a marker to distinguish from actual base64
      return '!' + str;
    }
    return str;
  }
  
  // Has non-ASCII characters - must encode
  const hasMultibyte = /[^\x00-\xFF]/.test(str);
  
  if (hasMultibyte) {
    // Has emoji/CJK - must use base64
    return Buffer.from(str, 'utf8').toString('base64');
  }
  
  // Only Latin-1 extended - calculate which is more efficient
  const base64 = Buffer.from(str, 'utf8').toString('base64');
  const urlEncoded = encodeURIComponent(str);
  
  // Use whichever is shorter
  if (urlEncoded.length <= base64.length) {
    return '%' + urlEncoded; // % prefix for URL encoded
  }
  
  return base64;
}

/**
 * Smart decode with minimal overhead
 */
export function optimizedDecode(value) {
  if (value === 'null') return null;
  if (value === 'undefined') return undefined;
  if (value === '' || value === null || value === undefined) return value;
  
  const str = String(value);
  
  // Check for our markers
  if (str.startsWith('!')) {
    // ASCII that looked like base64
    return str.substring(1);
  }
  
  if (str.startsWith('%')) {
    // URL encoded
    try {
      return decodeURIComponent(str.substring(1));
    } catch {
      return str;
    }
  }
  
  // Try to detect base64
  if (looksLikeBase64(str)) {
    try {
      const decoded = Buffer.from(str, 'base64').toString('utf8');
      // Verify it's valid UTF-8 with non-ASCII
      if (/[^\x00-\x7F]/.test(decoded)) {
        // Check if re-encoding matches
        if (Buffer.from(decoded, 'utf8').toString('base64') === str) {
          return decoded;
        }
      }
    } catch {
      // Not base64
    }
  }
  
  // Return as-is
  return str;
}

/**
 * Compare encoding strategies
 */
export function compareEncodings(value) {
  const str = String(value);
  const originalBytes = Buffer.byteLength(str, 'utf8');
  
  // Calculate all options
  const base64 = Buffer.from(str, 'utf8').toString('base64');
  const base64WithPrefix = 'b:' + base64;
  const urlEncoded = encodeURIComponent(str);
  const urlWithPrefix = 'u:' + urlEncoded;
  const optimized = optimizedEncode(value);
  
  return {
    original: originalBytes,
    base64Pure: base64.length,
    base64Prefixed: base64WithPrefix.length,
    urlPure: urlEncoded.length,
    urlPrefixed: urlWithPrefix.length,
    optimized: optimized.length,
    optimizedMethod: 
      optimized === str ? 'none' :
      optimized.startsWith('!') ? 'ascii-marked' :
      optimized.startsWith('%') ? 'url' :
      looksLikeBase64(optimized) ? 'base64' : 'unknown'
  };
}