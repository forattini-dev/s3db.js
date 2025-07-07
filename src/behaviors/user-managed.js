import { calculateTotalSize } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';

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
 * | data-truncate    | Truncates   | Yes       | Warns          | Content Mgmt            |
 * | body-overflow    | Truncates/Splits | Yes   | Warns          | Large objects           |
 *
 * ## Best Practices & Warnings
 * - Exceeding S3 metadata limits will cause silent data loss or errors at the storage layer.
 * - Use this behavior only if you have custom logic to handle warnings and enforce limits.
 * - For production, prefer `enforce-limits` or `data-truncate` to avoid data loss.
 *
 * ## Migration Tips
 * - To migrate to a stricter behavior, change the resource's behavior to `enforce-limits` or `data-truncate`.
 * - Review emitted warnings to identify resources at risk of exceeding S3 limits.
 *
 * @typedef {Object} UserManagedBehaviorConfig
 * @property {boolean} [enabled=true] - Whether the behavior is active
 */
export async function handleInsert({ resource, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    resource.emit('exceedsLimit', {
      operation: 'insert',
      totalSize,
      limit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - S3_METADATA_LIMIT_BYTES,
      data
    });
  }
  return { mappedData, body: "" };
}

export async function handleUpdate({ resource, id, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    resource.emit('exceedsLimit', {
      operation: 'update',
      id,
      totalSize,
      limit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - S3_METADATA_LIMIT_BYTES,
      data
    });
  }
  return { mappedData, body: "" };
}

export async function handleUpsert({ resource, id, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    resource.emit('exceedsLimit', {
      operation: 'upsert',
      id,
      totalSize,
      limit: S3_METADATA_LIMIT_BYTES,
      excess: totalSize - S3_METADATA_LIMIT_BYTES,
      data
    });
  }
  return { mappedData, body: "" };
}

export async function handleGet({ resource, metadata, body }) {
  // No special handling needed for user-managed behavior
  // User is responsible for handling metadata as received
  return { metadata, body };
}