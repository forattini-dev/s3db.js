import { ResourceError } from "../errors.js";

/**
 * ResourceMiddleware manages the middleware dispatch chain for a Resource.
 * Middleware functions intercept method calls and can modify args or short-circuit execution.
 */
export class ResourceMiddleware {
    /**
     * Supported methods for middleware
     */
    static SUPPORTED_METHODS = [
        'get', 'list', 'listIds', 'getAll', 'count', 'page',
        'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
        'content', 'hasContent', 'query', 'getFromPartition', 'setContent', 'deleteContent', 'replace'
    ];

    /**
     * Create a new ResourceMiddleware instance
     * @param {Object} resource - Parent Resource instance
     */
    constructor(resource) {
        this.resource = resource;
        this._middlewares = new Map();
        this._originalMethods = new Map();
        this._initialized = false;
    }

    /**
     * Initialize middleware system by wrapping resource methods
     */
    init() {
        if (this._initialized) return;

        for (const method of ResourceMiddleware.SUPPORTED_METHODS) {
            this._middlewares.set(method, []);

            // Store original method if not already wrapped
            if (!this._originalMethods.has(method) && typeof this.resource[method] === 'function') {
                this._originalMethods.set(method, this.resource[method].bind(this.resource));

                // Replace method with middleware dispatcher
                this.resource[method] = this._createDispatcher(method);
            }
        }

        this._initialized = true;
    }

    /**
     * Create a middleware dispatcher for a method
     * @param {string} method - Method name
     * @returns {Function} Async dispatcher function
     * @private
     */
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
                } else {
                    // Final handler: call the original method
                    return await self._originalMethods.get(method)(...ctx.args);
                }
            };

            return await dispatch(0);
        };
    }

    /**
     * Add middleware for a specific method
     * @param {string} method - Method name
     * @param {Function} fn - Middleware function (ctx, next) => Promise
     * @throws {ResourceError} If method is not supported
     */
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

    /**
     * Get middleware stack for a method
     * @param {string} method - Method name
     * @returns {Array<Function>} Middleware functions
     */
    getMiddlewares(method) {
        return this._middlewares.get(method) || [];
    }

    /**
     * Check if middleware system is initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * Get count of middlewares for a method
     * @param {string} method - Method name
     * @returns {number}
     */
    getMiddlewareCount(method) {
        const stack = this._middlewares.get(method);
        return stack ? stack.length : 0;
    }

    /**
     * Clear all middlewares for a method
     * @param {string} method - Method name
     */
    clearMiddlewares(method) {
        if (this._middlewares.has(method)) {
            this._middlewares.set(method, []);
        }
    }

    /**
     * Clear all middlewares
     */
    clearAllMiddlewares() {
        for (const method of ResourceMiddleware.SUPPORTED_METHODS) {
            if (this._middlewares.has(method)) {
                this._middlewares.set(method, []);
            }
        }
    }
}
