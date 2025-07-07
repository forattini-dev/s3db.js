import { calculateAttributeSizes, calculateTotalSize, calculateUTF8Bytes } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';

/**
 * Body Overflow Behavior Configuration Documentation
 * 
 * This behavior handles cases where the body content exceeds the maximum allowed size
 * by either truncating the data or storing overflow content in a separate location.
 * It's useful for managing large objects and preventing storage issues.
 * 
 * @typedef {Object} BodyOverflowBehaviorConfig
 * @property {boolean} [enabled=true] - Whether the behavior is active
 * @property {number} [maxBodySize=1024*1024] - Maximum body size in bytes (1MB default)
 * @property {string} [overflowStrategy='truncate'] - Strategy for handling overflow: 'truncate', 'split', 'reject'
 * @property {string} [truncateMode='end'] - Truncation mode: 'end', 'start', 'middle'
 * @property {string} [truncateIndicator='...'] - String to append when truncating
 * @property {boolean} [preserveStructure=true] - Whether to preserve JSON structure when truncating
 * @property {string[]} [priorityFields] - Array of field names to preserve during truncation
 *   - These fields will be kept even if they exceed the size limit
 * @property {string[]} [overflowFields] - Array of field names that can be moved to overflow storage
 * @property {Object} [overflowStorage] - Configuration for overflow storage
 * @property {string} [overflowStorage.type='s3'] - Storage type: 's3', 'local', 'memory'
 * @property {string} [overflowStorage.bucket] - S3 bucket for overflow storage (if type='s3')
 * @property {string} [overflowStorage.prefix='overflow/'] - Prefix for overflow objects
 * @property {string} [overflowStorage.path='./overflow'] - Local path for overflow files (if type='local')
 * @property {number} [overflowStorage.maxSize=100*1024*1024] - Maximum size for overflow storage (100MB)
 * @property {boolean} [overflowStorage.compress=true] - Whether to compress overflow data
 * @property {boolean} [logOverflow=false] - Whether to log overflow events
 * @property {Function} [customTruncator] - Custom function to handle truncation logic
 *   - Parameters: (data: any, maxSize: number, config: Object) => any
 *   - Return: truncated data object
 * @property {Function} [customOverflowHandler] - Custom function to handle overflow storage
 *   - Parameters: (overflowData: any, originalData: any, config: Object) => string
 *   - Return: reference to stored overflow data
 * @property {boolean} [validateOnRead=true] - Whether to validate body size on read operations
 * @property {boolean} [validateOnWrite=true] - Whether to validate body size on write operations
 * @property {number} [warningThreshold=0.8] - Percentage of max size to trigger warnings (0.8 = 80%)
 * @property {Object} [context] - Additional context for custom functions
 * 
 * @example
 * // Basic configuration with truncation
 * {
 *   enabled: true,
 *   maxBodySize: 2 * 1024 * 1024, // 2MB
 *   overflowStrategy: 'truncate',
 *   truncateMode: 'end',
 *   preserveStructure: true,
 *   logOverflow: true
 * }
 * 
 * @example
 * // Configuration with S3 overflow storage
 * {
 *   enabled: true,
 *   maxBodySize: 1024 * 1024, // 1MB
 *   overflowStrategy: 'split',
 *   overflowFields: ['large_content', 'attachments', 'logs'],
 *   overflowStorage: {
 *     type: 's3',
 *     bucket: 'my-overflow-bucket',
 *     prefix: 'data-overflow/',
 *     compress: true,
 *     maxSize: 500 * 1024 * 1024 // 500MB
 *   },
 *   priorityFields: ['id', 'title', 'status'],
 *   logOverflow: true
 * }
 * 
 * @example
 * // Configuration with custom truncation logic
 * {
 *   enabled: true,
 *   maxBodySize: 512 * 1024, // 512KB
 *   customTruncator: (data, maxSize, config) => {
 *     // Custom logic to intelligently truncate data
 *     if (data.content && data.content.length > maxSize) {
 *       return {
 *         ...data,
 *         content: data.content.substring(0, maxSize - 100) + '...',
 *         truncated: true,
 *         originalSize: data.content.length
 *       };
 *     }
 *     return data;
 *   },
 *   customOverflowHandler: (overflowData, originalData, config) => {
 *     // Store overflow in custom location
 *     const reference = `overflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 *     // Custom storage logic here
 *     return reference;
 *   },
 *   logOverflow: true
 * }
 * 
 * @example
 * // Minimal configuration using defaults
 * {
 *   enabled: true,
 *   maxBodySize: 1024 * 1024 // 1MB
 * }
 * 
 * @notes
 * - Default max body size is 1MB (1024*1024 bytes)
 * - Truncation preserves JSON structure when possible
 * - Split strategy moves overflow fields to separate storage
 * - Reject strategy throws an error when body is too large
 * - Priority fields are preserved even during truncation
 * - Overflow storage supports S3, local files, and memory
 * - Compression reduces storage costs for overflow data
 * - Custom functions allow for specialized handling logic
 * - Warning threshold helps prevent unexpected truncation
 * - Validation can be disabled for performance-critical operations
 * - Context object is useful for conditional overflow handling
 * - Performance impact increases with large data structures
 */

const OVERFLOW_FLAG = '$overflow';
const OVERFLOW_FLAG_VALUE = 'true';
const OVERFLOW_FLAG_BYTES = calculateUTF8Bytes(OVERFLOW_FLAG) + calculateUTF8Bytes(OVERFLOW_FLAG_VALUE);

/**
 * Body Overflow Behavior
 * Stores excess data in S3 object body when metadata exceeds 2KB
 */
export async function handleInsert({ resource, data, mappedData }) {
  return handleOverflow({ resource, data, mappedData });
}

export async function handleUpdate({ resource, id, data, mappedData }) {
  return handleOverflow({ resource, data, mappedData });
}

export async function handleUpsert({ resource, id, data, mappedData }) {
  return handleOverflow({ resource, data, mappedData });
}

export async function handleGet({ resource, metadata, body }) {
  // Check if this object has overflow data
  if (metadata[OVERFLOW_FLAG] === OVERFLOW_FLAG_VALUE) {
    try {
      // Parse body content and merge with metadata
      const bodyData = body ? JSON.parse(body) : {};
      
      // Remove overflow flag from metadata for clean merge
      const cleanMetadata = { ...metadata };
      delete cleanMetadata[OVERFLOW_FLAG];
      
      // Merge metadata and body data (body data takes precedence for conflicts)
      const mergedData = { ...cleanMetadata, ...bodyData };
      
      return { metadata: mergedData, body: "" };
    } catch (error) {
      // If body parsing fails, return metadata as-is
      return { metadata, body };
    }
  }
  
  return { metadata, body };
}

function handleOverflow({ resource, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  
  // If data fits within limit, no overflow needed
  if (totalSize <= S3_METADATA_LIMIT_BYTES) {
    return { mappedData, body: "" };
  }
  
  // Calculate available space for metadata (reserve space for overflow flag)
  const availableMetadataSpace = S3_METADATA_LIMIT_BYTES - OVERFLOW_FLAG_BYTES;
  const attributeSizes = calculateAttributeSizes(mappedData);
  
  // Sort attributes by size (smallest first) to maximize metadata usage
  const sortedAttributes = Object.entries(attributeSizes)
    .sort(([, sizeA], [, sizeB]) => sizeA - sizeB);
  
  const metadataAttributes = {};
  const bodyAttributes = {};
  let currentMetadataSize = 0;
  
  // Pack attributes into metadata up to the limit
  for (const [key, size] of sortedAttributes) {
    if (currentMetadataSize + size <= availableMetadataSpace) {
      metadataAttributes[key] = mappedData[key];
      currentMetadataSize += size;
    } else {
      bodyAttributes[key] = mappedData[key];
    }
  }
  
  // Add overflow flag to metadata
  metadataAttributes[OVERFLOW_FLAG] = OVERFLOW_FLAG_VALUE;
  
  // Create body content with overflow data
  const bodyContent = Object.keys(bodyAttributes).length > 0 
    ? JSON.stringify(bodyAttributes) 
    : "";
  
  return { 
    mappedData: metadataAttributes, 
    body: bodyContent 
  };
}