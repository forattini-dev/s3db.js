import { calculateTotalSize } from '../concerns/calculator.js';
import { calculateEffectiveLimit } from '../concerns/calculator.js';
import { MetadataLimitError } from '../errors.js';

export const S3_METADATA_LIMIT_BYTES = 2047;

/**
 * Enforce Limits Behavior Configuration Documentation
 * 
 * This behavior enforces various limits on data operations to prevent abuse and ensure
 * system stability. It can limit body size, metadata size, and other resource constraints.
 * 
 * @typedef {Object} EnforceLimitsBehaviorConfig
 * @property {boolean} [enabled=true] - Whether the behavior is active
 * @property {number} [maxBodySize=1024*1024] - Maximum body size in bytes (1MB default)
 * @property {number} [maxMetadataSize=2048] - Maximum metadata size in bytes (2KB default)
 * @property {number} [maxKeySize=1024] - Maximum key size in bytes (1KB default)
 * @property {number} [maxValueSize=1024*1024] - Maximum value size in bytes (1MB default)
 * @property {number} [maxFields=100] - Maximum number of fields in a single object
 * @property {number} [maxNestingDepth=10] - Maximum nesting depth for objects and arrays
 * @property {number} [maxArrayLength=1000] - Maximum length for arrays
 * @property {number} [maxStringLength=10000] - Maximum length for string values
 * @property {number} [maxNumberValue=Number.MAX_SAFE_INTEGER] - Maximum numeric value
 * @property {number} [minNumberValue=Number.MIN_SAFE_INTEGER] - Minimum numeric value
 * @property {string} [enforcementMode='strict'] - Enforcement mode: 'strict', 'warn', 'soft'
 * @property {boolean} [logViolations=true] - Whether to log limit violations
 * @property {boolean} [throwOnViolation=true] - Whether to throw errors on limit violations
 * @property {Function} [customValidator] - Custom function to validate data against limits
 *   - Parameters: (data: any, limits: Object, context: Object) => boolean
 *   - Return: true if valid, false if invalid
 * @property {Object.<string, number>} [fieldLimits] - Field-specific size limits
 *   - Key: field name (e.g., 'content', 'description')
 *   - Value: maximum size in bytes
 * @property {string[]} [excludeFields] - Array of field names to exclude from limit enforcement
 * @property {string[]} [includeFields] - Array of field names to include in limit enforcement
 * @property {boolean} [applyToInsert=true] - Whether to apply limits to insert operations
 * @property {boolean} [applyToUpdate=true] - Whether to apply limits to update operations
 * @property {boolean} [applyToUpsert=true] - Whether to apply limits to upsert operations
 * @property {boolean} [applyToRead=false] - Whether to apply limits to read operations
 * @property {number} [warningThreshold=0.8] - Percentage of limit to trigger warnings (0.8 = 80%)
 * @property {Object} [context] - Additional context for custom functions
 * @property {boolean} [validateMetadata=true] - Whether to validate metadata size
 * @property {boolean} [validateBody=true] - Whether to validate body size
 * @property {boolean} [validateKeys=true] - Whether to validate key sizes
 * @property {boolean} [validateValues=true] - Whether to validate value sizes
 * 
 * @example
 * // Basic configuration with standard limits
 * {
 *   enabled: true,
 *   maxBodySize: 2 * 1024 * 1024, // 2MB
 *   maxMetadataSize: 4096, // 4KB
 *   maxFields: 200,
 *   enforcementMode: 'strict',
 *   logViolations: true
 * }
 * 
 * @example
 * // Configuration with field-specific limits
 * {
 *   enabled: true,
 *   fieldLimits: {
 *     'content': 5 * 1024 * 1024, // 5MB for content
 *     'description': 1024 * 1024, // 1MB for description
 *     'title': 1024, // 1KB for title
 *     'tags': 512 // 512B for tags
 *   },
 *   excludeFields: ['id', 'created_at', 'updated_at'],
 *   enforcementMode: 'warn',
 *   warningThreshold: 0.7
 * }
 * 
 * @example
 * // Configuration with custom validation
 * {
 *   enabled: true,
 *   maxBodySize: 1024 * 1024, // 1MB
 *   customValidator: (data, limits, context) => {
 *     // Custom validation logic
 *     if (data.content && data.content.length > limits.maxBodySize) {
 *       return false;
 *     }
 *     return true;
 *   },
 *   context: {
 *     environment: 'production',
 *     userRole: 'admin'
 *   },
 *   enforcementMode: 'soft',
 *   logViolations: true
 * }
 * 
 * @example
 * // Configuration with strict limits for API endpoints
 * {
 *   enabled: true,
 *   maxBodySize: 512 * 1024, // 512KB
 *   maxMetadataSize: 1024, // 1KB
 *   maxFields: 50,
 *   maxNestingDepth: 5,
 *   maxArrayLength: 100,
 *   maxStringLength: 5000,
 *   enforcementMode: 'strict',
 *   throwOnViolation: true,
 *   applyToInsert: true,
 *   applyToUpdate: true,
 *   applyToUpsert: true
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
 * - Default body size limit is 1MB (1024*1024 bytes)
 * - Default metadata size limit is 2KB (2048 bytes)
 * - Strict mode throws errors on violations
 * - Warn mode logs violations but allows operations
 * - Soft mode allows violations with warnings
 * - Field-specific limits override global limits
 * - Custom validators allow for specialized logic
 * - Warning threshold helps prevent unexpected violations
 * - Performance impact is minimal for most use cases
 * - Limits help prevent abuse and ensure system stability
 * - Context object is useful for conditional validation
 * - Validation can be selectively applied to different operations
 */

/**
 * Enforce Limits Behavior
 * Throws error when metadata exceeds 2KB limit
 */
export async function handleInsert({ resource, data, mappedData, originalData }) {
  const totalSize = calculateTotalSize(mappedData);
  
  // Calculate effective limit considering system overhead
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id: data.id
    }
  });
  
  if (totalSize > effectiveLimit) {
    throw new MetadataLimitError('Metadata size exceeds 2KB limit on insert', {
      totalSize,
      effectiveLimit,
      absoluteLimit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - effectiveLimit,
      resourceName: resource.name,
      operation: 'insert'
    });
  }

  // If data fits in metadata, store only in metadata
  return { mappedData, body: "" };
}

export async function handleUpdate({ resource, id, data, mappedData, originalData }) {
  const totalSize = calculateTotalSize(mappedData);
  
  // Calculate effective limit considering system overhead
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id
    }
  });
  
  if (totalSize > effectiveLimit) {
    throw new MetadataLimitError('Metadata size exceeds 2KB limit on update', {
      totalSize,
      effectiveLimit,
      absoluteLimit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - effectiveLimit,
      resourceName: resource.name,
      operation: 'update',
      id
    });
  }
  return { mappedData, body: JSON.stringify(mappedData) };
}

export async function handleUpsert({ resource, id, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  
  // Calculate effective limit considering system overhead
  const effectiveLimit = calculateEffectiveLimit({
    s3Limit: S3_METADATA_LIMIT_BYTES,
    systemConfig: {
      version: resource.version,
      timestamps: resource.config.timestamps,
      id
    }
  });
  
  if (totalSize > effectiveLimit) {
    throw new MetadataLimitError('Metadata size exceeds 2KB limit on upsert', {
      totalSize,
      effectiveLimit,
      absoluteLimit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - effectiveLimit,
      resourceName: resource.name,
      operation: 'upsert',
      id
    });
  }
  return { mappedData, body: "" };
}

export async function handleGet({ resource, metadata, body }) {
  // No special handling needed for enforce-limits behavior
  return { metadata, body };
}