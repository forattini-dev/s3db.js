import { TasksRunner } from '../../../tasks/tasks-runner.class.js';
import { InvalidParentError, NodeNotFoundError } from '../errors.js';
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
  list(options: { limit: number }): Promise<TreeNode[]>;
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

export class NestedSetDriver {
  plugin: TreePlugin;
  config: NestedSetConfig;

  constructor(plugin: TreePlugin, config: NestedSetConfig) {
    this.plugin = plugin;
    this.config = config;
  }

  get database(): Database {
    return this.plugin.database as unknown as Database;
  }

  get logger(): Logger {
    return this.plugin.logger as Logger;
  }

  get treeField(): string | null {
    return this.config.treeField;
  }

  private _getTreeId(node: TreeNode): string | null {
    if (!this.treeField) return null;
    return node[this.treeField] as string | null;
  }

  private _getLockKey(resourceName: string, treeId: string | null): string {
    if (!this.treeField || !treeId) return resourceName;
    return `${resourceName}:${treeId}`;
  }

  private async _getNodesForTree(resourceName: string, treeId: string | null | undefined): Promise<TreeNode[]> {
    const resource = this.database.resources[resourceName]!;

    if (this.treeField && treeId) {
      if (resource.config.partitions?.byTree) {
        return await resource.listPartition({
          partition: 'byTree',
          partitionValues: { [this.treeField]: treeId },
          limit: 10000
        });
      }
      const allNodes = await resource.list({ limit: 10000 });
      return allNodes.filter(n => n[this.treeField!] === treeId);
    }

    return await resource.list({ limit: 10000 });
  }

  async createRoot(resourceName: string, data: Record<string, unknown> = {}): Promise<TreeNode> {
    const treeId = this.treeField ? data[this.treeField] as string | null : null;
    const lockKey = this._getLockKey(resourceName, treeId);

    return this.plugin._withLock(lockKey, async () => {
      const resource = this.database.resources[resourceName]!;

      const existingRoots = await this.getRoots(resourceName, { treeId });
      const maxRight = existingRoots.reduce((max, root) =>
        Math.max(max, (root[this.config.rightField] as number) || 0), 0);

      const rootData = {
        ...data,
        [this.config.leftField]: maxRight + 1,
        [this.config.rightField]: maxRight + 2,
        [this.config.depthField]: 0,
        [this.config.parentField]: this.config.rootParentValue
      };

      return await resource.insert(rootData);
    });
  }

  async addChild(resourceName: string, parentId: string, data: Record<string, unknown> = {}): Promise<TreeNode> {
    const resource = this.database.resources[resourceName]!;
    const parent = await this.getNode(resourceName, parentId);
    const treeId = this._getTreeId(parent);
    const lockKey = this._getLockKey(resourceName, treeId);

    return this.plugin._withLock(lockKey, async () => {
      const freshParent = await this.getNode(resourceName, parentId);
      const parentRight = freshParent[this.config.rightField] as number;
      const parentDepth = (freshParent[this.config.depthField] as number) || 0;

      await this._shiftNodes(resourceName, parentRight, 2, treeId);

      const childData = {
        ...data,
        [this.config.leftField]: parentRight,
        [this.config.rightField]: parentRight + 1,
        [this.config.depthField]: parentDepth + 1,
        [this.config.parentField]: parentId,
        ...(this.treeField && treeId ? { [this.treeField]: treeId } : {})
      };

      const child = await resource.insert(childData);

      await resource.patch(parentId, {
        [this.config.rightField]: parentRight + 2
      });

      return child;
    });
  }

  async insertBefore(resourceName: string, siblingId: string, data: Record<string, unknown> = {}): Promise<TreeNode> {
    const resource = this.database.resources[resourceName]!;
    const sibling = await this.getNode(resourceName, siblingId);
    const treeId = this._getTreeId(sibling);
    const lockKey = this._getLockKey(resourceName, treeId);

    return this.plugin._withLock(lockKey, async () => {
      const freshSibling = await this.getNode(resourceName, siblingId);
      const siblingLeft = freshSibling[this.config.leftField] as number;
      const siblingDepth = (freshSibling[this.config.depthField] as number) || 0;
      const siblingParent = freshSibling[this.config.parentField];

      await this._shiftNodes(resourceName, siblingLeft, 2, treeId);

      const nodeData = {
        ...data,
        [this.config.leftField]: siblingLeft,
        [this.config.rightField]: siblingLeft + 1,
        [this.config.depthField]: siblingDepth,
        [this.config.parentField]: siblingParent,
        ...(this.treeField && treeId ? { [this.treeField]: treeId } : {})
      };

      return await resource.insert(nodeData);
    });
  }

  async insertAfter(resourceName: string, siblingId: string, data: Record<string, unknown> = {}): Promise<TreeNode> {
    const resource = this.database.resources[resourceName]!;
    const sibling = await this.getNode(resourceName, siblingId);
    const treeId = this._getTreeId(sibling);
    const lockKey = this._getLockKey(resourceName, treeId);

    return this.plugin._withLock(lockKey, async () => {
      const freshSibling = await this.getNode(resourceName, siblingId);
      const siblingRight = freshSibling[this.config.rightField] as number;
      const siblingDepth = (freshSibling[this.config.depthField] as number) || 0;
      const siblingParent = freshSibling[this.config.parentField];

      await this._shiftNodes(resourceName, siblingRight + 1, 2, treeId);

      const nodeData = {
        ...data,
        [this.config.leftField]: siblingRight + 1,
        [this.config.rightField]: siblingRight + 2,
        [this.config.depthField]: siblingDepth,
        [this.config.parentField]: siblingParent,
        ...(this.treeField && treeId ? { [this.treeField]: treeId } : {})
      };

      return await resource.insert(nodeData);
    });
  }

  async getNode(resourceName: string, nodeId: string): Promise<TreeNode> {
    const resource = this.database.resources[resourceName]!;
    try {
      const node = await resource.get(nodeId);
      if (!node) throw new NodeNotFoundError(nodeId, { resource: resourceName });
      return node;
    } catch (err) {
      const error = err as Error & { code?: string; name?: string };
      if (error.code === 'NoSuchKey' || error.name === 'NoSuchKey' || error.message?.includes('No such key')) {
        throw new NodeNotFoundError(nodeId, { resource: resourceName, originalError: err });
      }
      throw err;
    }
  }

  async getRoot(resourceName: string, options: GetRootsOptions = {}): Promise<TreeNode | null> {
    const roots = await this.getRoots(resourceName, options);
    return roots.length > 0 ? roots[0] ?? null : null;
  }

  async getRoots(resourceName: string, options: GetRootsOptions = {}): Promise<TreeNode[]> {
    const { treeId } = options;
    const nodes = await this._getNodesForTree(resourceName, treeId);

    const roots = nodes.filter(node =>
      node[this.config.parentField] === this.config.rootParentValue ||
      node[this.config.parentField] === null ||
      node[this.config.parentField] === undefined
    );

    return roots.sort((a, b) => (a[this.config.leftField] as number) - (b[this.config.leftField] as number));
  }

  async getParent(resourceName: string, nodeId: string): Promise<TreeNode | null> {
    const node = await this.getNode(resourceName, nodeId);
    const parentId = node[this.config.parentField] as string | null;

    if (parentId === this.config.rootParentValue || !parentId) {
      return null;
    }

    const resource = this.database.resources[resourceName]!;
    return resource.get(parentId);
  }

  async getChildren(resourceName: string, nodeId: string, options: GetChildrenOptions = {}): Promise<TreeNode[]> {
    const { orderBy = 'left', order = 'asc' } = options;
    const resource = this.database.resources[resourceName]!;

    if (resource.config.partitions && resource.config.partitions.byParent) {
      return await resource.listPartition({
        partition: 'byParent',
        partitionValues: { [this.config.parentField]: nodeId },
        limit: 10000
      });
    }

    const allNodes = await resource.list({ limit: 10000 });
    const children = allNodes.filter(node => node[this.config.parentField] === nodeId);

    const sortField = orderBy === 'left' ? this.config.leftField : orderBy;
    children.sort((a, b) => {
      const aVal = (a[sortField] as number) || 0;
      const bVal = (b[sortField] as number) || 0;
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return children;
  }

  async getDescendants(resourceName: string, nodeId: string, options: GetDescendantsOptions = {}): Promise<TreeNode[]> {
    const { includeNode = false, maxDepth = null } = options;
    const node = await this.getNode(resourceName, nodeId);
    const treeId = this._getTreeId(node);

    const nodeLeft = node[this.config.leftField] as number;
    const nodeRight = node[this.config.rightField] as number;
    const nodeDepth = (node[this.config.depthField] as number) || 0;

    const treeNodes = await this._getNodesForTree(resourceName, treeId);

    let descendants = treeNodes.filter(n => {
      const left = n[this.config.leftField] as number;
      const right = n[this.config.rightField] as number;

      if (includeNode) {
        return left >= nodeLeft && right <= nodeRight;
      }
      return left > nodeLeft && right < nodeRight;
    });

    if (maxDepth !== null) {
      descendants = descendants.filter(n => {
        const depth = (n[this.config.depthField] as number) || 0;
        return depth <= nodeDepth + maxDepth;
      });
    }

    descendants.sort((a, b) => (a[this.config.leftField] as number) - (b[this.config.leftField] as number));

    return descendants;
  }

  async getAncestors(resourceName: string, nodeId: string, options: GetAncestorsOptions = {}): Promise<TreeNode[]> {
    const { includeNode = false } = options;
    const node = await this.getNode(resourceName, nodeId);
    const treeId = this._getTreeId(node);

    const nodeLeft = node[this.config.leftField] as number;
    const nodeRight = node[this.config.rightField] as number;

    const treeNodes = await this._getNodesForTree(resourceName, treeId);

    const ancestors = treeNodes.filter(n => {
      const left = n[this.config.leftField] as number;
      const right = n[this.config.rightField] as number;

      if (includeNode) {
        return left <= nodeLeft && right >= nodeRight;
      }
      return left < nodeLeft && right > nodeRight;
    });

    ancestors.sort((a, b) => (a[this.config.leftField] as number) - (b[this.config.leftField] as number));

    return ancestors;
  }

  async getSiblings(resourceName: string, nodeId: string, options: GetSiblingsOptions = {}): Promise<TreeNode[]> {
    const { includeSelf = false } = options;
    const node = await this.getNode(resourceName, nodeId);
    const parentId = node[this.config.parentField] as string | null;

    if (parentId === this.config.rootParentValue || !parentId) {
      const roots = await this.getRoots(resourceName);
      if (includeSelf) return roots;
      return roots.filter(r => r.id !== nodeId);
    }

    const siblings = await this.getChildren(resourceName, parentId);
    if (includeSelf) return siblings;
    return siblings.filter(s => s.id !== nodeId);
  }

  async getSubtree(resourceName: string, nodeId: string, options: GetDescendantsOptions = {}): Promise<TreeNode[]> {
    return this.getDescendants(resourceName, nodeId, { ...options, includeNode: true });
  }

  async getLeaves(resourceName: string, nodeId: string | null = null, options: GetLeavesOptions = {}): Promise<TreeNode[]> {
    const { treeId } = options;
    let nodes: TreeNode[];

    if (nodeId) {
      nodes = await this.getDescendants(resourceName, nodeId, { includeNode: true });
    } else {
      nodes = await this._getNodesForTree(resourceName, treeId);
    }

    const leaves = nodes.filter(n => {
      const left = n[this.config.leftField] as number;
      const right = n[this.config.rightField] as number;
      return right === left + 1;
    });

    return leaves.sort((a, b) => (a[this.config.leftField] as number) - (b[this.config.leftField] as number));
  }

  async getDepth(resourceName: string, nodeId: string): Promise<number> {
    const node = await this.getNode(resourceName, nodeId);
    return (node[this.config.depthField] as number) || 0;
  }

  async getTreeDepth(resourceName: string, options: GetRootsOptions = {}): Promise<number> {
    const { treeId } = options;
    const treeNodes = await this._getNodesForTree(resourceName, treeId);

    if (treeNodes.length === 0) return 0;

    let maxDepth = 0;
    for (const node of treeNodes) {
      const depth = (node[this.config.depthField] as number) || 0;
      if (depth > maxDepth) maxDepth = depth;
    }

    return maxDepth;
  }

  async isRoot(resourceName: string, nodeId: string): Promise<boolean> {
    const node = await this.getNode(resourceName, nodeId);
    const parentId = node[this.config.parentField];
    return parentId === this.config.rootParentValue || !parentId;
  }

  async isLeaf(resourceName: string, nodeId: string): Promise<boolean> {
    const node = await this.getNode(resourceName, nodeId);
    const left = node[this.config.leftField] as number;
    const right = node[this.config.rightField] as number;
    return right === left + 1;
  }

  async isDescendantOf(resourceName: string, nodeId: string, ancestorId: string): Promise<boolean> {
    const node = await this.getNode(resourceName, nodeId);
    const ancestor = await this.getNode(resourceName, ancestorId);

    const nodeLeft = node[this.config.leftField] as number;
    const nodeRight = node[this.config.rightField] as number;
    const ancestorLeft = ancestor[this.config.leftField] as number;
    const ancestorRight = ancestor[this.config.rightField] as number;

    return nodeLeft > ancestorLeft && nodeRight < ancestorRight;
  }

  async isAncestorOf(resourceName: string, nodeId: string, descendantId: string): Promise<boolean> {
    return this.isDescendantOf(resourceName, descendantId, nodeId);
  }

  async countDescendants(resourceName: string, nodeId: string): Promise<number> {
    const node = await this.getNode(resourceName, nodeId);
    const left = node[this.config.leftField] as number;
    const right = node[this.config.rightField] as number;

    return (right - left - 1) / 2;
  }

  async moveSubtree(resourceName: string, nodeId: string, newParentId: string): Promise<TreeNode> {
    const resource = this.database.resources[resourceName]!;
    const node = await this.getNode(resourceName, nodeId);
    const newParent = await this.getNode(resourceName, newParentId);
    const treeId = this._getTreeId(node);
    const newParentTreeId = this._getTreeId(newParent);

    if (this.treeField && treeId !== newParentTreeId) {
      throw new InvalidParentError(nodeId, newParentId, {
        reason: 'Cannot move node to a different tree'
      });
    }

    const lockKey = this._getLockKey(resourceName, treeId);

    return this.plugin._withLock(lockKey, async () => {
      const freshNode = await this.getNode(resourceName, nodeId);
      const freshNewParent = await this.getNode(resourceName, newParentId);

      if (await this.isDescendantOf(resourceName, newParentId, nodeId)) {
        throw new InvalidParentError(nodeId, newParentId, {
          reason: 'Cannot move node to its own descendant'
        });
      }

      if (freshNode[this.config.parentField] === newParentId) {
        return freshNode;
      }

      const nodeLeft = freshNode[this.config.leftField] as number;
      const nodeRight = freshNode[this.config.rightField] as number;
      const nodeWidth = nodeRight - nodeLeft + 1;
      const newParentRight = freshNewParent[this.config.rightField] as number;
      const oldDepth = (freshNode[this.config.depthField] as number) || 0;
      const newDepth = ((freshNewParent[this.config.depthField] as number) || 0) + 1;
      const depthDelta = newDepth - oldDepth;

      const subtree = await this.getSubtree(resourceName, nodeId);

      await TasksRunner.process(
        subtree,
        async (subtreeNode: TreeNode) => {
          await resource.patch(subtreeNode.id, {
            [this.config.leftField]: (subtreeNode[this.config.leftField] as number) - nodeLeft + 10000000,
            [this.config.rightField]: (subtreeNode[this.config.rightField] as number) - nodeLeft + 10000000
          });
        },
        { concurrency: 10 }
      );

      await this._shiftNodes(resourceName, nodeRight + 1, -nodeWidth, treeId);

      const refreshedParent = await resource.get(newParentId);
      const insertPosition = refreshedParent![this.config.rightField] as number;

      await this._shiftNodes(resourceName, insertPosition, nodeWidth, treeId);

      await TasksRunner.process(
        subtree,
        async (subtreeNode: TreeNode) => {
          const oldLeft = (subtreeNode[this.config.leftField] as number) - nodeLeft;
          const oldRight = (subtreeNode[this.config.rightField] as number) - nodeLeft;
          const currentDepth = (subtreeNode[this.config.depthField] as number) || 0;

          await resource.patch(subtreeNode.id, {
            [this.config.leftField]: insertPosition + oldLeft,
            [this.config.rightField]: insertPosition + oldRight,
            [this.config.depthField]: currentDepth + depthDelta,
            ...(subtreeNode.id === nodeId ? { [this.config.parentField]: newParentId } : {})
          });
        },
        { concurrency: 10 }
      );

      return (await resource.get(nodeId))!;
    });
  }

  async deleteNode(resourceName: string, nodeId: string, options: DeleteNodeOptions = {}): Promise<DeleteResult> {
    const { promoteChildren = true } = options;
    const resource = this.database.resources[resourceName]!;
    const node = await this.getNode(resourceName, nodeId);
    const treeId = this._getTreeId(node);
    const lockKey = this._getLockKey(resourceName, treeId);

    return this.plugin._withLock(lockKey, async () => {
      const freshNode = await this.getNode(resourceName, nodeId);
      const children = await this.getChildren(resourceName, nodeId);

      if (children.length > 0) {
        if (promoteChildren) {
          const nodeParent = freshNode[this.config.parentField];
          const nodeDepth = (freshNode[this.config.depthField] as number) || 0;

          await TasksRunner.process(
            children,
            async (child: TreeNode) => {
              await resource.patch(child.id, {
                [this.config.parentField]: nodeParent,
                [this.config.depthField]: nodeDepth
              });

              const childDescendants = await this.getDescendants(resourceName, child.id);
              await TasksRunner.process(
                childDescendants,
                async (descendant: TreeNode) => {
                  await resource.patch(descendant.id, {
                    [this.config.depthField]: ((descendant[this.config.depthField] as number) || 0) - 1
                  });
                },
                { concurrency: 10 }
              );
            },
            { concurrency: 10 }
          );
        } else {
          throw new Error(`Node has children. Use deleteSubtree() or set promoteChildren: true`);
        }
      }

      const nodeRight = freshNode[this.config.rightField] as number;
      await resource.delete(nodeId);
      await this._shiftNodes(resourceName, nodeRight + 1, -2, treeId);

      return { deleted: 1, promoted: children.length };
    });
  }

  async deleteSubtree(resourceName: string, nodeId: string): Promise<DeleteResult> {
    const resource = this.database.resources[resourceName]!;
    const node = await this.getNode(resourceName, nodeId);
    const treeId = this._getTreeId(node);
    const lockKey = this._getLockKey(resourceName, treeId);

    return this.plugin._withLock(lockKey, async () => {
      const freshNode = await this.getNode(resourceName, nodeId);
      const subtree = await this.getSubtree(resourceName, nodeId);

      const nodeLeft = freshNode[this.config.leftField] as number;
      const nodeRight = freshNode[this.config.rightField] as number;
      const width = nodeRight - nodeLeft + 1;

      await TasksRunner.process(
        subtree,
        async (subtreeNode: TreeNode) => {
          await resource.delete(subtreeNode.id);
        },
        { concurrency: 10 }
      );

      await this._shiftNodes(resourceName, nodeRight + 1, -width, treeId);

      return { deleted: subtree.length };
    });
  }

  private async _shiftNodes(resourceName: string, fromValue: number, delta: number, treeId: string | null = null): Promise<void> {
    const treeNodes = await this._getNodesForTree(resourceName, treeId);
    const resource = this.database.resources[resourceName]!;

    const nodesToUpdate = treeNodes.filter(node => {
      const left = node[this.config.leftField] as number;
      const right = node[this.config.rightField] as number;
      return left >= fromValue || right >= fromValue;
    });

    await TasksRunner.process(
      nodesToUpdate,
      async (node: TreeNode) => {
        const left = node[this.config.leftField] as number;
        const right = node[this.config.rightField] as number;
        const updateData: Record<string, number> = {};
        let needsUpdate = false;

        if (left >= fromValue) {
          updateData[this.config.leftField] = left + delta;
          needsUpdate = true;
        }

        if (right >= fromValue) {
          updateData[this.config.rightField] = right + delta;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await resource.patch(node.id, updateData);
        }
      },
      { concurrency: 10 }
    );
  }

  async rebuildTree(resourceName: string, options: GetRootsOptions = {}): Promise<RebuildResult> {
    const { treeId } = options;

    if (this.treeField && !treeId) {
      const resource = this.database.resources[resourceName]!;
      const allNodes = await resource.list({ limit: 10000 });

      const treeIds = [...new Set(allNodes.map(n => n[this.treeField!]).filter(Boolean))] as string[];

      let totalRebuilt = 0;
      for (const tid of treeIds) {
        const result = await this.rebuildTree(resourceName, { treeId: tid });
        totalRebuilt += result.rebuilt;
      }
      return { rebuilt: totalRebuilt };
    }

    const lockKey = this._getLockKey(resourceName, treeId ?? null);

    return this.plugin._withLock(lockKey, async () => {
      const resource = this.database.resources[resourceName]!;
      const treeNodes = await this._getNodesForTree(resourceName, treeId);

      if (treeNodes.length === 0) return { rebuilt: 0 };

      const nodeMap = new Map<string, TreeNode & { children: TreeNode[] }>();
      for (const node of treeNodes) {
        nodeMap.set(node.id, { ...node, children: [] });
      }

      const roots: (TreeNode & { children: TreeNode[] })[] = [];
      for (const node of treeNodes) {
        const parentId = node[this.config.parentField] as string | null;
        if (parentId === this.config.rootParentValue || !parentId) {
          roots.push(nodeMap.get(node.id)!);
        } else if (nodeMap.has(parentId)) {
          nodeMap.get(parentId)!.children.push(nodeMap.get(node.id)!);
        } else {
          roots.push(nodeMap.get(node.id)!);
        }
      }

      for (const rootNode of nodeMap.values()) {
        rootNode.children.sort((a, b) => {
          const aLeft = (a[this.config.leftField] as number) || 0;
          const bLeft = (b[this.config.leftField] as number) || 0;
          return aLeft - bLeft;
        });
      }

      let counter = 0;
      const updates: Array<{ id: string; data: Record<string, number> }> = [];

      const processNode = (node: TreeNode & { children: TreeNode[] }, depth: number): void => {
        const left = ++counter;
        for (const child of node.children) {
          processNode(child as TreeNode & { children: TreeNode[] }, depth + 1);
        }
        const right = ++counter;

        updates.push({
          id: node.id,
          data: {
            [this.config.leftField]: left,
            [this.config.rightField]: right,
            [this.config.depthField]: depth
          }
        });
      };

      for (const root of roots) {
        processNode(root, 0);
      }

      await TasksRunner.process(
        updates,
        async (update: { id: string; data: Record<string, number> }) => {
          await resource.patch(update.id, update.data);
        },
        { concurrency: 10 }
      );

      return { rebuilt: updates.length };
    });
  }

  async verifyTree(resourceName: string, options: GetRootsOptions = {}): Promise<VerifyResult> {
    const { treeId } = options;

    if (this.treeField && !treeId) {
      const resource = this.database.resources[resourceName]!;
      const allNodes = await resource.list({ limit: 10000 });
      const treeIds = [...new Set(allNodes.map(n => n[this.treeField!]).filter(Boolean))] as string[];

      const allErrors: VerifyError[] = [];
      let totalNodes = 0;

      for (const tid of treeIds) {
        const result = await this.verifyTree(resourceName, { treeId: tid });
        allErrors.push(...result.errors.map(e => ({ ...e, treeId: tid })));
        totalNodes += result.nodeCount;
      }

      return {
        valid: allErrors.length === 0,
        nodeCount: totalNodes,
        errors: allErrors
      };
    }

    const treeNodes = await this._getNodesForTree(resourceName, treeId);

    const errors: VerifyError[] = [];
    const usedValues = { left: new Set<number>(), right: new Set<number>() };

    for (const node of treeNodes) {
      const left = node[this.config.leftField] as number;
      const right = node[this.config.rightField] as number;

      if (left >= right) {
        errors.push({
          type: 'INVALID_LR_ORDER',
          nodeId: node.id,
          left,
          right,
          message: `Left (${left}) must be less than right (${right})`
        });
      }

      if (usedValues.left.has(left)) {
        errors.push({
          type: 'DUPLICATE_LEFT',
          nodeId: node.id,
          value: left,
          message: `Duplicate left value: ${left}`
        });
      }
      usedValues.left.add(left);

      if (usedValues.right.has(right)) {
        errors.push({
          type: 'DUPLICATE_RIGHT',
          nodeId: node.id,
          value: right,
          message: `Duplicate right value: ${right}`
        });
      }
      usedValues.right.add(right);

      const parentId = node[this.config.parentField] as string | null;
      if (parentId && parentId !== this.config.rootParentValue) {
        const parent = treeNodes.find(n => n.id === parentId);
        if (!parent) {
          errors.push({
            type: 'MISSING_PARENT',
            nodeId: node.id,
            parentId,
            message: `Parent not found: ${parentId}`
          });
        } else {
          const parentLeft = parent[this.config.leftField] as number;
          const parentRight = parent[this.config.rightField] as number;

          if (!(left > parentLeft && right < parentRight)) {
            errors.push({
              type: 'PARENT_MISMATCH',
              nodeId: node.id,
              parentId,
              message: `Node (${left}, ${right}) is not within parent bounds (${parentLeft}, ${parentRight})`
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      nodeCount: treeNodes.length,
      errors
    };
  }

  async getFullTree(resourceName: string, options: GetFullTreeOptions = {}): Promise<TreeNode[]> {
    const { flat = false, treeId } = options;
    const treeNodes = await this._getNodesForTree(resourceName, treeId);

    treeNodes.sort((a, b) => (a[this.config.leftField] as number) - (b[this.config.leftField] as number));

    if (flat) {
      return treeNodes;
    }

    return this.toNestedArray(resourceName, null, { treeId });
  }

  async toNestedArray(resourceName: string, nodeId: string | null = null, options: ToNestedArrayOptions = {}): Promise<TreeNode[]> {
    const { treeId } = options;
    let nodes: TreeNode[];

    if (nodeId) {
      nodes = await this.getSubtree(resourceName, nodeId);
    } else {
      nodes = await this._getNodesForTree(resourceName, treeId);
    }

    nodes.sort((a, b) => (a[this.config.leftField] as number) - (b[this.config.leftField] as number));

    const nodeMap = new Map<string, TreeNode & { children: TreeNode[] }>();
    for (const node of nodes) {
      nodeMap.set(node.id, { ...node, children: [] });
    }

    const result: TreeNode[] = [];

    for (const node of nodes) {
      const enrichedNode = nodeMap.get(node.id)!;
      const parentId = node[this.config.parentField] as string | null;

      if (parentId === this.config.rootParentValue || !parentId || !nodeMap.has(parentId)) {
        result.push(enrichedNode);
      } else {
        nodeMap.get(parentId)!.children.push(enrichedNode);
      }
    }

    return result;
  }
}

export default NestedSetDriver;
