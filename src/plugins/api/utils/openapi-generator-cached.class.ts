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
    const components = {
      resources: Object.keys(this.database.resources).map(name => {
        const resource = this.database.resources[name]!;
        return {
          name,
          version: resource.config?.currentVersion || resource.version || 'v1',
          attributes: Object.keys(resource.attributes || {}).sort().join(',')
        };
      }),

      auth: {
        drivers: this.options.auth?.drivers?.map((d: { driver?: string }) => d.driver).sort() || [],
        pathRules: this.options.auth?.pathRules?.length || 0,
        pathAuth: !!this.options.auth?.pathAuth
      },

      resourceConfig: Object.keys(this.options.resources || {}).sort(),
      customRoutes: Object.keys(this.options.routes || {}).sort(),

      versionPrefix: this.options.versionPrefix,
      basePath: this.options.basePath || '',

      apiInfo: {
        title: this.options.title,
        version: this.options.version,
        description: this.options.description
      },

      appRoutes: this.app ? this.app.getRoutes().map((r: RouteMetadata) => ({
        method: r.method,
        path: r.path,
        description: r.description,
        operationId: r.operationId,
        tags: r.tags
      })) : []
    };

    const hash = createHash('sha256')
      .update(JSON.stringify(components))
      .digest('hex')
      .substring(0, 16);

    return hash;
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
