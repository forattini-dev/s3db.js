import type { DatabaseRef, Plugin } from './types.js';
import type { DatabaseCoordinators } from './database-coordinators.class.js';
export declare class DatabasePlugins {
    private database;
    private coordinators;
    constructor(database: DatabaseRef, coordinators: DatabaseCoordinators);
    startPlugins(): Promise<void>;
    usePlugin(plugin: Plugin, name?: string | null): Promise<Plugin>;
    uninstallPlugin(name: string, options?: {
        purgeData?: boolean;
    }): Promise<void>;
    private _getPluginName;
}
//# sourceMappingURL=database-plugins.class.d.ts.map