import { TasksRunner } from '../../../tasks/tasks-runner.class.js';
import { InvalidParentError, TreeConfigurationError, NodeNotFoundError } from '../errors.js';
export class AdjacencyListDriver {
    plugin;
    config;
    constructor(plugin, config) {
        this.plugin = plugin;
        this.config = config;
    }
    get database() {
        return this.plugin.database;
    }
    get logger() {
        return this.plugin.logger;
    }
    get treeField() {
        return this.config.treeField;
    }
    _getTreeId(node) {
        if (!this.treeField)
            return null;
        return node[this.treeField];
    }
    async _getNodesForTree(resourceName, treeId) {
        const resource = this.database.resources[resourceName];
        if (this.treeField && treeId) {
            if (resource.config.partitions?.byTree) {
                return await resource.listPartition({
                    partition: 'byTree',
                    partitionValues: { [this.treeField]: treeId },
                    limit: 10000
                });
            }
            const allNodes = await resource.list({ limit: 10000 });
            return allNodes.filter(n => n[this.treeField] === treeId);
        }
        return await resource.list({ limit: 10000 });
    }
    validateResource(resourceName) {
        const resource = this.database.resources[resourceName];
        if (!resource.config.partitions || !resource.config.partitions.byParent) {
            throw new TreeConfigurationError(`Resource '${resourceName}' must have a 'byParent' partition to use Adjacency List driver. ` +
                `Add partitions: { byParent: { fields: { ${this.config.parentField}: 'string' } } }`);
        }
    }
    async createRoot(resourceName, data = {}) {
        this.validateResource(resourceName);
        const resource = this.database.resources[resourceName];
        const rootData = {
            ...data,
            [this.config.parentField]: this.config.rootParentValue
        };
        return await resource.insert(rootData);
    }
    async addChild(resourceName, parentId, data = {}) {
        this.validateResource(resourceName);
        const resource = this.database.resources[resourceName];
        const parent = await this.getNode(resourceName, parentId);
        const treeId = this._getTreeId(parent);
        const childData = {
            ...data,
            [this.config.parentField]: parentId,
            ...(this.treeField && treeId ? { [this.treeField]: treeId } : {})
        };
        return await resource.insert(childData);
    }
    async getNode(resourceName, nodeId) {
        const resource = this.database.resources[resourceName];
        try {
            const node = await resource.get(nodeId);
            if (!node)
                throw new NodeNotFoundError(nodeId, { resource: resourceName });
            return node;
        }
        catch (err) {
            const error = err;
            if (error.code === 'NoSuchKey' || error.name === 'NoSuchKey' || error.message?.includes('No such key')) {
                throw new NodeNotFoundError(nodeId, { resource: resourceName, originalError: err });
            }
            throw err;
        }
    }
    async getRoots(resourceName, options = {}) {
        this.validateResource(resourceName);
        const { treeId } = options;
        const resource = this.database.resources[resourceName];
        if (this.config.rootParentValue) {
            let roots = await resource.listPartition({
                partition: 'byParent',
                partitionValues: { [this.config.parentField]: this.config.rootParentValue },
                limit: 10000
            });
            if (this.treeField && treeId) {
                roots = roots.filter(node => node[this.treeField] === treeId);
            }
            return roots;
        }
        const nodes = await this._getNodesForTree(resourceName, treeId);
        return nodes.filter(node => !node[this.config.parentField] || node[this.config.parentField] === this.config.rootParentValue);
    }
    async getChildren(resourceName, nodeId, options = {}) {
        this.validateResource(resourceName);
        const resource = this.database.resources[resourceName];
        const children = await resource.listPartition({
            partition: 'byParent',
            partitionValues: { [this.config.parentField]: nodeId },
            limit: 10000
        });
        const { orderBy = 'name', order = 'asc' } = options;
        if (orderBy) {
            children.sort((a, b) => {
                const aVal = (a[orderBy] || '');
                const bVal = (b[orderBy] || '');
                if (aVal < bVal)
                    return order === 'asc' ? -1 : 1;
                if (aVal > bVal)
                    return order === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return children;
    }
    async getDescendants(resourceName, nodeId, options = {}) {
        const { includeNode = false, maxDepth = null } = options;
        const descendants = [];
        const queue = [{ id: nodeId, depth: 0 }];
        if (includeNode) {
            const node = await this.getNode(resourceName, nodeId);
            descendants.push(node);
        }
        while (queue.length > 0) {
            const { id, depth } = queue.shift();
            if (maxDepth !== null && depth >= maxDepth)
                continue;
            const children = await this.getChildren(resourceName, id);
            for (const child of children) {
                descendants.push(child);
                queue.push({ id: child.id, depth: depth + 1 });
            }
        }
        return descendants;
    }
    async getAncestors(resourceName, nodeId, options = {}) {
        const { includeNode = false } = options;
        const ancestors = [];
        let current = await this.getNode(resourceName, nodeId);
        if (includeNode)
            ancestors.push(current);
        while (true) {
            const parentId = current[this.config.parentField];
            if (!parentId || parentId === this.config.rootParentValue)
                break;
            current = await this.getNode(resourceName, parentId);
            ancestors.push(current);
        }
        return ancestors.reverse();
    }
    async moveSubtree(resourceName, nodeId, newParentId) {
        this.validateResource(resourceName);
        const resource = this.database.resources[resourceName];
        const node = await this.getNode(resourceName, nodeId);
        const newParent = await this.getNode(resourceName, newParentId);
        const treeId = this._getTreeId(node);
        const newParentTreeId = this._getTreeId(newParent);
        if (this.treeField && treeId !== newParentTreeId) {
            throw new InvalidParentError(nodeId, newParentId, {
                reason: 'Cannot move node to a different tree'
            });
        }
        if (await this.isDescendantOf(resourceName, newParentId, nodeId)) {
            throw new InvalidParentError(nodeId, newParentId, {
                reason: 'Cannot move node to its own descendant'
            });
        }
        if (node[this.config.parentField] === newParentId)
            return node;
        await resource.patch(nodeId, {
            [this.config.parentField]: newParentId
        });
        return (await resource.get(nodeId));
    }
    async deleteNode(resourceName, nodeId, options = {}) {
        const { promoteChildren = true } = options;
        this.validateResource(resourceName);
        const resource = this.database.resources[resourceName];
        const node = await this.getNode(resourceName, nodeId);
        const children = await this.getChildren(resourceName, nodeId);
        if (children.length > 0) {
            if (promoteChildren) {
                const parentId = node[this.config.parentField];
                await TasksRunner.process(children, async (child) => {
                    await resource.patch(child.id, { [this.config.parentField]: parentId });
                }, { concurrency: 10 });
            }
            else {
                throw new Error(`Node has children. Use deleteSubtree() or set promoteChildren: true`);
            }
        }
        await resource.delete(nodeId);
        return { deleted: 1, promoted: children.length };
    }
    async deleteSubtree(resourceName, nodeId) {
        const subtree = await this.getDescendants(resourceName, nodeId, { includeNode: true });
        const resource = this.database.resources[resourceName];
        await TasksRunner.process(subtree, async (node) => {
            await resource.delete(node.id);
        }, { concurrency: 10 });
        return { deleted: subtree.length };
    }
    async isDescendantOf(resourceName, nodeId, ancestorId) {
        let currentId = nodeId;
        while (true) {
            const node = await this.getNode(resourceName, currentId);
            const parentId = node[this.config.parentField];
            if (!parentId || parentId === this.config.rootParentValue)
                return false;
            if (parentId === ancestorId)
                return true;
            currentId = parentId;
        }
    }
    async rebuildTree(_resourceName) {
        return { rebuilt: 0, message: 'Adjacency List does not require rebuilding' };
    }
}
export default AdjacencyListDriver;
//# sourceMappingURL=adjacency-list.js.map