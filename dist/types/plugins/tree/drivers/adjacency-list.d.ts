import type { TreePlugin } from '../index.js';
export interface AdjacencyListConfig {
    treeField: string | null;
    parentField: string;
    rootParentValue: string | null;
    [key: string]: unknown;
}
export interface TreeNode {
    id: string;
    [key: string]: unknown;
}
interface Resource {
    name: string;
    config: {
        partitions?: {
            byParent?: unknown;
            byTree?: unknown;
        };
    };
    get(id: string): Promise<TreeNode | null>;
    list(options: {
        limit: number;
    }): Promise<TreeNode[]>;
    listPartition(options: {
        partition: string;
        partitionValues: Record<string, unknown>;
        limit: number;
    }): Promise<TreeNode[]>;
    insert(data: Record<string, unknown>): Promise<TreeNode>;
    patch(id: string, data: Record<string, unknown>): Promise<TreeNode>;
    delete(id: string): Promise<void>;
}
interface Database {
    resources: Record<string, Resource>;
}
interface Logger {
    info(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}
export interface GetChildrenOptions {
    orderBy?: string;
    order?: 'asc' | 'desc';
}
export interface GetDescendantsOptions {
    includeNode?: boolean;
    maxDepth?: number | null;
}
export interface GetAncestorsOptions {
    includeNode?: boolean;
}
export interface GetRootsOptions {
    treeId?: string | null;
}
export interface DeleteNodeOptions {
    promoteChildren?: boolean;
}
export interface DeleteResult {
    deleted: number;
    promoted?: number;
}
export interface RebuildResult {
    rebuilt: number;
    message?: string;
}
export declare class AdjacencyListDriver {
    plugin: TreePlugin;
    config: AdjacencyListConfig;
    constructor(plugin: TreePlugin, config: AdjacencyListConfig);
    get database(): Database;
    get logger(): Logger;
    get treeField(): string | null;
    private _getTreeId;
    private _getNodesForTree;
    validateResource(resourceName: string): void;
    createRoot(resourceName: string, data?: Record<string, unknown>): Promise<TreeNode>;
    addChild(resourceName: string, parentId: string, data?: Record<string, unknown>): Promise<TreeNode>;
    getNode(resourceName: string, nodeId: string): Promise<TreeNode>;
    getRoots(resourceName: string, options?: GetRootsOptions): Promise<TreeNode[]>;
    getChildren(resourceName: string, nodeId: string, options?: GetChildrenOptions): Promise<TreeNode[]>;
    getDescendants(resourceName: string, nodeId: string, options?: GetDescendantsOptions): Promise<TreeNode[]>;
    getAncestors(resourceName: string, nodeId: string, options?: GetAncestorsOptions): Promise<TreeNode[]>;
    moveSubtree(resourceName: string, nodeId: string, newParentId: string): Promise<TreeNode>;
    deleteNode(resourceName: string, nodeId: string, options?: DeleteNodeOptions): Promise<DeleteResult>;
    deleteSubtree(resourceName: string, nodeId: string): Promise<DeleteResult>;
    isDescendantOf(resourceName: string, nodeId: string, ancestorId: string): Promise<boolean>;
    rebuildTree(_resourceName: string): Promise<RebuildResult>;
}
export default AdjacencyListDriver;
//# sourceMappingURL=adjacency-list.d.ts.map