import { generateOpenAPISpec } from './openapi-generator.js';
import { createHash } from 'crypto';
export class OpenAPIGeneratorCached {
    database;
    app;
    options;
    logger;
    cache;
    cacheKey;
    constructor({ database, app = null, options, logger = null }) {
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
    generate() {
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
        this.cache = generateOpenAPISpec(this.database, { ...this.options, app: this.app });
        this.cacheKey = currentKey;
        if (this.options.logLevel && this.logger) {
            const duration = Date.now() - startTime;
            this.logger.info(`[OpenAPIGenerator] Generated spec in ${duration}ms`);
        }
        return this.cache;
    }
    generateCacheKey() {
        const components = {
            resources: Object.keys(this.database.resources).map(name => {
                const resource = this.database.resources[name];
                return {
                    name,
                    version: resource.config?.currentVersion || resource.version || 'v1',
                    attributes: Object.keys(resource.attributes || {}).sort().join(',')
                };
            }),
            auth: {
                drivers: this.options.auth?.drivers?.map((d) => d.driver).sort() || [],
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
            appRoutes: this.app ? this.app.getRoutes().map((r) => ({
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
    invalidate() {
        this.cache = null;
        this.cacheKey = null;
        if (this.options.logLevel && this.logger) {
            this.logger.info('[OpenAPIGenerator] Cache manually invalidated');
        }
    }
    getStats() {
        return {
            cached: !!this.cache,
            cacheKey: this.cacheKey,
            size: this.cache ? JSON.stringify(this.cache).length : 0
        };
    }
}
//# sourceMappingURL=openapi-generator-cached.class.js.map