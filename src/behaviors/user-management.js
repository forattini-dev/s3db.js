import { calculateTotalSize } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';

/**
 * User Management Behavior - Default behavior
 * User is responsible for managing 2KB metadata limits
 * Emits warning events when limit is exceeded but doesn't block operations
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
  // No special handling needed for user-management behavior
  return { metadata, body };
}