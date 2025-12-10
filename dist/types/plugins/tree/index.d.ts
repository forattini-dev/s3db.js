import { Plugin } from '../plugin.class.js';
import { type Logger } from '../../concerns/logger.js';
import { NestedSetDriver } from './drivers/nested-set.js';
import { AdjacencyListDriver } from './drivers/adjacency-list.js';
interface PluginOptions {
    name?: string;
    namespace?: string;
    logLevel?: string;
    [key: string]: unknown;
}
export interface TreePluginOptions extends PluginOptions {
    resources?: string | string[];
    driver?: 'nested-set' | 'adjacency-list';
    leftField?: string;
    rightField?: string;
    depthField?: string;
    parentField?: string;
    treeField?: string | null;
    rootParentValue?: string | null;
    autoRebuild?: boolean;
    logLevel?: string;
    logger?: Logger;
}
export interface TreePluginConfig {
    resources: string[];
    driver: string;
    leftField: string;
    rightField: string;
    depthField: string;
    parentField: string;
    treeField: string | null;
    rootParentValue: string | null;
    autoRebuild: boolean;
}
type TreeDriver = NestedSetDriver | AdjacencyListDriver;
export declare class TreePlugin extends Plugin {
    config: TreePluginConfig;
    driver: TreeDriver;
    private _resourceTreeNamespaces;
    private _locks;
    constructor(options?: TreePluginOptions);
    onInstall(): Promise<void>;
    private _installResourceMethods;
    private _installNodeTreeMiddleware;
    private _enrichNodeWithTree;
    private _createTreeNamespace;
    _acquireLock(resourceName: string): Promise<void>;
    _releaseLock(resourceName: string): void;
    _withLock<T>(resourceName: string, fn: () => Promise<T>): Promise<T>;
    onUninstall(): Promise<void>;
    getStats(): Record<string, unknown>;
}
export { TreeConfigurationError, NodeNotFoundError, InvalidParentError, RootNodeError, TreeIntegrityError } from './errors.js';
export { NestedSetDriver } from './drivers/nested-set.js';
export { AdjacencyListDriver } from './drivers/adjacency-list.js';
export default TreePlugin;
//# sourceMappingURL=index.d.ts.map