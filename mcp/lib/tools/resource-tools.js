/**
 * Resource tool definitions
 */
export const resourceTools = [
  {
    name: 'dbCreateResource',
    method: 'createResource',
    description: 'Create a new resource (collection/table)',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Resource name',
          pattern: '^[a-zA-Z][a-zA-Z0-9_]*$'
        },
        attributes: {
          type: 'object',
          description: 'Schema attributes (e.g., {"name": "string|required"})'
        },
        behavior: {
          type: 'string',
          enum: ['user-managed', 'body-only', 'body-overflow', 'enforce-limits', 'truncate-data'],
          description: 'Storage behavior strategy',
          default: 'user-managed'
        },
        timestamps: {
          type: 'boolean',
          description: 'Auto-add createdAt/updatedAt',
          default: false
        },
        partitions: {
          type: 'object',
          description: 'Partition configuration'
        },
        paranoid: {
          type: 'boolean',
          description: 'Enable soft deletes',
          default: true
        },
        hooks: {
          type: 'object',
          description: 'Lifecycle hooks'
        },
        events: {
          type: 'object',
          description: 'Event listeners'
        },
        idSize: {
          type: 'number',
          description: 'Length of auto-generated IDs',
          default: 22,
          minimum: 4,
          maximum: 128
        }
      },
      required: ['name', 'attributes']
    }
  },

  {
    name: 'dbListResources',
    method: 'listResources',
    description: 'List all resources in database',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  {
    name: 'resourceInsert',
    method: 'insert',
    description: 'Insert a document into resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Target resource name'
        },
        data: {
          type: 'object',
          description: 'Document data to insert'
        }
      },
      required: ['resourceName', 'data']
    }
  },

  {
    name: 'resourceInsertMany',
    method: 'insertMany',
    description: 'Insert multiple documents',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Target resource name'
        },
        data: {
          type: 'array',
          description: 'Array of documents',
          minItems: 1,
          maxItems: 10000
        }
      },
      required: ['resourceName', 'data']
    }
  },

  {
    name: 'resourceGet',
    method: 'get',
    description: 'Get document by ID',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        id: {
          type: 'string',
          description: 'Document ID'
        },
        partition: {
          type: 'string',
          description: 'Partition name for optimization'
        },
        partitionValues: {
          type: 'object',
          description: 'Partition field values'
        }
      },
      required: ['resourceName', 'id']
    }
  },

  {
    name: 'resourceGetMany',
    method: 'getMany',
    description: 'Get multiple documents by IDs',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Document IDs',
          minItems: 1,
          maxItems: 1000
        }
      },
      required: ['resourceName', 'ids']
    }
  },

  {
    name: 'resourceUpdate',
    method: 'update',
    description: 'Update a document',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        id: {
          type: 'string',
          description: 'Document ID'
        },
        data: {
          type: 'object',
          description: 'Update data'
        }
      },
      required: ['resourceName', 'id', 'data']
    }
  },

  {
    name: 'resourceUpsert',
    method: 'upsert',
    description: 'Insert or update document',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        data: {
          type: 'object',
          description: 'Document data (include id for update)'
        }
      },
      required: ['resourceName', 'data']
    }
  },

  {
    name: 'resourceDelete',
    method: 'delete',
    description: 'Delete a document',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        id: {
          type: 'string',
          description: 'Document ID'
        }
      },
      required: ['resourceName', 'id']
    }
  },

  {
    name: 'resourceDeleteMany',
    method: 'deleteMany',
    description: 'Delete multiple documents',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Document IDs to delete',
          minItems: 1
        }
      },
      required: ['resourceName', 'ids']
    }
  },

  {
    name: 'resourceDeleteAll',
    method: 'deleteAll',
    description: 'Delete all documents (dangerous)',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        confirm: {
          type: 'boolean',
          description: 'Confirmation flag (must be true)'
        }
      },
      required: ['resourceName', 'confirm']
    }
  },

  {
    name: 'resourceExists',
    method: 'exists',
    description: 'Check if document exists',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        id: {
          type: 'string',
          description: 'Document ID'
        },
        partition: {
          type: 'string',
          description: 'Partition name'
        },
        partitionValues: {
          type: 'object',
          description: 'Partition values'
        }
      },
      required: ['resourceName', 'id']
    }
  },

  {
    name: 'resourceList',
    method: 'list',
    description: 'List documents with pagination',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        limit: {
          type: 'number',
          description: 'Max documents to return',
          default: 100,
          minimum: 1,
          maximum: 10000
        },
        offset: {
          type: 'number',
          description: 'Documents to skip',
          default: 0,
          minimum: 0
        },
        partition: {
          type: 'string',
          description: 'Filter by partition'
        },
        partitionValues: {
          type: 'object',
          description: 'Partition filter values'
        }
      },
      required: ['resourceName']
    }
  },

  {
    name: 'resourceListIds',
    method: 'listIds',
    description: 'List document IDs only',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        limit: {
          type: 'number',
          description: 'Max IDs to return',
          default: 1000,
          minimum: 1,
          maximum: 100000
        },
        offset: {
          type: 'number',
          description: 'IDs to skip',
          default: 0,
          minimum: 0
        }
      },
      required: ['resourceName']
    }
  },

  {
    name: 'resourceCount',
    method: 'count',
    description: 'Count documents in resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        },
        partition: {
          type: 'string',
          description: 'Count within partition'
        },
        partitionValues: {
          type: 'object',
          description: 'Partition filter'
        }
      },
      required: ['resourceName']
    }
  },

  {
    name: 'resourceGetAll',
    method: 'getAll',
    description: 'Get all documents (use carefully)',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Resource name'
        }
      },
      required: ['resourceName']
    }
  }
];