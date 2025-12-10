import { Plugin } from '../plugin.class.js';
import { createLogger, type Logger } from '../../concerns/logger.js';
import { NestedSetDriver } from './drivers/nested-set.js';
import { AdjacencyListDriver } from './drivers/adjacency-list.js';
import { TreeConfigurationError } from './errors.js';

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

interface TreeNode {
  id: string;
  tree?: TreeNodeNamespace;
  [key: string]: unknown;
}

interface Resource {
  name: string;
  config: {
    partitions?: Record<string, unknown>;
  };
  tree?: TreeResourceNamespace;
  get(id: string): Promise<TreeNode | null>;
  insert(data: Record<string, unknown>): Promise<TreeNode>;
  update(id: string, data: Record<string, unknown>): Promise<TreeNode>;
  getMany(ids: string[]): Promise<TreeNode[]>;
  list(options?: Record<string, unknown>): Promise<TreeNode[]>;
  query(query: Record<string, unknown>): Promise<TreeNode[]>;
  page(options?: Record<string, unknown>): Promise<{ items: TreeNode[] }>;
}

interface Database {
  resources: Record<string, Resource>;
  addHook(event: string, callback: (args: { resource: Resource }) => Promise<void>): void;
}

type TreeDriver = NestedSetDriver | AdjacencyListDriver;

interface TreeNodeNamespace {
  parent(): Promise<TreeNode | null>;
  children(opts?: Record<string, unknown>): Promise<TreeNode[]>;
  descendants(opts?: Record<string, unknown>): Promise<TreeNode[]>;
  ancestors(opts?: Record<string, unknown>): Promise<TreeNode[]>;
  isDescendantOf(ancestorId: string): Promise<boolean>;
  addChild(data: Record<string, unknown>): Promise<TreeNode>;
  moveTo(newParentId: string): Promise<TreeNode>;
  delete(opts?: Record<string, unknown>): Promise<{ deleted: number; promoted?: number }>;
  deleteSubtree(): Promise<{ deleted: number }>;
  siblings?(opts?: Record<string, unknown>): Promise<TreeNode[]>;
  leaves?(): Promise<TreeNode[]>;
  depth?(): Promise<number>;
  subtree?(opts?: Record<string, unknown>): Promise<TreeNode[]>;
  isRoot?(): Promise<boolean>;
  isLeaf?(): Promise<boolean>;
  isAncestorOf?(descendantId: string): Promise<boolean>;
  countDescendants?(): Promise<number>;
  toNestedArray?(): Promise<TreeNode[]>;
  insertBefore?(data: Record<string, unknown>): Promise<TreeNode>;
  insertAfter?(data: Record<string, unknown>): Promise<TreeNode>;
}

interface TreeResourceNamespace {
  plugin: TreePlugin;
  resource: Resource;
  driverName: string;
  config: TreePluginConfig;
  createRoot(data: Record<string, unknown>): Promise<TreeNode>;
  addChild(parentId: string, data: Record<string, unknown>): Promise<TreeNode>;
  getNode(nodeId: string): Promise<TreeNode>;
  getRoots(opts?: Record<string, unknown>): Promise<TreeNode[]>;
  getChildren(nodeId: string, opts?: Record<string, unknown>): Promise<TreeNode[]>;
  getDescendants(nodeId: string, opts?: Record<string, unknown>): Promise<TreeNode[]>;
  getAncestors(nodeId: string, opts?: Record<string, unknown>): Promise<TreeNode[]>;
  moveSubtree(nodeId: string, newParentId: string): Promise<TreeNode>;
  deleteNode(nodeId: string, opts?: Record<string, unknown>): Promise<{ deleted: number; promoted?: number }>;
  deleteSubtree(nodeId: string): Promise<{ deleted: number }>;
  rebuild(opts?: Record<string, unknown>): Promise<{ rebuilt: number }>;
  getSiblings?(nodeId: string, opts?: Record<string, unknown>): Promise<TreeNode[]>;
  insertBefore?(siblingId: string, data: Record<string, unknown>): Promise<TreeNode>;
  insertAfter?(siblingId: string, data: Record<string, unknown>): Promise<TreeNode>;
  verify?(opts?: Record<string, unknown>): Promise<{ valid: boolean; nodeCount: number; errors: unknown[] }>;
  getRoot?(opts?: Record<string, unknown>): Promise<TreeNode | null>;
  getParent?(nodeId: string): Promise<TreeNode | null>;
  getSubtree?(nodeId: string, opts?: Record<string, unknown>): Promise<TreeNode[]>;
  getLeaves?(nodeId: string, opts?: Record<string, unknown>): Promise<TreeNode[]>;
  getDepth?(nodeId: string): Promise<number>;
  getTreeDepth?(opts?: Record<string, unknown>): Promise<number>;
  isRoot?(nodeId: string): Promise<boolean>;
  isLeaf?(nodeId: string): Promise<boolean>;
  isDescendantOf?(nodeId: string, ancestorId: string): Promise<boolean>;
  isAncestorOf?(nodeId: string, descendantId: string): Promise<boolean>;
  countDescendants?(nodeId: string): Promise<number>;
  getFullTree?(opts?: Record<string, unknown>): Promise<TreeNode[]>;
  toNestedArray?(nodeId: string, opts?: Record<string, unknown>): Promise<TreeNode[]>;
}

export class TreePlugin extends Plugin {
  config: TreePluginConfig;
  driver: TreeDriver;
  private _resourceTreeNamespaces: Map<string, TreeResourceNamespace>;
  private _locks: Map<string, boolean>;

  constructor(options: TreePluginOptions = {}) {
    super(options as any);

    if (options.logger) {
      this.logger = options.logger as any;
    } else {
      const logLevel = (this.options as TreePluginOptions).logLevel || 'info';
      this.logger = createLogger({ name: 'TreePlugin', level: logLevel as any });
    }

    const opts = this.options as TreePluginOptions;
    const {
      resources = [],
      driver = 'nested-set',
      leftField = 'lft',
      rightField = 'rgt',
      depthField = 'depth',
      parentField = 'parentId',
      treeField = null,
      rootParentValue = null,
      autoRebuild = false
    } = opts;

    this.config = {
      resources: Array.isArray(resources) ? resources as string[] : [resources as string],
      driver: driver as string,
      leftField: leftField as string,
      rightField: rightField as string,
      depthField: depthField as string,
      parentField: parentField as string,
      treeField: treeField as string | null,
      rootParentValue: rootParentValue as string | null,
      autoRebuild: autoRebuild as boolean
    };

    if (driver === 'nested-set') {
      this.driver = new NestedSetDriver(this, this.config as any);
    } else if (driver === 'adjacency-list') {
      this.driver = new AdjacencyListDriver(this, this.config as any);
    } else {
      throw new TreeConfigurationError(`Unknown driver: ${driver}`);
    }

    this._resourceTreeNamespaces = new Map();
    this._locks = new Map();
  }

  override async onInstall(): Promise<void> {
    this._installResourceMethods();

    this.database.addHook('afterCreateResource', async () => {
      this._installResourceMethods();
    });
  }

  private _installResourceMethods(): void {
    for (const resource of Object.values(this.database.resources)) {
      if (!this.config.resources.includes(resource.name)) continue;
      if (this._resourceTreeNamespaces.has(resource.name)) continue;

      const treeNamespace = this._createTreeNamespace(resource);
      this._resourceTreeNamespaces.set(resource.name, treeNamespace);

      Object.defineProperty(resource, 'tree', {
        value: treeNamespace,
        writable: true,
        configurable: true,
        enumerable: false
      });

      this._installNodeTreeMiddleware(resource);
    }
  }

  private _installNodeTreeMiddleware(resource: Resource): void {
    const plugin = this;

    const methodsToWrap = ['get', 'insert', 'update', 'getMany', 'list', 'query', 'page'] as const;

    for (const method of methodsToWrap) {
      if (typeof resource[method] !== 'function') continue;

      this.addMiddleware(resource as any, method, async (next: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => {
        const result = await next(...args);

        if (result === null || result === undefined) {
          return result;
        }

        if (Array.isArray(result)) {
          return result.map(node => plugin._enrichNodeWithTree(node as TreeNode, resource.name));
        }

        if (result && typeof result === 'object' && 'items' in result && Array.isArray((result as { items: unknown[] }).items)) {
          return {
            ...result,
            items: (result as { items: TreeNode[] }).items.map(node => plugin._enrichNodeWithTree(node, resource.name))
          };
        }

        if (typeof result === 'object' && (result as TreeNode).id) {
          return plugin._enrichNodeWithTree(result as TreeNode, resource.name);
        }

        return result;
      });
    }
  }

  private _enrichNodeWithTree(node: TreeNode, resourceName: string): TreeNode {
    if (!node || typeof node !== 'object' || node.tree) {
      return node;
    }

    const plugin = this;
    const driver = this.driver;
    const nodeId = node.id;

    const nodeTreeNamespace: TreeNodeNamespace = {
      parent: () => driver.getNode(resourceName, node[plugin.config.parentField] as string).catch(() => null),
      children: (opts) => driver.getChildren(resourceName, nodeId, opts),
      descendants: (opts) => driver.getDescendants(resourceName, nodeId, opts),
      ancestors: (opts) => driver.getAncestors(resourceName, nodeId, opts),

      isDescendantOf: (ancestorId) => driver.isDescendantOf(resourceName, nodeId, ancestorId),

      addChild: (data) => driver.addChild(resourceName, nodeId, data),
      moveTo: (newParentId) => driver.moveSubtree(resourceName, nodeId, newParentId),
      delete: (opts) => driver.deleteNode(resourceName, nodeId, opts),
      deleteSubtree: () => driver.deleteSubtree(resourceName, nodeId),

      ...((driver as NestedSetDriver).getSiblings ? { siblings: (opts?: Record<string, unknown>) => (driver as NestedSetDriver).getSiblings(resourceName, nodeId, opts) } : {}),
      ...((driver as NestedSetDriver).getLeaves ? { leaves: () => (driver as NestedSetDriver).getLeaves(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).getDepth ? { depth: () => (driver as NestedSetDriver).getDepth(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).getSubtree ? { subtree: (opts?: Record<string, unknown>) => (driver as NestedSetDriver).getSubtree(resourceName, nodeId, opts) } : {}),
      ...((driver as NestedSetDriver).isRoot ? { isRoot: () => (driver as NestedSetDriver).isRoot(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).isLeaf ? { isLeaf: () => (driver as NestedSetDriver).isLeaf(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).isAncestorOf ? { isAncestorOf: (descendantId: string) => (driver as NestedSetDriver).isAncestorOf(resourceName, nodeId, descendantId) } : {}),
      ...((driver as NestedSetDriver).countDescendants ? { countDescendants: () => (driver as NestedSetDriver).countDescendants(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).toNestedArray ? { toNestedArray: () => (driver as NestedSetDriver).toNestedArray(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).insertBefore ? { insertBefore: (data: Record<string, unknown>) => (driver as NestedSetDriver).insertBefore(resourceName, nodeId, data) } : {}),
      ...((driver as NestedSetDriver).insertAfter ? { insertAfter: (data: Record<string, unknown>) => (driver as NestedSetDriver).insertAfter(resourceName, nodeId, data) } : {}),
    };

    Object.defineProperty(node, 'tree', {
      value: nodeTreeNamespace,
      writable: false,
      configurable: true,
      enumerable: false
    });

    return node;
  }

  private _createTreeNamespace(resource: Resource): TreeResourceNamespace {
    const driver = this.driver;
    const resourceName = resource.name;

    return {
      plugin: this,
      resource,

      get driverName() { return driver.constructor.name; },
      get config() { return driver.config as unknown as TreePluginConfig; },

      createRoot: (data) => driver.createRoot(resourceName, data),
      addChild: (parentId, data) => driver.addChild(resourceName, parentId, data),
      getNode: (nodeId) => driver.getNode(resourceName, nodeId),
      getRoots: (opts) => driver.getRoots(resourceName, opts),

      getChildren: (nodeId, opts) => driver.getChildren(resourceName, nodeId, opts),
      getDescendants: (nodeId, opts) => driver.getDescendants(resourceName, nodeId, opts),
      getAncestors: (nodeId, opts) => driver.getAncestors(resourceName, nodeId, opts),

      moveSubtree: (nodeId, newParentId) => driver.moveSubtree(resourceName, nodeId, newParentId),
      deleteNode: (nodeId, opts) => driver.deleteNode(resourceName, nodeId, opts),
      deleteSubtree: (nodeId) => driver.deleteSubtree(resourceName, nodeId),
      rebuild: (opts) => driver.rebuildTree(resourceName, opts),

      ...((driver as NestedSetDriver).getSiblings ? { getSiblings: (nodeId: string, opts?: Record<string, unknown>) => (driver as NestedSetDriver).getSiblings(resourceName, nodeId, opts) } : {}),
      ...((driver as NestedSetDriver).insertBefore ? { insertBefore: (siblingId: string, data: Record<string, unknown>) => (driver as NestedSetDriver).insertBefore(resourceName, siblingId, data) } : {}),
      ...((driver as NestedSetDriver).insertAfter ? { insertAfter: (siblingId: string, data: Record<string, unknown>) => (driver as NestedSetDriver).insertAfter(resourceName, siblingId, data) } : {}),
      ...((driver as NestedSetDriver).verifyTree ? { verify: (opts?: Record<string, unknown>) => (driver as NestedSetDriver).verifyTree(resourceName, opts) } : {}),
      ...((driver as NestedSetDriver).getRoot ? { getRoot: (opts?: Record<string, unknown>) => (driver as NestedSetDriver).getRoot(resourceName, opts) } : {}),
      ...((driver as NestedSetDriver).getParent ? { getParent: (nodeId: string) => (driver as NestedSetDriver).getParent(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).getSubtree ? { getSubtree: (nodeId: string, opts?: Record<string, unknown>) => (driver as NestedSetDriver).getSubtree(resourceName, nodeId, opts) } : {}),
      ...((driver as NestedSetDriver).getLeaves ? { getLeaves: (nodeId: string, opts?: Record<string, unknown>) => (driver as NestedSetDriver).getLeaves(resourceName, nodeId, opts) } : {}),
      ...((driver as NestedSetDriver).getDepth ? { getDepth: (nodeId: string) => (driver as NestedSetDriver).getDepth(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).getTreeDepth ? { getTreeDepth: (opts?: Record<string, unknown>) => (driver as NestedSetDriver).getTreeDepth(resourceName, opts) } : {}),
      ...((driver as NestedSetDriver).isRoot ? { isRoot: (nodeId: string) => (driver as NestedSetDriver).isRoot(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).isLeaf ? { isLeaf: (nodeId: string) => (driver as NestedSetDriver).isLeaf(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).isDescendantOf ? { isDescendantOf: (nodeId: string, ancestorId: string) => (driver as NestedSetDriver).isDescendantOf(resourceName, nodeId, ancestorId) } : {}),
      ...((driver as NestedSetDriver).isAncestorOf ? { isAncestorOf: (nodeId: string, descendantId: string) => (driver as NestedSetDriver).isAncestorOf(resourceName, nodeId, descendantId) } : {}),
      ...((driver as NestedSetDriver).countDescendants ? { countDescendants: (nodeId: string) => (driver as NestedSetDriver).countDescendants(resourceName, nodeId) } : {}),
      ...((driver as NestedSetDriver).getFullTree ? { getFullTree: (opts?: Record<string, unknown>) => (driver as NestedSetDriver).getFullTree(resourceName, opts) } : {}),
      ...((driver as NestedSetDriver).toNestedArray ? { toNestedArray: (nodeId: string, opts?: Record<string, unknown>) => (driver as NestedSetDriver).toNestedArray(resourceName, nodeId, opts) } : {}),
    };
  }

  async _acquireLock(resourceName: string): Promise<void> {
    while (this._locks.get(resourceName)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this._locks.set(resourceName, true);
  }

  _releaseLock(resourceName: string): void {
    this._locks.delete(resourceName);
  }

  async _withLock<T>(resourceName: string, fn: () => Promise<T>): Promise<T> {
    await this._acquireLock(resourceName);
    try {
      return await fn();
    } finally {
      this._releaseLock(resourceName);
    }
  }

  override async onUninstall(): Promise<void> {
    for (const [resourceName] of this._resourceTreeNamespaces) {
      const resource = this.database.resources[resourceName]!;
      if (resource) delete (resource as any).tree;
    }
    this._resourceTreeNamespaces.clear();
  }

  getStats(): Record<string, unknown> {
    return {
      driver: this.config.driver,
      resources: this.config.resources,
      leftField: this.config.leftField,
      rightField: this.config.rightField,
      depthField: this.config.depthField,
      parentField: this.config.parentField,
      treeField: this.config.treeField
    };
  }
}

export {
  TreeConfigurationError,
  NodeNotFoundError,
  InvalidParentError,
  RootNodeError,
  TreeIntegrityError
} from './errors.js';

export { NestedSetDriver } from './drivers/nested-set.js';
export { AdjacencyListDriver } from './drivers/adjacency-list.js';

export default TreePlugin;
