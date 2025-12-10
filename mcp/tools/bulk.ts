import type { S3dbMCPServer } from '../entrypoint.js';
import type { ResourceUpdateManyArgs, ResourceBulkUpsertArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';

export const bulkTools = [
  {
    name: 'resourceUpdateMany',
    description: 'Update multiple documents matching a query filter',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        filters: {
          type: 'object',
          description: 'Query filters to select documents'
        },
        updates: {
          type: 'object',
          description: 'Updates to apply to matching documents'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of documents to update',
          default: 1000
        }
      },
      required: ['resourceName', 'filters', 'updates']
    }
  },
  {
    name: 'resourceBulkUpsert',
    description: 'Upsert multiple documents (insert if not exists, update if exists)',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        data: {
          type: 'array',
          description: 'Array of documents to upsert (must include id field)'
        }
      },
      required: ['resourceName', 'data']
    }
  }
];

export function createBulkHandlers(server: S3dbMCPServer) {
  return {
    async resourceUpdateMany(args: ResourceUpdateManyArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, filters, updates, limit = 1000 } = args;
      const resource = server.getResource(database, resourceName);

      try {
        // Query documents matching filters
        const docs = await resource.query(filters, { limit });

        // Update each document
        const updatePromises = docs.map((doc: any) =>
          resource.update(doc.id, updates)
        );

        const results = await Promise.all(updatePromises);

        return {
          success: true,
          updatedCount: results.length,
          filters,
          updates,
          data: results
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          filters,
          updates
        };
      }
    },

    async resourceBulkUpsert(args: ResourceBulkUpsertArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, data } = args;
      const resource = server.getResource(database, resourceName);

      try {
        // Upsert each document
        const upsertPromises = data.map((doc: any) => resource.upsert(doc));
        const results = await Promise.all(upsertPromises);

        return {
          success: true,
          upsertedCount: results.length,
          data: results
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message
        };
      }
    }
  };
}
