export type SupportedMethod = 'get' | 'list' | 'listIds' | 'getAll' | 'count' | 'page' | 'insert' | 'update' | 'delete' | 'deleteMany' | 'exists' | 'getMany' | 'content' | 'hasContent' | 'query' | 'getFromPartition' | 'setContent' | 'deleteContent' | 'replace';
export interface MiddlewareContext {
    resource: Resource;
    args: unknown[];
    method: string;
}
export type NextFunction = () => Promise<unknown>;
export type MiddlewareFunction = (ctx: MiddlewareContext, next: NextFunction) => Promise<unknown>;
export interface Resource {
    name: string;
    [method: string]: unknown;
}
export declare class ResourceMiddleware {
    static SUPPORTED_METHODS: SupportedMethod[];
    resource: Resource;
    private _middlewares;
    private _originalMethods;
    private _initialized;
    constructor(resource: Resource);
    init(): void;
    private _createDispatcher;
    use(method: string, fn: MiddlewareFunction): void;
    getMiddlewares(method: string): MiddlewareFunction[];
    isInitialized(): boolean;
    getMiddlewareCount(method: string): number;
    clearMiddlewares(method: string): void;
    clearAllMiddlewares(): void;
}
export default ResourceMiddleware;
//# sourceMappingURL=resource-middleware.class.d.ts.map