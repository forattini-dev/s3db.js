import type { S3dbMCPServer } from '../entrypoint.js';
import type {
  ResourceInsertArgs,
  ResourceGetArgs,
  ResourceListArgs,
  ResourceCountArgs,
  ResourceUpdateArgs,
  ResourceUpsertArgs,
  ResourceDeleteArgs
} from '../types/index.js';
import type { S3db } from '../../database.class.js';

export const crudTools = [
  {
    name: 'resourceInsert',
    description: 'Insert a new document into a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        data: {
          type: 'object',
          description: 'Data to insert'
        }
      },
      required: ['resourceName', 'data']
    }
  },
  {
    name: 'resourceInsertMany',
    description: 'Insert multiple documents into a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        data: {
          type: 'array',
          description: 'Array of documents to insert'
        }
      },
      required: ['resourceName', 'data']
    }
  },
  {
    name: 'resourceGet',
    description: 'Get a document by ID from a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        id: {
          type: 'string',
          description: 'Document ID'
        },
        partition: {
          type: 'string',
          description: 'Partition name for optimized retrieval'
        },
        partitionValues: {
          type: 'object',
          description: 'Partition values for targeted access'
        }
      },
      required: ['resourceName', 'id']
    }
  },
  {
    name: 'resourceGetMany',
    description: 'Get multiple documents by IDs from a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of document IDs'
        }
      },
      required: ['resourceName', 'ids']
    }
  },
  {
    name: 'resourceUpdate',
    description: 'Update a document in a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        id: {
          type: 'string',
          description: 'Document ID'
        },
        data: {
          type: 'object',
          description: 'Data to update'
        }
      },
      required: ['resourceName', 'id', 'data']
    }
  },
  {
    name: 'resourceUpsert',
    description: 'Insert or update a document in a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        data: {
          type: 'object',
          description: 'Data to upsert (must include id if updating)'
        }
      },
      required: ['resourceName', 'data']
    }
  },
  {
    name: 'resourceDelete',
    description: 'Delete a document from a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
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
    description: 'Delete multiple documents from a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of document IDs to delete'
        }
      },
      required: ['resourceName', 'ids']
    }
  },
  {
    name: 'resourceExists',
    description: 'Check if a document exists in a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        id: {
          type: 'string',
          description: 'Document ID'
        },
        partition: {
          type: 'string',
          description: 'Partition name for optimized check'
        },
        partitionValues: {
          type: 'object',
          description: 'Partition values for targeted check'
        }
      },
      required: ['resourceName', 'id']
    }
  },
  {
    name: 'resourceList',
    description: 'List documents in a resource with pagination and filtering',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of documents to return',
          default: 100
        },
        offset: {
          type: 'number',
          description: 'Number of documents to skip',
          default: 0
        },
        partition: {
          type: 'string',
          description: 'Partition name to filter by'
        },
        partitionValues: {
          type: 'object',
          description: 'Partition values for filtering'
        }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'resourceListIds',
    description: 'List document IDs in a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of IDs to return',
          default: 1000
        },
        offset: {
          type: 'number',
          description: 'Number of IDs to skip',
          default: 0
        }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'resourceCount',
    description: 'Count documents in a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        partition: {
          type: 'string',
          description: 'Partition name to filter by'
        },
        partitionValues: {
          type: 'object',
          description: 'Partition values for filtering'
        }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'resourceGetAll',
    description: 'Get all documents from a resource (use with caution on large datasets)',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'resourceDeleteAll',
    description: 'Delete all documents from a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        confirm: {
          type: 'boolean',
          description: 'Confirmation flag - must be true to proceed'
        }
      },
      required: ['resourceName', 'confirm']
    }
  }
];

export function createCrudHandlers(server: S3dbMCPServer) {
  return {
    async resourceInsert(args: ResourceInsertArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, data } = args;

      const resource = server.getResource(database, resourceName);
      const result = await resource.insert(data);

      // Extract partition information for cache invalidation
      const partitionInfo = server._extractPartitionInfo(resource, result);

      // Generate cache invalidation patterns
      const cacheInvalidationPatterns = server._generateCacheInvalidationPatterns(resource, result, 'insert');

      return {
        success: true,
        data: result,
        ...(partitionInfo && { partitionInfo }),
        cacheInvalidationPatterns
      };
    },

    async resourceInsertMany(args: { resourceName: string; data: any[] }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, data } = args;

      const resource = server.getResource(database, resourceName);
      const result = await resource.insertMany(data);

      return {
        success: true,
        data: result,
        count: result.length
      };
    },

    async resourceGet(args: ResourceGetArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, id, partition, partitionValues } = args;

      const resource = server.getResource(database, resourceName);

      // Use partition information for optimized retrieval if provided
      let options: any = {};
      if (partition && partitionValues) {
        options.partition = partition;
        options.partitionValues = partitionValues;
      }

      const result = await resource.get(id, options);

      // Extract partition information from result
      const partitionInfo = server._extractPartitionInfo(resource, result);

      return {
        success: true,
        data: result,
        ...(partitionInfo && { partitionInfo })
      };
    },

    async resourceGetMany(args: { resourceName: string; ids: string[] }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, ids } = args;

      const resource = server.getResource(database, resourceName);
      const result = await resource.getMany(ids);

      return {
        success: true,
        data: result,
        count: result.length
      };
    },

    async resourceUpdate(args: ResourceUpdateArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, id, data } = args;

      const resource = server.getResource(database, resourceName);
      const result = await resource.update(id, data);

      // Extract partition information for cache invalidation
      const partitionInfo = server._extractPartitionInfo(resource, result);

      return {
        success: true,
        data: result,
        ...(partitionInfo && { partitionInfo })
      };
    },

    async resourceUpsert(args: ResourceUpsertArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, data } = args;

      const resource = server.getResource(database, resourceName);
      const result = await resource.upsert(data);

      return {
        success: true,
        data: result
      };
    },

    async resourceDelete(args: ResourceDeleteArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, id } = args;

      const resource = server.getResource(database, resourceName);
      await resource.delete(id);

      return {
        success: true,
        message: `Document ${id} deleted from ${resourceName}`
      };
    },

    async resourceDeleteMany(args: { resourceName: string; ids: string[] }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, ids } = args;

      const resource = server.getResource(database, resourceName);
      await resource.deleteMany(ids);

      return {
        success: true,
        message: `${ids.length} documents deleted from ${resourceName}`,
        deletedIds: ids
      };
    },

    async resourceExists(args: ResourceGetArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, id, partition, partitionValues } = args;

      const resource = server.getResource(database, resourceName);

      // Use partition information for optimized existence check if provided
      let options: any = {};
      if (partition && partitionValues) {
        options.partition = partition;
        options.partitionValues = partitionValues;
      }

      const exists = await resource.exists(id, options);

      return {
        success: true,
        exists,
        id,
        resource: resourceName,
        ...(partition && { partition }),
        ...(partitionValues && { partitionValues })
      };
    },

    async resourceList(args: ResourceListArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, limit = 100, offset = 0, partition, partitionValues } = args;

      const resource = server.getResource(database, resourceName);
      const options: any = { limit, offset };

      if (partition && partitionValues) {
        options.partition = partition;
        options.partitionValues = partitionValues;
      }

      const result = await resource.list(options);

      // Generate cache key hint for intelligent caching
      const cacheKeyHint = server._generateCacheKeyHint(resourceName, 'list', {
        limit,
        offset,
        partition,
        partitionValues
      });

      return {
        success: true,
        data: result,
        count: result.length,
        pagination: {
          limit,
          offset,
          hasMore: result.length === limit
        },
        cacheKeyHint,
        ...(partition && { partition }),
        ...(partitionValues && { partitionValues })
      };
    },

    async resourceListIds(args: ResourceListArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, limit = 1000, offset = 0 } = args;

      const resource = server.getResource(database, resourceName);
      const result = await resource.listIds({ limit, offset });

      return {
        success: true,
        ids: result,
        count: result.length,
        pagination: {
          limit,
          offset,
          hasMore: result.length === limit
        }
      };
    },

    async resourceCount(args: ResourceCountArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, partition, partitionValues } = args;

      const resource = server.getResource(database, resourceName);
      const options: any = {};

      if (partition && partitionValues) {
        options.partition = partition;
        options.partitionValues = partitionValues;
      }

      const count = await resource.count(options);

      // Generate cache key hint for intelligent caching
      const cacheKeyHint = server._generateCacheKeyHint(resourceName, 'count', {
        partition,
        partitionValues
      });

      return {
        success: true,
        count,
        resource: resourceName,
        cacheKeyHint,
        ...(partition && { partition }),
        ...(partitionValues && { partitionValues })
      };
    },

    async resourceGetAll(args: { resourceName: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName } = args;

      const resource = server.getResource(database, resourceName);
      const result = await resource.getAll();

      return {
        success: true,
        data: result,
        count: result.length,
        warning: result.length > 1000 ? 'Large dataset returned. Consider using resourceList with pagination.' : undefined
      };
    },

    async resourceDeleteAll(args: { resourceName: string; confirm: boolean }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, confirm } = args;

      if (!confirm) {
        throw new Error('Confirmation required. Set confirm: true to proceed with deleting all data.');
      }

      const resource = server.getResource(database, resourceName);
      await resource.deleteAll();

      return {
        success: true,
        message: `All documents deleted from ${resourceName}`
      };
    }
  };
}
