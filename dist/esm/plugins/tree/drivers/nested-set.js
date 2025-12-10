import { TasksRunner } from '../../../tasks/tasks-runner.class.js';
import { InvalidParentError, NodeNotFoundError } from '../errors.js';
export class NestedSetDriver {
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
    _getLockKey(resourceName, treeId) {
        if (!this.treeField || !treeId)
            return resourceName;
        return `${resourceName}:${treeId}`;
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
    async createRoot(resourceName, data = {}) {
        const treeId = this.treeField ? data[this.treeField] : null;
        const lockKey = this._getLockKey(resourceName, treeId);
        return this.plugin._withLock(lockKey, async () => {
            const resource = this.database.resources[resourceName];
            const existingRoots = await this.getRoots(resourceName, { treeId });
            const maxRight = existingRoots.reduce((max, root) => Math.max(max, root[this.config.rightField] || 0), 0);
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
    async addChild(resourceName, parentId, data = {}) {
        const resource = this.database.resources[resourceName];
        const parent = await this.getNode(resourceName, parentId);
        const treeId = this._getTreeId(parent);
        const lockKey = this._getLockKey(resourceName, treeId);
        return this.plugin._withLock(lockKey, async () => {
            const freshParent = await this.getNode(resourceName, parentId);
            const parentRight = freshParent[this.config.rightField];
            const parentDepth = freshParent[this.config.depthField] || 0;
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
    async insertBefore(resourceName, siblingId, data = {}) {
        const resource = this.database.resources[resourceName];
        const sibling = await this.getNode(resourceName, siblingId);
        const treeId = this._getTreeId(sibling);
        const lockKey = this._getLockKey(resourceName, treeId);
        return this.plugin._withLock(lockKey, async () => {
            const freshSibling = await this.getNode(resourceName, siblingId);
            const siblingLeft = freshSibling[this.config.leftField];
            const siblingDepth = freshSibling[this.config.depthField] || 0;
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
    async insertAfter(resourceName, siblingId, data = {}) {
        const resource = this.database.resources[resourceName];
        const sibling = await this.getNode(resourceName, siblingId);
        const treeId = this._getTreeId(sibling);
        const lockKey = this._getLockKey(resourceName, treeId);
        return this.plugin._withLock(lockKey, async () => {
            const freshSibling = await this.getNode(resourceName, siblingId);
            const siblingRight = freshSibling[this.config.rightField];
            const siblingDepth = freshSibling[this.config.depthField] || 0;
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
    async getRoot(resourceName, options = {}) {
        const roots = await this.getRoots(resourceName, options);
        return roots.length > 0 ? roots[0] ?? null : null;
    }
    async getRoots(resourceName, options = {}) {
        const { treeId } = options;
        const nodes = await this._getNodesForTree(resourceName, treeId);
        const roots = nodes.filter(node => node[this.config.parentField] === this.config.rootParentValue ||
            node[this.config.parentField] === null ||
            node[this.config.parentField] === undefined);
        return roots.sort((a, b) => a[this.config.leftField] - b[this.config.leftField]);
    }
    async getParent(resourceName, nodeId) {
        const node = await this.getNode(resourceName, nodeId);
        const parentId = node[this.config.parentField];
        if (parentId === this.config.rootParentValue || !parentId) {
            return null;
        }
        const resource = this.database.resources[resourceName];
        return resource.get(parentId);
    }
    async getChildren(resourceName, nodeId, options = {}) {
        const { orderBy = 'left', order = 'asc' } = options;
        const resource = this.database.resources[resourceName];
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
            const aVal = a[sortField] || 0;
            const bVal = b[sortField] || 0;
            return order === 'asc' ? aVal - bVal : bVal - aVal;
        });
        return children;
    }
    async getDescendants(resourceName, nodeId, options = {}) {
        const { includeNode = false, maxDepth = null } = options;
        const node = await this.getNode(resourceName, nodeId);
        const treeId = this._getTreeId(node);
        const nodeLeft = node[this.config.leftField];
        const nodeRight = node[this.config.rightField];
        const nodeDepth = node[this.config.depthField] || 0;
        const treeNodes = await this._getNodesForTree(resourceName, treeId);
        let descendants = treeNodes.filter(n => {
            const left = n[this.config.leftField];
            const right = n[this.config.rightField];
            if (includeNode) {
                return left >= nodeLeft && right <= nodeRight;
            }
            return left > nodeLeft && right < nodeRight;
        });
        if (maxDepth !== null) {
            descendants = descendants.filter(n => {
                const depth = n[this.config.depthField] || 0;
                return depth <= nodeDepth + maxDepth;
            });
        }
        descendants.sort((a, b) => a[this.config.leftField] - b[this.config.leftField]);
        return descendants;
    }
    async getAncestors(resourceName, nodeId, options = {}) {
        const { includeNode = false } = options;
        const node = await this.getNode(resourceName, nodeId);
        const treeId = this._getTreeId(node);
        const nodeLeft = node[this.config.leftField];
        const nodeRight = node[this.config.rightField];
        const treeNodes = await this._getNodesForTree(resourceName, treeId);
        const ancestors = treeNodes.filter(n => {
            const left = n[this.config.leftField];
            const right = n[this.config.rightField];
            if (includeNode) {
                return left <= nodeLeft && right >= nodeRight;
            }
            return left < nodeLeft && right > nodeRight;
        });
        ancestors.sort((a, b) => a[this.config.leftField] - b[this.config.leftField]);
        return ancestors;
    }
    async getSiblings(resourceName, nodeId, options = {}) {
        const { includeSelf = false } = options;
        const node = await this.getNode(resourceName, nodeId);
        const parentId = node[this.config.parentField];
        if (parentId === this.config.rootParentValue || !parentId) {
            const roots = await this.getRoots(resourceName);
            if (includeSelf)
                return roots;
            return roots.filter(r => r.id !== nodeId);
        }
        const siblings = await this.getChildren(resourceName, parentId);
        if (includeSelf)
            return siblings;
        return siblings.filter(s => s.id !== nodeId);
    }
    async getSubtree(resourceName, nodeId, options = {}) {
        return this.getDescendants(resourceName, nodeId, { ...options, includeNode: true });
    }
    async getLeaves(resourceName, nodeId = null, options = {}) {
        const { treeId } = options;
        let nodes;
        if (nodeId) {
            nodes = await this.getDescendants(resourceName, nodeId, { includeNode: true });
        }
        else {
            nodes = await this._getNodesForTree(resourceName, treeId);
        }
        const leaves = nodes.filter(n => {
            const left = n[this.config.leftField];
            const right = n[this.config.rightField];
            return right === left + 1;
        });
        return leaves.sort((a, b) => a[this.config.leftField] - b[this.config.leftField]);
    }
    async getDepth(resourceName, nodeId) {
        const node = await this.getNode(resourceName, nodeId);
        return node[this.config.depthField] || 0;
    }
    async getTreeDepth(resourceName, options = {}) {
        const { treeId } = options;
        const treeNodes = await this._getNodesForTree(resourceName, treeId);
        if (treeNodes.length === 0)
            return 0;
        let maxDepth = 0;
        for (const node of treeNodes) {
            const depth = node[this.config.depthField] || 0;
            if (depth > maxDepth)
                maxDepth = depth;
        }
        return maxDepth;
    }
    async isRoot(resourceName, nodeId) {
        const node = await this.getNode(resourceName, nodeId);
        const parentId = node[this.config.parentField];
        return parentId === this.config.rootParentValue || !parentId;
    }
    async isLeaf(resourceName, nodeId) {
        const node = await this.getNode(resourceName, nodeId);
        const left = node[this.config.leftField];
        const right = node[this.config.rightField];
        return right === left + 1;
    }
    async isDescendantOf(resourceName, nodeId, ancestorId) {
        const node = await this.getNode(resourceName, nodeId);
        const ancestor = await this.getNode(resourceName, ancestorId);
        const nodeLeft = node[this.config.leftField];
        const nodeRight = node[this.config.rightField];
        const ancestorLeft = ancestor[this.config.leftField];
        const ancestorRight = ancestor[this.config.rightField];
        return nodeLeft > ancestorLeft && nodeRight < ancestorRight;
    }
    async isAncestorOf(resourceName, nodeId, descendantId) {
        return this.isDescendantOf(resourceName, descendantId, nodeId);
    }
    async countDescendants(resourceName, nodeId) {
        const node = await this.getNode(resourceName, nodeId);
        const left = node[this.config.leftField];
        const right = node[this.config.rightField];
        return (right - left - 1) / 2;
    }
    async moveSubtree(resourceName, nodeId, newParentId) {
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
            const nodeLeft = freshNode[this.config.leftField];
            const nodeRight = freshNode[this.config.rightField];
            const nodeWidth = nodeRight - nodeLeft + 1;
            const newParentRight = freshNewParent[this.config.rightField];
            const oldDepth = freshNode[this.config.depthField] || 0;
            const newDepth = (freshNewParent[this.config.depthField] || 0) + 1;
            const depthDelta = newDepth - oldDepth;
            const subtree = await this.getSubtree(resourceName, nodeId);
            await TasksRunner.process(subtree, async (subtreeNode) => {
                await resource.patch(subtreeNode.id, {
                    [this.config.leftField]: subtreeNode[this.config.leftField] - nodeLeft + 10000000,
                    [this.config.rightField]: subtreeNode[this.config.rightField] - nodeLeft + 10000000
                });
            }, { concurrency: 10 });
            await this._shiftNodes(resourceName, nodeRight + 1, -nodeWidth, treeId);
            const refreshedParent = await resource.get(newParentId);
            const insertPosition = refreshedParent[this.config.rightField];
            await this._shiftNodes(resourceName, insertPosition, nodeWidth, treeId);
            await TasksRunner.process(subtree, async (subtreeNode) => {
                const oldLeft = subtreeNode[this.config.leftField] - nodeLeft;
                const oldRight = subtreeNode[this.config.rightField] - nodeLeft;
                const currentDepth = subtreeNode[this.config.depthField] || 0;
                await resource.patch(subtreeNode.id, {
                    [this.config.leftField]: insertPosition + oldLeft,
                    [this.config.rightField]: insertPosition + oldRight,
                    [this.config.depthField]: currentDepth + depthDelta,
                    ...(subtreeNode.id === nodeId ? { [this.config.parentField]: newParentId } : {})
                });
            }, { concurrency: 10 });
            return (await resource.get(nodeId));
        });
    }
    async deleteNode(resourceName, nodeId, options = {}) {
        const { promoteChildren = true } = options;
        const resource = this.database.resources[resourceName];
        const node = await this.getNode(resourceName, nodeId);
        const treeId = this._getTreeId(node);
        const lockKey = this._getLockKey(resourceName, treeId);
        return this.plugin._withLock(lockKey, async () => {
            const freshNode = await this.getNode(resourceName, nodeId);
            const children = await this.getChildren(resourceName, nodeId);
            if (children.length > 0) {
                if (promoteChildren) {
                    const nodeParent = freshNode[this.config.parentField];
                    const nodeDepth = freshNode[this.config.depthField] || 0;
                    await TasksRunner.process(children, async (child) => {
                        await resource.patch(child.id, {
                            [this.config.parentField]: nodeParent,
                            [this.config.depthField]: nodeDepth
                        });
                        const childDescendants = await this.getDescendants(resourceName, child.id);
                        await TasksRunner.process(childDescendants, async (descendant) => {
                            await resource.patch(descendant.id, {
                                [this.config.depthField]: (descendant[this.config.depthField] || 0) - 1
                            });
                        }, { concurrency: 10 });
                    }, { concurrency: 10 });
                }
                else {
                    throw new Error(`Node has children. Use deleteSubtree() or set promoteChildren: true`);
                }
            }
            const nodeRight = freshNode[this.config.rightField];
            await resource.delete(nodeId);
            await this._shiftNodes(resourceName, nodeRight + 1, -2, treeId);
            return { deleted: 1, promoted: children.length };
        });
    }
    async deleteSubtree(resourceName, nodeId) {
        const resource = this.database.resources[resourceName];
        const node = await this.getNode(resourceName, nodeId);
        const treeId = this._getTreeId(node);
        const lockKey = this._getLockKey(resourceName, treeId);
        return this.plugin._withLock(lockKey, async () => {
            const freshNode = await this.getNode(resourceName, nodeId);
            const subtree = await this.getSubtree(resourceName, nodeId);
            const nodeLeft = freshNode[this.config.leftField];
            const nodeRight = freshNode[this.config.rightField];
            const width = nodeRight - nodeLeft + 1;
            await TasksRunner.process(subtree, async (subtreeNode) => {
                await resource.delete(subtreeNode.id);
            }, { concurrency: 10 });
            await this._shiftNodes(resourceName, nodeRight + 1, -width, treeId);
            return { deleted: subtree.length };
        });
    }
    async _shiftNodes(resourceName, fromValue, delta, treeId = null) {
        const treeNodes = await this._getNodesForTree(resourceName, treeId);
        const resource = this.database.resources[resourceName];
        const nodesToUpdate = treeNodes.filter(node => {
            const left = node[this.config.leftField];
            const right = node[this.config.rightField];
            return left >= fromValue || right >= fromValue;
        });
        await TasksRunner.process(nodesToUpdate, async (node) => {
            const left = node[this.config.leftField];
            const right = node[this.config.rightField];
            const updateData = {};
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
        }, { concurrency: 10 });
    }
    async rebuildTree(resourceName, options = {}) {
        const { treeId } = options;
        if (this.treeField && !treeId) {
            const resource = this.database.resources[resourceName];
            const allNodes = await resource.list({ limit: 10000 });
            const treeIds = [...new Set(allNodes.map(n => n[this.treeField]).filter(Boolean))];
            let totalRebuilt = 0;
            for (const tid of treeIds) {
                const result = await this.rebuildTree(resourceName, { treeId: tid });
                totalRebuilt += result.rebuilt;
            }
            return { rebuilt: totalRebuilt };
        }
        const lockKey = this._getLockKey(resourceName, treeId ?? null);
        return this.plugin._withLock(lockKey, async () => {
            const resource = this.database.resources[resourceName];
            const treeNodes = await this._getNodesForTree(resourceName, treeId);
            if (treeNodes.length === 0)
                return { rebuilt: 0 };
            const nodeMap = new Map();
            for (const node of treeNodes) {
                nodeMap.set(node.id, { ...node, children: [] });
            }
            const roots = [];
            for (const node of treeNodes) {
                const parentId = node[this.config.parentField];
                if (parentId === this.config.rootParentValue || !parentId) {
                    roots.push(nodeMap.get(node.id));
                }
                else if (nodeMap.has(parentId)) {
                    nodeMap.get(parentId).children.push(nodeMap.get(node.id));
                }
                else {
                    roots.push(nodeMap.get(node.id));
                }
            }
            for (const rootNode of nodeMap.values()) {
                rootNode.children.sort((a, b) => {
                    const aLeft = a[this.config.leftField] || 0;
                    const bLeft = b[this.config.leftField] || 0;
                    return aLeft - bLeft;
                });
            }
            let counter = 0;
            const updates = [];
            const processNode = (node, depth) => {
                const left = ++counter;
                for (const child of node.children) {
                    processNode(child, depth + 1);
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
            await TasksRunner.process(updates, async (update) => {
                await resource.patch(update.id, update.data);
            }, { concurrency: 10 });
            return { rebuilt: updates.length };
        });
    }
    async verifyTree(resourceName, options = {}) {
        const { treeId } = options;
        if (this.treeField && !treeId) {
            const resource = this.database.resources[resourceName];
            const allNodes = await resource.list({ limit: 10000 });
            const treeIds = [...new Set(allNodes.map(n => n[this.treeField]).filter(Boolean))];
            const allErrors = [];
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
        const errors = [];
        const usedValues = { left: new Set(), right: new Set() };
        for (const node of treeNodes) {
            const left = node[this.config.leftField];
            const right = node[this.config.rightField];
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
            const parentId = node[this.config.parentField];
            if (parentId && parentId !== this.config.rootParentValue) {
                const parent = treeNodes.find(n => n.id === parentId);
                if (!parent) {
                    errors.push({
                        type: 'MISSING_PARENT',
                        nodeId: node.id,
                        parentId,
                        message: `Parent not found: ${parentId}`
                    });
                }
                else {
                    const parentLeft = parent[this.config.leftField];
                    const parentRight = parent[this.config.rightField];
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
    async getFullTree(resourceName, options = {}) {
        const { flat = false, treeId } = options;
        const treeNodes = await this._getNodesForTree(resourceName, treeId);
        treeNodes.sort((a, b) => a[this.config.leftField] - b[this.config.leftField]);
        if (flat) {
            return treeNodes;
        }
        return this.toNestedArray(resourceName, null, { treeId });
    }
    async toNestedArray(resourceName, nodeId = null, options = {}) {
        const { treeId } = options;
        let nodes;
        if (nodeId) {
            nodes = await this.getSubtree(resourceName, nodeId);
        }
        else {
            nodes = await this._getNodesForTree(resourceName, treeId);
        }
        nodes.sort((a, b) => a[this.config.leftField] - b[this.config.leftField]);
        const nodeMap = new Map();
        for (const node of nodes) {
            nodeMap.set(node.id, { ...node, children: [] });
        }
        const result = [];
        for (const node of nodes) {
            const enrichedNode = nodeMap.get(node.id);
            const parentId = node[this.config.parentField];
            if (parentId === this.config.rootParentValue || !parentId || !nodeMap.has(parentId)) {
                result.push(enrichedNode);
            }
            else {
                nodeMap.get(parentId).children.push(enrichedNode);
            }
        }
        return result;
    }
}
export default NestedSetDriver;
//# sourceMappingURL=nested-set.js.map