import { Plugin } from './plugin.class.js';
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
export declare class GraphPlugin extends Plugin {
    config: GraphConfig;
    private _resourceGraphNamespaces;
    constructor(options?: GraphPluginOptions);
    onInstall(): Promise<void>;
    private _createGraphResources;
    private _installResourceMethods;
    private _createGraphNamespace;
    private _getEdgeResource;
    private _getVertexEdges;
    private _getNeighbors;
    private _getDegree;
    private _findShortestPath;
    private _getPathLength;
    private _reconstructPath;
    private _traverse;
    private _createEdge;
    private _createEdgeInResource;
    private _removeEdge;
    private _removeEdgeFromResource;
    private _isConnected;
    private _getEdgesByLabel;
    private _getEdgesBySource;
    private _getEdgesByTarget;
    private _getEdgesBetween;
    onUninstall(): Promise<void>;
    getStats(): {
        vertexResources: string[];
        edgeResources: string[];
        directed: boolean;
        weighted: boolean;
    };
}
export { GraphError, GraphConfigurationError, VertexNotFoundError, PathNotFoundError, InvalidEdgeError } from './graph.errors.js';
//# sourceMappingURL=graph.plugin.d.ts.map