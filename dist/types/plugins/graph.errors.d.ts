export interface GraphErrorContext {
    code?: string;
    statusCode?: number;
    retriable?: boolean;
    vertexId?: string;
    edgeId?: string;
    fromVertex?: string;
    toVertex?: string;
    [key: string]: unknown;
}
export declare class GraphError extends Error {
    context: GraphErrorContext;
    code: string;
    statusCode: number;
    retriable: boolean;
    constructor(message: string, context?: GraphErrorContext);
}
export declare class GraphConfigurationError extends GraphError {
    constructor(message: string, context?: GraphErrorContext);
}
export declare class VertexNotFoundError extends GraphError {
    constructor(vertexId: string, context?: GraphErrorContext);
}
export declare class EdgeNotFoundError extends GraphError {
    constructor(edgeId: string, context?: GraphErrorContext);
}
export declare class PathNotFoundError extends GraphError {
    constructor(fromVertex: string, toVertex: string, context?: GraphErrorContext);
}
export declare class CycleDetectedError extends GraphError {
    constructor(vertexId: string, context?: GraphErrorContext);
}
export declare class InvalidEdgeError extends GraphError {
    constructor(message: string, context?: GraphErrorContext);
}
//# sourceMappingURL=graph.errors.d.ts.map