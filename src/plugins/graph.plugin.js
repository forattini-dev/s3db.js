/**
 * Graph Plugin for S3DB
 *
 * Enables graph database functionality using S3DB resources.
 * Supports vertices, edges, labels, and graph traversal algorithms.
 *
 * Features:
 * - Vertex and edge resources with optimized partitions
 * - Directed and undirected (bidirectional) edges
 * - Labels for edge categorization
 * - A* shortest path algorithm
 * - Neighbor traversal
 * - Graph analytics
 *
 * @example
 * ```javascript
 * const graphPlugin = new GraphPlugin({
 *   vertices: 'nodes',        // or array: ['users', 'posts']
 *   edges: 'relationships',
 *   directed: true,           // default: true (directed graph)
 *   weighted: true,           // enable edge weights
 *   defaultWeight: 1
 * });
 *
 * await db.usePlugin(graphPlugin);
 *
 * // Use shorthand methods
 * await db.resources.nodes.graph.edges('vertex-1');          // Get edges for vertex
 * await db.resources.relationships.graph.labels('knows');    // Get edges by label
 * await db.resources.nodes.graph.neighbors('vertex-1');      // Get neighbor vertices
 * await db.resources.nodes.graph.shortestPath('a', 'z');     // A* pathfinding
 * ```
 */

import { Plugin } from './plugin.class.js';
import { createLogger } from '../concerns/logger.js';
import {
  GraphError,
  GraphConfigurationError,
  VertexNotFoundError,
  PathNotFoundError,
  InvalidEdgeError
} from './graph.errors.js';

/** @class */
export class GraphPlugin extends Plugin {
  /** @param {Object} options */
  constructor(options = {}) {
    super(options);

    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.options.logLevel || 'info';
      this.logger = createLogger({ name: 'GraphPlugin', level: logLevel });
    }

    const {
      vertices = null,
      edges = null,
      directed = true,
      weighted = false,
      defaultWeight = 1,
      maxTraversalDepth = 50,
      createResources = false,
      vertexIdField = 'id',
      edgeSourceField = 'source',
      edgeTargetField = 'target',
      edgeLabelField = 'label',
      edgeWeightField = 'weight',
      denormalize = [] // Array of vertex fields to cache on edges (e.g. ['name', 'avatar'])
    } = this.options;

    this.config = {
      vertices: Array.isArray(vertices) ? vertices : (vertices ? [vertices] : []),
      edges: Array.isArray(edges) ? edges : (edges ? [edges] : []),
      directed,
      weighted,
      defaultWeight,
      maxTraversalDepth,
      createResources,
      vertexIdField,
      edgeSourceField,
      edgeTargetField,
      edgeLabelField,
      edgeWeightField,
      denormalize
    };

    this._resourceGraphNamespaces = new Map();
  }

  async onInstall() {
    if (this.config.createResources) {
      await this._createGraphResources();
    }

    this._installResourceMethods();

    this.database.addHook('afterCreateResource', async ({ resource }) => {
      this._installResourceMethods();
    });
  }

  async _createGraphResources() {
    for (const vertexName of this.config.vertices) {
      if (!this.database.resources[vertexName]) {
        await this.database.createResource({
          name: vertexName,
          attributes: {
            data: 'object|optional'
          },
          createdBy: this.slug
        });
        this.logger.info({ resource: vertexName }, `Created vertex resource: ${vertexName}`);
      }
    }

    for (const edgeName of this.config.edges) {
      if (!this.database.resources[edgeName]) {
        const attributes = {
          [this.config.edgeSourceField]: 'string|required',
          [this.config.edgeTargetField]: 'string|required',
          [this.config.edgeLabelField]: 'string|optional'
        };

        if (this.config.weighted) {
          attributes[this.config.edgeWeightField] = 'number|optional';
        }

        await this.database.createResource({
          name: edgeName,
          attributes,
          partitions: {
            bySource: {
              fields: { [this.config.edgeSourceField]: 'string' }
            },
            byTarget: {
              fields: { [this.config.edgeTargetField]: 'string' }
            },
            byLabel: {
              fields: { [this.config.edgeLabelField]: 'string' }
            }
          },
          createdBy: this.slug
        });
        this.logger.info({ resource: edgeName }, `Created edge resource: ${edgeName}`);
      }
    }
  }

  _installResourceMethods() {
    for (const resource of Object.values(this.database.resources)) {
      const isVertex = this.config.vertices.includes(resource.name);
      const isEdge = this.config.edges.includes(resource.name);

      if (!isVertex && !isEdge) continue;

      if (this._resourceGraphNamespaces.has(resource.name)) continue;

      const graphNamespace = this._createGraphNamespace(resource, isVertex, isEdge);
      this._resourceGraphNamespaces.set(resource.name, graphNamespace);

      // Register snapshot as plugin attribute for edge resources so it's not filtered
      if (isEdge && this.config.denormalize.length > 0) {
        try {
          // Only add if not already present to avoid errors
          if (!resource.schema.attributes.snapshot) {
            resource.addPluginAttribute('snapshot', { type: 'object', optional: true }, 'GraphPlugin');
          }
        } catch (e) {
          // Ignore if already exists or conflict
        }
      }

      Object.defineProperty(resource, 'graph', {
        value: graphNamespace,
        writable: true,
        configurable: true,
        enumerable: false
      });
    }
  }

  _createGraphNamespace(resource, isVertex, isEdge) {
    const plugin = this;
    const config = this.config;

    const namespace = {
      plugin,
      resource,
      isVertex,
      isEdge,

      get directed() {
        return config.directed;
      },

      get weighted() {
        return config.weighted;
      }
    };

    if (isVertex) {
      Object.assign(namespace, {
        async edges(vertexId, options = {}) {
          return plugin._getVertexEdges(resource.name, vertexId, options);
        },

        async outgoingEdges(vertexId, options = {}) {
          return plugin._getVertexEdges(resource.name, vertexId, { ...options, direction: 'outgoing' });
        },

        async incomingEdges(vertexId, options = {}) {
          return plugin._getVertexEdges(resource.name, vertexId, { ...options, direction: 'incoming' });
        },

        async neighbors(vertexId, options = {}) {
          return plugin._getNeighbors(resource.name, vertexId, options);
        },

        async outgoingNeighbors(vertexId, options = {}) {
          return plugin._getNeighbors(resource.name, vertexId, { ...options, direction: 'outgoing' });
        },

        async incomingNeighbors(vertexId, options = {}) {
          return plugin._getNeighbors(resource.name, vertexId, { ...options, direction: 'incoming' });
        },

        async degree(vertexId, options = {}) {
          return plugin._getDegree(resource.name, vertexId, options);
        },

        async shortestPath(fromId, toId, options = {}) {
          return plugin._findShortestPath(resource.name, fromId, toId, options);
        },

        async traverse(startId, options = {}) {
          return plugin._traverse(resource.name, startId, options);
        },

        async connect(fromId, toId, options = {}) {
          return plugin._createEdge(resource.name, fromId, toId, options);
        },

        async disconnect(fromId, toId, options = {}) {
          return plugin._removeEdge(resource.name, fromId, toId, options);
        },

        async isConnected(fromId, toId, options = {}) {
          return plugin._isConnected(resource.name, fromId, toId, options);
        },

        async pathExists(fromId, toId, options = {}) {
          try {
            const path = await plugin._findShortestPath(resource.name, fromId, toId, { ...options, returnPath: false });
            return path !== null;
          } catch (err) {
            if (err.name === 'PathNotFoundError') return false;
            throw err;
          }
        }
      });
    }

    if (isEdge) {
      Object.assign(namespace, {
        async labels(label, options = {}) {
          return plugin._getEdgesByLabel(resource.name, label, options);
        },

        async bySource(sourceId, options = {}) {
          return plugin._getEdgesBySource(resource.name, sourceId, options);
        },

        async byTarget(targetId, options = {}) {
          return plugin._getEdgesByTarget(resource.name, targetId, options);
        },

        async between(sourceId, targetId, options = {}) {
          return plugin._getEdgesBetween(resource.name, sourceId, targetId, options);
        },

        async create(sourceId, targetId, options = {}) {
          return plugin._createEdgeInResource(resource.name, sourceId, targetId, options);
        },

        async remove(sourceId, targetId, options = {}) {
          return plugin._removeEdgeFromResource(resource.name, sourceId, targetId, options);
        }
      });
    }

    return namespace;
  }

  _getEdgeResource(vertexResourceName) {
    if (this.config.edges.length === 1) {
      return this.database.resources[this.config.edges[0]];
    }

    const index = this.config.vertices.indexOf(vertexResourceName);
    if (index >= 0 && this.config.edges[index]) {
      return this.database.resources[this.config.edges[index]];
    }

    return this.database.resources[this.config.edges[0]];
  }

  async _getVertexEdges(vertexResourceName, vertexId, options = {}) {
    const { direction = 'both', label = null, limit = 1000 } = options;
    const edgeResource = this._getEdgeResource(vertexResourceName);

    if (!edgeResource) {
      throw new GraphConfigurationError('No edge resource configured', {
        vertexResource: vertexResourceName
      });
    }

    const edges = [];

    if (direction === 'outgoing' || direction === 'both') {
      const outgoing = await edgeResource.listPartition({
        partition: 'bySource',
        partitionValues: { [this.config.edgeSourceField]: vertexId },
        limit
      });
      edges.push(...(outgoing || []).map(e => ({ ...e, _direction: 'outgoing' })));
    }

    if (direction === 'incoming' || direction === 'both') {
      if (this.config.directed || direction === 'incoming') {
        const incoming = await edgeResource.listPartition({
          partition: 'byTarget',
          partitionValues: { [this.config.edgeTargetField]: vertexId },
          limit
        });
        edges.push(...(incoming || []).map(e => ({ ...e, _direction: 'incoming' })));
      }
    }

    let result = edges;
    if (label) {
      result = edges.filter(e => e[this.config.edgeLabelField] === label);
    }

    return result;
  }

  async _getNeighbors(vertexResourceName, vertexId, options = {}) {
    const { direction = 'both', label = null, includeEdges = false, limit = 1000 } = options;

    const edges = await this._getVertexEdges(vertexResourceName, vertexId, { direction, label, limit });

    const neighborIds = new Set();
    const edgesByNeighbor = new Map();

    for (const edge of edges) {
      let neighborId;
      if (edge._direction === 'outgoing') {
        neighborId = edge[this.config.edgeTargetField];
      } else {
        neighborId = edge[this.config.edgeSourceField];
      }

      if (neighborId !== vertexId) {
        neighborIds.add(neighborId);
        
        // Always track edges by neighbor for denormalization lookup
        if (!edgesByNeighbor.has(neighborId)) {
          edgesByNeighbor.set(neighborId, []);
        }
        edgesByNeighbor.get(neighborId).push(edge);
      }
    }

    const neighborIdArray = [];
    const cachedNeighbors = [];

    // Separate neighbors that need fetching vs those with cached data
    for (const id of neighborIds) {
      const edges = edgesByNeighbor.get(id);
      // Check if ANY edge to this neighbor has the snapshot
      const snapshotEdge = edges.find(e => e.snapshot && Object.keys(e.snapshot).length > 0);
      
      if (snapshotEdge && this.config.denormalize.length > 0) {
        // Reconstruct node from snapshot
        cachedNeighbors.push({
          id,
          ...snapshotEdge.snapshot
        });
      } else {
        neighborIdArray.push(id);
      }
    }

    let fetchedNeighbors = [];
    const vertexResource = this.database.resources[vertexResourceName];

    if (neighborIdArray.length > 0) {
      if (!includeEdges && (!vertexResource || typeof vertexResource.getMany !== 'function')) {
        fetchedNeighbors = neighborIdArray.map(id => ({ id }));
      } else {
        fetchedNeighbors = vertexResource && typeof vertexResource.getMany === 'function'
          ? await vertexResource.getMany(neighborIdArray)
          : neighborIdArray.map(id => ({ id }));
      }
    }

    const allNeighbors = [...cachedNeighbors, ...fetchedNeighbors];

    return allNeighbors.map(n => ({
      ...n,
      _edges: edgesByNeighbor.get(n.id) || []
    }));
  }

  async _getDegree(vertexResourceName, vertexId, options = {}) {
    const { direction = 'both' } = options;

    const edges = await this._getVertexEdges(vertexResourceName, vertexId, { direction, limit: 10000 });

    const result = {
      total: edges.length,
      outgoing: 0,
      incoming: 0
    };

    for (const edge of edges) {
      if (edge._direction === 'outgoing') {
        result.outgoing++;
      } else {
        result.incoming++;
      }
    }

    return result;
  }

  async _findShortestPath(vertexResourceName, fromId, toId, options = {}) {
    const {
      maxDepth = this.config.maxTraversalDepth,
      heuristic = null,
      returnPath = true,
      direction = 'outgoing',
      includeStats = false
    } = options;

    if (fromId === toId) {
      const result = returnPath ? { path: [fromId], distance: 0, edges: [] } : { distance: 0 };
      if (includeStats) result.stats = { iterations: 0, visited: 0 };
      return result;
    }

    const openSet = new MinHeap();
    const gScore = new Map();
    const fScore = new Map();
    const cameFrom = new Map();
    const edgeUsed = new Map();

    gScore.set(fromId, 0);
    fScore.set(fromId, heuristic ? heuristic(fromId, toId) : 0);
    openSet.insert({ id: fromId, f: fScore.get(fromId) });

    const visited = new Set();
    let iterations = 0;
    const maxIterations = maxDepth * 1000;

    while (!openSet.isEmpty() && iterations < maxIterations) {
      iterations++;

      const current = openSet.extractMin();
      if (!current) break;

      const currentId = current.id;

      if (currentId === toId) {
        if (!returnPath) {
          const result = { distance: gScore.get(toId) };
          if (includeStats) result.stats = { iterations, visited: visited.size };
          return result;
        }
        const result = this._reconstructPath(fromId, toId, cameFrom, edgeUsed, gScore.get(toId));
        if (includeStats) result.stats = { iterations, visited: visited.size };
        return result;
      }

      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const currentDepth = this._getPathLength(fromId, currentId, cameFrom);
      if (currentDepth >= maxDepth) continue;

      const edges = await this._getVertexEdges(vertexResourceName, currentId, { direction });

      for (const edge of edges) {
        const neighborId = edge._direction === 'outgoing'
          ? edge[this.config.edgeTargetField]
          : edge[this.config.edgeSourceField];

        if (visited.has(neighborId)) continue;

        const weight = this.config.weighted
          ? (edge[this.config.edgeWeightField] ?? this.config.defaultWeight)
          : 1;

        const tentativeG = gScore.get(currentId) + weight;

        if (!gScore.has(neighborId) || tentativeG < gScore.get(neighborId)) {
          cameFrom.set(neighborId, currentId);
          edgeUsed.set(neighborId, edge);
          gScore.set(neighborId, tentativeG);

          const h = heuristic ? heuristic(neighborId, toId) : 0;
          fScore.set(neighborId, tentativeG + h);

          openSet.insert({ id: neighborId, f: fScore.get(neighborId) });
        }
      }
    }

    throw new PathNotFoundError(fromId, toId, {
      vertexResource: vertexResourceName,
      maxDepth,
      iterations
    });
  }

  _getPathLength(fromId, toId, cameFrom) {
    let length = 0;
    let current = toId;
    while (current !== fromId && cameFrom.has(current)) {
      length++;
      current = cameFrom.get(current);
    }
    return length;
  }

  _reconstructPath(fromId, toId, cameFrom, edgeUsed, distance) {
    const path = [toId];
    const edges = [];
    let current = toId;

    while (current !== fromId && cameFrom.has(current)) {
      const prev = cameFrom.get(current);
      const edge = edgeUsed.get(current);
      if (edge) {
        edges.unshift(edge);
      }
      path.unshift(prev);
      current = prev;
    }

    return { path, edges, distance };
  }

  async _traverse(vertexResourceName, startId, options = {}) {
    const {
      maxDepth = this.config.maxTraversalDepth,
      direction = 'outgoing',
      filter = null,
      visitor = null,
      mode = 'bfs'
    } = options;

    const visited = new Set();
    const result = [];
    const queue = [{ id: startId, depth: 0, path: [startId] }];

    while (queue.length > 0) {
      const { id, depth, path } = mode === 'bfs' ? queue.shift() : queue.pop();

      if (visited.has(id)) continue;
      visited.add(id);

      const vertexResource = this.database.resources[vertexResourceName];
      let vertex = null;
      if (vertexResource && typeof vertexResource.get === 'function') {
        vertex = await vertexResource.get(id);
      }

      const node = {
        id,
        depth,
        path: [...path],
        data: vertex
      };

      if (filter && !filter(node)) continue;

      if (visitor) {
        const shouldContinue = await visitor(node);
        if (shouldContinue === false) continue;
      }

      result.push(node);

      if (depth < maxDepth) {
        const neighbors = await this._getNeighbors(vertexResourceName, id, { direction });
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor.id)) {
            queue.push({
              id: neighbor.id,
              depth: depth + 1,
              path: [...path, neighbor.id]
            });
          }
        }
      }
    }

    return result;
  }

  async _createEdge(vertexResourceName, fromId, toId, options = {}) {
    const edgeResource = this._getEdgeResource(vertexResourceName);

    if (!edgeResource) {
      throw new GraphConfigurationError('No edge resource configured', {
        vertexResource: vertexResourceName
      });
    }

    return this._createEdgeInResource(edgeResource.name, fromId, toId, options);
  }

  async _createEdgeInResource(edgeResourceName, sourceId, targetId, options = {}) {
    const { label = null, weight = null, data = {} } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    // Denormalization Logic
    let targetDataSnapshot = {};
    let sourceDataSnapshot = {};

    if (this.config.denormalize.length > 0) {
      // We need to identify which resource the source/target belong to
      // This is tricky if multiple vertex resources exist. 
      // Assumption: For denormalization to work reliably, IDs should be unique or we scan configured vertex resources.
      
      const fetchFields = async (id) => {
        for (const vertexRes of this.config.vertices) {
          const res = this.database.resources[vertexRes];
          if (res) {
            try {
              const node = await res.get(id);
              const snapshot = {};
              this.config.denormalize.forEach(field => {
                if (node[field] !== undefined) snapshot[field] = node[field];
              });
              return snapshot;
            } catch (e) { /* ignore not found */ }
          }
        }
        return {};
      };

      targetDataSnapshot = await fetchFields(targetId);
      if (!this.config.directed) {
        sourceDataSnapshot = await fetchFields(sourceId);
      }
    }

    const edgeData = {
      [this.config.edgeSourceField]: sourceId,
      [this.config.edgeTargetField]: targetId,
      ...data,
      snapshot: targetDataSnapshot // Store snapshot (public field to avoid filtering)
    };

    if (label) {
      edgeData[this.config.edgeLabelField] = label;
    }

    if (this.config.weighted && weight !== null) {
      edgeData[this.config.edgeWeightField] = weight;
    }

    const edge = await edgeResource.insert(edgeData);

    if (!this.config.directed) {
      const reverseData = {
        [this.config.edgeSourceField]: targetId,
        [this.config.edgeTargetField]: sourceId,
        ...data,
        _reverse: true,
        _originalEdge: edge.id,
        snapshot: sourceDataSnapshot // Store snapshot for the reverse edge
      };

      if (label) {
        reverseData[this.config.edgeLabelField] = label;
      }

      if (this.config.weighted && weight !== null) {
        reverseData[this.config.edgeWeightField] = weight;
      }

      await edgeResource.insert(reverseData);
    }

    return edge;
  }

  async _removeEdge(vertexResourceName, fromId, toId, options = {}) {
    const edgeResource = this._getEdgeResource(vertexResourceName);

    if (!edgeResource) {
      throw new GraphConfigurationError('No edge resource configured', {
        vertexResource: vertexResourceName
      });
    }

    return this._removeEdgeFromResource(edgeResource.name, fromId, toId, options);
  }

  async _removeEdgeFromResource(edgeResourceName, sourceId, targetId, options = {}) {
    const { label = null } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    const filter = {
      [this.config.edgeSourceField]: sourceId,
      [this.config.edgeTargetField]: targetId
    };

    if (label) {
      filter[this.config.edgeLabelField] = label;
    }

    const edges = await edgeResource.query(filter);
    let deleted = 0;

    for (const edge of edges) {
      await edgeResource.delete(edge.id);
      deleted++;
    }

    if (!this.config.directed) {
      const reverseFilter = {
        [this.config.edgeSourceField]: targetId,
        [this.config.edgeTargetField]: sourceId
      };

      if (label) {
        reverseFilter[this.config.edgeLabelField] = label;
      }

      const reverseEdges = await edgeResource.query(reverseFilter);
      for (const edge of reverseEdges) {
        await edgeResource.delete(edge.id);
        deleted++;
      }
    }

    return { deleted };
  }

  async _isConnected(vertexResourceName, fromId, toId, options = {}) {
    const { label = null } = options;

    const edges = await this._getVertexEdges(vertexResourceName, fromId, {
      direction: 'outgoing',
      label
    });

    return edges.some(e => e[this.config.edgeTargetField] === toId);
  }

  async _getEdgesByLabel(edgeResourceName, label, options = {}) {
    const { limit = 1000 } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    return edgeResource.listPartition({
      partition: 'byLabel',
      partitionValues: { [this.config.edgeLabelField]: label },
      limit
    });
  }

  async _getEdgesBySource(edgeResourceName, sourceId, options = {}) {
    const { limit = 1000 } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    return edgeResource.listPartition({
      partition: 'bySource',
      partitionValues: { [this.config.edgeSourceField]: sourceId },
      limit
    });
  }

  async _getEdgesByTarget(edgeResourceName, targetId, options = {}) {
    const { limit = 1000 } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    return edgeResource.listPartition({
      partition: 'byTarget',
      partitionValues: { [this.config.edgeTargetField]: targetId },
      limit
    });
  }

  async _getEdgesBetween(edgeResourceName, sourceId, targetId, options = {}) {
    const { label = null } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    const filter = {
      [this.config.edgeSourceField]: sourceId,
      [this.config.edgeTargetField]: targetId
    };

    if (label) {
      filter[this.config.edgeLabelField] = label;
    }

    return edgeResource.query(filter);
  }

  async onUninstall(options) {
    for (const [resourceName, namespace] of this._resourceGraphNamespaces) {
      const resource = this.database.resources[resourceName];
      if (resource) {
        delete resource.graph;
      }
    }
    this._resourceGraphNamespaces.clear();
  }

  getStats() {
    return {
      vertexResources: this.config.vertices,
      edgeResources: this.config.edges,
      directed: this.config.directed,
      weighted: this.config.weighted
    };
  }
}

/**
 * MinHeap for A* priority queue
 * @private
 */
class MinHeap {
  constructor() {
    this.heap = [];
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  insert(item) {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  extractMin() {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop();

    const min = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._bubbleDown(0);
    return min;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex].f <= this.heap[index].f) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  _bubbleDown(index) {
    const length = this.heap.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < length && this.heap[leftChild].f < this.heap[smallest].f) {
        smallest = leftChild;
      }
      if (rightChild < length && this.heap[rightChild].f < this.heap[smallest].f) {
        smallest = rightChild;
      }

      if (smallest === index) break;

      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }
}

export {
  GraphError,
  GraphConfigurationError,
  VertexNotFoundError,
  PathNotFoundError,
  InvalidEdgeError
} from './graph.errors.js';
