import { ResourceError } from '../errors.js';

export type SupportedMethod =
  | 'get' | 'list' | 'listIds' | 'getAll' | 'count' | 'page'
  | 'insert' | 'update' | 'delete' | 'deleteMany' | 'exists' | 'getMany'
  | 'content' | 'hasContent' | 'query' | 'getFromPartition' | 'setContent' | 'deleteContent' | 'replace';

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

export class ResourceMiddleware {
  static SUPPORTED_METHODS: SupportedMethod[] = [
    'get', 'list', 'listIds', 'getAll', 'count', 'page',
    'insert', 'update', 'delete', 'deleteMany', 'exists', 'getMany',
    'content', 'hasContent', 'query', 'getFromPartition', 'setContent', 'deleteContent', 'replace'
  ];

  resource: Resource;
  private _middlewares: Map<string, MiddlewareFunction[]>;
  private _originalMethods: Map<string, (...args: unknown[]) => Promise<unknown>>;
  private _initialized: boolean;

  constructor(resource: Resource) {
    this.resource = resource;
    this._middlewares = new Map();
    this._originalMethods = new Map();
    this._initialized = false;
  }

  init(): void {
    if (this._initialized) return;

    for (const method of ResourceMiddleware.SUPPORTED_METHODS) {
      this._middlewares.set(method, []);

      if (!this._originalMethods.has(method) && typeof this.resource[method] === 'function') {
        const originalMethod = this.resource[method] as (...args: unknown[]) => Promise<unknown>;
        this._originalMethods.set(method, originalMethod.bind(this.resource));

        (this.resource as Record<string, unknown>)[method] = this._createDispatcher(method);
      }
    }

    this._initialized = true;
  }

  private _createDispatcher(method: string): (...args: unknown[]) => Promise<unknown> {
    const self = this;
    return async function (...args: unknown[]): Promise<unknown> {
      const ctx: MiddlewareContext = { resource: self.resource, args, method };
      let idx = -1;
      const stack = self._middlewares.get(method)!;

      const dispatch = async (i: number): Promise<unknown> => {
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
          return await stack[i]!(ctx, () => dispatch(i + 1));
        } else {
          return await self._originalMethods.get(method)!(...ctx.args);
        }
      };

      return await dispatch(0);
    };
  }

  use(method: string, fn: MiddlewareFunction): void {
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

    this._middlewares.get(method)!.push(fn);
  }

  getMiddlewares(method: string): MiddlewareFunction[] {
    return this._middlewares.get(method) || [];
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  getMiddlewareCount(method: string): number {
    const stack = this._middlewares.get(method);
    return stack ? stack.length : 0;
  }

  clearMiddlewares(method: string): void {
    if (this._middlewares.has(method)) {
      this._middlewares.set(method, []);
    }
  }

  clearAllMiddlewares(): void {
    for (const method of ResourceMiddleware.SUPPORTED_METHODS) {
      if (this._middlewares.has(method)) {
        this._middlewares.set(method, []);
      }
    }
  }
}

export default ResourceMiddleware;
