import type { DatabaseRef, GlobalCoordinatorService, GlobalCoordinatorOptions, MemorySnapshot } from './types.js';
export declare class DatabaseCoordinators {
    private database;
    private _coordinators;
    constructor(database: DatabaseRef);
    get coordinators(): Map<string, GlobalCoordinatorService>;
    getGlobalCoordinator(namespace: string, options?: GlobalCoordinatorOptions): Promise<GlobalCoordinatorService>;
    stopAll(): Promise<void>;
    collectMemorySnapshot(): MemorySnapshot;
}
//# sourceMappingURL=database-coordinators.class.d.ts.map