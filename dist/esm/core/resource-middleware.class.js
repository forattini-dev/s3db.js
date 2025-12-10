import { ResourceError } from '../errors.js';
export class ResourceMiddleware {
    static SUPPORTED_METHODS = [
        'get', 'list', 'listIds', 'getAll', 'count', 'page',
        'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
        'content', 'hasContent', 'query', 'getFromPartition', 'setContent', 'deleteContent', 'replace'
    ];
    resource;
    _middlewares;
    _originalMethods;
    _initialized;
    constructor(resource) {
        this.resource = resource;
        this._middlewares = new Map();
        this._originalMethods = new Map();
        this._initialized = false;
    }
    init() {
        if (this._initialized)
            return;
        for (const method of ResourceMiddleware.SUPPORTED_METHODS) {
            this._middlewares.set(method, []);
            if (!this._originalMethods.has(method) && typeof this.resource[method] === 'function') {
                const originalMethod = this.resource[method];
                this._originalMethods.set(method, originalMethod.bind(this.resource));
                this.resource[method] = this._createDispatcher(method);
            }
        }
        this._initialized = true;
    }
    _createDispatcher(method) {
        const self = this;
        return async function (...args) {
            const ctx = { resource: self.resource, args, method };
            let idx = -1;
            const stack = self._middlewares.get(method);
            const dispatch = async (i) => {
                if (i <= idx) {
                    throw new ResourceError('Resource middleware next() called multiple times', {
                        resourceName: self.resource.name,
                        operation: method,
                        statusCode: 500,
                        retriable: false,
                        suggestion: 'Ensure each middleware awaits next() at most once.'
                    });
                }
                idx = i;
                if (i < stack.length) {
                    return await stack[i](ctx, () => dispatch(i + 1));
                }
                else {
                    return await self._originalMethods.get(method)(...ctx.args);
                }
            };
            return await dispatch(0);
        };
    }
    use(method, fn) {
        if (!this._initialized) {
            this.init();
        }
        if (!this._middlewares.has(method)) {
            throw new ResourceError(`No such method for middleware: ${method}`, {
                operation: 'useMiddleware',
                method,
                supportedMethods: ResourceMiddleware.SUPPORTED_METHODS
            });
        }
        this._middlewares.get(method).push(fn);
    }
    getMiddlewares(method) {
        return this._middlewares.get(method) || [];
    }
    isInitialized() {
        return this._initialized;
    }
    getMiddlewareCount(method) {
        const stack = this._middlewares.get(method);
        return stack ? stack.length : 0;
    }
    clearMiddlewares(method) {
        if (this._middlewares.has(method)) {
            this._middlewares.set(method, []);
        }
    }
    clearAllMiddlewares() {
        for (const method of ResourceMiddleware.SUPPORTED_METHODS) {
            if (this._middlewares.has(method)) {
                this._middlewares.set(method, []);
            }
        }
    }
}
export default ResourceMiddleware;
//# sourceMappingURL=resource-middleware.class.js.map