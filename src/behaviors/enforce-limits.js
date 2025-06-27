import { calculateTotalSize } from '../concerns/calculator.js';

const S3_METADATA_LIMIT_BYTES = 2048;

/**
 * Enforce Limits Behavior
 * Throws error when metadata exceeds 2KB limit
 */
export async function handleInsert({ resource, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    throw new Error(`S3 metadata size exceeds 2KB limit. Current size: ${totalSize} bytes, limit: ${S3_METADATA_LIMIT_BYTES} bytes`);
  }
  
  return { mappedData, body: "" };
}

export async function handleUpdate({ resource, id, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    throw new Error(`S3 metadata size exceeds 2KB limit. Current size: ${totalSize} bytes, limit: ${S3_METADATA_LIMIT_BYTES} bytes`);
  }
  
  return { mappedData, body: "" };
}

export async function handleUpsert({ resource, id, data, mappedData }) {
  const totalSize = calculateTotalSize(mappedData);
  
  if (totalSize > S3_METADATA_LIMIT_BYTES) {
    throw new Error(`S3 metadata size exceeds 2KB limit. Current size: ${totalSize} bytes, limit: ${S3_METADATA_LIMIT_BYTES} bytes`);
  }
  
  return { mappedData, body: "" };
}

export async function handleGet({ resource, metadata, body }) {
  // No special handling needed for enforce-limits behavior
  return { metadata, body };
}