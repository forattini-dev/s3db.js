/**
 * Partition Management Tools
 * Handles partition listing, inspection, and orphaned partition recovery
 */

export const partitionTools = [
  {
    name: 'resourceListPartitions',
    description: 'List all partitions defined for a resource',
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
    name: 'resourceListPartitionValues',
    description: 'List unique values for a specific partition field',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        partitionName: {
          type: 'string',
          description: 'Name of the partition'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of values to return',
          default: 1000
        }
      },
      required: ['resourceName', 'partitionName']
    }
  },
  {
    name: 'dbFindOrphanedPartitions',
    description: 'Find partitions that reference fields no longer in the schema',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of specific resource to check (optional - checks all if not provided)'
        }
      },
      required: []
    }
  },
  {
    name: 'dbRemoveOrphanedPartitions',
    description: 'Remove orphaned partitions from resource configuration',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview changes without applying them',
          default: true
        }
      },
      required: ['resourceName']
    }
  }
];

export function createPartitionHandlers(server) {
  return {
    async resourceListPartitions(args, database) {
      server.ensureConnected(database);
      const { resourceName } = args;
      const resource = server.getResource(database, resourceName);

      const partitions = resource.config.partitions || {};

      return {
        success: true,
        resource: resourceName,
        partitions: Object.keys(partitions),
        count: Object.keys(partitions).length,
        details: partitions
      };
    },

    async resourceListPartitionValues(args, database) {
      server.ensureConnected(database);
      const { resourceName, partitionName, limit = 1000 } = args;
      const resource = server.getResource(database, resourceName);

      if (!resource.config.partitions || !resource.config.partitions[partitionName]) {
        throw new Error(`Partition '${partitionName}' not found in resource '${resourceName}'`);
      }

      try {
        // List all objects with this partition prefix
        const prefix = `${database.keyPrefix}resource=${resourceName}/partition=${partitionName}/`;

        const response = await database.client.listObjectsV2({
          Bucket: database.bucket,
          Prefix: prefix,
          MaxKeys: limit
        });

        // Extract unique partition values from keys
        const partitionValues = new Set();

        for (const obj of response.Contents || []) {
          // Parse partition values from key
          const keyParts = obj.Key.split('/');
          const partitionPart = keyParts.find(part => part.startsWith('partition='));
          if (partitionPart) {
            const valuesPart = keyParts.slice(keyParts.indexOf(partitionPart) + 1).find(part => !part.startsWith('id='));
            if (valuesPart) {
              partitionValues.add(valuesPart);
            }
          }
        }

        return {
          success: true,
          resource: resourceName,
          partition: partitionName,
          values: Array.from(partitionValues),
          count: partitionValues.size
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          resource: resourceName,
          partition: partitionName
        };
      }
    },

    async dbFindOrphanedPartitions(args, database) {
      server.ensureConnected(database);
      const { resourceName } = args;

      const orphanedByResource = {};
      const resourcesToCheck = resourceName
        ? [resourceName]
        : Object.keys(database.resources || {});

      for (const name of resourcesToCheck) {
        const resource = database.resources[name];
        if (resource && resource.findOrphanedPartitions) {
          const orphaned = resource.findOrphanedPartitions();
          if (Object.keys(orphaned).length > 0) {
            orphanedByResource[name] = orphaned;
          }
        }
      }

      return {
        success: true,
        orphanedPartitions: orphanedByResource,
        affectedResources: Object.keys(orphanedByResource),
        count: Object.keys(orphanedByResource).length,
        hasIssues: Object.keys(orphanedByResource).length > 0
      };
    },

    async dbRemoveOrphanedPartitions(args, database) {
      server.ensureConnected(database);
      const { resourceName, dryRun = true } = args;
      const resource = server.getResource(database, resourceName);

      if (!resource.removeOrphanedPartitions) {
        throw new Error(`Resource '${resourceName}' does not support removeOrphanedPartitions method`);
      }

      // Find orphaned partitions first
      const orphaned = resource.findOrphanedPartitions();

      if (Object.keys(orphaned).length === 0) {
        return {
          success: true,
          message: 'No orphaned partitions found',
          resource: resourceName,
          dryRun
        };
      }

      if (dryRun) {
        return {
          success: true,
          message: 'Dry run - no changes made',
          resource: resourceName,
          orphanedPartitions: orphaned,
          wouldRemove: Object.keys(orphaned),
          dryRun: true
        };
      }

      // Actually remove
      const removed = resource.removeOrphanedPartitions();

      // Save metadata
      await database.uploadMetadataFile();

      return {
        success: true,
        message: `Removed ${Object.keys(removed).length} orphaned partition(s)`,
        resource: resourceName,
        removedPartitions: removed,
        dryRun: false
      };
    }
  };
}
