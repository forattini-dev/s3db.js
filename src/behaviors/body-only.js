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