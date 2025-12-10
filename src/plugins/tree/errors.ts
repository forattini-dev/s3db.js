export interface TreeErrorContext {
  code?: string;
  statusCode?: number;
  nodeId?: string;
  parentId?: string;
  reason?: string;
  [key: string]: unknown;
}

export class TreeError extends Error {
  context: TreeErrorContext;
  code: string;
  statusCode: number;

  constructor(message: string, context: TreeErrorContext = {}) {
    super(message);
    this.name = 'TreeError';
    this.context = context;
    this.code = context.code || 'TREE_ERROR';
    this.statusCode = context.statusCode || 500;
  }
}

export class TreeConfigurationError extends TreeError {
  constructor(message: string, context: TreeErrorContext = {}) {
    super(message, { ...context, code: 'TREE_CONFIGURATION_ERROR', statusCode: 400 });
    this.name = 'TreeConfigurationError';
  }
}

export class NodeNotFoundError extends TreeError {
  constructor(nodeId: string, context: TreeErrorContext = {}) {
    super(`Node not found: ${nodeId}`, {
      ...context,
      code: 'NODE_NOT_FOUND',
      statusCode: 404,
      nodeId
    });
    this.name = 'NodeNotFoundError';
  }
}

export class InvalidParentError extends TreeError {
  constructor(nodeId: string, parentId: string, context: TreeErrorContext = {}) {
    const reason = context.reason || 'would create a cycle or invalid structure';
    super(`Cannot set ${parentId} as parent of ${nodeId}: ${reason}`, {
      ...context,
      code: 'INVALID_PARENT',
      statusCode: 400,
      nodeId,
      parentId
    });
    this.name = 'InvalidParentError';
  }
}

export class RootNodeError extends TreeError {
  constructor(message: string, context: TreeErrorContext = {}) {
    super(message, { ...context, code: 'ROOT_NODE_ERROR', statusCode: 400 });
    this.name = 'RootNodeError';
  }
}

export class TreeIntegrityError extends TreeError {
  constructor(message: string, context: TreeErrorContext = {}) {
    super(message, { ...context, code: 'TREE_INTEGRITY_ERROR', statusCode: 500 });
    this.name = 'TreeIntegrityError';
  }
}
