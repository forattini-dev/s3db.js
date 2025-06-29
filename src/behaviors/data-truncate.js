import { calculateAttributeSizes, calculateUTF8Bytes, transformValue } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';

const TRUNCATE_SUFFIX = "...";
const TRUNCATE_SUFFIX_BYTES = calculateUTF8Bytes(TRUNCATE_SUFFIX);

/**
 * Data Truncate Behavior
 * Truncates data to fit within 2KB limit by prioritizing smaller attributes
 */
export async function handleInsert({ resource, data, mappedData }) {
  return handleTruncate({ resource, data, mappedData });
}

export async function handleUpdate({ resource, id, data, mappedData }) {
  return handleTruncate({ resource, data, mappedData });
}

export async function handleUpsert({ resource, id, data, mappedData }) {
  return handleTruncate({ resource, data, mappedData });
}

export async function handleGet({ resource, metadata, body }) {
  // No special handling needed for data-truncate behavior
  return { metadata, body };
}

function handleTruncate({ resource, data, mappedData }) {
  const attributeSizes = calculateAttributeSizes(mappedData);
  
  // Sort attributes by size (smallest first)
  const sortedAttributes = Object.entries(attributeSizes)
    .sort(([, sizeA], [, sizeB]) => sizeA - sizeB);
  
  const result = {};
  let currentSize = 0;
  
  for (const [key, size] of sortedAttributes) {
    const availableSpace = S3_METADATA_LIMIT_BYTES - currentSize;
    
    if (size <= availableSpace) {
      // Attribute fits completely
      result[key] = mappedData[key];
      currentSize += size;
    } else if (availableSpace > TRUNCATE_SUFFIX_BYTES) {
      // Truncate the attribute to fit
      const maxContentBytes = availableSpace - TRUNCATE_SUFFIX_BYTES;
      const originalValue = transformValue(mappedData[key]);
      
      // Truncate string to fit in maxContentBytes
      let truncatedValue = "";
      let bytes = 0;
      
      for (let i = 0; i < originalValue.length; i++) {
        const char = originalValue[i];
        const charBytes = calculateUTF8Bytes(char);
        
        if (bytes + charBytes <= maxContentBytes) {
          truncatedValue += char;
          bytes += charBytes;
        } else {
          break;
        }
      }
      
      result[key] = truncatedValue + TRUNCATE_SUFFIX;
      currentSize = S3_METADATA_LIMIT_BYTES; // We've filled up the space
      break; // No more space for other attributes
    } else {
      // Not enough space even for truncation
      break;
    }
  }
  
  return { mappedData: result, body: "" };
}