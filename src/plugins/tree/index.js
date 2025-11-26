/**
 * Tree Plugin for S3DB
 * 
 * Unified tree management supporting multiple drivers:
 * 1. nested-set: Optimized for reads (descendants), slow writes.
 * 2. adjacency-list: Optimized for writes, slow reads (recursive), requires 'byParent' partition.
 */

import { Plugin } from '../plugin.class.js';
import { createLogger } from '../../concerns/logger.js';
import { NestedSetDriver } from './drivers/nested-set.js';
import { AdjacencyListDriver } from './drivers/adjacency-list.js';
import { TreeConfigurationError } from './errors.js';

export class TreePlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.options.logLevel || 'info';
      this.logger = createLogger({ name: 'TreePlugin', level: logLevel });
    }

    const {
      resources = [],
      driver = 'nested-set', // 'nested-set' | 'adjacency-list'
      leftField = 'lft',
      rightField = 'rgt',
      depthField = 'depth',
      parentField = 'parentId',
      treeField = null, // Field for multi-tree isolation (e.g., 'treeId')
      rootParentValue = null,
      autoRebuild = false
    } = this.options;

    this.config = {
      resources: Array.isArray(resources) ? resources : [resources],
      driver,
      leftField,
      rightField,
      depthField,
      parentField,
      treeField,
      rootParentValue,
      autoRebuild
    };

    // Select driver
    if (driver === 'nested-set') {
      this.driver = new NestedSetDriver(this, this.config);
    } else if (driver === 'adjacency-list') {
      this.driver = new AdjacencyListDriver(this, this.config);
    } else {
      throw new TreeConfigurationError(`Unknown driver: ${driver}`);
    }

    this._resourceTreeNamespaces = new Map();
    this._locks = new Map();
  }

  async onInstall() {
    this._installResourceMethods();

    this.database.addHook('afterCreateResource', async ({ resource }) => {
      this._installResourceMethods();
    });
  }

  _installResourceMethods() {
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

  _installNodeTreeMiddleware(resource) {
    const plugin = this;

    const methodsToWrap = ['get', 'insert', 'update', 'getMany', 'list', 'query', 'page'];

    for (const method of methodsToWrap) {
      if (typeof resource[method] !== 'function') continue;

      this.addMiddleware(resource, method, async (next, ...args) => {
        const result = await next(...args);

        if (result === null || result === undefined) {
          return result;
        }

        if (Array.isArray(result)) {
          return result.map(node => plugin._enrichNodeWithTree(node, resource.name));
        }

        if (result && result.items && Array.isArray(result.items)) {
          return {
            ...result,
            items: result.items.map(node => plugin._enrichNodeWithTree(node, resource.name))
          };
        }

        if (typeof result === 'object' && result.id) {
          return plugin._enrichNodeWithTree(result, resource.name);
        }

        return result;
      });
    }
  }

  _enrichNodeWithTree(node, resourceName) {
    if (!node || typeof node !== 'object' || node.tree) {
      return node;
    }

    const plugin = this;
    const driver = this.driver;
    const nodeId = node.id;

    // Helper to bind driver methods
    const bind = (method, ...args) => driver[method](resourceName, nodeId, ...args);

    const nodeTreeNamespace = {
      // Navigation
      parent: () => driver.getNode(resourceName, node[plugin.config.parentField]),
      children: (opts) => driver.getChildren(resourceName, nodeId, opts),
      descendants: (opts) => driver.getDescendants(resourceName, nodeId, opts),
      ancestors: (opts) => driver.getAncestors(resourceName, nodeId, opts),
      
      // Checks
      isDescendantOf: (ancestorId) => driver.isDescendantOf(resourceName, nodeId, ancestorId),
      
      // Actions
      addChild: (data) => driver.addChild(resourceName, nodeId, data),
      moveTo: (newParentId) => driver.moveSubtree(resourceName, nodeId, newParentId),
      delete: (opts) => driver.deleteNode(resourceName, nodeId, opts),
      deleteSubtree: () => driver.deleteSubtree(resourceName, nodeId),
      
      // Driver-specific fallback (safe for features not in interface)
      ...((driver.getSiblings) ? { siblings: (opts) => driver.getSiblings(resourceName, nodeId, opts) } : {}),
      ...((driver.getLeaves) ? { leaves: () => driver.getLeaves(resourceName, nodeId) } : {}),
      ...((driver.getDepth) ? { depth: () => driver.getDepth(resourceName, nodeId) } : {}),
      ...((driver.getSubtree) ? { subtree: (opts) => driver.getSubtree(resourceName, nodeId, opts) } : {}),
      ...((driver.isRoot) ? { isRoot: () => driver.isRoot(resourceName, nodeId) } : {}),
      ...((driver.isLeaf) ? { isLeaf: () => driver.isLeaf(resourceName, nodeId) } : {}),
      ...((driver.isAncestorOf) ? { isAncestorOf: (descendantId) => driver.isAncestorOf(resourceName, nodeId, descendantId) } : {}),
      ...((driver.countDescendants) ? { countDescendants: () => driver.countDescendants(resourceName, nodeId) } : {}),
      ...((driver.toNestedArray) ? { toNestedArray: () => driver.toNestedArray(resourceName, nodeId) } : {}),
      ...((driver.insertBefore) ? { insertBefore: (data) => driver.insertBefore(resourceName, nodeId, data) } : {}),
      ...((driver.insertAfter) ? { insertAfter: (data) => driver.insertAfter(resourceName, nodeId, data) } : {}),
    };

    Object.defineProperty(node, 'tree', {
      value: nodeTreeNamespace,
      writable: false,
      configurable: true,
      enumerable: false
    });

    return node;
  }

  _createTreeNamespace(resource) {
    const driver = this.driver;
    const resourceName = resource.name;

    return {
      plugin: this,
      resource,

      // Config
      get driverName() { return driver.constructor.name; },
      get config() { return driver.config; },

      // Methods - opts can include { treeId } for multi-tree support
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

      // Optional / Driver specific
      ...((driver.getSiblings) ? { getSiblings: (nodeId, opts) => driver.getSiblings(resourceName, nodeId, opts) } : {}),
      ...((driver.insertBefore) ? { insertBefore: (siblingId, data) => driver.insertBefore(resourceName, siblingId, data) } : {}),
      ...((driver.insertAfter) ? { insertAfter: (siblingId, data) => driver.insertAfter(resourceName, siblingId, data) } : {}),
      ...((driver.verifyTree) ? { verify: (opts) => driver.verifyTree(resourceName, opts) } : {}),
      ...((driver.getRoot) ? { getRoot: (opts) => driver.getRoot(resourceName, opts) } : {}),
      ...((driver.getParent) ? { getParent: (nodeId) => driver.getParent(resourceName, nodeId) } : {}),
      ...((driver.getSubtree) ? { getSubtree: (nodeId, opts) => driver.getSubtree(resourceName, nodeId, opts) } : {}),
      ...((driver.getLeaves) ? { getLeaves: (nodeId, opts) => driver.getLeaves(resourceName, nodeId, opts) } : {}),
      ...((driver.getDepth) ? { getDepth: (nodeId) => driver.getDepth(resourceName, nodeId) } : {}),
      ...((driver.getTreeDepth) ? { getTreeDepth: (opts) => driver.getTreeDepth(resourceName, opts) } : {}),
      ...((driver.isRoot) ? { isRoot: (nodeId) => driver.isRoot(resourceName, nodeId) } : {}),
      ...((driver.isLeaf) ? { isLeaf: (nodeId) => driver.isLeaf(resourceName, nodeId) } : {}),
      ...((driver.isDescendantOf) ? { isDescendantOf: (nodeId, ancestorId) => driver.isDescendantOf(resourceName, nodeId, ancestorId) } : {}),
      ...((driver.isAncestorOf) ? { isAncestorOf: (nodeId, descendantId) => driver.isAncestorOf(resourceName, nodeId, descendantId) } : {}),
      ...((driver.countDescendants) ? { countDescendants: (nodeId) => driver.countDescendants(resourceName, nodeId) } : {}),
      ...((driver.getFullTree) ? { getFullTree: (opts) => driver.getFullTree(resourceName, opts) } : {}),
      ...((driver.toNestedArray) ? { toNestedArray: (nodeId, opts) => driver.toNestedArray(resourceName, nodeId, opts) } : {}),
    };
  }

  async _acquireLock(resourceName) {
    // Simple memory lock, similar to original plugin
    // In a real distributed scenario, this should use GlobalCoordinator
    while (this._locks.get(resourceName)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this._locks.set(resourceName, true);
  }

  _releaseLock(resourceName) {
    this._locks.delete(resourceName);
  }

  async _withLock(resourceName, fn) {
    await this._acquireLock(resourceName);
    try {
      return await fn();
    } finally {
      this._releaseLock(resourceName);
    }
  }
  
  async onUninstall() {
    for (const [resourceName] of this._resourceTreeNamespaces) {
      const resource = this.database.resources[resourceName];
      if (resource) delete resource.tree;
    }
    this._resourceTreeNamespaces.clear();
  }

  getStats() {
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
  RootNodeError
} from './errors.js';
