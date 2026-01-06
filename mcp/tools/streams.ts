import type { S3dbMCPServer } from '../entrypoint.js';
import type { S3db } from '../../src/database.class.js';

export const streamTools = [
  {
    name: 'streamInsert',
    description: 'Insert records in batches with progress tracking. Efficient for large datasets.',
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
        },
        batchSize: {
          type: 'number',
          description: 'Number of records per batch (default: 100)'
        }
      },
      required: ['resourceName', 'data']
    }
  },
  {
    name: 'streamUpdate',
    description: 'Update matching records in batches. Efficient for bulk updates.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        filter: {
          type: 'object',
          description: 'Filter to match records'
        },
        update: {
          type: 'object',
          description: 'Update data to apply'
        },
        batchSize: {
          type: 'number',
          description: 'Number of records per batch (default: 50)'
        }
      },
      required: ['resourceName', 'filter', 'update']
    }
  },
  {
    name: 'streamRead',
    description: 'Read records in pages without loading all into memory. Returns a page of results with cursor for next page.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        filter: {
          type: 'object',
          description: 'Optional filter to apply'
        },
        pageSize: {
          type: 'number',
          description: 'Number of records per page (default: 100)'
        },
        cursor: {
          type: 'string',
          description: 'Cursor from previous page for pagination'
        }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'streamDelete',
    description: 'Delete records matching filter in batches. Efficient for bulk deletions.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        filter: {
          type: 'object',
          description: 'Filter to match records to delete'
        },
        batchSize: {
          type: 'number',
          description: 'Number of records per batch (default: 50)'
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview what would be deleted without actually deleting'
        }
      },
      required: ['resourceName', 'filter']
    }
  },
  {
    name: 'streamExport',
    description: 'Export all records from a resource as a stream. Returns data in chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: {
          type: 'string',
          description: 'Name of the resource'
        },
        format: {
          type: 'string',
          enum: ['json', 'jsonl', 'csv'],
          description: 'Export format (default: json)'
        },
        filter: {
          type: 'object',
          description: 'Optional filter to apply'
        }
      },
      required: ['resourceName']
    }
  }
];

export function createStreamHandlers(server: S3dbMCPServer) {
  return {
    async streamInsert(args: { resourceName: string; data: any[]; batchSize?: number }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, data, batchSize = 100 } = args;

      const resource = server.getResource(database, resourceName);
      const results: any[] = [];
      const errors: any[] = [];
      let processed = 0;

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        try {
          const inserted = await resource.insertMany(batch);
          results.push(...inserted);
          processed += batch.length;
        } catch (error: any) {
          errors.push({
            batchStart: i,
            batchEnd: i + batch.length,
            error: error.message
          });
        }
      }

      return {
        success: errors.length === 0,
        totalRecords: data.length,
        processedRecords: processed,
        insertedCount: results.length,
        batchSize,
        batchCount: Math.ceil(data.length / batchSize),
        errors: errors.length > 0 ? errors : undefined
      };
    },

    async streamUpdate(args: { resourceName: string; filter: any; update: any; batchSize?: number }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, filter, update, batchSize = 50 } = args;

      const resource = server.getResource(database, resourceName);

      const allRecords = await resource.query(filter);
      const totalRecords = allRecords.length;
      let updatedCount = 0;
      const errors: any[] = [];

      for (let i = 0; i < allRecords.length; i += batchSize) {
        const batch = allRecords.slice(i, i + batchSize);
        for (const record of batch) {
          try {
            await resource.patch(record.id, update);
            updatedCount++;
          } catch (error: any) {
            errors.push({
              id: record.id,
              error: error.message
            });
          }
        }
      }

      return {
        success: errors.length === 0,
        totalMatched: totalRecords,
        updatedCount,
        batchSize,
        batchCount: Math.ceil(totalRecords / batchSize),
        errors: errors.length > 0 ? errors : undefined
      };
    },

    async streamRead(args: { resourceName: string; filter?: any; pageSize?: number; cursor?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, filter, pageSize = 100, cursor } = args;

      const resource = server.getResource(database, resourceName);

      const offset = cursor ? parseInt(Buffer.from(cursor, 'base64').toString('utf8')) : 0;

      const options: any = {
        limit: pageSize + 1,
        offset
      };

      let data: any[];
      if (filter && Object.keys(filter).length > 0) {
        const allMatching = await resource.query(filter);
        data = allMatching.slice(offset, offset + pageSize + 1);
      } else {
        data = await resource.list(options);
      }

      const hasMore = data.length > pageSize;
      if (hasMore) {
        data = data.slice(0, pageSize);
      }

      const nextCursor = hasMore
        ? Buffer.from(String(offset + pageSize)).toString('base64')
        : null;

      return {
        success: true,
        data,
        count: data.length,
        pagination: {
          pageSize,
          currentOffset: offset,
          hasMore,
          nextCursor
        }
      };
    },

    async streamDelete(args: { resourceName: string; filter: any; batchSize?: number; dryRun?: boolean }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, filter, batchSize = 50, dryRun = false } = args;

      const resource = server.getResource(database, resourceName);

      const matchingRecords = await resource.query(filter);
      const totalMatched = matchingRecords.length;

      if (dryRun) {
        return {
          success: true,
          dryRun: true,
          totalMatched,
          wouldDelete: matchingRecords.map((r: any) => r.id),
          message: `Would delete ${totalMatched} records`
        };
      }

      let deletedCount = 0;
      const errors: any[] = [];

      for (let i = 0; i < matchingRecords.length; i += batchSize) {
        const batch = matchingRecords.slice(i, i + batchSize);
        const ids = batch.map((r: any) => r.id);
        try {
          await resource.deleteMany(ids);
          deletedCount += ids.length;
        } catch (error: any) {
          errors.push({
            batchStart: i,
            ids,
            error: error.message
          });
        }
      }

      return {
        success: errors.length === 0,
        totalMatched,
        deletedCount,
        batchSize,
        batchCount: Math.ceil(totalMatched / batchSize),
        errors: errors.length > 0 ? errors : undefined
      };
    },

    async streamExport(args: { resourceName: string; format?: string; filter?: any }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const { resourceName, format = 'json', filter } = args;

      const resource = server.getResource(database, resourceName);

      let data: any[];
      if (filter && Object.keys(filter).length > 0) {
        data = await resource.query(filter);
      } else {
        data = await resource.getAll();
      }

      let exported: string;
      switch (format) {
        case 'jsonl':
          exported = data.map((r: any) => JSON.stringify(r)).join('\n');
          break;
        case 'csv':
          if (data.length === 0) {
            exported = '';
          } else {
            const headers = Object.keys(data[0]);
            const rows = data.map((r: any) =>
              headers.map(h => {
                const val = r[h];
                if (val === null || val === undefined) return '';
                if (typeof val === 'object') return JSON.stringify(val).replace(/"/g, '""');
                return String(val).replace(/"/g, '""');
              }).map(v => `"${v}"`).join(',')
            );
            exported = [headers.join(','), ...rows].join('\n');
          }
          break;
        default:
          exported = JSON.stringify(data, null, 2);
      }

      return {
        success: true,
        format,
        recordCount: data.length,
        data: exported,
        sizeBytes: Buffer.byteLength(exported, 'utf8')
      };
    }
  };
}
