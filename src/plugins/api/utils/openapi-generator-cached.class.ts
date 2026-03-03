import { generateOpenAPISpec } from './openapi-generator.js';
import type { OpenAPISpec, OpenAPIGeneratorConfig } from './openapi-generator.js';
import { createHash } from 'crypto';

export interface ApiAppLike {
  getRoutes(): RouteMetadata[];
}

export interface RouteMetadata {
  method: string;
  path: string;
  description?: string;
  operationId?: string;
  tags?: string[];
}

export interface DatabaseLike {
  resources: Record<string, ResourceLike>;
}

export interface ResourceLike {
  name: string;
  config?: {
    currentVersion?: string;
    [key: string]: unknown;
  };
  version?: string;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CachedGeneratorOptions extends OpenAPIGeneratorConfig {
  logLevel?: string;
}

export interface CacheStats {
  cached: boolean;
  cacheKey: string | null;
  size: number;
}

export interface LoggerLike {
  info(message: string): void;
}

export class OpenAPIGeneratorCached {
  private database: DatabaseLike;
  private app: ApiAppLike | null;
  private options: CachedGeneratorOptions;
  private logger: LoggerLike | null;
  private cache: OpenAPISpec | null;
  private cacheKey: string | null;

  constructor({ database, app = null, options, logger = null }: {
    database: DatabaseLike;
    app?: ApiAppLike | null;
    options: CachedGeneratorOptions;
    logger?: LoggerLike | null;
  }) {
    this.database = database;
    this.app = app;
    this.options = options;
    this.logger = logger;

    this.cache = null;
    this.cacheKey = null;

    if (this.logger && options.logLevel) {
      this.logger.info('[OpenAPIGenerator] Caching enabled');
    }
  }

  generate(): OpenAPISpec {
    const currentKey = this.generateCacheKey();

    if (this.cacheKey === currentKey && this.cache) {
      if (this.logger && this.options.logLevel) {
        this.logger.info('[OpenAPIGenerator] Cache HIT (0ms)');
      }
      return this.cache;
    }

    if (this.logger && this.options.logLevel) {
      const reason = !this.cache ? 'initial' : 'invalidated';
      this.logger.info(`[OpenAPIGenerator] Cache MISS (${reason})`);
    }

    const startTime = Date.now();
    this.cache = generateOpenAPISpec(this.database as unknown as Parameters<typeof generateOpenAPISpec>[0], { ...this.options, app: this.app });
    this.cacheKey = currentKey;

    if (this.options.logLevel && this.logger) {
      const duration = Date.now() - startTime;
      this.logger.info(`[OpenAPIGenerator] Generated spec in ${duration}ms`);
    }

    return this.cache;
  }

  private generateCacheKey(): string {
    const resourcesSignature = Object.entries(this.database.resources || {})
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
      .map(([name, resource]) => ({
        name,
        version: resource.config?.currentVersion || resource.version || 'v1',
        config: this.normalizeForHash(resource.config || {}),
        attributes: this.normalizeForHash(resource.attributes || {}),
        schema: this.normalizeForHash((resource as ResourceLike & { $schema?: Record<string, unknown> }).$schema || {}),
        relations: this.normalizeForHash((resource as ResourceLike & { _relations?: Record<string, unknown> })._relations || {})
      }));

    const optionsSignature = this.normalizeForHash({
      title: this.options.title,
      version: this.options.version,
      description: this.options.description,
      serverUrl: this.options.serverUrl,
      auth: this.options.auth || {},
      resources: this.options.resources || {},
      routes: this.options.routes || {},
      versionPrefix: this.options.versionPrefix,
      basePath: this.options.basePath || ''
    });

    const appRoutesSignature = this.app
      ? this.app.getRoutes()
        .map((route: RouteMetadata) => ({
          method: route.method,
          path: route.path,
          description: route.description,
          operationId: route.operationId,
          tags: route.tags || []
        }))
        .sort((left, right) => {
          const leftKey = `${left.method}:${left.path}`;
          const rightKey = `${right.method}:${right.path}`;
          return leftKey.localeCompare(rightKey);
        })
      : [];

    const components = {
      resources: resourcesSignature,
      options: optionsSignature,
      appRoutes: this.normalizeForHash(appRoutesSignature)
    };

    const hash = createHash('sha256')
      .update(JSON.stringify(components))
      .digest('hex')
      .substring(0, 16);

    return hash;
  }

  private normalizeForHash(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'function') {
      const fn = value as Function;
      return `[Function:${fn.name || 'anonymous'}]`;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map(item => this.normalizeForHash(item));
    }

    if (typeof value === 'object') {
      const input = value as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};
      const keys = Object.keys(input).sort((left, right) => left.localeCompare(right));
      for (const key of keys) {
        normalized[key] = this.normalizeForHash(input[key]);
      }
      return normalized;
    }

    return value;
  }

  invalidate(): void {
    this.cache = null;
    this.cacheKey = null;

    if (this.options.logLevel && this.logger) {
      this.logger.info('[OpenAPIGenerator] Cache manually invalidated');
    }
  }

  getStats(): CacheStats {
    return {
      cached: !!this.cache,
      cacheKey: this.cacheKey,
      size: this.cache ? JSON.stringify(this.cache).length : 0
    };
  }
}
