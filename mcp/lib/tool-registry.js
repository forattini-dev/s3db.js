/**
 * Tool Registry for MCP Server
 * Manages tool definitions and routing
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.handlers = new Map();
    this.middleware = [];
  }

  /**
   * Register a tool with its definition and handler
   */
  registerTool(name, definition, handler) {
    this.tools.set(name, {
      name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      handler
    });
  }

  /**
   * Register multiple tools from a handler class
   */
  registerHandler(handlerInstance, prefix = '') {
    const tools = handlerInstance.constructor.tools || [];
    
    for (const tool of tools) {
      const fullName = prefix ? `${prefix}${tool.name}` : tool.name;
      this.registerTool(fullName, tool, async (args) => {
        return handlerInstance[tool.method](args);
      });
    }
    
    this.handlers.set(handlerInstance.constructor.name, handlerInstance);
  }

  /**
   * Register tools from definitions object
   */
  registerTools(definitions) {
    for (const [category, tools] of Object.entries(definitions)) {
      for (const tool of tools) {
        this.registerTool(tool.name, tool, tool.handler);
      }
    }
  }

  /**
   * Add middleware for tool execution
   */
  use(middleware) {
    this.middleware.push(middleware);
  }

  /**
   * Get all registered tools for listing
   */
  listTools() {
    const tools = [];
    
    for (const [name, tool] of this.tools) {
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      });
    }
    
    return tools.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Execute a tool with middleware
   */
  async executeTool(name, args) {
    const tool = this.tools.get(name);
    
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }
    
    // Build middleware chain
    const chain = [...this.middleware];
    let index = 0;
    
    const next = async () => {
      if (index >= chain.length) {
        return tool.handler(args);
      }
      
      const middleware = chain[index++];
      return middleware(args, next, { toolName: name, tool });
    };
    
    return next();
  }

  /**
   * Get handler instance by name
   */
  getHandler(name) {
    return this.handlers.get(name);
  }

  /**
   * Group tools by category
   */
  getToolsByCategory() {
    const categories = {
      connection: [],
      resource: [],
      query: [],
      batch: [],
      stream: [],
      schema: [],
      introspection: [],
      export: [],
      performance: [],
      monitoring: [],
      advanced: []
    };
    
    for (const [name, tool] of this.tools) {
      const category = this.categorize(name);
      if (categories[category]) {
        categories[category].push({
          name: tool.name,
          description: tool.description
        });
      }
    }
    
    return categories;
  }

  /**
   * Categorize tool by name
   */
  private categorize(toolName) {
    const prefixes = {
      db: 'connection',
      resource: 'resource',
      query: 'query',
      batch: 'batch',
      stream: 'stream',
      schema: 'schema',
      export: 'export',
      import: 'export',
      analyze: 'introspection',
      inspect: 'introspection',
      validate: 'introspection',
      optimize: 'performance',
      index: 'performance',
      metrics: 'monitoring',
      alert: 'monitoring',
      backup: 'advanced',
      restore: 'advanced',
      hook: 'advanced',
      plugin: 'advanced'
    };
    
    for (const [prefix, category] of Object.entries(prefixes)) {
      if (toolName.toLowerCase().startsWith(prefix)) {
        return category;
      }
    }
    
    return 'resource';
  }

  /**
   * Validate tool arguments
   */
  validateArgs(toolName, args) {
    const tool = this.tools.get(toolName);
    if (!tool) return { valid: false, error: 'Tool not found' };
    
    const schema = tool.inputSchema;
    if (!schema) return { valid: true };
    
    // Validate required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (args[prop] === undefined) {
          return {
            valid: false,
            error: `Missing required parameter: ${prop}`
          };
        }
      }
    }
    
    // Validate property types
    if (schema.properties) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (args[prop] !== undefined) {
          const validation = this.validateProperty(args[prop], propSchema);
          if (!validation.valid) {
            return {
              valid: false,
              error: `Invalid ${prop}: ${validation.error}`
            };
          }
        }
      }
    }
    
    return { valid: true };
  }

  /**
   * Validate a single property
   */
  private validateProperty(value, schema) {
    // Type validation
    if (schema.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (schema.type !== actualType) {
        return {
          valid: false,
          error: `Expected ${schema.type}, got ${actualType}`
        };
      }
    }
    
    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      return {
        valid: false,
        error: `Must be one of: ${schema.enum.join(', ')}`
      };
    }
    
    // String pattern validation
    if (schema.pattern && typeof value === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        return {
          valid: false,
          error: `Does not match pattern: ${schema.pattern}`
        };
      }
    }
    
    // Number range validation
    if (typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        return {
          valid: false,
          error: `Must be >= ${schema.minimum}`
        };
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        return {
          valid: false,
          error: `Must be <= ${schema.maximum}`
        };
      }
    }
    
    // Array length validation
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        return {
          valid: false,
          error: `Must have at least ${schema.minItems} items`
        };
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        return {
          valid: false,
          error: `Must have at most ${schema.maxItems} items`
        };
      }
    }
    
    return { valid: true };
  }

  /**
   * Get tool documentation
   */
  getDocumentation(toolName) {
    const tool = this.tools.get(toolName);
    if (!tool) return null;
    
    const schema = tool.inputSchema;
    const params = [];
    
    if (schema?.properties) {
      for (const [name, prop] of Object.entries(schema.properties)) {
        params.push({
          name,
          type: prop.type,
          description: prop.description,
          required: schema.required?.includes(name),
          default: prop.default,
          enum: prop.enum
        });
      }
    }
    
    return {
      name: tool.name,
      description: tool.description,
      parameters: params,
      examples: tool.examples || []
    };
  }

  /**
   * Search tools by keyword
   */
  searchTools(keyword) {
    const results = [];
    const query = keyword.toLowerCase();
    
    for (const [name, tool] of this.tools) {
      if (
        name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query)
      ) {
        results.push({
          name: tool.name,
          description: tool.description,
          relevance: name.toLowerCase() === query ? 1 : 0.5
        });
      }
    }
    
    return results.sort((a, b) => b.relevance - a.relevance);
  }
}