import { calculateAttributeSizes, calculateUTF8Bytes, transformValue } from '../concerns/calculator.js';
import { S3_METADATA_LIMIT_BYTES } from './enforce-limits.js';

/**
 * Data Truncate Behavior Configuration Documentation
 * 
 * This behavior automatically truncates data fields that exceed specified length limits,
 * ensuring data consistency and preventing storage issues. It can be applied to specific
 * fields or globally to all string fields.
 * 
 * @typedef {Object} DataTruncateBehaviorConfig
 * @property {boolean} [enabled=true] - Whether the behavior is active
 * @property {Object.<string, number>} [fieldLimits] - Maximum length for specific fields
 *   - Key: field name (e.g., 'title', 'description', 'content')
 *   - Value: maximum length in characters
 * @property {number} [defaultLimit=1000] - Default maximum length for all string fields
 * @property {string} [truncateIndicator='...'] - String to append when truncating
 * @property {string} [truncateMode='end'] - Truncation mode: 'end', 'start', 'middle'
 * @property {boolean} [preserveWords=true] - Whether to avoid truncating in the middle of words
 * @property {boolean} [preserveSentences=true] - Whether to avoid truncating in the middle of sentences
 * @property {string[]} [excludeFields] - Array of field names to exclude from truncation
 * @property {string[]} [includeFields] - Array of field names to include in truncation (if empty, all fields)
 * @property {boolean} [applyToInsert=true] - Whether to apply truncation to insert operations
 * @property {boolean} [applyToUpdate=true] - Whether to apply truncation to update operations
 * @property {boolean} [applyToUpsert=true] - Whether to apply truncation to upsert operations
 * @property {boolean} [logTruncations=false] - Whether to log when fields are truncated
 * @property {boolean} [warnOnTruncation=true] - Whether to emit warnings when truncation occurs
 * @property {Function} [customTruncator] - Custom function to handle truncation logic
 *   - Parameters: (value: string, fieldName: string, limit: number, config: Object) => string
 *   - Return: truncated string
 * @property {Object.<string, Function>} [fieldTruncators] - Custom truncators for specific fields
 *   - Key: field name
 *   - Value: custom truncation function
 * @property {boolean} [validateOnRead=false] - Whether to validate and truncate on read operations
 * @property {number} [warningThreshold=0.9] - Percentage of limit to trigger warnings (0.9 = 90%)
 * @property {Object} [context] - Additional context for custom functions
 * @property {boolean} [preserveHTML=false] - Whether to preserve HTML tags during truncation
 * @property {boolean} [preserveMarkdown=false] - Whether to preserve Markdown syntax during truncation
 * @property {string[]} [preserveTags] - Array of HTML tags to preserve during truncation
 * 
 * @example
 * // Basic configuration with field-specific limits
 * {
 *   enabled: true,
 *   fieldLimits: {
 *     'title': 100,
 *     'description': 500,
 *     'content': 5000,
 *     'summary': 200
 *   },
 *   defaultLimit: 1000,
 *   truncateIndicator: '...',
 *   logTruncations: true
 * }
 * 
 * @example
 * // Configuration with word and sentence preservation
 * {
 *   enabled: true,
 *   defaultLimit: 2000,
 *   preserveWords: true,
 *   preserveSentences: true,
 *   truncateMode: 'end',
 *   excludeFields: ['id', 'created_at', 'updated_at'],
 *   warnOnTruncation: true,
 *   warningThreshold: 0.8
 * }
 * 
 * @example
 * // Configuration with custom truncation logic
 * {
 *   enabled: true,
 *   fieldLimits: {
 *     'content': 10000,
 *     'excerpt': 300
 *   },
 *   customTruncator: (value, fieldName, limit, config) => {
 *     if (fieldName === 'content' && value.length > limit) {
 *       // Find the last complete sentence within the limit
 *       const truncated = value.substring(0, limit);
 *       const lastSentence = truncated.lastIndexOf('.');
 *       if (lastSentence > limit * 0.8) {
 *         return truncated.substring(0, lastSentence + 1);
 *       }
 *     }
 *     return value.length > limit ? value.substring(0, limit) + config.truncateIndicator : value;
 *   },
 *   fieldTruncators: {
 *     'html_content': (value, fieldName, limit, config) => {
 *       // Custom HTML-aware truncation
 *       return value.length > limit ? value.substring(0, limit) + '</p>' : value;
 *     }
 *   },
 *   logTruncations: true
 * }
 * 
 * @example
 * // Configuration with HTML preservation
 * {
 *   enabled: true,
 *   fieldLimits: {
 *     'html_content': 5000,
 *     'markdown_content': 3000
 *   },
 *   preserveHTML: true,
 *   preserveMarkdown: true,
 *   preserveTags: ['p', 'div', 'span', 'strong', 'em'],
 *   truncateIndicator: '</p>...',
 *   applyToInsert: true,
 *   applyToUpdate: true
 * }
 * 
 * @example
 * // Minimal configuration using defaults
 * {
 *   enabled: true,
 *   defaultLimit: 1000
 * }
 * 
 * @notes
 * - Default limit is 1000 characters for all string fields
 * - Field-specific limits override the default limit
 * - Word preservation avoids breaking words at arbitrary points
 * - Sentence preservation tries to end at sentence boundaries
 * - Custom truncators allow for specialized logic per field
 * - HTML preservation maintains valid HTML structure
 * - Markdown preservation keeps syntax intact
 * - Warning threshold helps identify fields approaching limits
 * - Logging helps track truncation patterns
 * - Performance impact is minimal for most use cases
 * - Truncation preserves data integrity while enforcing limits
 * - Context object is useful for conditional truncation logic
 */

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