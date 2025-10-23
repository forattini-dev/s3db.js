// Memory cache for UTF-8 byte calculations
// Using Map for simple strings, with a max size to prevent memory leaks
const utf8BytesMemory = new Map();
const UTF8_MEMORY_MAX_SIZE = 10000; // Limit memory size

/**
 * Calculates the size in bytes of a string using UTF-8 encoding
 * @param {string} str - The string to calculate size for
 * @returns {number} - Size in bytes
 */
export function calculateUTF8Bytes(str) {
  if (typeof str !== 'string') {
    str = String(str);
  }
  
  // Check memory first
  if (utf8BytesMemory.has(str)) {
    return utf8BytesMemory.get(str);
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
  
  // Add to memory if under size limit
  if (utf8BytesMemory.size < UTF8_MEMORY_MAX_SIZE) {
    utf8BytesMemory.set(str, bytes);
  } else if (utf8BytesMemory.size === UTF8_MEMORY_MAX_SIZE) {
    // Simple LRU: clear half of memory when full
    const entriesToDelete = Math.floor(UTF8_MEMORY_MAX_SIZE / 2);
    let deleted = 0;
    for (const key of utf8BytesMemory.keys()) {
      if (deleted >= entriesToDelete) break;
      utf8BytesMemory.delete(key);
      deleted++;
    }
    utf8BytesMemory.set(str, bytes);
  }
  
  return bytes;
}

/**
 * Clear the UTF-8 memory cache (useful for testing or memory management)
 */
export function clearUTF8Memory() {
  utf8BytesMemory.clear();
}

/**
 * Calculates the size in bytes of attribute names (mapped to digits)
 * @param {Object} mappedObject - The object returned by schema.mapper()
 * @returns {number} - Total size of attribute names in bytes
 */
export function calculateAttributeNamesSize(mappedObject) {
  let totalSize = 0;
  
  for (const key of Object.keys(mappedObject)) {
    totalSize += calculateUTF8Bytes(key);
  }
  
  return totalSize;
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
 * Calculates the total size in bytes of a mapped object (including attribute names)
 * @param {Object} mappedObject - The object returned by schema.mapper()
 * @returns {number} - Total size in bytes
 */
export function calculateTotalSize(mappedObject) {
  const valueSizes = calculateAttributeSizes(mappedObject);
  const valueTotal = Object.values(valueSizes).reduce((total, size) => total + size, 0);
  
  // Add the size of attribute names (digits)
  const namesSize = calculateAttributeNamesSize(mappedObject);
  
  return valueTotal + namesSize;
}

/**
 * Gets detailed size information for a mapped object
 * @param {Object} mappedObject - The object returned by schema.mapper()
 * @returns {Object} - Object with sizes, total, and breakdown information
 */
export function getSizeBreakdown(mappedObject) {
  const valueSizes = calculateAttributeSizes(mappedObject);
  const namesSize = calculateAttributeNamesSize(mappedObject);
  
  const valueTotal = Object.values(valueSizes).reduce((sum, size) => sum + size, 0);
  const total = valueTotal + namesSize;
  
  // Sort attributes by size (largest first)
  const sortedAttributes = Object.entries(valueSizes)
    .sort(([, a], [, b]) => b - a)
    .map(([key, size]) => ({
      attribute: key,
      size,
      percentage: ((size / total) * 100).toFixed(2) + '%'
    }));
  
  return {
    total,
    valueSizes,
    namesSize,
    valueTotal,
    breakdown: sortedAttributes,
    // Add detailed breakdown including names
    detailedBreakdown: {
      values: valueTotal,
      names: namesSize,
      total: total
    }
  };
}

/**
 * Calculates the minimum overhead required for system fields
 * @param {Object} config - Configuration object
 * @param {string} [config.version='1'] - Resource version
 * @param {boolean} [config.timestamps=false] - Whether timestamps are enabled
 * @param {string} [config.id=''] - Resource ID (if known)
 * @returns {number} - Minimum overhead in bytes
 */
export function calculateSystemOverhead(config = {}) {
  const { version = '1', timestamps = false, id = '' } = config;
  
  // System fields that are always present
  const systemFields = {
    '_v': String(version), // Version field (e.g., "1", "10", "100")
  };
  
  // Optional system fields
  if (timestamps) {
    systemFields.createdAt = '2024-01-01T00:00:00.000Z'; // Example timestamp
    systemFields.updatedAt = '2024-01-01T00:00:00.000Z'; // Example timestamp
  }
  
  if (id) {
    systemFields.id = id;
  }
  
  // Calculate overhead for system fields
  const overheadObject = {};
  for (const [key, value] of Object.entries(systemFields)) {
    overheadObject[key] = value;
  }
  
  return calculateTotalSize(overheadObject);
}

/**
 * Calculates the effective metadata limit considering system overhead
 * @param {Object} config - Configuration object
 * @param {number} [config.s3Limit=2048] - S3 metadata limit in bytes
 * @param {Object} [config.systemConfig] - System configuration for overhead calculation
 * @returns {number} - Effective limit in bytes
 */
export function calculateEffectiveLimit(config = {}) {
  const { s3Limit = 2048, systemConfig = {} } = config;
  const overhead = calculateSystemOverhead(systemConfig);
  return s3Limit - overhead;
}
