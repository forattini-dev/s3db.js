import { calculateTotalSize, calculateAttributeSizes, calculateUTF8Bytes } from '../concerns/calculator.js';
import { calculateEffectiveLimit } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';
import { tryFn, tryFnSync } from '../concerns/try-fn.js';

const OVERFLOW_FLAG = '$overflow';
const OVERFLOW_FLAG_VALUE = 'true';
const OVERFLOW_FLAG_BYTES = calculateUTF8Bytes(OVERFLOW_FLAG) + calculateUTF8Bytes(OVERFLOW_FLAG_VALUE);

/**
 * Body Overflow Behavior Configuration Documentation
 *
 * The `body-overflow` behavior optimizes metadata usage by sorting attributes by size
 * in ascending order and placing as many small attributes as possible in metadata,
 * while moving larger attributes to the S3 object body. This maximizes metadata
 * utilization while keeping frequently accessed small fields in metadata for fast access.
 *
 * ## Purpose & Use Cases
 * - For objects with mixed field sizes (some small, some large)
 * - When you want to optimize for both metadata efficiency and read performance
 * - For objects that exceed metadata limits but have important small fields
 * - When you need fast access to frequently used small fields
 *
 * ## How It Works
 * 1. Calculates the size of each attribute
 * 2. Sorts attributes by size in ascending order (smallest first)
 * 3. Fills metadata with small attributes until limit is reached
 * 4. Places remaining (larger) attributes in the object body as JSON
 * 5. Adds a `$overflow` flag to metadata to indicate body usage
 *
 * ## Performance Characteristics
 * - Fast access to small fields (in metadata)
 * - Slower access to large fields (requires body read)
 * - Optimized metadata utilization
 * - Balanced approach between performance and size efficiency
 *
 * @example
 * // Create a resource with body-overflow behavior
 * const resource = await db.createResource({
 *   name: 'mixed_content',
 *   attributes: { ... },
 *   behavior: 'body-overflow'
 * });
 *
 * // Small fields go to metadata, large fields go to body
 * const doc = await resource.insert({
 *   id: 'doc123',           // Small -> metadata
 *   title: 'Short Title',   // Small -> metadata
 *   content: 'Very long...', // Large -> body
 *   metadata: { ... }       // Large -> body
 * });
 *
 * ## Comparison to Other Behaviors
 * | Behavior         | Metadata Usage | Body Usage | Size Limits | Performance |
 * |------------------|----------------|------------|-------------|-------------|
 * | body-overflow    | Optimized      | Overflow   | 2KB metadata | Balanced     |
 * | body-only        | Minimal (_v)   | All data   | 5TB         | Slower reads |
 * | truncate-data    | All (truncated)| None       | 2KB metadata | Fast reads   |
 * | enforce-limits   | All (limited)  | None       | 2KB metadata | Fast reads   |
 * | user-managed     | All (unlimited)| None       | S3 limit    | Fast reads   |
 *
 * @typedef {Object} BodyOverflowBehaviorConfig
 * @property {boolean} [enabled=true] - Whether the behavior is active
 * @property {number} [metadataReserve=50] - Reserve bytes for system fields
 * @property {string[]} [priorityFields] - Fields that should be prioritized in metadata
 * @property {boolean} [preserveOrder=false] - Whether to preserve original field order
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

  const metadataFields = {};
  const bodyFields = {};
  let currentSize = 0;
  let willOverflow = false;

  // Always include version field first
  if (mappedData._v) {
    metadataFields._v = mappedData._v;
    currentSize += attributeSizes._v;
  }

  // Reserve space for $overflow if overflow is possible
  let reservedLimit = effectiveLimit;
  for (const [fieldName, size] of sortedFields) {
    if (fieldName === '_v') continue;
    if (!willOverflow && (currentSize + size > effectiveLimit)) {
      reservedLimit -= OVERFLOW_FLAG_BYTES;
      willOverflow = true;
    }
    if (!willOverflow && (currentSize + size <= reservedLimit)) {
      metadataFields[fieldName] = mappedData[fieldName];
      currentSize += size;
    } else {
      bodyFields[fieldName] = mappedData[fieldName];
      willOverflow = true;
    }
  }

  if (willOverflow) {
    metadataFields[OVERFLOW_FLAG] = OVERFLOW_FLAG_VALUE;
  }

  const hasOverflow = Object.keys(bodyFields).length > 0;
  let body = hasOverflow ? JSON.stringify(bodyFields) : "";

  // FIX: Only return metadataFields as mappedData, not full mappedData
  return { mappedData: metadataFields, body };
}

export async function handleUpdate({ resource, id, data, mappedData, originalData }) {
  // For updates, use the same logic as insert (split fields by size)
  return handleInsert({ resource, data, mappedData, originalData });
}

export async function handleUpsert({ resource, id, data, mappedData }) {
  return handleInsert({ resource, data, mappedData });
}

export async function handleGet({ resource, metadata, body }) {
  // Parse body content if it exists
  let bodyData = {};
  if (body && body.trim() !== '') {
    const [ok, err, parsed] = tryFnSync(() => JSON.parse(body));
    if (ok) {
      bodyData = parsed;
    } else {
      bodyData = {};
    }
  }

  // Merge metadata and body data, with metadata taking precedence
  const mergedData = {
    ...bodyData,
    ...metadata
  };

  // Remove internal flags from the merged result
  delete mergedData.$overflow;

  return { metadata: mergedData, body };
}