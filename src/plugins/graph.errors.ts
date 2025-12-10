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

export class GraphError extends Error {
  context: GraphErrorContext;
  code: string;
  statusCode: number;
  retriable: boolean;

  constructor(message: string, context: GraphErrorContext = {}) {
    super(message);
    this.name = 'GraphError';
    this.context = context;
    this.code = context.code || 'GRAPH_ERROR';
    this.statusCode = context.statusCode || 500;
    this.retriable = context.retriable ?? false;
  }
}

export class GraphConfigurationError extends GraphError {
  constructor(message: string, context: GraphErrorContext = {}) {
    super(message, { ...context, code: 'GRAPH_CONFIGURATION_ERROR', statusCode: 400 });
    this.name = 'GraphConfigurationError';
  }
}

export class VertexNotFoundError extends GraphError {
  constructor(vertexId: string, context: GraphErrorContext = {}) {
    super(`Vertex not found: ${vertexId}`, {
      ...context,
      code: 'VERTEX_NOT_FOUND',
      statusCode: 404,
      vertexId
    });
    this.name = 'VertexNotFoundError';
  }
}

export class EdgeNotFoundError extends GraphError {
  constructor(edgeId: string, context: GraphErrorContext = {}) {
    super(`Edge not found: ${edgeId}`, {
      ...context,
      code: 'EDGE_NOT_FOUND',
      statusCode: 404,
      edgeId
    });
    this.name = 'EdgeNotFoundError';
  }
}

export class PathNotFoundError extends GraphError {
  constructor(fromVertex: string, toVertex: string, context: GraphErrorContext = {}) {
    super(`No path found from ${fromVertex} to ${toVertex}`, {
      ...context,
      code: 'PATH_NOT_FOUND',
      statusCode: 404,
      fromVertex,
      toVertex
    });
    this.name = 'PathNotFoundError';
  }
}

export class CycleDetectedError extends GraphError {
  constructor(vertexId: string, context: GraphErrorContext = {}) {
    super(`Cycle detected at vertex: ${vertexId}`, {
      ...context,
      code: 'CYCLE_DETECTED',
      statusCode: 400,
      vertexId
    });
    this.name = 'CycleDetectedError';
  }
}

export class InvalidEdgeError extends GraphError {
  constructor(message: string, context: GraphErrorContext = {}) {
    super(message, { ...context, code: 'INVALID_EDGE', statusCode: 400 });
    this.name = 'InvalidEdgeError';
  }
}
