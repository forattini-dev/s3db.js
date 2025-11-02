/**
 * Base handler class for MCP tool handlers
 */
export class BaseHandler {
  constructor(database) {
    this.database = database;
  }

  /**
   * Ensure database is connected
   */
  ensureConnected() {
    if (!this.database || !this.database.isConnected()) {
      throw new Error('Database not connected. Use dbConnect tool first.');
    }
  }

  /**
   * Get resource by name with validation
   */
  getResource(resourceName) {
    this.ensureConnected();
    
    if (!this.database.resources[resourceName]) {
      const available = Object.keys(this.database.resources).join(', ');
      throw new Error(`Resource '${resourceName}' not found. Available: ${available}`);
    }
    
    return this.database.resources[resourceName];
  }

  /**
   * Wrap handler execution with error handling
   */
  async execute(method, args) {
    try {
      return await method.call(this, args);
    } catch (error) {
      return this.handleError(error, args);
    }
  }

  /**
   * Standard error handling
   */
  handleError(error, context = {}) {
    const suggestion = this.getErrorSuggestion(error);
    
    return {
      success: false,
      error: {
        message: error.message,
        type: error.constructor.name,
        context,
        suggestion,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    };
  }

  /**
   * Get contextual error suggestions
   */
  getErrorSuggestion(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('not connected')) {
      return 'Use dbConnect tool first to establish database connection';
    }
    if (message.includes('not found')) {
      return 'Check resource name or use dbListResources to see available resources';
    }
    if (message.includes('validation')) {
      return 'Use resourceValidate to check data before insertion';
    }
    if (message.includes('permission') || message.includes('access')) {
      return 'Check your AWS credentials and bucket permissions';
    }
    if (message.includes('timeout')) {
      return 'Operation timed out. Try with smaller batch size or increase timeout';
    }
    
    return null;
  }

  /**
   * Generate cache key for operations
   */
  generateCacheKey(resource, action, params = {}) {
    const parts = [`resource=${resource}`, `action=${action}`];
    
    const sortedParams = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join('&');
    
    if (sortedParams) {
      parts.push(`params=${sortedParams}`);
    }
    
    return parts.join('/');
  }

  /**
   * Extract partition information from data
   */
  extractPartitionInfo(resource, data) {
    if (!resource?.config?.partitions || !data) {
      return null;
    }

    const partitionInfo = {};
    
    for (const [name, config] of Object.entries(resource.config.partitions)) {
      if (config.fields) {
        const values = {};
        let hasValues = false;

        for (const field of Object.keys(config.fields)) {
          if (data[field] !== undefined && data[field] !== null) {
            values[field] = data[field];
            hasValues = true;
          }
        }

        if (hasValues) {
          partitionInfo[name] = values;
        }
      }
    }

    return Object.keys(partitionInfo).length > 0 ? partitionInfo : null;
  }

  /**
   * Validate required parameters
   */
  validateParams(params, required) {
    const missing = required.filter(param => params[param] === undefined);
    
    if (missing.length > 0) {
      throw new Error(`Missing required parameters: ${missing.join(', ')}`);
    }
  }

  /**
   * Format response with standard structure
   */
  formatResponse(data, meta = {}) {
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
      ...meta
    };
  }
}