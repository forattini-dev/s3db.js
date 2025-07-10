import { calculateTotalSize } from '../concerns/calculator.js';

/**
 * Body Only Behavior Configuration Documentation
 *
 * The `body-only` behavior stores all data in the S3 object body as JSON, keeping only
 * the version field (`_v`) in metadata. This allows for unlimited data size since S3
 * objects can be up to 5TB, but requires reading the full object body for any operation.
 *
 * ## Purpose & Use Cases
 * - For large objects that exceed S3 metadata limits
 * - When you need to store complex nested data structures
 * - For objects that will be read infrequently (higher latency)
 * - When you want to avoid metadata size constraints entirely
 *
 * ## How It Works
 * - Keeps only the `_v` (version) field in S3 metadata
 * - Serializes all other data as JSON in the object body
 * - Requires full object read for any data access
 * - No size limits on data (only S3 object size limit of 5TB)
 *
 * ## Performance Considerations
 * - Higher latency for read operations (requires full object download)
 * - Higher bandwidth usage for read operations
 * - No metadata-based filtering or querying possible
 * - Best for large, infrequently accessed data
 *
 * @example
 * // Create a resource with body-only behavior
 * const resource = await db.createResource({
 *   name: 'large_documents',
 *   attributes: { ... },
 *   behavior: 'body-only'
 * });
 *
 * // All data goes to body, only _v stays in metadata
 * const doc = await resource.insert({
 *   title: 'Large Document',
 *   content: 'Very long content...',
 *   metadata: { ... }
 * });
 *
 * ## Comparison to Other Behaviors
 * | Behavior         | Metadata Usage | Body Usage | Size Limits | Performance |
 * |------------------|----------------|------------|-------------|-------------|
 * | body-only        | Minimal (_v)   | All data   | 5TB         | Slower reads |
 * | body-overflow    | Optimized      | Overflow   | 2KB metadata | Balanced     |
 * | truncate-data    | All (truncated)| None       | 2KB metadata | Fast reads   |
 * | enforce-limits   | All (limited)  | None       | 2KB metadata | Fast reads   |
 * | user-managed     | All (unlimited)| None       | S3 limit    | Fast reads   |
 *
 * @typedef {Object} BodyOnlyBehaviorConfig
 * @property {boolean} [enabled=true] - Whether the behavior is active
 */
export async function handleInsert({ resource, data, mappedData }) {
  // Keep only the version field in metadata
  const metadataOnly = {
    '_v': mappedData._v || String(resource.version)
  };
  metadataOnly._map = JSON.stringify(resource.schema.map);
  
  // Use o objeto original para o body
  const body = JSON.stringify(mappedData);
  
  return { mappedData: metadataOnly, body };
}

export async function handleUpdate({ resource, id, data, mappedData }) {
  // For updates, we need to merge with existing data
  // Since we can't easily read the existing body during update,
  // we'll put the update data in the body and let the resource handle merging
  
  // Keep only the version field in metadata
  const metadataOnly = {
    '_v': mappedData._v || String(resource.version)
  };
  metadataOnly._map = JSON.stringify(resource.schema.map);
  
  // Use o objeto original para o body
  const body = JSON.stringify(mappedData);
  
  return { mappedData: metadataOnly, body };
}

export async function handleUpsert({ resource, id, data, mappedData }) {
  // Same as insert for body-only behavior
  return handleInsert({ resource, data, mappedData });
}

export async function handleGet({ resource, metadata, body }) {
  // Parse the body to get the actual data
  let bodyData = {};
  if (body && body.trim() !== '') {
    try {
      bodyData = JSON.parse(body);
    } catch (error) {
      console.warn('Failed to parse body data:', error.message);
      bodyData = {};
    }
  }
  
  // Merge metadata (which contains _v) with body data
  const mergedData = {
    ...bodyData,
    ...metadata // metadata contains _v
  };
  
  return { metadata: mergedData, body };
} 