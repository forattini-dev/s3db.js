/**
 * Body-Only Behavior Configuration Documentation
 * 
 * This behavior ensures that only the body content of a resource is returned,
 * stripping away metadata like id, created_at, updated_at, and other system fields.
 * It's useful when you want to return clean data objects without internal fields.
 * 
 * @typedef {Object} BodyOnlyBehaviorConfig
 * @property {boolean} [enabled=true] - Whether the behavior is active
 * @property {string[]} [excludeFields] - Array of field names to exclude from the body-only output
 *   - Default excluded fields: ['id', 'created_at', 'updated_at', 'deleted_at', 'version', 'partition']
 *   - Additional fields can be specified here
 * @property {string[]} [includeFields] - Array of field names to include even when body-only is active
 *   - These fields will be preserved in the output even if they're in excludeFields
 * @property {boolean} [applyToRead=true] - Whether to apply body-only filtering to read operations
 * @property {boolean} [applyToList=true] - Whether to apply body-only filtering to list operations
 * @property {boolean} [applyToFind=true] - Whether to apply body-only filtering to find operations
 * @property {boolean} [applyToStream=true] - Whether to apply body-only filtering to stream operations
 * @property {boolean} [preserveArrays=true] - Whether to preserve array structure in nested objects
 * @property {boolean} [deepFilter=false] - Whether to recursively filter nested objects and arrays
 * @property {Function} [customFilter] - Custom function to apply additional filtering logic
 *   - Parameters: (data: any, context: Object) => any
 *   - Return: filtered data object
 * @property {boolean} [logFilteredFields=false] - Whether to log which fields are being filtered
 * @property {Object} [context] - Additional context passed to customFilter function
 * 
 * @example
 * // Basic configuration with default exclusions
 * {
 *   enabled: true,
 *   applyToRead: true,
 *   applyToList: true,
 *   logFilteredFields: true
 * }
 * 
 * @example
 * // Configuration with custom field exclusions
 * {
 *   enabled: true,
 *   excludeFields: ['id', 'created_at', 'updated_at', 'internal_flag', 'temp_data'],
 *   includeFields: ['id'], // Keep id even though it's in excludeFields
 *   applyToRead: true,
 *   applyToList: true,
 *   applyToFind: true,
 *   deepFilter: true
 * }
 * 
 * @example
 * // Configuration with custom filtering function
 * {
 *   enabled: true,
 *   customFilter: (data, context) => {
 *     // Remove sensitive fields
 *     const { password, secret_key, ...cleanData } = data;
 *     return cleanData;
 *   },
 *   context: {
 *     environment: 'production',
 *     userRole: 'admin'
 *   },
 *   logFilteredFields: true
 * }
 * 
 * @example
 * // Minimal configuration using defaults
 * {
 *   enabled: true
 * }
 * 
 * @notes
 * - Default excluded fields are: id, created_at, updated_at, deleted_at, version, partition
 * - includeFields takes precedence over excludeFields
 * - Custom filter functions receive the original data and context object
 * - Deep filtering recursively processes nested objects and arrays
 * - Array preservation maintains the original array structure
 * - Logging helps debug which fields are being filtered
 * - Context object is useful for conditional filtering logic
 * - Behavior can be selectively applied to different operation types
 * - Performance impact is minimal for most use cases
 * - Custom filters should handle edge cases (null, undefined, etc.)
 */
/**
 * Body Only Behavior
 * Stores all data in S3 object body as JSON, keeping only version in metadata
 * This approach maximizes data size and simplifies metadata management
 */
export async function handleInsert({ resource, data, mappedData }) {
  // Store all data in body as JSON, keep only version in metadata
  const bodyContent = JSON.stringify(mappedData);
  
  // Return empty metadata (version will be added by Resource class)
  return { 
    mappedData: {}, 
    body: bodyContent 
  };
}

export async function handleUpdate({ resource, id, data, mappedData }) {
  // Same logic as insert - store all data in body
  const bodyContent = JSON.stringify(mappedData);
  
  return { 
    mappedData: {}, 
    body: bodyContent 
  };
}

export async function handleUpsert({ resource, id, data, mappedData }) {
  // Same logic as insert - store all data in body
  const bodyContent = JSON.stringify(mappedData);
  
  return { 
    mappedData: {}, 
    body: bodyContent 
  };
}

export async function handleGet({ resource, metadata, body }) {
  try {
    // Parse body content as JSON
    const bodyData = body ? JSON.parse(body) : {};
    
    // Return body data as metadata (this is what the Resource class expects)
    // The version from metadata will be merged by the Resource class
    return { 
      metadata: bodyData, 
      body: "" 
    };
  } catch (error) {
    // If body parsing fails, return metadata as-is and log warning
    console.warn(`Failed to parse body-only content:`, error.message);
    return { 
      metadata, 
      body: "" 
    };
  }
} 