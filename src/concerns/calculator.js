/**
 * Calculates the size in bytes of a string using UTF-8 encoding
 * @param {string} str - The string to calculate size for
 * @returns {number} - Size in bytes
 */
export function calculateUTF8Bytes(str) {
  if (typeof str !== 'string') {
    str = String(str);
  }
  
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.codePointAt(i);
    
    if (codePoint <= 0x7F) {
      // 1 byte: U+0000 to U+007F (ASCII characters)
      bytes += 1;
    } else if (codePoint <= 0x7FF) {
      // 2 bytes: U+0080 to U+07FF
      bytes += 2;
    } else if (codePoint <= 0xFFFF) {
      // 3 bytes: U+0800 to U+FFFF
      bytes += 3;
    } else if (codePoint <= 0x10FFFF) {
      // 4 bytes: U+10000 to U+10FFFF
      bytes += 4;
      // Skip the next character if it's a surrogate pair
      if (codePoint > 0xFFFF) {
        i++;
      }
    }
  }
  
  return bytes;
}

/**
 * Transforms a value according to the schema mapper rules
 * @param {any} value - The value to transform
 * @returns {string} - The transformed value as string
 */
export function transformValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  
  if (typeof value === 'number') {
    return String(value);
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (Array.isArray(value)) {
    // Handle arrays like in the schema mapper
    if (value.length === 0) {
      return '[]';
    }
    // For simplicity, join with | separator like in the schema
    return value.map(item => String(item)).join('|');
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  return String(value);
}

/**
 * Calculates the size in bytes of each attribute in a mapped object
 * @param {Object} mappedObject - The object returned by schema.mapper()
 * @returns {Object} - Object with attribute names as keys and byte sizes as values
 */
export function calculateAttributeSizes(mappedObject) {
  const sizes = {};
  
  for (const [key, value] of Object.entries(mappedObject)) {
    const transformedValue = transformValue(value);
    const byteSize = calculateUTF8Bytes(transformedValue);
    sizes[key] = byteSize;
  }
  
  return sizes;
}

/**
 * Calculates the total size in bytes of a mapped object
 * @param {Object} mappedObject - The object returned by schema.mapper()
 * @returns {number} - Total size in bytes
 */
export function calculateTotalSize(mappedObject) {
  const sizes = calculateAttributeSizes(mappedObject);
  return Object.values(sizes).reduce((total, size) => total + size, 0);
}

/**
 * Gets detailed size information for a mapped object
 * @param {Object} mappedObject - The object returned by schema.mapper()
 * @returns {Object} - Object with sizes, total, and breakdown information
 */
export function getSizeBreakdown(mappedObject) {
  const sizes = calculateAttributeSizes(mappedObject);
  const total = Object.values(sizes).reduce((sum, size) => sum + size, 0);
  
  // Sort attributes by size (largest first)
  const sortedAttributes = Object.entries(sizes)
    .sort(([, a], [, b]) => b - a)
    .map(([key, size]) => ({
      attribute: key,
      size,
      percentage: ((size / total) * 100).toFixed(2) + '%'
    }));
  
  return {
    total,
    sizes,
    breakdown: sortedAttributes
  };
}
