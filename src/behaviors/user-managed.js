import { calculateTotalSize } from '../concerns/calculator.js';
import { calculateEffectiveLimit } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';
import tryFn from '../concerns/try-fn.js';

/**
 * User Managed Behavior Configuration Documentation
 *
 * The `user-managed` behavior is the default for s3db resources. It provides no automatic enforcement
 * of S3 metadata or body size limits, and does not modify or truncate data. Instead, it emits warnings
 * via the `exceedsLimit` event when S3 metadata limits are exceeded, but allows all operations to proceed.
 *
 * ## Purpose & Use Cases
 * - For development, testing, or advanced users who want full control over resource metadata and body size.
 * - Useful when you want to handle S3 metadata limits yourself, or implement custom logic for warnings.
 * - Not recommended for production unless you have custom enforcement or validation in place.
 *
 * ## How It Works
 * - Emits an `exceedsLimit` event (with details) when a resource's metadata size exceeds the S3 2KB limit.
 * - Does NOT block, truncate, or modify data—operations always proceed.
 * - No automatic enforcement of any limits; user is responsible for handling warnings and data integrity.
 *
 * ## Event Emission
 * - Event: `exceedsLimit`
 * - Payload:
 *   - `operation`: 'insert' | 'update' | 'upsert'
 *   - `id` (for update/upsert): resource id
 *   - `totalSize`: total metadata size in bytes
 *   - `limit`: S3 metadata limit (2048 bytes)
 *   - `excess`: number of bytes over the limit
 *   - `data`: the offending data object
 *
 * @example
 * // Listen for warnings on a resource
 * resource.on('exceedsLimit', (info) => {
 *   console.warn(`Resource exceeded S3 metadata limit:`, info);
 * });
 *
 * @example
 * // Create a resource with user-managed behavior (default)
 * const resource = await db.createResource({
 *   name: 'my_resource',
 *   attributes: { ... },
 *   behavior: 'user-managed' // or omit for default
 * });
 *
 * ## Comparison to Other Behaviors
 * | Behavior         | Enforcement | Data Loss | Event Emission | Use Case                |
 * |------------------|-------------|-----------|----------------|-------------------------|
 * | user-managed     | None        | Possible  | Warns          | Dev/Test/Advanced users |
 * | enforce-limits   | Strict      | No        | Throws         | Production              |
 * | truncate-data    | Truncates   | Yes       | Warns          | Content Mgmt            |
 * | body-overflow    | Truncates/Splits | Yes   | Warns          | Large objects           |
 *
 * ## Best Practices & Warnings
 * - Exceeding S3 metadata limits will cause silent data loss or errors at the storage layer.
 * - Use this behavior only if you have custom logic to handle warnings and enforce limits.
 * - For production, prefer `enforce-limits` or `truncate-data` to avoid data loss.
 *
 * ## Migration Tips
 * - To migrate to a stricter behavior, change the resource's behavior to `enforce-limits` or `truncate-data`.
 * - Review emitted warnings to identify resources at risk of exceeding S3 limits.
 *
 * @typedef {Object} UserManagedBehaviorConfig
 * @property {boolean} [enabled=true] - Whether the behavior is active
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
    resource.emit('exceedsLimit', {
      operation: 'insert',
      totalSize,
      limit: 2047,
      excess: totalSize - 2047,
      data: originalData || data
    });
    // If data exceeds limit, store in body
    const metadataOnly = { _v: mappedData._v };

    // Store pluginMap for backwards compatibility when plugins are added/removed
    if (resource.schema?.pluginMap && Object.keys(resource.schema.pluginMap).length > 0) {
      metadataOnly._pluginMap = JSON.stringify(resource.schema.pluginMap);
    }

    return { mappedData: metadataOnly, body: JSON.stringify(mappedData) };
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
    resource.emit('exceedsLimit', {
      operation: 'update',
      id,
      totalSize,
      limit: 2047,
      excess: totalSize - 2047,
      data: originalData || data
    });
  }
  return { mappedData, body: JSON.stringify(data) };
}

export async function handleUpsert({ resource, id, data, mappedData, originalData }) {
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
    resource.emit('exceedsLimit', {
      operation: 'upsert',
      id,
      totalSize,
      limit: 2047,
      excess: totalSize - 2047,
      data: originalData || data
    });
  }
  return { mappedData, body: JSON.stringify(data) };
}

export async function handleGet({ resource, metadata, body }) {
  // If body contains data, parse it and merge with metadata
  if (body && body.trim() !== '') {
    const [ok, error, result] = tryFn(() => {
      const bodyData = JSON.parse(body);
      // Merge body data with metadata, with metadata taking precedence
      return {
        metadata: {
          ...bodyData,
          ...metadata
        },
        body
      };
    });

    if (ok) {
      return result;
    } else {
      // If parsing fails, return original metadata and body
      return { metadata, body };
    }
  }
  
  // If no body data, return metadata as is
  return { metadata, body };
}