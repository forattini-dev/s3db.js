import type { DatabaseRef, SavedMetadata } from './types.js';
export declare class DatabaseRecovery {
    private database;
    constructor(database: DatabaseRef);
    attemptJsonRecovery(content: string, healingLog: string[]): Promise<SavedMetadata | null>;
    validateAndHealMetadata(metadata: SavedMetadata, healingLog: string[]): Promise<SavedMetadata>;
    private _healResourceStructure;
    private _healHooksStructure;
    createCorruptedBackup(content?: string | null): Promise<void>;
    uploadHealedMetadata(metadata: SavedMetadata, healingLog: string[]): Promise<void>;
}
//# sourceMappingURL=database-recovery.class.d.ts.map