import type { TreePlugin } from '../index.js';
export interface NestedSetConfig {
    treeField: string | null;
    parentField: string;
    leftField: string;
    rightField: string;
    depthField: string;
    rootParentValue: string | null;
    [key: string]: unknown;
}
export interface TreeNode {
    id: string;
    children?: TreeNode[];
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
export interface GetSiblingsOptions {
    includeSelf?: boolean;
}
export interface GetLeavesOptions {
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
}
export interface VerifyError {
    type: string;
    nodeId: string;
    value?: number;
    left?: number;
    right?: number;
    parentId?: string;
    message: string;
    treeId?: string;
}
export interface VerifyResult {
    valid: boolean;
    nodeCount: number;
    errors: VerifyError[];
}
export interface GetFullTreeOptions {
    flat?: boolean;
    treeId?: string | null;
}
export interface ToNestedArrayOptions {
    treeId?: string | null;
}
export declare class NestedSetDriver {
    plugin: TreePlugin;
    config: NestedSetConfig;
    constructor(plugin: TreePlugin, config: NestedSetConfig);
    get database(): Database;
    get logger(): Logger;
    get treeField(): string | null;
    private _getTreeId;
    private _getLockKey;
    private _getNodesForTree;
    createRoot(resourceName: string, data?: Record<string, unknown>): Promise<TreeNode>;
    addChild(resourceName: string, parentId: string, data?: Record<string, unknown>): Promise<TreeNode>;
    insertBefore(resourceName: string, siblingId: string, data?: Record<string, unknown>): Promise<TreeNode>;
    insertAfter(resourceName: string, siblingId: string, data?: Record<string, unknown>): Promise<TreeNode>;
    getNode(resourceName: string, nodeId: string): Promise<TreeNode>;
    getRoot(resourceName: string, options?: GetRootsOptions): Promise<TreeNode | null>;
    getRoots(resourceName: string, options?: GetRootsOptions): Promise<TreeNode[]>;
    getParent(resourceName: string, nodeId: string): Promise<TreeNode | null>;
    getChildren(resourceName: string, nodeId: string, options?: GetChildrenOptions): Promise<TreeNode[]>;
    getDescendants(resourceName: string, nodeId: string, options?: GetDescendantsOptions): Promise<TreeNode[]>;
    getAncestors(resourceName: string, nodeId: string, options?: GetAncestorsOptions): Promise<TreeNode[]>;
    getSiblings(resourceName: string, nodeId: string, options?: GetSiblingsOptions): Promise<TreeNode[]>;
    getSubtree(resourceName: string, nodeId: string, options?: GetDescendantsOptions): Promise<TreeNode[]>;
    getLeaves(resourceName: string, nodeId?: string | null, options?: GetLeavesOptions): Promise<TreeNode[]>;
    getDepth(resourceName: string, nodeId: string): Promise<number>;
    getTreeDepth(resourceName: string, options?: GetRootsOptions): Promise<number>;
    isRoot(resourceName: string, nodeId: string): Promise<boolean>;
    isLeaf(resourceName: string, nodeId: string): Promise<boolean>;
    isDescendantOf(resourceName: string, nodeId: string, ancestorId: string): Promise<boolean>;
    isAncestorOf(resourceName: string, nodeId: string, descendantId: string): Promise<boolean>;
    countDescendants(resourceName: string, nodeId: string): Promise<number>;
    moveSubtree(resourceName: string, nodeId: string, newParentId: string): Promise<TreeNode>;
    deleteNode(resourceName: string, nodeId: string, options?: DeleteNodeOptions): Promise<DeleteResult>;
    deleteSubtree(resourceName: string, nodeId: string): Promise<DeleteResult>;
    private _shiftNodes;
    rebuildTree(resourceName: string, options?: GetRootsOptions): Promise<RebuildResult>;
    verifyTree(resourceName: string, options?: GetRootsOptions): Promise<VerifyResult>;
    getFullTree(resourceName: string, options?: GetFullTreeOptions): Promise<TreeNode[]>;
    toNestedArray(resourceName: string, nodeId?: string | null, options?: ToNestedArrayOptions): Promise<TreeNode[]>;
}
export default NestedSetDriver;
//# sourceMappingURL=nested-set.d.ts.map