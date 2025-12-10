import { Plugin } from './plugin.class.js';
import { createLogger } from '../concerns/logger.js';
import {
  GraphError,
  GraphConfigurationError,
  VertexNotFoundError,
  PathNotFoundError,
  InvalidEdgeError
} from './graph.errors.js';

import type { Database } from '../database.class.js';
import type { Resource } from '../resource.class.js';
import type { Logger } from '../concerns/logger.js';

export interface GraphPluginOptions {
  vertices?: string | string[] | null;
  edges?: string | string[] | null;
  directed?: boolean;
  weighted?: boolean;
  defaultWeight?: number;
  maxTraversalDepth?: number;
  createResources?: boolean;
  vertexIdField?: string;
  edgeSourceField?: string;
  edgeTargetField?: string;
  edgeLabelField?: string;
  edgeWeightField?: string;
  denormalize?: string[];
  logLevel?: string;
  logger?: Logger;
  [key: string]: unknown;
}

export interface GraphConfig {
  vertices: string[];
  edges: string[];
  directed: boolean;
  weighted: boolean;
  defaultWeight: number;
  maxTraversalDepth: number;
  createResources: boolean;
  vertexIdField: string;
  edgeSourceField: string;
  edgeTargetField: string;
  edgeLabelField: string;
  edgeWeightField: string;
  denormalize: string[];
}

export interface EdgeRecord {
  id: string;
  _direction?: 'outgoing' | 'incoming';
  _reverse?: boolean;
  _originalEdge?: string;
  snapshot?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NeighborResult {
  id: string;
  _edges: EdgeRecord[];
  [key: string]: unknown;
}

export interface DegreeResult {
  total: number;
  outgoing: number;
  incoming: number;
}

export interface PathResult {
  path: string[];
  edges: EdgeRecord[];
  distance: number;
  stats?: {
    iterations: number;
    visited: number;
  };
}

export interface TraverseNode {
  id: string;
  depth: number;
  path: string[];
  data: Record<string, unknown> | null;
}

export interface EdgeOptions {
  direction?: 'outgoing' | 'incoming' | 'both';
  label?: string | null;
  limit?: number;
}

export interface NeighborOptions extends EdgeOptions {
  includeEdges?: boolean;
}

export interface ShortestPathOptions {
  maxDepth?: number;
  heuristic?: ((from: string, to: string) => number) | null;
  returnPath?: boolean;
  direction?: 'outgoing' | 'incoming' | 'both';
  includeStats?: boolean;
}

export interface TraverseOptions {
  maxDepth?: number;
  direction?: 'outgoing' | 'incoming' | 'both';
  filter?: ((node: TraverseNode) => boolean) | null;
  visitor?: ((node: TraverseNode) => Promise<boolean | void>) | null;
  mode?: 'bfs' | 'dfs';
}

export interface CreateEdgeOptions {
  label?: string | null;
  weight?: number | null;
  data?: Record<string, unknown>;
}

interface HeapItem {
  id: string;
  f: number;
}

export class GraphPlugin extends Plugin {

  config: GraphConfig;
  private _resourceGraphNamespaces: Map<string, unknown>;

  constructor(options: GraphPluginOptions = {}) {
    super(options);

    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = this.options.logLevel || 'info';
      this.logger = createLogger({ name: 'GraphPlugin', level: logLevel as any });
    }

    const opts = this.options as GraphPluginOptions;
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
      denormalize = []
    } = opts;

    this.config = {
      vertices: Array.isArray(vertices) ? vertices : (vertices ? [vertices] : []),
      edges: Array.isArray(edges) ? edges : (edges ? [edges] : []),
      directed: directed as boolean,
      weighted: weighted as boolean,
      defaultWeight: defaultWeight as number,
      maxTraversalDepth: maxTraversalDepth as number,
      createResources: createResources as boolean,
      vertexIdField: vertexIdField as string,
      edgeSourceField: edgeSourceField as string,
      edgeTargetField: edgeTargetField as string,
      edgeLabelField: edgeLabelField as string,
      edgeWeightField: edgeWeightField as string,
      denormalize: denormalize as string[]
    };

    this._resourceGraphNamespaces = new Map();
  }

  override async onInstall(): Promise<void> {
    if (this.config.createResources) {
      await this._createGraphResources();
    }

    this._installResourceMethods();

    this.database.addHook('afterCreateResource', async () => {
      this._installResourceMethods();
    });
  }

  private async _createGraphResources(): Promise<void> {
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
        const attributes: Record<string, string> = {
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

  private _installResourceMethods(): void {
    for (const resource of Object.values(this.database.resources)) {
      const isVertex = this.config.vertices.includes(resource.name);
      const isEdge = this.config.edges.includes(resource.name);

      if (!isVertex && !isEdge) continue;

      if (this._resourceGraphNamespaces.has(resource.name)) continue;

      const graphNamespace = this._createGraphNamespace(resource, isVertex, isEdge);
      this._resourceGraphNamespaces.set(resource.name, graphNamespace);

      if (isEdge && this.config.denormalize.length > 0) {
        try {
          const resourceWithSchema = resource as unknown as { schema: { attributes: Record<string, unknown> }; addPluginAttribute: (name: string, config: unknown, plugin: string) => void };
          if (!resourceWithSchema.schema.attributes.snapshot) {
            resourceWithSchema.addPluginAttribute('snapshot', { type: 'object', optional: true }, 'GraphPlugin');
          }
        } catch {
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

  private _createGraphNamespace(resource: Resource, isVertex: boolean, isEdge: boolean): Record<string, unknown> {
    const plugin = this;
    const config = this.config;

    const namespace: Record<string, unknown> = {
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
        async edges(vertexId: string, options: EdgeOptions = {}) {
          return plugin._getVertexEdges(resource.name, vertexId, options);
        },

        async outgoingEdges(vertexId: string, options: EdgeOptions = {}) {
          return plugin._getVertexEdges(resource.name, vertexId, { ...options, direction: 'outgoing' });
        },

        async incomingEdges(vertexId: string, options: EdgeOptions = {}) {
          return plugin._getVertexEdges(resource.name, vertexId, { ...options, direction: 'incoming' });
        },

        async neighbors(vertexId: string, options: NeighborOptions = {}) {
          return plugin._getNeighbors(resource.name, vertexId, options);
        },

        async outgoingNeighbors(vertexId: string, options: NeighborOptions = {}) {
          return plugin._getNeighbors(resource.name, vertexId, { ...options, direction: 'outgoing' });
        },

        async incomingNeighbors(vertexId: string, options: NeighborOptions = {}) {
          return plugin._getNeighbors(resource.name, vertexId, { ...options, direction: 'incoming' });
        },

        async degree(vertexId: string, options: EdgeOptions = {}) {
          return plugin._getDegree(resource.name, vertexId, options);
        },

        async shortestPath(fromId: string, toId: string, options: ShortestPathOptions = {}) {
          return plugin._findShortestPath(resource.name, fromId, toId, options);
        },

        async traverse(startId: string, options: TraverseOptions = {}) {
          return plugin._traverse(resource.name, startId, options);
        },

        async connect(fromId: string, toId: string, options: CreateEdgeOptions = {}) {
          return plugin._createEdge(resource.name, fromId, toId, options);
        },

        async disconnect(fromId: string, toId: string, options: { label?: string | null } = {}) {
          return plugin._removeEdge(resource.name, fromId, toId, options);
        },

        async isConnected(fromId: string, toId: string, options: { label?: string | null } = {}) {
          return plugin._isConnected(resource.name, fromId, toId, options);
        },

        async pathExists(fromId: string, toId: string, options: ShortestPathOptions = {}) {
          try {
            const path = await plugin._findShortestPath(resource.name, fromId, toId, { ...options, returnPath: false });
            return path !== null;
          } catch (err) {
            if ((err as Error).name === 'PathNotFoundError') return false;
            throw err;
          }
        }
      });
    }

    if (isEdge) {
      Object.assign(namespace, {
        async labels(label: string, options: { limit?: number } = {}) {
          return plugin._getEdgesByLabel(resource.name, label, options);
        },

        async bySource(sourceId: string, options: { limit?: number } = {}) {
          return plugin._getEdgesBySource(resource.name, sourceId, options);
        },

        async byTarget(targetId: string, options: { limit?: number } = {}) {
          return plugin._getEdgesByTarget(resource.name, targetId, options);
        },

        async between(sourceId: string, targetId: string, options: { label?: string | null } = {}) {
          return plugin._getEdgesBetween(resource.name, sourceId, targetId, options);
        },

        async create(sourceId: string, targetId: string, options: CreateEdgeOptions = {}) {
          return plugin._createEdgeInResource(resource.name, sourceId, targetId, options);
        },

        async remove(sourceId: string, targetId: string, options: { label?: string | null } = {}) {
          return plugin._removeEdgeFromResource(resource.name, sourceId, targetId, options);
        }
      });
    }

    return namespace;
  }

  private _getEdgeResource(vertexResourceName: string): Resource | undefined {
    if (this.config.edges.length === 1) {
      return this.database.resources[this.config.edges[0]!];
    }

    const index = this.config.vertices.indexOf(vertexResourceName);
    if (index >= 0 && this.config.edges[index]) {
      return this.database.resources[this.config.edges[index]!];
    }

    return this.database.resources[this.config.edges[0]!];
  }

  private async _getVertexEdges(vertexResourceName: string, vertexId: string, options: EdgeOptions = {}): Promise<EdgeRecord[]> {
    const { direction = 'both', label = null, limit = 1000 } = options;
    const edgeResource = this._getEdgeResource(vertexResourceName);

    if (!edgeResource) {
      throw new GraphConfigurationError('No edge resource configured', {
        vertexResource: vertexResourceName
      });
    }

    const edges: EdgeRecord[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      const outgoing = await edgeResource.listPartition({
        partition: 'bySource',
        partitionValues: { [this.config.edgeSourceField]: vertexId },
        limit
      }) as EdgeRecord[];
      edges.push(...(outgoing || []).map(e => ({ ...e, _direction: 'outgoing' as const })));
    }

    if (direction === 'incoming' || direction === 'both') {
      if (this.config.directed || direction === 'incoming') {
        const incoming = await edgeResource.listPartition({
          partition: 'byTarget',
          partitionValues: { [this.config.edgeTargetField]: vertexId },
          limit
        }) as EdgeRecord[];
        edges.push(...(incoming || []).map(e => ({ ...e, _direction: 'incoming' as const })));
      }
    }

    let result = edges;
    if (label) {
      result = edges.filter(e => e[this.config.edgeLabelField] === label);
    }

    return result;
  }

  private async _getNeighbors(vertexResourceName: string, vertexId: string, options: NeighborOptions = {}): Promise<NeighborResult[]> {
    const { direction = 'both', label = null, includeEdges = false, limit = 1000 } = options;

    const edges = await this._getVertexEdges(vertexResourceName, vertexId, { direction, label, limit });

    const neighborIds = new Set<string>();
    const edgesByNeighbor = new Map<string, EdgeRecord[]>();

    for (const edge of edges) {
      let neighborId: string;
      if (edge._direction === 'outgoing') {
        neighborId = edge[this.config.edgeTargetField] as string;
      } else {
        neighborId = edge[this.config.edgeSourceField] as string;
      }

      if (neighborId !== vertexId) {
        neighborIds.add(neighborId);

        if (!edgesByNeighbor.has(neighborId)) {
          edgesByNeighbor.set(neighborId, []);
        }
        edgesByNeighbor.get(neighborId)!.push(edge);
      }
    }

    const neighborIdArray: string[] = [];
    const cachedNeighbors: NeighborResult[] = [];

    for (const id of neighborIds) {
      const neighborEdges = edgesByNeighbor.get(id);
      const snapshotEdge = neighborEdges?.find(e => e.snapshot && Object.keys(e.snapshot).length > 0);

      if (snapshotEdge && this.config.denormalize.length > 0) {
        cachedNeighbors.push({
          id,
          ...snapshotEdge.snapshot,
          _edges: []
        });
      } else {
        neighborIdArray.push(id);
      }
    }

    let fetchedNeighbors: Array<{ id: string; [key: string]: unknown }> = [];
    const vertexResource = this.database.resources[vertexResourceName];

    if (neighborIdArray.length > 0) {
      const resourceWithGetMany = vertexResource as unknown as { getMany?: (ids: string[]) => Promise<Array<{ id: string; [key: string]: unknown }>> };
      if (!includeEdges && (!vertexResource || typeof resourceWithGetMany.getMany !== 'function')) {
        fetchedNeighbors = neighborIdArray.map(id => ({ id }));
      } else {
        fetchedNeighbors = resourceWithGetMany && typeof resourceWithGetMany.getMany === 'function'
          ? await resourceWithGetMany.getMany(neighborIdArray)
          : neighborIdArray.map(id => ({ id }));
      }
    }

    const allNeighbors = [...cachedNeighbors, ...fetchedNeighbors];

    return allNeighbors.map(n => ({
      ...n,
      _edges: edgesByNeighbor.get(n.id) || []
    }));
  }

  private async _getDegree(vertexResourceName: string, vertexId: string, options: EdgeOptions = {}): Promise<DegreeResult> {
    const { direction = 'both' } = options;

    const edges = await this._getVertexEdges(vertexResourceName, vertexId, { direction, limit: 10000 });

    const result: DegreeResult = {
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

  private async _findShortestPath(vertexResourceName: string, fromId: string, toId: string, options: ShortestPathOptions = {}): Promise<PathResult | { distance: number; stats?: { iterations: number; visited: number } }> {
    const {
      maxDepth = this.config.maxTraversalDepth,
      heuristic = null,
      returnPath = true,
      direction = 'outgoing',
      includeStats = false
    } = options;

    if (fromId === toId) {
      const result: PathResult = { path: [fromId], distance: 0, edges: [] };
      if (includeStats) result.stats = { iterations: 0, visited: 0 };
      return result;
    }

    const openSet = new MinHeap();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();
    const cameFrom = new Map<string, string>();
    const edgeUsed = new Map<string, EdgeRecord>();

    gScore.set(fromId, 0);
    fScore.set(fromId, heuristic ? heuristic(fromId, toId) : 0);
    openSet.insert({ id: fromId, f: fScore.get(fromId)! });

    const visited = new Set<string>();
    let iterations = 0;
    const maxIterations = maxDepth * 1000;

    while (!openSet.isEmpty() && iterations < maxIterations) {
      iterations++;

      const current = openSet.extractMin();
      if (!current) break;

      const currentId = current.id;

      if (currentId === toId) {
        if (!returnPath) {
          const result: { distance: number; stats?: { iterations: number; visited: number } } = { distance: gScore.get(toId)! };
          if (includeStats) result.stats = { iterations, visited: visited.size };
          return result;
        }
        const result = this._reconstructPath(fromId, toId, cameFrom, edgeUsed, gScore.get(toId)!);
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
          ? edge[this.config.edgeTargetField] as string
          : edge[this.config.edgeSourceField] as string;

        if (visited.has(neighborId)) continue;

        const weight = this.config.weighted
          ? ((edge[this.config.edgeWeightField] as number) ?? this.config.defaultWeight)
          : 1;

        const tentativeG = gScore.get(currentId)! + weight;

        if (!gScore.has(neighborId) || tentativeG < gScore.get(neighborId)!) {
          cameFrom.set(neighborId, currentId);
          edgeUsed.set(neighborId, edge);
          gScore.set(neighborId, tentativeG);

          const h = heuristic ? heuristic(neighborId, toId) : 0;
          fScore.set(neighborId, tentativeG + h);

          openSet.insert({ id: neighborId, f: fScore.get(neighborId)! });
        }
      }
    }

    throw new PathNotFoundError(fromId, toId, {
      vertexResource: vertexResourceName,
      maxDepth,
      iterations
    });
  }

  private _getPathLength(fromId: string, toId: string, cameFrom: Map<string, string>): number {
    let length = 0;
    let current = toId;
    while (current !== fromId && cameFrom.has(current)) {
      length++;
      current = cameFrom.get(current)!;
    }
    return length;
  }

  private _reconstructPath(fromId: string, toId: string, cameFrom: Map<string, string>, edgeUsed: Map<string, EdgeRecord>, distance: number): PathResult {
    const path: string[] = [toId];
    const edges: EdgeRecord[] = [];
    let current = toId;

    while (current !== fromId && cameFrom.has(current)) {
      const prev = cameFrom.get(current)!;
      const edge = edgeUsed.get(current);
      if (edge) {
        edges.unshift(edge);
      }
      path.unshift(prev);
      current = prev;
    }

    return { path, edges, distance };
  }

  private async _traverse(vertexResourceName: string, startId: string, options: TraverseOptions = {}): Promise<TraverseNode[]> {
    const {
      maxDepth = this.config.maxTraversalDepth,
      direction = 'outgoing',
      filter = null,
      visitor = null,
      mode = 'bfs'
    } = options;

    const visited = new Set<string>();
    const result: TraverseNode[] = [];
    const queue: Array<{ id: string; depth: number; path: string[] }> = [{ id: startId, depth: 0, path: [startId] }];

    while (queue.length > 0) {
      const { id, depth, path } = mode === 'bfs' ? queue.shift()! : queue.pop()!;

      if (visited.has(id)) continue;
      visited.add(id);

      const vertexResource = this.database.resources[vertexResourceName];
      let vertex: Record<string, unknown> | null = null;
      if (vertexResource && typeof vertexResource.get === 'function') {
        vertex = await vertexResource.get(id) as Record<string, unknown>;
      }

      const node: TraverseNode = {
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

  private async _createEdge(vertexResourceName: string, fromId: string, toId: string, options: CreateEdgeOptions = {}): Promise<EdgeRecord> {
    const edgeResource = this._getEdgeResource(vertexResourceName);

    if (!edgeResource) {
      throw new GraphConfigurationError('No edge resource configured', {
        vertexResource: vertexResourceName
      });
    }

    return this._createEdgeInResource(edgeResource.name, fromId, toId, options);
  }

  private async _createEdgeInResource(edgeResourceName: string, sourceId: string, targetId: string, options: CreateEdgeOptions = {}): Promise<EdgeRecord> {
    const { label = null, weight = null, data = {} } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    let targetDataSnapshot: Record<string, unknown> = {};
    let sourceDataSnapshot: Record<string, unknown> = {};

    if (this.config.denormalize.length > 0) {
      const fetchFields = async (id: string): Promise<Record<string, unknown>> => {
        for (const vertexRes of this.config.vertices) {
          const res = this.database.resources[vertexRes];
          if (res) {
            try {
              const node = await res.get(id) as Record<string, unknown>;
              const snapshot: Record<string, unknown> = {};
              this.config.denormalize.forEach(field => {
                if (node[field] !== undefined) snapshot[field] = node[field];
              });
              return snapshot;
            } catch { /* ignore not found */ }
          }
        }
        return {};
      };

      targetDataSnapshot = await fetchFields(targetId);
      if (!this.config.directed) {
        sourceDataSnapshot = await fetchFields(sourceId);
      }
    }

    const edgeData: Record<string, unknown> = {
      [this.config.edgeSourceField]: sourceId,
      [this.config.edgeTargetField]: targetId,
      ...data,
      snapshot: targetDataSnapshot
    };

    if (label) {
      edgeData[this.config.edgeLabelField] = label;
    }

    if (this.config.weighted && weight !== null) {
      edgeData[this.config.edgeWeightField] = weight;
    }

    const edge = await edgeResource.insert(edgeData) as EdgeRecord;

    if (!this.config.directed) {
      const reverseData: Record<string, unknown> = {
        [this.config.edgeSourceField]: targetId,
        [this.config.edgeTargetField]: sourceId,
        ...data,
        _reverse: true,
        _originalEdge: edge.id,
        snapshot: sourceDataSnapshot
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

  private async _removeEdge(vertexResourceName: string, fromId: string, toId: string, options: { label?: string | null } = {}): Promise<{ deleted: number }> {
    const edgeResource = this._getEdgeResource(vertexResourceName);

    if (!edgeResource) {
      throw new GraphConfigurationError('No edge resource configured', {
        vertexResource: vertexResourceName
      });
    }

    return this._removeEdgeFromResource(edgeResource.name, fromId, toId, options);
  }

  private async _removeEdgeFromResource(edgeResourceName: string, sourceId: string, targetId: string, options: { label?: string | null } = {}): Promise<{ deleted: number }> {
    const { label = null } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    const filter: Record<string, string> = {
      [this.config.edgeSourceField]: sourceId,
      [this.config.edgeTargetField]: targetId
    };

    if (label) {
      filter[this.config.edgeLabelField] = label;
    }

    const edges = await (edgeResource as unknown as { query: (filter: Record<string, string>) => Promise<EdgeRecord[]> }).query(filter);
    let deleted = 0;

    for (const edge of edges) {
      await edgeResource.delete(edge.id);
      deleted++;
    }

    if (!this.config.directed) {
      const reverseFilter: Record<string, string> = {
        [this.config.edgeSourceField]: targetId,
        [this.config.edgeTargetField]: sourceId
      };

      if (label) {
        reverseFilter[this.config.edgeLabelField] = label;
      }

      const reverseEdges = await (edgeResource as unknown as { query: (filter: Record<string, string>) => Promise<EdgeRecord[]> }).query(reverseFilter);
      for (const edge of reverseEdges) {
        await edgeResource.delete(edge.id);
        deleted++;
      }
    }

    return { deleted };
  }

  private async _isConnected(vertexResourceName: string, fromId: string, toId: string, options: { label?: string | null } = {}): Promise<boolean> {
    const { label = null } = options;

    const edges = await this._getVertexEdges(vertexResourceName, fromId, {
      direction: 'outgoing',
      label
    });

    return edges.some(e => e[this.config.edgeTargetField] === toId);
  }

  private async _getEdgesByLabel(edgeResourceName: string, label: string, options: { limit?: number } = {}): Promise<EdgeRecord[]> {
    const { limit = 1000 } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    return edgeResource.listPartition({
      partition: 'byLabel',
      partitionValues: { [this.config.edgeLabelField]: label },
      limit
    }) as Promise<EdgeRecord[]>;
  }

  private async _getEdgesBySource(edgeResourceName: string, sourceId: string, options: { limit?: number } = {}): Promise<EdgeRecord[]> {
    const { limit = 1000 } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    return edgeResource.listPartition({
      partition: 'bySource',
      partitionValues: { [this.config.edgeSourceField]: sourceId },
      limit
    }) as Promise<EdgeRecord[]>;
  }

  private async _getEdgesByTarget(edgeResourceName: string, targetId: string, options: { limit?: number } = {}): Promise<EdgeRecord[]> {
    const { limit = 1000 } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    return edgeResource.listPartition({
      partition: 'byTarget',
      partitionValues: { [this.config.edgeTargetField]: targetId },
      limit
    }) as Promise<EdgeRecord[]>;
  }

  private async _getEdgesBetween(edgeResourceName: string, sourceId: string, targetId: string, options: { label?: string | null } = {}): Promise<EdgeRecord[]> {
    const { label = null } = options;
    const edgeResource = this.database.resources[edgeResourceName];

    if (!edgeResource) {
      throw new GraphConfigurationError(`Edge resource not found: ${edgeResourceName}`);
    }

    const filter: Record<string, string> = {
      [this.config.edgeSourceField]: sourceId,
      [this.config.edgeTargetField]: targetId
    };

    if (label) {
      filter[this.config.edgeLabelField] = label;
    }

    return (edgeResource as unknown as { query: (filter: Record<string, string>) => Promise<EdgeRecord[]> }).query(filter);
  }

  override async onUninstall(): Promise<void> {
    for (const [resourceName] of this._resourceGraphNamespaces) {
      const resource = this.database.resources[resourceName]!;
      if (resource) {
        delete (resource as unknown as Record<string, unknown>).graph;
      }
    }
    this._resourceGraphNamespaces.clear();
  }

  getStats(): { vertexResources: string[]; edgeResources: string[]; directed: boolean; weighted: boolean } {
    return {
      vertexResources: this.config.vertices,
      edgeResources: this.config.edges,
      directed: this.config.directed,
      weighted: this.config.weighted
    };
  }
}

class MinHeap {
  private heap: HeapItem[];

  constructor() {
    this.heap = [];
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  insert(item: HeapItem): void {
    this.heap.push(item);
    this._bubbleUp(this.heap.length - 1);
  }

  extractMin(): HeapItem | null {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop()!;

    const min = this.heap[0]!;
    this.heap[0] = this.heap.pop()!;
    this._bubbleDown(0);
    return min;
  }

  private _bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[parentIndex]!.f <= this.heap[index]!.f) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index]!, this.heap[parentIndex]!];
      index = parentIndex;
    }
  }

  private _bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < length && this.heap[leftChild]!.f < this.heap[smallest]!.f) {
        smallest = leftChild;
      }
      if (rightChild < length && this.heap[rightChild]!.f < this.heap[smallest]!.f) {
        smallest = rightChild;
      }

      if (smallest === index) break;

      [this.heap[index], this.heap[smallest]] = [this.heap[smallest]!, this.heap[index]!];
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
