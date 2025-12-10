import type { Database } from '../database.class.js';
export interface PluginObjectInterface {
    setup(database: Database): void;
    start(): void;
    stop(): void;
}
export declare const PluginObject: PluginObjectInterface;
//# sourceMappingURL=plugin.obj.d.ts.map