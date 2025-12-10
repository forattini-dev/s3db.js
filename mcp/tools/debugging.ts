import type { S3dbMCPServer } from '../entrypoint.js';
import type { DbInspectResourceArgs, ResourceValidateArgs, DbHealthCheckArgs, DbGetRawArgs } from '../types/index.js';
import type { S3db } from '../../database.class.js';

export const debuggingTools = [
  {
    name: 'dbInspectResource',
    description: 'Inspect detailed information about a resource including schema, partitions, behaviors, and configuration',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource to inspect'
        }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'dbGetMetadata',
    description: 'Get raw metadata.json from the S3 bucket for debugging',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'resourceValidate',
    description: 'Validate data against resource schema without inserting',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        data: {
          type: 'object',
          description: 'Data to validate'
        }
      },
      required: ['resourceName', 'data']
    }
  },
  {
    name: 'dbHealthCheck',
    description: 'Perform comprehensive health check on database including orphaned partitions detection',
    inputSchema: {
      type: 'object',
      properties: {
        includeOrphanedPartitions: {
          type: 'boolean',
          description: 'Include orphaned partitions check',
          default: true
        }
      },
      required: []
    }
  },
  {
    name: 'resourceGetRaw',
    description: 'Get raw S3 object data (metadata + body) for debugging',
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
  }
];

export function createDebuggingHandlers(server: S3dbMCPServer) {
  return {
    async dbInspectResource(args: DbInspectResourceArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName } = args;
      const resource = server.getResource(database, resourceName);

      const inspection = {
        success: true,
        resource: {
          name: resource.name,
          behavior: resource.behavior,
          version: resource.version,
          createdBy: resource.createdBy || 'user',

          schema: {
            attributes: resource.attributes,
            attributeCount: Object.keys(resource.attributes || {}).length,
            fieldTypes: {}
          },

          partitions: resource.config.partitions ? {
            count: Object.keys(resource.config.partitions).length,
            definitions: resource.config.partitions,
            orphaned: resource.findOrphanedPartitions ? resource.findOrphanedPartitions() : null
          } : null,

          configuration: {
            timestamps: resource.config.timestamps,
            paranoid: resource.config.paranoid,
            strictValidation: resource.strictValidation,
            asyncPartitions: resource.config.asyncPartitions,
            versioningEnabled: resource.config.versioningEnabled,
            autoDecrypt: resource.config.autoDecrypt
          },

          hooks: resource.config.hooks ? {
            beforeInsert: resource.config.hooks.beforeInsert?.length || 0,
            afterInsert: resource.config.hooks.afterInsert?.length || 0,
            beforeUpdate: resource.config.hooks.beforeUpdate?.length || 0,
            afterUpdate: resource.config.hooks.afterUpdate?.length || 0,
            beforeDelete: resource.config.hooks.beforeDelete?.length || 0,
            afterDelete: resource.config.hooks.afterDelete?.length || 0
          } : null,

          s3Paths: {
            metadataKey: `${database.keyPrefix}metadata.json`,
            resourcePrefix: `${database.keyPrefix}resource=${resourceName}/`
          }
        }
      };

      // Analyze field types
      for (const [fieldName, fieldDef] of Object.entries(resource.attributes || {})) {
        const typeStr = typeof fieldDef === 'string' ? fieldDef : (fieldDef as any).type;
        (inspection.resource.schema.fieldTypes as any)[fieldName] = typeStr;
      }

      return inspection;
    },

    async dbGetMetadata(args: {}, database: S3db): Promise<any> {
      server.ensureConnected(database);

      const metadataKey = `${database.keyPrefix}metadata.json`;

      try {
        const response = await (database.client as any).getObject({
          Bucket: database.bucket,
          Key: metadataKey
        });

        const metadataContent = await response.Body.transformToString();
        const metadata = JSON.parse(metadataContent);

        return {
          success: true,
          metadata,
          s3Info: {
            key: metadataKey,
            bucket: database.bucket,
            lastModified: response.LastModified,
            size: response.ContentLength,
            etag: response.ETag
          }
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          key: metadataKey
        };
      }
    },

    async resourceValidate(args: ResourceValidateArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, data } = args;
      const resource = server.getResource(database, resourceName);

      try {
        // Use the schema validator if available
        const validationResult = resource.schema.validate(data);

        return {
          success: true,
          valid: validationResult === true,
          errors: validationResult === true ? [] : validationResult,
          data: data
        };
      } catch (error: any) {
        return {
          success: false,
          valid: false,
          error: error.message,
          data: data
        };
      }
    },

    async dbHealthCheck(args: DbHealthCheckArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { includeOrphanedPartitions = true } = args;

      const health = {
        success: true,
        timestamp: new Date().toISOString(),
        database: {
          connected: database.isConnected(),
          bucket: database.bucket,
          keyPrefix: database.keyPrefix,
          version: database.s3dbVersion
        },
        resources: {
          total: Object.keys(database.resources || {}).length,
          list: Object.keys(database.resources || {}),
          details: {}
        },
        issues: []
      };

      // Check each resource
      for (const [name, resource] of Object.entries(database.resources || {})) {
        const resourceHealth: any = {
          name,
          behavior: resource.behavior,
          attributeCount: Object.keys(resource.attributes || {}).length,
          partitionCount: resource.config.partitions ? Object.keys(resource.config.partitions).length : 0
        };

        // Check for orphaned partitions
        if (includeOrphanedPartitions && (resource as any).findOrphanedPartitions) {
          const orphaned = (resource as any).findOrphanedPartitions();
          if (Object.keys(orphaned).length > 0) {
            resourceHealth.orphanedPartitions = orphaned;
            health.issues.push({
              severity: 'warning',
              resource: name,
              type: 'orphaned_partitions',
              message: `Resource '${name}' has ${Object.keys(orphaned).length} orphaned partition(s)`,
              details: orphaned
            });
          }
        }

        (health.resources.details as any)[name] = resourceHealth;
      }

      health.healthy = health.issues.length === 0;

      return health;
    },

    async resourceGetRaw(args: DbGetRawArgs, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, id } = args;
      const resource = server.getResource(database, resourceName);

      try {
        // Build S3 key
        const key = `${database.keyPrefix}resource=${resourceName}/id=${id}.json`;

        const response = await (database.client as any).getObject({
          Bucket: database.bucket,
          Key: key
        });

        const body = await response.Body.transformToString();
        const bodyData = body ? JSON.parse(body) : null;

        return {
          success: true,
          s3Object: {
            key,
            bucket: database.bucket,
            metadata: response.Metadata || {},
            contentLength: response.ContentLength,
            lastModified: response.LastModified,
            etag: response.ETag,
            contentType: response.ContentType
          },
          data: {
            metadata: response.Metadata,
            body: bodyData
          }
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
          id,
          resource: resourceName
        };
      }
    }
  };
}
