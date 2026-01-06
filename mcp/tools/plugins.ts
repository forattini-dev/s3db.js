import type { S3dbMCPServer } from '../entrypoint.js';
import type { S3db } from '../../src/database.class.js';

export const pluginTools = [
  // ============================================
  // CACHE PLUGIN
  // ============================================
  {
    name: 'cacheGet',
    description: 'Get a cached value from the cache plugin',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        key: { type: 'string', description: 'Cache key' }
      },
      required: ['resourceName', 'key']
    }
  },
  {
    name: 'cacheSet',
    description: 'Set a value in the cache',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        key: { type: 'string', description: 'Cache key' },
        value: { type: 'object', description: 'Value to cache' },
        ttl: { type: 'number', description: 'Time to live in milliseconds (optional)' }
      },
      required: ['resourceName', 'key', 'value']
    }
  },
  {
    name: 'cacheClear',
    description: 'Clear cache entries matching a pattern',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        pattern: { type: 'string', description: 'Pattern to match (optional, clears all if not provided)' }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'cacheStats',
    description: 'Get cache statistics',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource (optional, returns all if not provided)' }
      },
      required: []
    }
  },

  // ============================================
  // AUDIT PLUGIN
  // ============================================
  {
    name: 'auditList',
    description: 'List audit entries for a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        limit: { type: 'number', description: 'Maximum entries to return (default: 100)' },
        offset: { type: 'number', description: 'Offset for pagination' },
        operation: { type: 'string', description: 'Filter by operation (insert, update, delete)' }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'auditGet',
    description: 'Get a specific audit entry',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        entryId: { type: 'string', description: 'Audit entry ID' }
      },
      required: ['resourceName', 'entryId']
    }
  },
  {
    name: 'auditSearch',
    description: 'Search audit entries',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        query: { type: 'string', description: 'Search query' },
        startDate: { type: 'string', description: 'Start date (ISO format)' },
        endDate: { type: 'string', description: 'End date (ISO format)' }
      },
      required: ['resourceName', 'query']
    }
  },

  // ============================================
  // TTL PLUGIN
  // ============================================
  {
    name: 'ttlSet',
    description: 'Set TTL for a document',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        id: { type: 'string', description: 'Document ID' },
        expiresAt: { type: 'string', description: 'Expiration date (ISO format)' }
      },
      required: ['resourceName', 'id', 'expiresAt']
    }
  },
  {
    name: 'ttlGet',
    description: 'Get TTL for a document',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        id: { type: 'string', description: 'Document ID' }
      },
      required: ['resourceName', 'id']
    }
  },
  {
    name: 'ttlCleanup',
    description: 'Clean up expired documents',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        dryRun: { type: 'boolean', description: 'Preview what would be deleted without actually deleting' }
      },
      required: ['resourceName']
    }
  },

  // ============================================
  // METRICS PLUGIN
  // ============================================
  {
    name: 'metricsGet',
    description: 'Get performance metrics',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource (optional, returns all if not provided)' }
      },
      required: []
    }
  },
  {
    name: 'metricsExport',
    description: 'Export metrics in specified format',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['json', 'prometheus'], description: 'Export format' }
      },
      required: ['format']
    }
  },
  {
    name: 'metricsReset',
    description: 'Reset metric counters',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource (optional, resets all if not provided)' }
      },
      required: []
    }
  },

  // ============================================
  // REPLICATOR PLUGIN
  // ============================================
  {
    name: 'replicatorSync',
    description: 'Sync data to replication target',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        target: { type: 'string', description: 'Replication target name' }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'replicatorStatus',
    description: 'Get replication status',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' }
      },
      required: ['resourceName']
    }
  },

  // ============================================
  // VECTOR PLUGIN
  // ============================================
  {
    name: 'vectorSearch',
    description: 'Search for similar vectors (k-nearest neighbors)',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        embedding: { type: 'array', items: { type: 'number' }, description: 'Query embedding vector' },
        k: { type: 'number', description: 'Number of results to return (default: 10)' },
        filter: { type: 'object', description: 'Optional filter to apply' }
      },
      required: ['resourceName', 'embedding']
    }
  },
  {
    name: 'vectorUpsert',
    description: 'Insert or update a vector embedding',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        id: { type: 'string', description: 'Document ID' },
        embedding: { type: 'array', items: { type: 'number' }, description: 'Embedding vector' },
        metadata: { type: 'object', description: 'Optional metadata' }
      },
      required: ['resourceName', 'id', 'embedding']
    }
  },

  // ============================================
  // FULLTEXT PLUGIN
  // ============================================
  {
    name: 'fulltextSearch',
    description: 'Perform full-text search',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        query: { type: 'string', description: 'Search query' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Fields to search (optional)' },
        limit: { type: 'number', description: 'Maximum results (default: 100)' }
      },
      required: ['resourceName', 'query']
    }
  },
  {
    name: 'fulltextIndex',
    description: 'Rebuild fulltext index',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Fields to index' }
      },
      required: ['resourceName', 'fields']
    }
  },

  // ============================================
  // GEO PLUGIN
  // ============================================
  {
    name: 'geoNear',
    description: 'Find documents near a geographic point',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        lat: { type: 'number', description: 'Latitude' },
        lng: { type: 'number', description: 'Longitude' },
        maxDistanceKm: { type: 'number', description: 'Maximum distance in kilometers' },
        limit: { type: 'number', description: 'Maximum results (default: 100)' }
      },
      required: ['resourceName', 'lat', 'lng', 'maxDistanceKm']
    }
  },

  // ============================================
  // GRAPH PLUGIN
  // ============================================
  {
    name: 'graphAddEdge',
    description: 'Add an edge between two nodes in the graph',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        from: { type: 'string', description: 'Source node ID' },
        to: { type: 'string', description: 'Target node ID' },
        label: { type: 'string', description: 'Edge label (optional)' },
        properties: { type: 'object', description: 'Edge properties (optional)' }
      },
      required: ['resourceName', 'from', 'to']
    }
  },
  {
    name: 'graphTraverse',
    description: 'Traverse the graph from a starting node',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        startNode: { type: 'string', description: 'Starting node ID' },
        depth: { type: 'number', description: 'Maximum traversal depth (default: 3)' },
        direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'], description: 'Traversal direction' }
      },
      required: ['resourceName', 'startNode']
    }
  },

  // ============================================
  // BACKUP PLUGIN
  // ============================================
  {
    name: 'backupCreate',
    description: 'Create a backup of a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource (optional, backs up all if not provided)' },
        destination: { type: 'string', description: 'Backup destination path' }
      },
      required: ['destination']
    }
  },
  {
    name: 'backupList',
    description: 'List available backups',
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Backup location' }
      },
      required: ['destination']
    }
  },
  {
    name: 'backupRestore',
    description: 'Restore from a backup',
    inputSchema: {
      type: 'object',
      properties: {
        backupPath: { type: 'string', description: 'Path to the backup' },
        resourceName: { type: 'string', description: 'Target resource name' }
      },
      required: ['backupPath', 'resourceName']
    }
  },

  // ============================================
  // SCHEDULER PLUGIN
  // ============================================
  {
    name: 'schedulerCreate',
    description: 'Create a scheduled task',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Task name' },
        cron: { type: 'string', description: 'Cron expression' },
        action: { type: 'object', description: 'Action to execute' }
      },
      required: ['name', 'cron', 'action']
    }
  },
  {
    name: 'schedulerList',
    description: 'List all scheduled tasks',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'schedulerCancel',
    description: 'Cancel a scheduled task',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Task name to cancel' }
      },
      required: ['name']
    }
  },

  // ============================================
  // S3 QUEUE PLUGIN
  // ============================================
  {
    name: 's3QueuePush',
    description: 'Push a message to the S3-backed queue',
    inputSchema: {
      type: 'object',
      properties: {
        queueName: { type: 'string', description: 'Queue name' },
        message: { type: 'object', description: 'Message to push' }
      },
      required: ['queueName', 'message']
    }
  },
  {
    name: 's3QueuePop',
    description: 'Pop a message from the queue',
    inputSchema: {
      type: 'object',
      properties: {
        queueName: { type: 'string', description: 'Queue name' }
      },
      required: ['queueName']
    }
  },
  {
    name: 's3QueuePeek',
    description: 'Peek at the next message without removing it',
    inputSchema: {
      type: 'object',
      properties: {
        queueName: { type: 'string', description: 'Queue name' }
      },
      required: ['queueName']
    }
  },

  // ============================================
  // STATE MACHINE PLUGIN
  // ============================================
  {
    name: 'stateMachineTransition',
    description: 'Transition a document to a new state',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        id: { type: 'string', description: 'Document ID' },
        event: { type: 'string', description: 'Transition event' }
      },
      required: ['resourceName', 'id', 'event']
    }
  },
  {
    name: 'stateMachineHistory',
    description: 'Get state transition history for a document',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        id: { type: 'string', description: 'Document ID' }
      },
      required: ['resourceName', 'id']
    }
  },

  // ============================================
  // COORDINATOR TOOLS
  // ============================================
  {
    name: 'coordinatorGetLeader',
    description: 'Get the current leader for a coordinator namespace',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: 'Coordinator namespace (default: "default")' }
      },
      required: []
    }
  },
  {
    name: 'coordinatorCircuitBreaker',
    description: 'Get circuit breaker status for a coordinator namespace',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: 'Coordinator namespace (default: "default")' }
      },
      required: []
    }
  },
  {
    name: 'coordinatorMetrics',
    description: 'Get coordinator metrics including latency percentiles (p50, p95, p99)',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: 'Coordinator namespace (default: "default")' }
      },
      required: []
    }
  },

  // ============================================
  // COSTS PLUGIN
  // ============================================
  {
    name: 'costsEstimate',
    description: 'Estimate S3 costs for a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' },
        operations: {
          type: 'object',
          description: 'Expected operations (reads, writes per month)'
        }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'costsReport',
    description: 'Generate a cost report for the database',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['day', 'week', 'month'], description: 'Report period' }
      },
      required: []
    }
  },

  // ============================================
  // SMTP PLUGIN
  // ============================================
  {
    name: 'smtpSend',
    description: 'Send an email via SMTP',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (HTML or text)' },
        from: { type: 'string', description: 'Sender email (optional)' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'smtpTemplate',
    description: 'Send an email using a template',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        template: { type: 'string', description: 'Template name' },
        variables: { type: 'object', description: 'Template variables' }
      },
      required: ['to', 'template', 'variables']
    }
  },

  // ============================================
  // TOURNAMENT PLUGIN
  // ============================================
  {
    name: 'tournamentCreate',
    description: 'Create a new tournament',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tournament name' },
        type: { type: 'string', enum: ['elimination', 'round-robin', 'swiss'], description: 'Tournament type' },
        participants: { type: 'array', items: { type: 'string' }, description: 'List of participant IDs' }
      },
      required: ['name', 'type', 'participants']
    }
  },
  {
    name: 'tournamentMatch',
    description: 'Record a match result',
    inputSchema: {
      type: 'object',
      properties: {
        tournamentId: { type: 'string', description: 'Tournament ID' },
        matchId: { type: 'string', description: 'Match ID' },
        winner: { type: 'string', description: 'Winner participant ID' },
        scores: { type: 'object', description: 'Match scores' }
      },
      required: ['tournamentId', 'matchId', 'winner']
    }
  },
  {
    name: 'tournamentStandings',
    description: 'Get tournament standings',
    inputSchema: {
      type: 'object',
      properties: {
        tournamentId: { type: 'string', description: 'Tournament ID' }
      },
      required: ['tournamentId']
    }
  },

  // ============================================
  // HOOK MANAGEMENT TOOLS
  // ============================================
  {
    name: 'hookList',
    description: 'List all registered hooks for a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' }
      },
      required: ['resourceName']
    }
  },

  // ============================================
  // ID GENERATOR TOOLS
  // ============================================
  {
    name: 'idGeneratorInfo',
    description: 'Get ID generator configuration for a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' }
      },
      required: ['resourceName']
    }
  },
  {
    name: 'idGeneratorNext',
    description: 'Generate the next ID without inserting a document',
    inputSchema: {
      type: 'object',
      properties: {
        resourceName: { type: 'string', description: 'Name of the resource' }
      },
      required: ['resourceName']
    }
  }
];

function getPlugin(database: S3db, pluginName: string): any {
  const plugin = database.getPlugin?.(pluginName);
  if (!plugin) {
    throw new Error(`Plugin '${pluginName}' not enabled. Enable it when creating the database.`);
  }
  return plugin;
}

export function createPluginHandlers(server: S3dbMCPServer) {
  return {
    // ============================================
    // CACHE HANDLERS
    // ============================================
    async cacheGet(args: { resourceName: string; key: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const cache = resource._cache;
      if (!cache) {
        return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'Cache not enabled for this resource' } };
      }
      const value = await cache.get(args.key);
      return { success: true, data: value };
    },

    async cacheSet(args: { resourceName: string; key: string; value: any; ttl?: number }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const cache = resource._cache;
      if (!cache) {
        return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'Cache not enabled for this resource' } };
      }
      await cache.set(args.key, args.value, args.ttl);
      return { success: true, message: `Cached key '${args.key}'` };
    },

    async cacheClear(args: { resourceName: string; pattern?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const cache = resource._cache;
      if (!cache) {
        return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'Cache not enabled for this resource' } };
      }
      const count = await cache.clear(args.pattern);
      return { success: true, clearedCount: count };
    },

    async cacheStats(args: { resourceName?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      if (args.resourceName) {
        const resource = server.getResource(database, args.resourceName);
        const cache = resource._cache;
        if (!cache) {
          return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'Cache not enabled for this resource' } };
        }
        return { success: true, data: cache.getStats?.() || {} };
      }
      return { success: true, data: { message: 'Provide resourceName for specific stats' } };
    },

    // ============================================
    // AUDIT HANDLERS
    // ============================================
    async auditList(args: { resourceName: string; limit?: number; offset?: number; operation?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'audit');
      const entries = await plugin.list(args.resourceName, {
        limit: args.limit || 100,
        offset: args.offset || 0,
        operation: args.operation
      });
      return { success: true, data: entries, count: entries.length };
    },

    async auditGet(args: { resourceName: string; entryId: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'audit');
      const entry = await plugin.get(args.resourceName, args.entryId);
      return { success: true, data: entry };
    },

    async auditSearch(args: { resourceName: string; query: string; startDate?: string; endDate?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'audit');
      const entries = await plugin.search(args.resourceName, {
        query: args.query,
        startDate: args.startDate,
        endDate: args.endDate
      });
      return { success: true, data: entries, count: entries.length };
    },

    // ============================================
    // TTL HANDLERS
    // ============================================
    async ttlSet(args: { resourceName: string; id: string; expiresAt: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'ttl');
      await plugin.setTTL(args.resourceName, args.id, new Date(args.expiresAt));
      return { success: true, message: `TTL set for ${args.id}`, expiresAt: args.expiresAt };
    },

    async ttlGet(args: { resourceName: string; id: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'ttl');
      const expiresAt = await plugin.getTTL(args.resourceName, args.id);
      return { success: true, data: { id: args.id, expiresAt } };
    },

    async ttlCleanup(args: { resourceName: string; dryRun?: boolean }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'ttl');
      const result = await plugin.cleanup(args.resourceName, { dryRun: args.dryRun });
      return { success: true, data: result, dryRun: args.dryRun || false };
    },

    // ============================================
    // METRICS HANDLERS
    // ============================================
    async metricsGet(args: { resourceName?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'metrics');
      const metrics = args.resourceName
        ? await plugin.getResourceMetrics(args.resourceName)
        : await plugin.getAllMetrics();
      return { success: true, data: metrics };
    },

    async metricsExport(args: { format: 'json' | 'prometheus' }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'metrics');
      const exported = await plugin.export(args.format);
      return { success: true, format: args.format, data: exported };
    },

    async metricsReset(args: { resourceName?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'metrics');
      await plugin.reset(args.resourceName);
      return { success: true, message: args.resourceName ? `Reset metrics for ${args.resourceName}` : 'Reset all metrics' };
    },

    // ============================================
    // REPLICATOR HANDLERS
    // ============================================
    async replicatorSync(args: { resourceName: string; target?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'replicator');
      const result = await plugin.sync(args.resourceName, args.target);
      return { success: true, data: result };
    },

    async replicatorStatus(args: { resourceName: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'replicator');
      const status = await plugin.getStatus(args.resourceName);
      return { success: true, data: status };
    },

    // ============================================
    // VECTOR HANDLERS
    // ============================================
    async vectorSearch(args: { resourceName: string; embedding: number[]; k?: number; filter?: any }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const results = await resource.vectorSearch?.(args.embedding, {
        k: args.k || 10,
        filter: args.filter
      });
      if (!results) {
        return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'Vector search not enabled for this resource' } };
      }
      return { success: true, data: results, count: results.length };
    },

    async vectorUpsert(args: { resourceName: string; id: string; embedding: number[]; metadata?: any }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const result = await resource.vectorUpsert?.(args.id, args.embedding, args.metadata);
      if (!result) {
        return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'Vector operations not enabled for this resource' } };
      }
      return { success: true, data: result };
    },

    // ============================================
    // FULLTEXT HANDLERS
    // ============================================
    async fulltextSearch(args: { resourceName: string; query: string; fields?: string[]; limit?: number }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const results = await resource.fulltextSearch?.(args.query, {
        fields: args.fields,
        limit: args.limit || 100
      });
      if (!results) {
        return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'Fulltext search not enabled for this resource' } };
      }
      return { success: true, data: results, count: results.length };
    },

    async fulltextIndex(args: { resourceName: string; fields: string[] }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const result = await resource.fulltextIndex?.(args.fields);
      if (!result) {
        return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'Fulltext indexing not enabled for this resource' } };
      }
      return { success: true, message: `Indexed fields: ${args.fields.join(', ')}` };
    },

    // ============================================
    // GEO HANDLERS
    // ============================================
    async geoNear(args: { resourceName: string; lat: number; lng: number; maxDistanceKm: number; limit?: number }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const results = await resource.geoNear?.(args.lat, args.lng, args.maxDistanceKm, {
        limit: args.limit || 100
      });
      if (!results) {
        return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'Geo queries not enabled for this resource' } };
      }
      return { success: true, data: results, count: results.length };
    },

    // ============================================
    // GRAPH HANDLERS
    // ============================================
    async graphAddEdge(args: { resourceName: string; from: string; to: string; label?: string; properties?: any }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'graph');
      const result = await plugin.addEdge(args.resourceName, args.from, args.to, args.label, args.properties);
      return { success: true, data: result };
    },

    async graphTraverse(args: { resourceName: string; startNode: string; depth?: number; direction?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'graph');
      const results = await plugin.traverse(args.resourceName, args.startNode, {
        depth: args.depth || 3,
        direction: args.direction || 'outgoing'
      });
      return { success: true, data: results };
    },

    // ============================================
    // BACKUP HANDLERS
    // ============================================
    async backupCreate(args: { resourceName?: string; destination: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'backup');
      const result = await plugin.create(args.destination, args.resourceName);
      return { success: true, data: result };
    },

    async backupList(args: { destination: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'backup');
      const backups = await plugin.list(args.destination);
      return { success: true, data: backups };
    },

    async backupRestore(args: { backupPath: string; resourceName: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'backup');
      const result = await plugin.restore(args.backupPath, args.resourceName);
      return { success: true, data: result };
    },

    // ============================================
    // SCHEDULER HANDLERS
    // ============================================
    async schedulerCreate(args: { name: string; cron: string; action: any }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'scheduler');
      const result = await plugin.schedule(args.name, args.cron, args.action);
      return { success: true, data: result };
    },

    async schedulerList(args: Record<string, never>, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'scheduler');
      const tasks = await plugin.list();
      return { success: true, data: tasks };
    },

    async schedulerCancel(args: { name: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'scheduler');
      await plugin.cancel(args.name);
      return { success: true, message: `Cancelled task: ${args.name}` };
    },

    // ============================================
    // S3 QUEUE HANDLERS
    // ============================================
    async s3QueuePush(args: { queueName: string; message: any }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 's3-queue');
      const result = await plugin.push(args.queueName, args.message);
      return { success: true, data: result };
    },

    async s3QueuePop(args: { queueName: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 's3-queue');
      const message = await plugin.pop(args.queueName);
      return { success: true, data: message };
    },

    async s3QueuePeek(args: { queueName: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 's3-queue');
      const message = await plugin.peek(args.queueName);
      return { success: true, data: message };
    },

    // ============================================
    // STATE MACHINE HANDLERS
    // ============================================
    async stateMachineTransition(args: { resourceName: string; id: string; event: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const result = await resource.transition?.(args.id, args.event);
      if (!result) {
        return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'State machine not enabled for this resource' } };
      }
      return { success: true, data: result };
    },

    async stateMachineHistory(args: { resourceName: string; id: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const history = await resource.getStateHistory?.(args.id);
      if (!history) {
        return { success: false, error: { code: 'PLUGIN_NOT_ENABLED', message: 'State machine not enabled for this resource' } };
      }
      return { success: true, data: history };
    },

    // ============================================
    // COORDINATOR HANDLERS
    // ============================================
    async coordinatorGetLeader(args: { namespace?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const namespace = args.namespace || 'default';
      const coordinator = await database.getGlobalCoordinator?.(namespace);
      if (!coordinator) {
        return { success: false, error: { code: 'COORDINATOR_NOT_AVAILABLE', message: 'Global coordinator not available' } };
      }
      const leader = await coordinator.getLeader();
      return { success: true, namespace, leader };
    },

    async coordinatorCircuitBreaker(args: { namespace?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const namespace = args.namespace || 'default';
      const coordinator = await database.getGlobalCoordinator?.(namespace);
      if (!coordinator) {
        return { success: false, error: { code: 'COORDINATOR_NOT_AVAILABLE', message: 'Global coordinator not available' } };
      }
      const status = coordinator.getCircuitBreakerStatus?.();
      return { success: true, namespace, circuitBreaker: status || 'unknown' };
    },

    async coordinatorMetrics(args: { namespace?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const namespace = args.namespace || 'default';
      const coordinator = await database.getGlobalCoordinator?.(namespace);
      if (!coordinator) {
        return { success: false, error: { code: 'COORDINATOR_NOT_AVAILABLE', message: 'Global coordinator not available' } };
      }
      const metrics = coordinator.getMetrics?.();
      return { success: true, namespace, metrics: metrics || {} };
    },

    // ============================================
    // COSTS HANDLERS
    // ============================================
    async costsEstimate(args: { resourceName: string; operations?: any }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'costs');
      const estimate = await plugin.estimate(args.resourceName, args.operations);
      return { success: true, data: estimate };
    },

    async costsReport(args: { period?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'costs');
      const report = await plugin.report(args.period || 'month');
      return { success: true, data: report };
    },

    // ============================================
    // SMTP HANDLERS
    // ============================================
    async smtpSend(args: { to: string; subject: string; body: string; from?: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'smtp');
      const result = await plugin.send({
        to: args.to,
        subject: args.subject,
        body: args.body,
        from: args.from
      });
      return { success: true, data: result };
    },

    async smtpTemplate(args: { to: string; template: string; variables: any }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'smtp');
      const result = await plugin.sendTemplate(args.to, args.template, args.variables);
      return { success: true, data: result };
    },

    // ============================================
    // TOURNAMENT HANDLERS
    // ============================================
    async tournamentCreate(args: { name: string; type: string; participants: string[] }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'tournament');
      const tournament = await plugin.create({
        name: args.name,
        type: args.type,
        participants: args.participants
      });
      return { success: true, data: tournament };
    },

    async tournamentMatch(args: { tournamentId: string; matchId: string; winner: string; scores?: any }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'tournament');
      const result = await plugin.recordMatch(args.tournamentId, args.matchId, {
        winner: args.winner,
        scores: args.scores
      });
      return { success: true, data: result };
    },

    async tournamentStandings(args: { tournamentId: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const plugin = getPlugin(database, 'tournament');
      const standings = await plugin.getStandings(args.tournamentId);
      return { success: true, data: standings };
    },

    // ============================================
    // HOOK HANDLERS
    // ============================================
    async hookList(args: { resourceName: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const hooks = resource._hooks?.list?.() || [];
      return {
        success: true,
        resource: args.resourceName,
        hooks: hooks.map((h: any) => ({
          type: h.type,
          name: h.name,
          priority: h.priority
        }))
      };
    },

    // ============================================
    // ID GENERATOR HANDLERS
    // ============================================
    async idGeneratorInfo(args: { resourceName: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const idGen = resource._idGenerator;
      return {
        success: true,
        resource: args.resourceName,
        idGenerator: {
          type: idGen?.type || 'uuid',
          config: idGen?.config || {}
        }
      };
    },

    async idGeneratorNext(args: { resourceName: string }, database: S3db): Promise<any> {
      server.ensureConnected(database);
      const resource = server.getResource(database, args.resourceName);
      const nextId = await resource._idGenerator?.next?.();
      if (!nextId) {
        return { success: false, error: { code: 'ID_GENERATOR_ERROR', message: 'Could not generate next ID' } };
      }
      return { success: true, nextId };
    }
  };
}
