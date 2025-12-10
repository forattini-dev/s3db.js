export interface TreeErrorContext {
    code?: string;
    statusCode?: number;
    nodeId?: string;
    parentId?: string;
    reason?: string;
    [key: string]: unknown;
}
export declare class TreeError extends Error {
    context: TreeErrorContext;
    code: string;
    statusCode: number;
    constructor(message: string, context?: TreeErrorContext);
}
export declare class TreeConfigurationError extends TreeError {
    constructor(message: string, context?: TreeErrorContext);
}
export declare class NodeNotFoundError extends TreeError {
    constructor(nodeId: string, context?: TreeErrorContext);
}
export declare class InvalidParentError extends TreeError {
    constructor(nodeId: string, parentId: string, context?: TreeErrorContext);
}
export declare class RootNodeError extends TreeError {
    constructor(message: string, context?: TreeErrorContext);
}
export declare class TreeIntegrityError extends TreeError {
    constructor(message: string, context?: TreeErrorContext);
}
//# sourceMappingURL=errors.d.ts.map