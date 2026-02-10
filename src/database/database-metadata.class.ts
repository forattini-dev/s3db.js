import { createHash } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import type { BehaviorType } from '../behaviors/types.js';
import type { ResourceExport } from '../resource.class.js';
import type { HooksCollection } from '../core/resource-hooks.class.js';
import type {
  DatabaseRef,
  SavedMetadata,
  ResourceMetadata,
  VersionData,
  HookSummary,
  DefinitionChange,
  StringRecord
} from './types.js';
import type { SchemaRegistry, PluginSchemaRegistry } from '../schema.class.js';
import { PluginStorage } from '../concerns/plugin-storage.js';
import { S3Mutex, type LockResult } from '../plugins/concerns/s3-mutex.class.js';
import { streamToString } from '../stream/index.js';
import tryFn from '../concerns/try-fn.js';

export class DatabaseMetadata {
  private _metadataUploadPending: boolean;
  private _metadataUploadDebounce: ReturnType<typeof setTimeout> | null;
  private _pluginStorage: PluginStorage | null;
  private _mutex: S3Mutex | null;

  constructor(private database: DatabaseRef) {
    this._metadataUploadPending = false;
    this._metadataUploadDebounce = null;
    this._pluginStorage = null;
    this._mutex = null;
  }

  private _getPluginStorage(): PluginStorage {
    if (!this._pluginStorage) {
      this._pluginStorage = new PluginStorage(
        this.database.client as any,
        's3db-core'
      );
    }
    return this._pluginStorage;
  }

  private _requiresDistributedLock(): boolean {
    const client = this.database.client;
    if (!client) return false;

    const connStr = client.connectionString || '';
    if (connStr.startsWith('file://') || connStr.startsWith('memory://')) {
      return false;
    }

    const endpoint = client.config?.endpoint || '';
    if (endpoint.startsWith('mock://')) {
      return false;
    }

    return connStr.length > 0;
  }

  private _getMutex(): S3Mutex | null {
    if (!this._requiresDistributedLock()) {
      return null;
    }
    if (!this._mutex) {
      this._mutex = new S3Mutex(this._getPluginStorage(), 'metadata');
    }
    return this._mutex;
  }

  get uploadPending(): boolean {
    return this._metadataUploadPending;
  }

  blankMetadataStructure(): SavedMetadata {
    return {
      version: '1',
      s3dbVersion: this.database.s3dbVersion,
      lastUpdated: new Date().toISOString(),
      resources: {},
    };
  }

  generateDefinitionHash(definition: ResourceExport, behavior?: BehaviorType): string {
    const attributes = definition.attributes;
    const stableAttributes = { ...attributes };
    if (definition.timestamps) {
      delete (stableAttributes as any).createdAt;
      delete (stableAttributes as any).updatedAt;
    }
    const hashObj = {
      attributes: stableAttributes,
      behavior: behavior || definition.behavior || 'user-managed',
      partitions: definition.partitions || {},
    };
    const stableString = jsonStableStringify(hashObj);
    return `sha256:${createHash('sha256').update(stableString!).digest('hex')}`;
  }

  getNextVersion(versions: StringRecord<VersionData> = {}): string {
    const versionNumbers = Object.keys(versions)
      .filter(v => v.startsWith('v'))
      .map(v => parseInt(v.substring(1)))
      .filter(n => !isNaN(n));

    const maxVersion = versionNumbers.length > 0 ? Math.max(...versionNumbers) : 0;
    return `v${maxVersion + 1}`;
  }

  detectDefinitionChanges(savedMetadata: SavedMetadata): DefinitionChange[] {
    const changes: DefinitionChange[] = [];

    for (const [name, currentResource] of Object.entries(this.database.resources)) {
      const currentHash = this.generateDefinitionHash(currentResource.export());
      const savedResource = savedMetadata.resources?.[name];

      if (!savedResource) {
        changes.push({
          type: 'new',
          resourceName: name,
          currentHash,
          savedHash: null
        });
      } else {
        const currentVersion = savedResource.currentVersion || 'v1';
        const versionData = savedResource.versions?.[currentVersion];
        const savedHash = versionData?.hash;

        if (savedHash !== currentHash) {
          changes.push({
            type: 'changed',
            resourceName: name,
            currentHash,
            savedHash: savedHash || null,
            fromVersion: currentVersion,
            toVersion: this.getNextVersion(savedResource.versions)
          });
        }
      }
    }

    for (const [name, savedResource] of Object.entries(savedMetadata.resources || {})) {
      if (!this.database._resourcesMap[name]) {
        const currentVersion = savedResource.currentVersion || 'v1';
        const versionData = savedResource.versions?.[currentVersion];
        changes.push({
          type: 'deleted',
          resourceName: name,
          currentHash: null,
          savedHash: versionData?.hash || null,
          deletedVersion: currentVersion
        });
      }
    }

    return changes;
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async _readFreshMetadata(): Promise<SavedMetadata | null> {
    const [ok, , response] = await tryFn(async () => {
      const request = await this.database.client.getObject('s3db.json');
      return streamToString((request as any)?.Body);
    });

    if (!ok || !response) {
      return null;
    }

    try {
      return JSON.parse(response) as SavedMetadata;
    } catch {
      return null;
    }
  }

  private _mergeSchemaRegistry(
    fresh: SchemaRegistry | undefined,
    local: SchemaRegistry | undefined
  ): SchemaRegistry | undefined {
    if (!fresh && !local) return undefined;
    if (!fresh) return local;
    if (!local) return fresh;

    const mergedNextIndex = Math.max(fresh.nextIndex, local.nextIndex);

    const mergedMapping: Record<string, number> = { ...fresh.mapping };
    for (const [attr, index] of Object.entries(local.mapping)) {
      const existingIndex = mergedMapping[attr];
      if (existingIndex === undefined) {
        mergedMapping[attr] = index;
      } else if (existingIndex !== index) {
        mergedMapping[attr] = Math.max(existingIndex, index);
      }
    }

    const burnedByIndex = new Map<number, { index: number; attribute: string; burnedAt: string; reason?: string }>();
    for (const entry of fresh.burned) {
      burnedByIndex.set(entry.index, entry);
    }
    for (const entry of local.burned) {
      if (!burnedByIndex.has(entry.index)) {
        burnedByIndex.set(entry.index, entry);
      }
    }

    return {
      nextIndex: mergedNextIndex,
      mapping: mergedMapping,
      burned: Array.from(burnedByIndex.values())
    };
  }

  private _mergePluginSchemaRegistry(
    fresh: StringRecord<PluginSchemaRegistry> | undefined,
    local: StringRecord<PluginSchemaRegistry> | undefined
  ): StringRecord<PluginSchemaRegistry> | undefined {
    if (!fresh && !local) return undefined;
    if (!fresh) return local;
    if (!local) return fresh;

    const merged: StringRecord<PluginSchemaRegistry> = {};
    const allPlugins = new Set([...Object.keys(fresh), ...Object.keys(local)]);

    for (const pluginName of allPlugins) {
      const freshReg = fresh[pluginName];
      const localReg = local[pluginName];

      if (!freshReg && localReg) {
        merged[pluginName] = localReg;
      } else if (freshReg && !localReg) {
        merged[pluginName] = freshReg;
      } else if (freshReg && localReg) {
        merged[pluginName] = this._mergeSinglePluginRegistry(freshReg, localReg);
      }
    }

    return merged;
  }

  private _mergeSinglePluginRegistry(
    fresh: PluginSchemaRegistry,
    local: PluginSchemaRegistry
  ): PluginSchemaRegistry {
    const mergedMapping: Record<string, string> = { ...fresh.mapping };
    for (const [attr, key] of Object.entries(local.mapping)) {
      if (!(attr in mergedMapping)) {
        mergedMapping[attr] = key;
      }
    }

    const burnedByKey = new Map<string, { key: string; attribute: string; burnedAt: string; reason?: string }>();
    for (const entry of fresh.burned) {
      burnedByKey.set(entry.key, entry);
    }
    for (const entry of local.burned) {
      if (!burnedByKey.has(entry.key)) {
        burnedByKey.set(entry.key, entry);
      }
    }

    return {
      mapping: mergedMapping,
      burned: Array.from(burnedByKey.values())
    };
  }

  private _buildLocalMetadata(): SavedMetadata {
    const metadata: SavedMetadata = {
      version: this.database.version,
      s3dbVersion: this.database.s3dbVersion,
      lastUpdated: new Date().toISOString(),
      resources: {}
    };

    Object.entries(this.database.resources).forEach(([name, resource]) => {
      const resourceDef = resource.export();
      const serializableDef = this._buildMetadataDefinition(resourceDef);
      const definitionHash = this.generateDefinitionHash(serializableDef as unknown as ResourceExport);

      const existingResource = this.database.savedMetadata?.resources?.[name];
      const currentVersion = existingResource?.currentVersion || 'v1';
      const existingVersionData = existingResource?.versions?.[currentVersion];

      let version: string;
      let isNewVersion: boolean;

      if (!existingVersionData || existingVersionData.hash !== definitionHash) {
        version = this.getNextVersion(existingResource?.versions);
        isNewVersion = true;
      } else {
        version = currentVersion;
        isNewVersion = false;
      }

      const idGeneratorValue = typeof resource.idGeneratorType === 'function'
        ? 'custom'
        : resource.idGeneratorType as string | number | Record<string, unknown> | undefined;

      const newVersionData: VersionData = {
        hash: definitionHash,
        attributes: serializableDef.attributes!,
        behavior: (serializableDef.behavior || 'user-managed') as BehaviorType,
        timestamps: serializableDef.timestamps,
        partitions: serializableDef.partitions,
        paranoid: serializableDef.paranoid,
        allNestedObjectsOptional: serializableDef.allNestedObjectsOptional,
        autoDecrypt: serializableDef.autoDecrypt,
        cache: serializableDef.cache,
        asyncEvents: serializableDef.asyncEvents,
        asyncPartitions: serializableDef.asyncPartitions,
        hooks: serializableDef.hooks,
        idSize: resource.idSize,
        idGenerator: idGeneratorValue,
        createdAt: isNewVersion ? new Date().toISOString() : existingVersionData?.createdAt
      };

      const schema = resource.schema;
      let schemaRegistry = schema?.getSchemaRegistry?.();
      let pluginSchemaRegistry: StringRecord<PluginSchemaRegistry> | undefined = schema?.getPluginSchemaRegistry?.();

      if (!schemaRegistry && existingResource?.schemaRegistry) {
        schemaRegistry = existingResource.schemaRegistry;
      }
      if (!pluginSchemaRegistry && existingResource?.pluginSchemaRegistry) {
        pluginSchemaRegistry = existingResource.pluginSchemaRegistry;
      }

      if (!schemaRegistry && schema) {
        const initial = schema.generateInitialRegistry?.();
        if (initial) {
          schemaRegistry = initial.schemaRegistry;
          pluginSchemaRegistry = initial.pluginSchemaRegistry;
        }
      }

      metadata.resources[name] = {
        currentVersion: version,
        partitions: (resource.config as any).partitions || {},
        createdBy: existingResource?.createdBy || (resource.config as any).createdBy || 'user',
        versions: {
          ...existingResource?.versions,
          [version]: newVersionData
        },
        schemaRegistry,
        pluginSchemaRegistry
      };

      if (resource.version !== version) {
        resource.version = version;
        resource.emit('versionUpdated', { oldVersion: currentVersion, newVersion: version });
      }
    });

    return metadata;
  }

  private _mergeMetadata(fresh: SavedMetadata, local: SavedMetadata): SavedMetadata {
    const merged: SavedMetadata = {
      version: local.version,
      s3dbVersion: local.s3dbVersion,
      lastUpdated: local.lastUpdated,
      resources: { ...fresh.resources }
    };

    for (const [name, localResource] of Object.entries(local.resources)) {
      const freshResource = fresh.resources[name];

      if (!freshResource) {
        merged.resources[name] = localResource;
        continue;
      }

      merged.resources[name] = {
        ...localResource,
        schemaRegistry: this._mergeSchemaRegistry(
          freshResource.schemaRegistry,
          localResource.schemaRegistry
        ),
        pluginSchemaRegistry: this._mergePluginSchemaRegistry(
          freshResource.pluginSchemaRegistry,
          localResource.pluginSchemaRegistry
        )
      };
    }

    return merged;
  }

  scheduleMetadataUpload(): Promise<void> {
    if (!this.database.deferMetadataWrites) {
      return this.uploadMetadataFile();
    }

    if (this._metadataUploadDebounce) {
      clearTimeout(this._metadataUploadDebounce);
    }

    this._metadataUploadPending = true;

    this._metadataUploadDebounce = setTimeout(() => {
      if (this._metadataUploadPending) {
        this.uploadMetadataFile()
          .then(() => {
            this._metadataUploadPending = false;
          })
          .catch(err => {
            this.database.logger.error({ error: (err as Error).message }, 'metadata upload failed');
            this._metadataUploadPending = false;
          });
      }
    }, this.database.metadataWriteDelay);

    return Promise.resolve();
  }

  async flushMetadata(): Promise<void> {
    if (this._metadataUploadDebounce) {
      clearTimeout(this._metadataUploadDebounce);
      this._metadataUploadDebounce = null;
    }

    if (this._metadataUploadPending) {
      await this.uploadMetadataFile();
      this._metadataUploadPending = false;
    }
  }

  async uploadMetadataFile(): Promise<void> {
    const mutex = this._getMutex();

    if (!mutex) {
      await this._uploadMetadataWithoutLock();
      return;
    }

    await this._uploadMetadataWithLock(mutex);
  }

  private async _uploadMetadataWithoutLock(): Promise<void> {
    const localMetadata = this._buildLocalMetadata();

    await this.database.client.putObject({
      key: 's3db.json',
      body: JSON.stringify(localMetadata, null, 2),
      contentType: 'application/json'
    });

    (this.database as any).savedMetadata = localMetadata;
    this.database.emit('db:metadata-uploaded', localMetadata);
  }

  private async _uploadMetadataWithLock(mutex: S3Mutex): Promise<void> {
    const maxRetries = 3;
    const lockTtl = 30000;
    let attempt = 0;

    while (attempt < maxRetries) {
      const lock = await mutex.tryLock('s3db-metadata', lockTtl);

      if (!lock.acquired) {
        attempt++;
        this.database.logger.debug(
          { attempt, maxRetries, error: lock.error?.message },
          'failed to acquire metadata lock, retrying'
        );

        if (attempt >= maxRetries) {
          throw new Error(
            `Failed to acquire metadata lock after ${maxRetries} attempts: ${lock.error?.message}`
          );
        }

        await this._sleep(100 * Math.pow(2, attempt - 1));
        continue;
      }

      try {
        const freshMetadata = await this._readFreshMetadata();
        const localMetadata = this._buildLocalMetadata();

        const finalMetadata = freshMetadata
          ? this._mergeMetadata(freshMetadata, localMetadata)
          : localMetadata;

        await this.database.client.putObject({
          key: 's3db.json',
          body: JSON.stringify(finalMetadata, null, 2),
          contentType: 'application/json'
        });

        (this.database as any).savedMetadata = finalMetadata;
        this.database.emit('db:metadata-uploaded', finalMetadata);
        return;
      } finally {
        await mutex.unlock('s3db-metadata', lock.lockId!);
      }
    }
  }

  private _buildMetadataDefinition(resourceDef: ResourceExport): Omit<Partial<ResourceExport>, 'hooks'> & { hooks?: StringRecord<HookSummary> } {
    const {
      hooks,
      ...rest
    } = resourceDef || {};

    const serializable: Omit<Partial<ResourceExport>, 'hooks'> & { hooks?: StringRecord<HookSummary> } = { ...rest };

    if (hooks) {
      serializable.hooks = this._summarizeHooks(hooks);
    } else {
      serializable.hooks = {};
    }

    return serializable;
  }

  private _summarizeHooks(hooks: Partial<HooksCollection>): StringRecord<HookSummary> {
    if (!hooks || typeof hooks !== 'object') {
      return {};
    }

    const summary: StringRecord<HookSummary> = {};

    for (const [event, handlers] of Object.entries(hooks)) {
      if (!Array.isArray(handlers) || handlers.length === 0) {
        continue;
      }

      summary[event] = {
        count: handlers.length,
        handlers: handlers.map((handler) => {
          if (typeof handler !== 'function') {
            return { name: null, length: null, type: typeof handler };
          }
          return {
            name: handler.name || null,
            length: handler.length ?? null,
            type: 'function'
          };
        })
      };
    }

    return summary;
  }
}
