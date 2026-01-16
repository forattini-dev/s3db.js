/**
 * API Server - Hono-based HTTP server for s3db.js API Plugin
 *
 * Manages HTTP server lifecycle and delegates routing/middleware concerns
 * to dedicated components (MiddlewareChain, Router, HealthManager).
 */
import { networkInterfaces } from 'node:os';
import { errorHandler } from '../shared/error-handler.js';
import * as formatter from '../shared/response-formatter.js';
import { createOIDCHandler } from './auth/oidc-auth.js';
import { createSessionStore } from './concerns/session-store-factory.js';
import { FailbanManager } from '../../concerns/failban-manager.js';
import { bumpProcessMaxListeners } from '../../concerns/process-max-listeners.js';
import { validatePathAuth } from './utils/path-matcher.js';
import { ApiEventEmitter } from './concerns/event-emitter.js';
import { MetricsCollector } from './concerns/metrics-collector.js';
import { MiddlewareChain } from './server/middleware-chain.class.js';
import { Router } from './server/router.class.js';
import { HealthManager } from './server/health-manager.class.js';
import { OpenAPIGeneratorCached } from './utils/openapi-generator-cached.class.js';
import { AuthStrategyFactory } from './auth/strategies/factory.class.js';
import { applyBasePath } from './utils/base-path.js';
export class ApiServer {
    options;
    logger;
    app = null;
    server = null;
    isRunning = false;
    initialized = false;
    oidcMiddleware = null;
    middlewareChain = null;
    router = null;
    healthManager = null;
    inFlightRequests = new Set();
    acceptingRequests = true;
    events;
    metrics;
    failban = null;
    relationsPlugin;
    openApiGenerator;
    Hono = null;
    serve = null;
    swaggerUI = null;
    cors = null;
    ApiApp = null;
    constructor(options = {}) {
        this.options = {
            port: options.port || 3000,
            host: options.host || '0.0.0.0',
            database: options.database,
            namespace: options.namespace || null,
            basePath: options.basePath || '',
            versionPrefix: options.versionPrefix,
            resources: options.resources || {},
            routes: options.routes || {},
            templates: options.templates || { enabled: false, engine: 'jsx' },
            middlewares: options.middlewares || [],
            cors: options.cors || { enabled: false },
            security: options.security || { enabled: false },
            sessionTracking: options.sessionTracking || { enabled: false },
            requestId: options.requestId || { enabled: false },
            httpLogger: options.httpLogger || { enabled: false },
            events: options.events || { enabled: false },
            metrics: options.metrics || { enabled: false },
            failban: options.failban || { enabled: false },
            static: Array.isArray(options.static) ? options.static : [],
            health: options.health ?? { enabled: true },
            logLevel: options.logLevel || 'info',
            auth: options.auth || {},
            docsEnabled: (options.docs?.enabled !== false) && (options.docsEnabled !== false),
            docsUI: options.docs?.ui || options.docsUI || 'redoc',
            docsCsp: options.docsCsp || options.docs?.csp || null,
            apiTitle: options.docs?.title || options.apiTitle || 's3db.js API',
            apiVersion: options.docs?.version || options.apiVersion || '1.0.0',
            apiDescription: options.docs?.description || options.apiDescription || 'Auto-generated REST API for s3db.js resources',
            maxBodySize: options.maxBodySize || 10 * 1024 * 1024,
            startupBanner: options.startupBanner !== false,
            rootRoute: options.rootRoute,
            compression: options.compression || { enabled: false }
        };
        this.logger = options.logger;
        this.events = new ApiEventEmitter({
            enabled: this.options.events?.enabled !== false,
            logLevel: this.options.events?.logLevel || this.options.logLevel,
            maxListeners: this.options.events?.maxListeners
        });
        this.metrics = new MetricsCollector({
            enabled: this.options.metrics?.enabled !== false,
            logLevel: this.options.metrics?.logLevel || this.options.logLevel,
            maxPathsTracked: this.options.metrics?.maxPathsTracked,
            resetInterval: this.options.metrics?.resetInterval,
            format: (this.options.metrics?.format || 'json')
        });
        if (this.options.metrics?.enabled && this.options.events?.enabled !== false) {
            this._setupMetricsEventListeners();
        }
        if (this.options.failban?.enabled) {
            this.failban = new FailbanManager({
                database: this.options.database,
                namespace: this.options.namespace,
                enabled: true,
                maxViolations: this.options.failban.maxViolations || 3,
                violationWindow: this.options.failban.violationWindow || 3600000,
                banDuration: this.options.failban.banDuration || 86400000,
                whitelist: this.options.failban.whitelist || ['127.0.0.1', '::1'],
                blacklist: this.options.failban.blacklist || [],
                persistViolations: this.options.failban.persistViolations !== false,
                logLevel: (this.options.failban.logLevel || this.options.logLevel),
                geo: this.options.failban.geo || {},
                resourceNames: this.options.failban.resourceNames,
                logger: this.logger
            });
        }
        this.relationsPlugin = this.options.database?.pluginRegistry?.relation ||
            this.options.database?.pluginRegistry?.RelationPlugin ||
            null;
        const resolvedHost = (this.options.host || 'localhost') === '0.0.0.0'
            ? 'localhost'
            : (this.options.host || 'localhost');
        this.openApiGenerator = new OpenAPIGeneratorCached({
            database: this.options.database,
            app: this.app,
            logger: this.logger,
            options: {
                auth: this.options.auth,
                resources: this.options.resources,
                routes: this.options.routes,
                versionPrefix: this.options.versionPrefix,
                basePath: this.options.basePath,
                title: this.options.apiTitle,
                version: this.options.apiVersion,
                description: this.options.apiDescription,
                serverUrl: `http://${resolvedHost}:${this.options.port}`,
                logLevel: this.options.logLevel
            }
        });
    }
    async start() {
        if (this.isRunning) {
            if (this.options.logLevel) {
                this.logger.warn('Server is already running');
            }
            return;
        }
        if (!this.initialized) {
            const { Hono } = await import('hono');
            const { serve } = await import('@hono/node-server');
            const { swaggerUI } = await import('@hono/swagger-ui');
            const { cors } = await import('hono/cors');
            const { ApiApp } = await import('./app.class.js');
            this.Hono = Hono;
            this.serve = serve;
            this.swaggerUI = swaggerUI;
            this.cors = cors;
            this.ApiApp = ApiApp;
            this.app = new ApiApp({
                db: this.options.database,
                resources: this.options.database?.resources
            });
            if (this.failban) {
                await this.failban.initialize();
            }
            this._registerMetricsPluginRoute();
            this.middlewareChain = new MiddlewareChain({
                requestId: this.options.requestId,
                cors: this.options.cors,
                security: this.options.security,
                sessionTracking: this.options.sessionTracking,
                middlewares: this.options.middlewares,
                templates: this.options.templates,
                maxBodySize: this.options.maxBodySize || 10 * 1024 * 1024,
                failban: this.failban,
                events: this.events,
                logLevel: this.options.logLevel,
                logger: this.logger,
                httpLogger: this.options.httpLogger,
                database: this.options.database,
                inFlightRequests: this.inFlightRequests,
                acceptingRequests: () => this.acceptingRequests,
                corsMiddleware: this.cors
            });
            this.middlewareChain.apply(this.app);
            const oidcDriver = this.options.auth?.drivers?.find((d) => d.driver === 'oidc');
            if (oidcDriver) {
                await this._setupOIDCRoutes(oidcDriver.config);
            }
            const authMiddleware = await this._createAuthMiddleware();
            this._setupDocumentationRoutes();
            if (this.options.health?.enabled !== false) {
                this.healthManager = new HealthManager({
                    database: this.options.database,
                    healthConfig: this.options.health,
                    logLevel: this.options.logLevel,
                    logger: this.logger
                });
                this.healthManager.register(this.app);
            }
            this.router = new Router({
                database: this.options.database,
                resources: this.options.resources,
                routes: this.options.routes,
                versionPrefix: this.options.versionPrefix,
                basePath: this.options.basePath,
                auth: this.options.auth,
                static: this.options.static,
                failban: this.failban,
                metrics: this.metrics,
                relationsPlugin: this.relationsPlugin,
                authMiddleware: authMiddleware,
                logLevel: this.options.logLevel,
                logger: this.logger,
                Hono: this.Hono,
                apiTitle: this.options.apiTitle,
                apiDescription: this.options.apiDescription,
                docsEnabled: this.options.docsEnabled,
                rootRoute: this.options.rootRoute
            });
            this.router.mount(this.app, this.events);
            this.app.onError((err, c) => errorHandler(err, c));
            this.app.notFound((c) => {
                const response = formatter.error('Route not found', {
                    status: 404,
                    code: 'NOT_FOUND',
                    details: {
                        path: c.req.path,
                        method: c.req.method
                    }
                });
                return c.json(response, 404);
            });
            this.initialized = true;
        }
        const { port, host } = this.options;
        let fetchHandler = this.app.fetch;
        if (this.options.compression?.enabled) {
            const { threshold = 1024 } = this.options.compression;
            const { gzipSync, deflateSync } = await import('node:zlib');
            const baseFetch = this.app.fetch;
            fetchHandler = async (req, env, ctx) => {
                const res = await baseFetch(req, env, ctx);
                const existingEncoding = res.headers.get('content-encoding');
                if (existingEncoding)
                    return res;
                const acceptEncoding = req.headers.get('accept-encoding') || '';
                const wantsGzip = acceptEncoding.includes('gzip');
                const wantsDeflate = acceptEncoding.includes('deflate');
                if (!wantsGzip && !wantsDeflate)
                    return res;
                const contentType = res.headers.get('content-type') || '';
                const isTextLike = contentType.startsWith('text/') || contentType.includes('json');
                if (!isTextLike)
                    return res;
                const source = typeof res.clone === 'function' ? res.clone() : res;
                const buffer = Buffer.from(await source.arrayBuffer());
                if (buffer.length < threshold) {
                    if (source === res) {
                        const headers = new Headers(res.headers);
                        return new Response(buffer, {
                            status: res.status,
                            statusText: res.statusText,
                            headers
                        });
                    }
                    return res;
                }
                const encoding = wantsGzip ? 'gzip' : 'deflate';
                const compressed = encoding === 'gzip' ? gzipSync(buffer) : deflateSync(buffer);
                const headers = new Headers(res.headers);
                headers.set('Content-Encoding', encoding);
                headers.set('Vary', 'Accept-Encoding');
                headers.delete('Content-Length');
                return new Response(new Uint8Array(compressed), {
                    status: res.status,
                    statusText: res.statusText,
                    headers
                });
            };
        }
        return new Promise((resolve, reject) => {
            try {
                this.server = this.serve({
                    fetch: fetchHandler,
                    port,
                    hostname: host,
                    keepAliveTimeout: 65000,
                    headersTimeout: 66000
                }, (info) => {
                    this.isRunning = true;
                    if (this.options.logLevel) {
                        this.logger.info({ address: info.address, port: info.port }, 'Server listening');
                    }
                    this._printStartupBanner(info);
                    const shutdownHandler = async (signal) => {
                        if (this.options.logLevel) {
                            this.logger.info({ signal }, 'Received shutdown signal');
                        }
                        try {
                            await this.shutdown({ timeout: 30000 });
                            process.exit(0);
                        }
                        catch (err) {
                            if (this.options.logLevel) {
                                this.logger.error({ error: err.message }, 'Error during shutdown');
                            }
                            process.exit(1);
                        }
                    };
                    bumpProcessMaxListeners(2);
                    process.once('SIGTERM', () => shutdownHandler('SIGTERM'));
                    process.once('SIGINT', () => shutdownHandler('SIGINT'));
                    resolve();
                });
            }
            catch (err) {
                reject(err);
            }
        });
    }
    async stop() {
        if (!this.isRunning) {
            if (this.options.logLevel) {
                this.logger.warn('Server is not running');
            }
            return;
        }
        if (this.server && typeof this.server.close === 'function') {
            await new Promise((resolve) => {
                this.server.close(() => {
                    this.isRunning = false;
                    if (this.options.logLevel) {
                        this.logger.info('Server stopped');
                    }
                    resolve();
                });
            });
        }
        else {
            this.isRunning = false;
            if (this.options.logLevel) {
                this.logger.info('Server stopped');
            }
        }
        if (this.metrics) {
            this.metrics.stop();
        }
        if (this.failban) {
            await this.failban.cleanup();
        }
        if (this.oidcMiddleware && typeof this.oidcMiddleware.destroy === 'function') {
            this.oidcMiddleware.destroy();
        }
    }
    getInfo() {
        return {
            isRunning: this.isRunning,
            port: this.options.port,
            host: this.options.host,
            resources: Object.keys(this.options.database?.resources || {}).length
        };
    }
    getApp() {
        return this.app;
    }
    stopAcceptingRequests() {
        this.acceptingRequests = false;
        if (this.options.logLevel) {
            this.logger.info('Stopped accepting new requests');
        }
    }
    _registerMetricsPluginRoute() {
        const metricsPlugin = this.options.database?.pluginRegistry?.metrics ||
            this.options.database?.pluginRegistry?.MetricsPlugin;
        if (!metricsPlugin)
            return;
        const config = metricsPlugin.config;
        if (!config?.prometheus?.enabled)
            return;
        const mode = config.prometheus.mode;
        if (mode !== 'integrated' && mode !== 'auto')
            return;
        const path = config.prometheus.path || '/metrics';
        const enforceIpAllowlist = config.prometheus.enforceIpAllowlist;
        const ipAllowlist = config.prometheus.ipAllowlist || [];
        this.app.get(path, async (c) => {
            if (enforceIpAllowlist) {
                const { isIpAllowed, getClientIp } = await import('../concerns/ip-allowlist.js');
                const clientIp = getClientIp(c);
                if (!clientIp || !isIpAllowed(clientIp, ipAllowlist)) {
                    if (this.options.logLevel) {
                        this.logger.warn({ clientIp: clientIp || 'unknown' }, 'Blocked /metrics request from unauthorized IP');
                    }
                    return c.text('Forbidden', 403);
                }
            }
            try {
                const metrics = await metricsPlugin.getPrometheusMetrics();
                return c.text(metrics, 200, {
                    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
                });
            }
            catch (err) {
                if (this.options.logLevel) {
                    this.logger.error({ error: err.message }, 'Error generating Prometheus metrics');
                }
                return c.text('Internal Server Error', 500);
            }
        });
        if (this.options.logLevel) {
            const ipFilter = enforceIpAllowlist ? ` (IP allowlist: ${ipAllowlist.length} ranges)` : ' (no IP filtering)';
            this.logger.debug({ path, ipFilter, ipAllowlistSize: ipAllowlist.length }, 'Registered MetricsPlugin route');
        }
    }
    async waitForRequestsToFinish({ timeout = 30000 } = {}) {
        const startTime = Date.now();
        while (this.inFlightRequests.size > 0) {
            const elapsed = Date.now() - startTime;
            if (elapsed >= timeout) {
                if (this.options.logLevel) {
                    this.logger.warn({ inFlightCount: this.inFlightRequests.size }, 'Timeout waiting for in-flight requests');
                }
                return false;
            }
            if (this.options.logLevel) {
                this.logger.debug({ inFlightCount: this.inFlightRequests.size }, 'Waiting for in-flight requests');
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (this.options.logLevel) {
            this.logger.info('All requests finished');
        }
        return true;
    }
    async shutdown({ timeout = 30000 } = {}) {
        if (!this.isRunning) {
            if (this.options.logLevel) {
                this.logger.warn('Server is not running');
            }
            return;
        }
        if (this.options.logLevel) {
            this.logger.info('Initiating graceful shutdown');
        }
        this.stopAcceptingRequests();
        const finished = await this.waitForRequestsToFinish({ timeout });
        if (!finished) {
            if (this.options.logLevel) {
                this.logger.warn({ inFlightCount: this.inFlightRequests.size }, 'Some requests did not finish in time');
            }
        }
        if (this.server) {
            await new Promise((resolve, reject) => {
                this.server.close((err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        }
        this.isRunning = false;
        if (this.options.logLevel) {
            this.logger.info('Shutdown complete');
        }
    }
    _setupMetricsEventListeners() {
        this.events.on('request:end', (data) => {
            this.metrics.recordRequest({
                method: data.method,
                path: data.path,
                status: data.status,
                duration: data.duration
            });
        });
        this.events.on('request:error', (data) => {
            this.metrics.recordError({
                error: data.error.message,
                type: 'request'
            });
        });
        this.events.on('auth:success', (data) => {
            this.metrics.recordAuth({
                success: true,
                method: data.method
            });
        });
        this.events.on('auth:failure', (data) => {
            this.metrics.recordAuth({
                success: false,
                method: data.allowedMethods?.[0] || 'unknown'
            });
        });
        this.events.on('resource:created', (data) => {
            this.metrics.recordResourceOperation({
                action: 'created',
                resource: data.resource
            });
        });
        this.events.on('resource:updated', (data) => {
            this.metrics.recordResourceOperation({
                action: 'updated',
                resource: data.resource
            });
        });
        this.events.on('resource:deleted', (data) => {
            this.metrics.recordResourceOperation({
                action: 'deleted',
                resource: data.resource
            });
        });
        this.events.on('user:created', () => {
            this.metrics.recordUserEvent({ action: 'created' });
        });
        this.events.on('user:login', () => {
            this.metrics.recordUserEvent({ action: 'login' });
        });
        if (this.options.logLevel) {
            this.logger.debug('Metrics event listeners configured');
        }
    }
    _setupDocumentationRoutes() {
        if (this.options.logLevel) {
            this.logger.debug({ docsEnabled: this.options.docsEnabled, docsUI: this.options.docsUI }, 'Setting up documentation routes');
        }
        const basePath = this.options.basePath || '';
        const openApiPath = applyBasePath(basePath, '/openapi.json');
        const docsPath = applyBasePath(basePath, '/docs');
        if (this.options.logLevel) {
            this.logger.debug({ docsPath, openApiPath }, 'Documentation paths configured');
        }
        if (this.options.docsEnabled) {
            if (this.options.logLevel) {
                this.logger.debug({ openApiPath }, 'Registering OpenAPI route');
            }
            this.app.get(openApiPath, (c) => {
                if (this.options.logLevel) {
                    this.logger.debug('OpenAPI route hit');
                }
                const spec = this.openApiGenerator.generate();
                return c.json(spec);
            });
            if (this.options.logLevel) {
                this.logger.debug('OpenAPI route registered');
            }
            if (this.options.docsUI === 'swagger') {
                if (this.options.logLevel) {
                    this.logger.debug({ docsPath }, 'Registering Swagger UI');
                }
                const swaggerHandler = this.swaggerUI({ url: openApiPath });
                this.app.get(docsPath, (c) => {
                    let cspHeader = this.options.docsCsp;
                    if (!cspHeader) {
                        cspHeader = [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline'",
                            "style-src 'self' 'unsafe-inline'",
                            "img-src 'self' data: https:",
                            "font-src 'self'",
                            "connect-src 'self'"
                        ].join('; ');
                    }
                    const res = swaggerHandler(c, async () => { });
                    if (res?.headers) {
                        res.headers.set('Content-Security-Policy', cspHeader);
                        res.headers.delete('Content-Security-Policy-Report-Only');
                    }
                    return res;
                });
            }
            else {
                if (this.options.logLevel) {
                    this.logger.debug({ docsPath }, 'Registering Redoc UI');
                }
                this.app.get(docsPath, (c) => {
                    if (this.options.logLevel) {
                        this.logger.debug('Redoc docs route hit');
                    }
                    const redocCdn = 'https://cdn.redoc.ly';
                    const fontsCss = 'https://fonts.googleapis.com';
                    const fontsGstatic = 'https://fonts.gstatic.com';
                    let cspHeader = this.options.docsCsp;
                    if (!cspHeader) {
                        cspHeader = [
                            "default-src 'self'",
                            `script-src 'self' 'unsafe-inline' ${redocCdn}`,
                            `script-src-elem 'self' 'unsafe-inline' ${redocCdn}`,
                            `style-src 'self' 'unsafe-inline' ${redocCdn} ${fontsCss}`,
                            "img-src 'self' data: https:",
                            `font-src 'self' ${fontsGstatic}`,
                            "connect-src 'self'"
                        ].join('; ');
                    }
                    const html = [
                        '<!DOCTYPE html>',
                        '<html lang="en">',
                        '<head>',
                        '  <meta charset="UTF-8">',
                        '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
                        '  <title>' + String(this.options.apiTitle || 's3db.js API') + ' - API Documentation</title>',
                        '  <style>',
                        '    body { margin: 0; padding: 0; }',
                        '  </style>',
                        '</head>',
                        '<body>',
                        '  <redoc spec-url="' + String(openApiPath) + '"></redoc>',
                        '  <script src="https://cdn.redoc.ly/redoc/v2.5.1/bundles/redoc.standalone.js"></script>',
                        '</body>',
                        '</html>'
                    ].join('\n');
                    const res = c.html(html);
                    if (res?.headers) {
                        res.headers.set('Content-Security-Policy', cspHeader);
                        res.headers.delete('Content-Security-Policy-Report-Only');
                    }
                    return res;
                });
                if (this.options.logLevel) {
                    this.logger.debug('Redoc UI route registered');
                }
            }
            if (this.options.logLevel) {
                this.logger.debug('Documentation routes setup complete');
            }
        }
    }
    async _setupOIDCRoutes(config) {
        this.logger.debug({ hasConfig: !!config }, '[API] Setting up OIDC routes');
        const { database, auth } = this.options;
        const authResource = database?.resources?.[auth?.resource || ''];
        if (!authResource) {
            this.logger.error({ resource: auth?.resource }, 'Auth resource not found for OIDC');
            return;
        }
        let sessionStore = null;
        if (config.sessionStore) {
            try {
                if (config.sessionStore.driver) {
                    sessionStore = await createSessionStore(config.sessionStore, database);
                    if (this.options.logLevel) {
                        this.logger.info({ driver: config.sessionStore.driver }, 'Session store initialized');
                    }
                }
                else {
                    sessionStore = config.sessionStore;
                }
            }
            catch (err) {
                this.logger.error({ error: err.message }, 'Failed to create session store');
                throw err;
            }
            config.sessionStore = sessionStore;
        }
        const oidcHandler = await createOIDCHandler(config, this.app, database, this.events);
        this.oidcMiddleware = oidcHandler.middleware;
        if (this.options.logLevel && oidcHandler.routes) {
            const routes = Object.entries(oidcHandler.routes).map(([path, description]) => ({ path, description }));
            this.logger.info({ routes }, 'Mounted OIDC routes');
        }
    }
    async _createAuthMiddleware() {
        const { database, auth } = this.options;
        const { drivers, resource: defaultResourceName, pathAuth, pathRules } = auth || {};
        if (!drivers || drivers.length === 0) {
            return null;
        }
        const authResource = database?.resources?.[defaultResourceName || ''];
        if (!authResource) {
            this.logger.error({ resource: defaultResourceName }, 'Auth resource not found for middleware');
            return null;
        }
        if (pathAuth) {
            try {
                validatePathAuth(pathAuth);
            }
            catch (err) {
                this.logger.error({ error: err.message }, 'Invalid pathAuth configuration');
                throw err;
            }
        }
        const strategy = AuthStrategyFactory.create({
            drivers,
            authResource: authResource,
            oidcMiddleware: this.oidcMiddleware || null,
            database: database,
            pathRules: pathRules,
            pathAuth,
            events: this.events,
            logLevel: this.options.logLevel || 'info',
            logger: this.logger
        });
        try {
            return await strategy.createMiddleware();
        }
        catch (err) {
            this.logger.error({ error: err.message }, 'Failed to create auth middleware');
            throw err;
        }
    }
    _printStartupBanner(info) {
        if (this.options.startupBanner === false) {
            return;
        }
        const version = this.options.database?.s3dbVersion || 'latest';
        const basePath = this.options.basePath || '';
        const localHost = this._resolveLocalHostname();
        const localUrl = this._buildUrl(localHost, info.port, basePath);
        const networkHost = this._resolveNetworkHostname();
        const networkUrl = networkHost ? this._buildUrl(networkHost, info.port, basePath) : null;
        const docsPath = this.options.docsEnabled !== false
            ? (basePath ? `${basePath}/docs` : '/docs')
            : null;
        const docsUrl = docsPath ? this._buildUrl(localHost, info.port, docsPath) : null;
        const lines = [
            '',
            `  🗄️  s3db.js API ${version}`,
            `     - Local:    ${localUrl}`
        ];
        if (networkUrl && networkUrl !== localUrl) {
            lines.push(`     - Network:  ${networkUrl}`);
        }
        if (docsUrl) {
            lines.push(`     - Docs:     ${docsUrl}`);
        }
        const routeSummaries = this.router?.getRouteSummaries?.() || [];
        if (routeSummaries.length > 0) {
            lines.push('     Routes:');
            const globalDrivers = this.options.auth?.drivers?.map(d => d.driver === 'apiKey' ? 'apikey' : d.driver) || [];
            const maxPathLen = routeSummaries.reduce((max, r) => Math.max(max, r.path.length), 0);
            routeSummaries.forEach((route) => {
                const actions = [];
                const m = route.methods;
                if (m.includes('GET'))
                    actions.push('list', 'show');
                if (m.includes('POST'))
                    actions.push('create');
                if (m.includes('PATCH'))
                    actions.push('update');
                if (m.includes('PUT'))
                    actions.push('replace');
                if (m.includes('DELETE'))
                    actions.push('delete');
                const actionStr = actions.join(', ');
                let authTag = '[public]';
                if (route.authEnabled) {
                    let activeDrivers = globalDrivers;
                    if (Array.isArray(route.authConfig)) {
                        activeDrivers = globalDrivers.filter(d => route.authConfig.includes(d) || route.authConfig.includes(d === 'apikey' ? 'apiKey' : d));
                    }
                    authTag = activeDrivers.length > 0
                        ? `[auth:${activeDrivers.join(',')}]`
                        : '[auth:none]';
                }
                lines.push(`       ${route.path.padEnd(maxPathLen + 2)} ${authTag.padEnd(25)} ${actionStr}`);
            });
        }
        lines.push('');
        this.logger.info(lines.join('\n'));
    }
    _resolveLocalHostname() {
        const host = this.options.host;
        if (!host || host === '0.0.0.0' || host === '::') {
            return 'localhost';
        }
        return host;
    }
    _resolveNetworkHostname() {
        const host = this.options.host;
        if (host && host !== '0.0.0.0' && host !== '::') {
            return host;
        }
        return this._findLanAddress() || null;
    }
    _findLanAddress() {
        const nets = networkInterfaces();
        for (const interfaceDetails of Object.values(nets)) {
            if (!interfaceDetails)
                continue;
            for (const detail of interfaceDetails) {
                if (detail.family === 'IPv4' && !detail.internal) {
                    return detail.address;
                }
            }
        }
        return null;
    }
    _buildUrl(host, port, path = '') {
        if (!host)
            return '';
        const isIPv6 = host.includes(':') && !host.startsWith('[');
        const hostPart = isIPv6 ? `[${host}]` : host;
        const base = `http://${hostPart}:${port}`;
        if (!path) {
            return base;
        }
        const normalizedPath = path === '/'
            ? '/'
            : (path.startsWith('/') ? path : `/${path}`);
        if (normalizedPath === '/') {
            return `${base}/`;
        }
        return `${base}${normalizedPath}`;
    }
    _generateOpenAPISpec() {
        return this.openApiGenerator.generate();
    }
}
export default ApiServer;
//# sourceMappingURL=server.js.map