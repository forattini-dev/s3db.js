import { Plugin, ResourceLike } from './plugin.class.js';
import { getValidatedNamespace } from './namespace.js';
import tryFn from '../concerns/try-fn.js';
import { resolveResourceName } from './concerns/resource-names.js';
import { createLogger, type Logger, type LogLevel } from '../concerns/logger.js';
import type { PluginConfig } from './plugin.class.js';

export interface AuditPluginOptions {
  resourceNames?: {
    audit?: string;
  };
  resourceName?: string;
  includeData?: boolean;
  includePartitions?: boolean;
  maxDataSize?: number;
  namespace?: string;
  logger?: Logger;
  logLevel?: string;
  [key: string]: unknown;
}

export interface AuditQueryOptions {
  resourceName?: string;
  operation?: string;
  recordId?: string;
  partition?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AuditRecord {
  id: string;
  resourceName: string;
  operation: string;
  recordId: string;
  userId: string;
  timestamp: string;
  createdAt: string;
  oldData?: string | null;
  newData?: string | null;
  partition?: string | null;
  partitionValues?: string | null;
  metadata?: string;
}

export interface AuditStats {
  total: number;
  byOperation: Record<string, number>;
  byResource: Record<string, number>;
  byPartition: Record<string, number>;
  byUser: Record<string, number>;
  timeline: Record<string, number>;
}

export interface AuditConfig {
  includeData: boolean;
  includePartitions: boolean;
  maxDataSize: number;
  logLevel?: string;
}

interface ResourceDescriptor {
  defaultName: string;
  override?: string;
}

interface Resource {
  name: string;
  $schema: {
    partitions?: Record<string, { fields: Record<string, string> }>;
  };
  on(event: string, callback: (data: unknown) => Promise<void>): void;
  insert(data: Record<string, unknown>): Promise<void>;
  get(id: string): Promise<Record<string, unknown>>;
  list(options?: { limit?: number }): Promise<Record<string, unknown>[]>;
  query(filter: Record<string, unknown>, options?: { limit?: number }): Promise<Record<string, unknown>[]>;
  page(options?: { size?: number; offset?: number }): Promise<{ items: Record<string, unknown>[] }>;
  delete(id: string): Promise<void>;
  deleteMany: (ids: string[]) => Promise<void>;
  _originalDeleteMany?: (ids: string[]) => Promise<void>;
}

export class AuditPlugin extends Plugin {
  declare namespace: string;
  auditResource: Resource | null;
  _auditResourceDescriptor: ResourceDescriptor;
  auditResourceName: string;
  config: AuditConfig;
  getCurrentUserId?: () => string;

  constructor(options: AuditPluginOptions = {}) {
    super(options);

    this.namespace = getValidatedNamespace(this.options, '');

    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = (this.logLevel || 'info') as LogLevel;
      this.logger = createLogger({ name: 'AuditPlugin', level: logLevel });
    }

    const {
      resourceNames = {},
      resourceName,
      includeData = true,
      includePartitions = true,
      maxDataSize = 10000
    } = this.options as AuditPluginOptions;

    this.auditResource = null;
    this._auditResourceDescriptor = {
      defaultName: 'plg_audits',
      override: resourceNames.audit || resourceName
    };
    this.auditResourceName = this._resolveAuditResourceName();
    this.config = {
      includeData,
      includePartitions,
      maxDataSize,
      logLevel: this.logLevel
    };
  }

  _resolveAuditResourceName(): string {
    return resolveResourceName('audit', this._auditResourceDescriptor, {
      namespace: this.namespace
    });
  }

  override onNamespaceChanged(): void {
    this.auditResourceName = this._resolveAuditResourceName();
  }

  override async onInstall(): Promise<void> {
    const [ok, , auditResource] = await tryFn(() => this.database.createResource({
      name: this.auditResourceName,
      attributes: {
        id: 'string|required',
        resourceName: 'string|required',
        operation: 'string|required',
        recordId: 'string|required',
        userId: 'string|optional',
        timestamp: 'string|required',
        createdAt: 'string|required',
        oldData: 'string|optional',
        newData: 'string|optional',
        partition: 'string|optional',
        partitionValues: 'string|optional',
        metadata: 'string|optional'
      },
      partitions: {
        byDate: { fields: { createdAt: 'string|maxlength:10' } },
        byResource: { fields: { resourceName: 'string' } }
      },
      behavior: 'body-overflow'
    }));
    this.auditResource = ok ? auditResource as unknown as Resource : ((this.database.resources[this.auditResourceName] as unknown as Resource) || null);
    if (!ok && !this.auditResource) return;

    this.database.addHook('afterCreateResource', (context: any) => {
      if (context.resource.name !== this.auditResourceName) {
        this.setupResourceAuditing(context.resource as Resource);
      }
    });

    for (const resource of Object.values(this.database.resources)) {
      if (resource.name !== this.auditResourceName) {
        this.setupResourceAuditing(resource as unknown as Resource);
      }
    }
  }

  override async onStart(): Promise<void> {
    // Ready
  }

  override async onStop(): Promise<void> {
    // No cleanup needed
  }

  setupResourceAuditing(resource: Resource): void {
    resource.on('inserted', async (data: unknown) => {
      const record = data as Record<string, unknown>;
      const partitionValues = this.config.includePartitions ? this.getPartitionValues(record, resource as unknown as ResourceLike) : null;
      await this.logAudit({
        resourceName: resource.name,
        operation: 'insert',
        recordId: (record.id as string) || 'auto-generated',
        oldData: null,
        newData: this.config.includeData ? JSON.stringify(this.truncateData(record)) : null,
        partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
      });
    });

    resource.on('updated', async (data: unknown) => {
      const record = data as Record<string, unknown> & { $before?: Record<string, unknown> };
      let oldData = record.$before;
      if (this.config.includeData && !oldData) {
        const [fetchOk, , fetched] = await tryFn(() => resource.get(record.id as string));
        if (fetchOk) oldData = fetched;
      }

      const partitionValues = this.config.includePartitions ? this.getPartitionValues(record, resource as unknown as ResourceLike) : null;
      await this.logAudit({
        resourceName: resource.name,
        operation: 'update',
        recordId: record.id as string,
        oldData: oldData && this.config.includeData ? JSON.stringify(this.truncateData(oldData)) : null,
        newData: this.config.includeData ? JSON.stringify(this.truncateData(record)) : null,
        partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
      });
    });

    resource.on('deleted', async (data: unknown) => {
      const record = data as Record<string, unknown>;
      let oldData = record;
      if (this.config.includeData && !oldData) {
        const [fetchOk, , fetched] = await tryFn(() => resource.get(record.id as string));
        if (fetchOk) oldData = fetched;
      }

      const partitionValues = oldData && this.config.includePartitions ? this.getPartitionValues(oldData, resource as unknown as ResourceLike) : null;
      await this.logAudit({
        resourceName: resource.name,
        operation: 'delete',
        recordId: record.id as string,
        oldData: oldData && this.config.includeData ? JSON.stringify(this.truncateData(oldData)) : null,
        newData: null,
        partition: partitionValues ? this.getPrimaryPartition(partitionValues) : null,
        partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
      });
    });

    const originalDeleteMany = resource.deleteMany.bind(resource);
    const plugin = this;
    resource.deleteMany = async function(ids: string[]) {
      const objectsToDelete: Record<string, unknown>[] = [];
      for (const id of ids) {
        const [fetchOk, , fetched] = await tryFn(() => resource.get(id));
        if (fetchOk && fetched) {
          objectsToDelete.push(fetched);
        } else {
          objectsToDelete.push({ id });
        }
      }

      const result = await originalDeleteMany(ids);

      for (const oldData of objectsToDelete) {
        const partitionValues = oldData && plugin.config.includePartitions ? plugin.getPartitionValues(oldData, resource as unknown as ResourceLike) : null;
        await plugin.logAudit({
          resourceName: resource.name,
          operation: 'deleteMany',
          recordId: oldData.id as string,
          oldData: oldData && plugin.config.includeData ? JSON.stringify(plugin.truncateData(oldData)) : null,
          newData: null,
          partition: partitionValues ? plugin.getPrimaryPartition(partitionValues) : null,
          partitionValues: partitionValues ? JSON.stringify(partitionValues) : null
        });
      }

      return result;
    };

    resource._originalDeleteMany = originalDeleteMany;
  }

  async logAudit(auditData: {
    resourceName: string;
    operation: string;
    recordId: string;
    oldData: string | null;
    newData: string | null;
    partition: string | null;
    partitionValues: string | null;
  }): Promise<void> {
    if (!this.auditResource) {
      return;
    }

    const now = new Date();
    const auditRecord: Record<string, unknown> = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      userId: this.getCurrentUserId?.() || 'system',
      timestamp: now.toISOString(),
      createdAt: now.toISOString().slice(0, 10),
      metadata: JSON.stringify({ source: 'audit-plugin', version: '2.0' }),
      resourceName: auditData.resourceName,
      operation: auditData.operation,
      recordId: auditData.recordId
    };

    if (auditData.oldData !== null) {
      auditRecord.oldData = auditData.oldData;
    }
    if (auditData.newData !== null) {
      auditRecord.newData = auditData.newData;
    }
    if (auditData.partition !== null) {
      auditRecord.partition = auditData.partition;
    }
    if (auditData.partitionValues !== null) {
      auditRecord.partitionValues = auditData.partitionValues;
    }

    try {
      await this.auditResource.insert(auditRecord);
    } catch (error) {
      this.logger.warn(
        { error: (error as Error).message, resourceName: auditData.resourceName, recordId: auditData.recordId },
        `Audit logging failed: ${(error as Error).message}`
      );
    }
  }

  override getPartitionValues(data: Record<string, unknown>, resource: ResourceLike): Record<string, Record<string, unknown>> {
    if (!this.config.includePartitions) return {};

    const partitions = (resource as any).$schema?.partitions;
    if (!partitions) {
      return {};
    }

    const partitionValues: Record<string, Record<string, unknown>> = {};
    for (const [partitionName, partitionConfig] of Object.entries(partitions)) {
      const values: Record<string, unknown> = {};
      for (const field of Object.keys((partitionConfig as any).fields)) {
        values[field] = this.getNestedFieldValue(data, field);
      }
      if (Object.values(values).some(v => v !== undefined && v !== null)) {
        partitionValues[partitionName] = values;
      }
    }
    return partitionValues;
  }

  override getNestedFieldValue(data: Record<string, unknown>, fieldPath: string): unknown {
    const parts = fieldPath.split('.');
    let value: unknown = data;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  getPrimaryPartition(partitionValues: Record<string, unknown>): string | null {
    if (!partitionValues) return null;
    const partitionNames = Object.keys(partitionValues);
    return partitionNames.length > 0 ? (partitionNames[0] ?? null) : null;
  }

  truncateData(data: Record<string, unknown>): Record<string, unknown> | null {
    if (!this.config.includeData) return null;

    const dataStr = JSON.stringify(data);
    if (dataStr.length <= this.config.maxDataSize) {
      return data;
    }

    return {
      ...data,
      _truncated: true,
      _originalSize: dataStr.length,
      _truncatedAt: new Date().toISOString()
    };
  }

  async getAuditLogs(options: AuditQueryOptions = {}): Promise<AuditRecord[]> {
    if (!this.auditResource) return [];

    const { resourceName, operation, recordId, partition, startDate, endDate, limit = 100, offset = 0 } = options;

    let items: AuditRecord[] = [];

    if (resourceName && !operation && !recordId && !partition && !startDate && !endDate) {
      const [ok, , result] = await tryFn(() =>
        this.auditResource!.query({ resourceName }, { limit: limit + offset })
      );
      items = ok && result ? (result as unknown as AuditRecord[]) : [];
      return items.slice(offset, offset + limit);
    } else if (startDate && !resourceName && !operation && !recordId && !partition) {
      const dates = this._generateDateRange(startDate, endDate);
      for (const date of dates) {
        const [ok, , result] = await tryFn(() =>
          this.auditResource!.query({ createdAt: date })
        );
        if (ok && result) {
          items.push(...(result as unknown as AuditRecord[]));
        }
      }
      return items.slice(offset, offset + limit);
    } else if (resourceName || operation || recordId || partition || startDate || endDate) {
      const fetchSize = Math.min(10000, Math.max(1000, (limit + offset) * 20));
      const result = await this.auditResource.list({ limit: fetchSize });
      items = (result || []) as unknown as AuditRecord[];

      if (resourceName) {
        items = items.filter(log => log.resourceName === resourceName);
      }
      if (operation) {
        items = items.filter(log => log.operation === operation);
      }
      if (recordId) {
        items = items.filter(log => log.recordId === recordId);
      }
      if (partition) {
        items = items.filter(log => log.partition === partition);
      }
      if (startDate || endDate) {
        items = items.filter(log => {
          const timestamp = new Date(log.timestamp);
          if (startDate && timestamp < new Date(startDate)) return false;
          if (endDate && timestamp > new Date(endDate)) return false;
          return true;
        });
      }

      return items.slice(offset, offset + limit);
    } else {
      const result = await this.auditResource.page({ size: limit, offset });
      return (result.items || []) as unknown as AuditRecord[];
    }
  }

  _generateDateRange(startDate: string, endDate?: string): string[] {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    return dates;
  }

  async getRecordHistory(resourceName: string, recordId: string): Promise<AuditRecord[]> {
    return await this.getAuditLogs({ resourceName, recordId });
  }

  async getPartitionHistory(resourceName: string, partitionName: string, partitionValues: Record<string, unknown>): Promise<AuditRecord[]> {
    return await this.getAuditLogs({
      resourceName,
      partition: partitionName
    });
  }

  async getAuditStats(options: AuditQueryOptions = {}): Promise<AuditStats> {
    const logs = await this.getAuditLogs(options);

    const stats: AuditStats = {
      total: logs.length,
      byOperation: {},
      byResource: {},
      byPartition: {},
      byUser: {},
      timeline: {}
    };

    for (const log of logs) {
      stats.byOperation[log.operation] = (stats.byOperation[log.operation] || 0) + 1;
      stats.byResource[log.resourceName] = (stats.byResource[log.resourceName] || 0) + 1;
      if (log.partition) {
        stats.byPartition[log.partition] = (stats.byPartition[log.partition] || 0) + 1;
      }
      stats.byUser[log.userId] = (stats.byUser[log.userId] || 0) + 1;
      const date = log.timestamp.split('T')[0]!;
      stats.timeline[date] = (stats.timeline[date] || 0) + 1;
    }

    return stats;
  }

  async cleanupOldAudits(retentionDays: number = 90): Promise<number> {
    if (!this.auditResource) return 0;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const datesToDelete: string[] = [];
    const startDate = new Date(cutoffDate);
    startDate.setDate(startDate.getDate() - 365);

    for (let d = new Date(startDate); d < cutoffDate; d.setDate(d.getDate() + 1)) {
      datesToDelete.push(d.toISOString().slice(0, 10));
    }

    let deletedCount = 0;

    for (const dateStr of datesToDelete) {
      const [ok, , oldAudits] = await tryFn(() =>
        this.auditResource!.query({ createdAt: dateStr })
      );

      if (ok && oldAudits) {
        for (const audit of oldAudits as unknown as AuditRecord[]) {
          const [delOk] = await tryFn(() => this.auditResource!.delete(audit.id));
          if (delOk) {
            deletedCount++;
          }
        }
      }
    }

    return deletedCount;
  }
}
