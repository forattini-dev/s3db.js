import type { BehaviorType } from '../behaviors/types.js';
import type { ResourceExport } from '../resource.class.js';
import type { DatabaseRef, SavedMetadata, VersionData, DefinitionChange, StringRecord } from './types.js';
export declare class DatabaseMetadata {
    private database;
    private _metadataUploadPending;
    private _metadataUploadDebounce;
    private _pluginStorage;
    private _mutex;
    constructor(database: DatabaseRef);
    private _getPluginStorage;
    private _requiresDistributedLock;
    private _getMutex;
    get uploadPending(): boolean;
    blankMetadataStructure(): SavedMetadata;
    generateDefinitionHash(definition: ResourceExport, behavior?: BehaviorType): string;
    getNextVersion(versions?: StringRecord<VersionData>): string;
    detectDefinitionChanges(savedMetadata: SavedMetadata): DefinitionChange[];
    private _sleep;
    _readFreshMetadata(): Promise<SavedMetadata | null>;
    private _mergeSchemaRegistry;
    private _mergePluginSchemaRegistry;
    private _convertToPluginRegistries;
    private _toPluginRegistry;
    private _mergeSinglePluginRegistry;
    private _legacyPluginKey;
    private _buildLocalMetadata;
    private _mergeMetadata;
    scheduleMetadataUpload(): Promise<void>;
    flushMetadata(): Promise<void>;
    uploadMetadataFile(): Promise<void>;
    private _uploadMetadataWithoutLock;
    private _uploadMetadataWithLock;
    private _buildMetadataDefinition;
    private _summarizeHooks;
}
//# sourceMappingURL=database-metadata.class.d.ts.map