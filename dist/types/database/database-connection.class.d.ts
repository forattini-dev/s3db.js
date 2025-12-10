import type { DatabaseRef } from './types.js';
import type { DatabaseMetadata } from './database-metadata.class.js';
import type { DatabaseRecovery } from './database-recovery.class.js';
import type { DatabasePlugins } from './database-plugins.class.js';
import type { DatabaseCoordinators } from './database-coordinators.class.js';
export declare class DatabaseConnection {
    private database;
    private metadata;
    private recovery;
    private plugins;
    private coordinators;
    private _exitListenerRegistered;
    private _exitListener;
    constructor(database: DatabaseRef, metadata: DatabaseMetadata, recovery: DatabaseRecovery, plugins: DatabasePlugins, coordinators: DatabaseCoordinators);
    registerExitListener(): void;
    isConnected(): boolean;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=database-connection.class.d.ts.map