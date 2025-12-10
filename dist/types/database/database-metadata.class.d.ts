import type { BehaviorType } from '../behaviors/types.js';
import type { ResourceExport } from '../resource.class.js';
import type { DatabaseRef, SavedMetadata, VersionData, DefinitionChange, StringRecord } from './types.js';
export declare class DatabaseMetadata {
    private database;
    private _metadataUploadPending;
    private _metadataUploadDebounce;
    constructor(database: DatabaseRef);
    get uploadPending(): boolean;
    blankMetadataStructure(): SavedMetadata;
    generateDefinitionHash(definition: ResourceExport, behavior?: BehaviorType): string;
    getNextVersion(versions?: StringRecord<VersionData>): string;
    detectDefinitionChanges(savedMetadata: SavedMetadata): DefinitionChange[];
    scheduleMetadataUpload(): Promise<void>;
    flushMetadata(): Promise<void>;
    uploadMetadataFile(): Promise<void>;
    private _buildMetadataDefinition;
    private _summarizeHooks;
}
//# sourceMappingURL=database-metadata.class.d.ts.map