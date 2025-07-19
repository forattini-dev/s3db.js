import { calculateTotalSize, calculateAttributeSizes, calculateUTF8Bytes } from '../concerns/calculator.js';
import { calculateEffectiveLimit } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';

const TRUNCATED_FLAG = '$truncated';
const TRUNCATED_FLAG_VALUE = 'true';
const TRUNCATED_FLAG_BYTES = calculateUTF8Bytes(TRUNCATED_FLAG) + calculateUTF8Bytes(TRUNCATED_FLAG_VALUE);

/**
 * Data Truncate Behavior Configuration Documentation
 *
 * The `truncate-data` behavior optimizes metadata usage by sorting attributes by size
 * in ascending order and truncating the last attribute that fits within the available
 * space. This ensures all data stays in metadata for fast access while respecting
 * S3 metadata size limits.
 *
 * ## Purpose & Use Cases
 * - When you need fast access to all data (no body reads required)
 * - For objects that slightly exceed metadata limits
 * - When data loss through truncation is acceptable
 * - For frequently accessed data where performance is critical
 *
 * ## How It Works
 * 1. Calculates the size of each attribute
 * 2. Sorts attributes by size in ascending order (smallest first)
 * 3. Fills metadata with small attributes until limit is approached
 * 4. Truncates the last attribute that fits to maximize data retention
 * 5. Adds a `$truncated` flag to indicate truncation occurred
 *
 * ## Performance Characteristics
 * - Fastest possible access (all data in metadata)
 * - No body reads required
 * - Potential data loss through truncation
 * - Optimal for frequently accessed data
 *
 * @example
 * // Create a resource with truncate-data behavior
 * const resource = await db.createResource({
 *   name: 'fast_access_data',
 *   attributes: { ... },
 *   behavior: 'truncate-data'
 * });
 *
 * // Small fields stay intact, large fields get truncated
 * const doc = await resource.insert({
 *   id: 'doc123',           // Small -> intact
 *   title: 'Short Title',   // Small -> intact
 *   content: 'Very long...', // Large -> truncated
 *   metadata: { ... }       // Large -> truncated
 * });
 *
 * ## Comparison to Other Behaviors
 * | Behavior         | Metadata Usage | Body Usage | Size Limits | Performance |
 * |------------------|----------------|------------|-------------|-------------|
 * | truncate-data    | All (truncated)| None       | 2KB metadata | Fast reads   |
 * | body-overflow    | Optimized      | Overflow   | 2KB metadata | Balanced     |
 * | body-only        | Minimal (_v)   | All data   | 5TB         | Slower reads |
 * | enforce-limits   | All (limited)  | None       | 2KB metadata | Fast reads   |
 * | user-managed     | All (unlimited)| None       | S3 limit    | Fast reads   |
 *
 * @typedef {Object} DataTruncateBehaviorConfig
 * @property {boolean} [enabled=true] - Whether the behavior is active
 * @property {string} [truncateIndicator='...'] - String to append when truncating
 * @property {string[]} [priorityFields] - Fields that should not be truncated
 * @property {boolean} [preserveStructure=true] - Whether to preserve JSON structure
 */
export async function handleInsert({ resource, data, mappedData, originalData }) {
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id: data.id
    }
  });

  const attributeSizes = calculateAttributeSizes(mappedData);
  const sortedFields = Object.entries(attributeSizes)
    .sort(([, a], [, b]) => a - b);

  const resultFields = {};
  let currentSize = 0;
  let truncated = false;

  // Always include version field first
  if (mappedData._v) {
    resultFields._v = mappedData._v;
    currentSize += attributeSizes._v;
  }

  // Add fields to metadata until we reach the limit
  for (const [fieldName, size] of sortedFields) {
    if (fieldName === '_v') continue;
    
    const fieldValue = mappedData[fieldName];
    const spaceNeeded = size + (truncated ? 0 : TRUNCATED_FLAG_BYTES);
    
    if (currentSize + spaceNeeded <= effectiveLimit) {
      // Field fits completely
      resultFields[fieldName] = fieldValue;
      currentSize += size;
    } else {
      // Field needs to be truncated
      const availableSpace = effectiveLimit - currentSize - (truncated ? 0 : TRUNCATED_FLAG_BYTES);
      if (availableSpace > 0) {
        // We can fit part of this field
        const truncatedValue = truncateValue(fieldValue, availableSpace);
        resultFields[fieldName] = truncatedValue;
        truncated = true;
        currentSize += calculateUTF8Bytes(truncatedValue);
      } else {
        // Field doesn't fit at all, but keep it as empty string
        resultFields[fieldName] = '';
        truncated = true;
      }
      // Stop processing - we've reached the limit
      break;
    }
  }

  // Verify we're within limits and adjust if necessary
  let finalSize = calculateTotalSize(resultFields) + (truncated ? TRUNCATED_FLAG_BYTES : 0);
  
  // If still over limit, keep removing/truncating fields until we fit
  while (finalSize > effectiveLimit) {
    const fieldNames = Object.keys(resultFields).filter(f => f !== '_v' && f !== '$truncated');
    if (fieldNames.length === 0) {
      // Only version field remains, this shouldn't happen but just in case
      break;
    }
    
    // Remove the last field but keep it as empty string
    const lastField = fieldNames[fieldNames.length - 1];
    resultFields[lastField] = '';
    
    // Recalculate size
    finalSize = calculateTotalSize(resultFields) + TRUNCATED_FLAG_BYTES;
    truncated = true;
  }

  if (truncated) {
    resultFields[TRUNCATED_FLAG] = TRUNCATED_FLAG_VALUE;
  }

  return { mappedData: resultFields, body: JSON.stringify(mappedData) };
}

export async function handleUpdate({ resource, id, data, mappedData, originalData }) {
  return handleInsert({ resource, data, mappedData, originalData });
}

export async function handleUpsert({ resource, id, data, mappedData }) {
  return handleInsert({ resource, data, mappedData });
}

export async function handleGet({ resource, metadata, body }) {
  // For truncate-data, all data is in metadata, no body processing needed
  return { metadata, body };
}

/**
 * Truncate a value to fit within the specified byte limit
 * @param {any} value - The value to truncate
 * @param {number} maxBytes - Maximum bytes allowed
 * @returns {any} - Truncated value
 */
function truncateValue(value, maxBytes) {
  if (typeof value === 'string') {
    return truncateString(value, maxBytes);
  } else if (typeof value === 'object' && value !== null) {
          // Truncate object as truncated JSON string
    const jsonStr = JSON.stringify(value);
    return truncateString(jsonStr, maxBytes);
  } else {
    // For numbers, booleans, etc., convert to string and truncate
    const stringValue = String(value);
    return truncateString(stringValue, maxBytes);
  }
}

/**
 * Truncate a string to fit within byte limit
 * @param {string} str - String to truncate
 * @param {number} maxBytes - Maximum bytes allowed
 * @returns {string} - Truncated string
 */
function truncateString(str, maxBytes) {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(str);
  if (bytes.length <= maxBytes) {
    return str;
  }
  // Trunca sem adicionar '...'
  let length = str.length;
  while (length > 0) {
    const truncated = str.substring(0, length);
    bytes = encoder.encode(truncated);
    if (bytes.length <= maxBytes) {
      return truncated;
    }
    length--;
  }
  return '';
}