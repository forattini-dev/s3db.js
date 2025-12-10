import type { S3dbMCPServer } from '../entrypoint.js';
import type { DbCreateResourceArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';

export const resourceManagementTools = [
  {
    name: 'dbCreateResource',
    description: 'Create a new resource (collection/table) in the database',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Resource name'
        },
        attributes: {
          type: 'object',
          description: 'Schema attributes definition (e.g., {"name": "string|required", "age": "number"})'
        },
        behavior: {
          type: 'string',
          description: 'Resource behavior',
          enum: ['user-managed', 'body-only', 'body-overflow', 'enforce-limits', 'truncate-data'],
          default: 'user-managed'
        },
        timestamps: {
          type: 'boolean',
          description: 'Enable automatic timestamps',
          default: false
        },
        partitions: {
          type: 'object',
          description: 'Partition configuration'
        },
        paranoid: {
          type: 'boolean',
          description: 'Enable paranoid mode (soft deletes)',
          default: true
        }
      },
      required: ['name', 'attributes']
    }
  },
  {
    name: 'dbListResources',
    description: 'List all resources in the database',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export function createResourceManagementHandlers(server: S3dbMCPServer) {
  return {
    async dbCreateResource(args: DbCreateResourceArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);

      const { name, attributes, behavior = 'user-managed', timestamps = false, partitions, paranoid = true } = args;

      const resource = await database.createResource({
        name,
        attributes,
        behavior,
        timestamps,
        partitions,
        paranoid
      });

      return {
        success: true,
        resource: {
          name: resource.name,
          behavior: resource.behavior,
          attributes: resource.attributes,
          partitions: (resource.config as any).partitions,
          timestamps: (resource.config as any).timestamps
        }
      };
    },

    async dbListResources(args: {}, database: S3db): Promise<any> {
      server.ensureConnected(database);

      const resourceList = await database.listResources();

      return {
        success: true,
        resources: resourceList,
        count: resourceList.length
      };
    }
  };
}
