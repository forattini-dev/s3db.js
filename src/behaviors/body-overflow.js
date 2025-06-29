import { calculateAttributeSizes, calculateTotalSize, calculateUTF8Bytes } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';

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