/**
 * Query tool definitions
 */
export const queryTools = [
  {
    name: 'queryCreate',
    method: 'create',
    description: 'Create a query builder for complex queries',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource to query'
        },
        queryId: {
          type: 'string',
          description: 'Custom query ID (optional)'
        }
      },
      required: ['resourceName']
    }
  },

  {
    name: 'queryFilter',
    method: 'filter',
    description: 'Add filter conditions to query',
    inputSchema: {
      type: 'object',
      properties: {
        queryId: {
          type: 'string',
          description: 'Query builder ID'
        },
        field: {
          type: 'string',
          description: 'Field to filter (supports nested: user.name)'
        },
        operator: {
          type: 'string',
          enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'startsWith', 'endsWith', 'regex', 'exists', 'type'],
          description: 'Comparison operator'
        },
        value: {
          description: 'Value to compare against'
        },
        combineWith: {
          type: 'string',
          enum: ['AND', 'OR'],
          description: 'How to combine with previous filters',
          default: 'AND'
        }
      },
      required: ['queryId', 'field', 'operator', 'value']
    },
    examples: [
      {
        description: 'Filter by age greater than 18',
        args: {
          queryId: 'query_123',
          field: 'age',
          operator: 'gt',
          value: 18
        }
      },
      {
        description: 'Filter by status in list',
        args: {
          queryId: 'query_123',
          field: 'status',
          operator: 'in',
          value: ['active', 'pending']
        }
      }
    ]
  },

  {
    name: 'querySort',
    method: 'sort',
    description: 'Add sorting to query',
    inputSchema: {
      type: 'object',
      properties: {
        queryId: {
          type: 'string',
          description: 'Query builder ID'
        },
        field: {
          type: 'string',
          description: 'Field to sort by'
        },
        direction: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction',
          default: 'asc'
        }
      },
      required: ['queryId', 'field']
    }
  },

  {
    name: 'queryProject',
    method: 'project',
    description: 'Select specific fields to return',
    inputSchema: {
      type: 'object',
      properties: {
        queryId: {
          type: 'string',
          description: 'Query builder ID'
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include/exclude'
        },
        exclude: {
          type: 'boolean',
          description: 'Exclude specified fields instead',
          default: false
        }
      },
      required: ['queryId', 'fields']
    }
  },

  {
    name: 'queryExecute',
    method: 'execute',
    description: 'Execute built query',
    inputSchema: {
      type: 'object',
      properties: {
        queryId: {
          type: 'string',
          description: 'Query builder ID'
        },
        limit: {
          type: 'number',
          description: 'Override limit',
          minimum: 1,
          maximum: 10000
        },
        offset: {
          type: 'number',
          description: 'Override offset',
          minimum: 0
        },
        explain: {
          type: 'boolean',
          description: 'Return execution plan instead',
          default: false
        }
      },
      required: ['queryId']
    }
  },

  {
    name: 'queryAggregate',
    method: 'aggregate',
    description: 'Perform aggregation operations',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource to aggregate'
        },
        pipeline: {
          type: 'array',
          description: 'Aggregation pipeline stages',
          items: {
            type: 'object',
            properties: {
              stage: {
                type: 'string',
                enum: ['match', 'group', 'sort', 'limit', 'count', 'sum', 'avg', 'min', 'max']
              },
              params: {
                type: 'object',
                description: 'Stage parameters'
              }
            },
            required: ['stage', 'params']
          }
        }
      },
      required: ['resourceName', 'pipeline']
    },
    examples: [
      {
        description: 'Count by category',
        args: {
          resourceName: 'products',
          pipeline: [
            {
              stage: 'group',
              params: {
                by: 'category',
                aggregations: [
                  { type: 'count', name: 'total' }
                ]
              }
            }
          ]
        }
      },
      {
        description: 'Average price by brand',
        args: {
          resourceName: 'products',
          pipeline: [
            {
              stage: 'group',
              params: {
                by: 'brand',
                aggregations: [
                  { type: 'avg', field: 'price', name: 'avgPrice' }
                ]
              }
            },
            {
              stage: 'sort',
              params: {
                rules: [{ field: 'avgPrice', direction: 'desc' }]
              }
            }
          ]
        }
      }
    ]
  },

  {
    name: 'queryBuildFromText',
    method: 'buildFromText',
    description: 'Build query from natural language',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource to query'
        },
        query: {
          type: 'string',
          description: 'Natural language query'
        }
      },
      required: ['resourceName', 'query']
    },
    examples: [
      {
        description: 'Simple text query',
        args: {
          resourceName: 'users',
          query: 'Find users where age is greater than 18 sorted by name'
        }
      }
    ]
  }
];