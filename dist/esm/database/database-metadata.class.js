import { createHash } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
export class DatabaseMetadata {
    database;
    _metadataUploadPending;
    _metadataUploadDebounce;
    constructor(database) {
        this.database = database;
        this._metadataUploadPending = false;
        this._metadataUploadDebounce = null;
    }
    get uploadPending() {
        return this._metadataUploadPending;
    }
    blankMetadataStructure() {
        return {
            version: '1',
            s3dbVersion: this.database.s3dbVersion,
            lastUpdated: new Date().toISOString(),
            resources: {},
        };
    }
    generateDefinitionHash(definition, behavior) {
        const attributes = definition.attributes;
        const stableAttributes = { ...attributes };
        if (definition.timestamps) {
            delete stableAttributes.createdAt;
            delete stableAttributes.updatedAt;
        }
        const hashObj = {
            attributes: stableAttributes,
            behavior: behavior || definition.behavior || 'user-managed',
            partitions: definition.partitions || {},
        };
        const stableString = jsonStableStringify(hashObj);
        return `sha256:${createHash('sha256').update(stableString).digest('hex')}`;
    }
    getNextVersion(versions = {}) {
        const versionNumbers = Object.keys(versions)
            .filter(v => v.startsWith('v'))
            .map(v => parseInt(v.substring(1)))
            .filter(n => !isNaN(n));
        const maxVersion = versionNumbers.length > 0 ? Math.max(...versionNumbers) : 0;
        return `v${maxVersion + 1}`;
    }
    detectDefinitionChanges(savedMetadata) {
        const changes = [];
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
            }
            else {
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
    scheduleMetadataUpload() {
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
                    this.database.logger.error({ error: err.message }, 'metadata upload failed');
                    this._metadataUploadPending = false;
                });
            }
        }, this.database.metadataWriteDelay);
        return Promise.resolve();
    }
    async flushMetadata() {
        if (this._metadataUploadDebounce) {
            clearTimeout(this._metadataUploadDebounce);
            this._metadataUploadDebounce = null;
        }
        if (this._metadataUploadPending) {
            await this.uploadMetadataFile();
            this._metadataUploadPending = false;
        }
    }
    async uploadMetadataFile() {
        const metadata = {
            version: this.database.version,
            s3dbVersion: this.database.s3dbVersion,
            lastUpdated: new Date().toISOString(),
            resources: {}
        };
        Object.entries(this.database.resources).forEach(([name, resource]) => {
            const resourceDef = resource.export();
            const serializableDef = this._buildMetadataDefinition(resourceDef);
            const definitionHash = this.generateDefinitionHash(serializableDef);
            const existingResource = this.database.savedMetadata?.resources?.[name];
            const currentVersion = existingResource?.currentVersion || 'v1';
            const existingVersionData = existingResource?.versions?.[currentVersion];
            let version;
            let isNewVersion;
            if (!existingVersionData || existingVersionData.hash !== definitionHash) {
                version = this.getNextVersion(existingResource?.versions);
                isNewVersion = true;
            }
            else {
                version = currentVersion;
                isNewVersion = false;
            }
            const idGeneratorValue = typeof resource.idGeneratorType === 'function'
                ? 'custom'
                : resource.idGeneratorType;
            const newVersionData = {
                hash: definitionHash,
                attributes: serializableDef.attributes,
                behavior: (serializableDef.behavior || 'user-managed'),
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
            metadata.resources[name] = {
                currentVersion: version,
                partitions: resource.config.partitions || {},
                createdBy: existingResource?.createdBy || resource.config.createdBy || 'user',
                versions: {
                    ...existingResource?.versions,
                    [version]: newVersionData
                }
            };
            if (resource.version !== version) {
                resource.version = version;
                resource.emit('versionUpdated', { oldVersion: currentVersion, newVersion: version });
            }
        });
        await this.database.client.putObject({
            key: 's3db.json',
            body: JSON.stringify(metadata, null, 2),
            contentType: 'application/json'
        });
        this.database.savedMetadata = metadata;
        this.database.emit('db:metadata-uploaded', metadata);
    }
    _buildMetadataDefinition(resourceDef) {
        const { hooks, ...rest } = resourceDef || {};
        const serializable = { ...rest };
        if (hooks) {
            serializable.hooks = this._summarizeHooks(hooks);
        }
        else {
            serializable.hooks = {};
        }
        return serializable;
    }
    _summarizeHooks(hooks) {
        if (!hooks || typeof hooks !== 'object') {
            return {};
        }
        const summary = {};
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
//# sourceMappingURL=database-metadata.class.js.map