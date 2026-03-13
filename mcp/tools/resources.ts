import type { S3dbMCPServer } from '../entrypoint.js';
import type { DbCreateResourceArgs } from '../types/index.js';
import type { S3db } from 's3db.js';

export const resourceManagementTools = [
  {
    name: 'dbCreateResource',
    description: `Create a new resource (like a table/collection). Key options:
- attributes: schema definition using fastest-validator syntax (e.g. { name: "string|required", age: "number", active: "bool|default:true" })
- behavior: "body-overflow" (default, auto-handles 2KB S3 metadata limit), "body-only" (large docs), "enforce-limits" (strict)
- partitions: define on fields you query by for O(1) lookups (e.g. { "by-status": { fields: { status: "string" } } })
- timestamps: true for auto createdAt/updatedAt

Read s3db://best-practices for detailed guidance.`,
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
    description: 'List all resources (tables/collections) in the connected database. Shows name, schema, behavior, and partition info for each resource. Use s3db://resource/{name} for detailed inspection.',
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

      const summary = Object.values(database.resources || {}).map((r: any) => {
        const partitions = r.config?.partitions || {};
        const attrs = r.attributes || {};
        return {
          name: r.name,
          behavior: r.behavior,
          attributeCount: Object.keys(attrs).length,
          attributes: Object.keys(attrs),
          partitions: Object.keys(partitions),
          timestamps: r.config?.timestamps || false,
          paranoid: r.config?.paranoid !== undefined ? r.config.paranoid : true,
        };
      });

      return {
        success: true,
        resources: summary,
        count: summary.length,
        hint: 'Use s3db://resource/{name} for full schema, partition details, and usage examples.'
      };
    }
  };
}
