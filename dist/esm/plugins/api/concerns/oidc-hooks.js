import { setCookie as honoSetCookie, getCookie as honoGetCookie, deleteCookie as honoDeleteCookie } from 'hono/cookie';
import { createLogger } from '../../../concerns/logger.js';
const logger = createLogger({ name: 'OidcHooks', level: (process.env.S3DB_LOG_LEVEL || 'info') });
export const HOOK_DEFINITIONS = {
    beforeLogin: {
        phase: 'login',
        canModify: true,
        errorHook: 'onError'
    },
    afterLogin: {
        phase: 'login',
        canModify: false,
        errorHook: 'onError'
    },
    beforeCallbackValidation: {
        phase: 'callback',
        canModify: false,
        errorHook: 'onCallbackError'
    },
    afterTokenExchange: {
        phase: 'callback',
        canModify: false,
        errorHook: 'onTokenExchangeError'
    },
    afterTokenDecode: {
        phase: 'callback',
        canModify: true,
        errorHook: 'onTokenValidationError'
    },
    beforeUserResolution: {
        phase: 'callback',
        canModify: true,
        errorHook: 'onError'
    },
    beforeUserCreate: {
        phase: 'callback',
        canModify: true,
        errorHook: 'onUserCreateError'
    },
    afterUserCreate: {
        phase: 'callback',
        canModify: false,
        errorHook: 'onError'
    },
    beforeUserUpdate: {
        phase: 'callback',
        canModify: true,
        errorHook: 'onUserUpdateError'
    },
    afterUserUpdate: {
        phase: 'callback',
        canModify: false,
        errorHook: 'onError'
    },
    beforeSessionCreate: {
        phase: 'callback',
        canModify: true,
        errorHook: 'onError'
    },
    afterSessionCreate: {
        phase: 'callback',
        canModify: false,
        errorHook: 'onError'
    },
    beforeRedirect: {
        phase: 'callback',
        canModify: true,
        errorHook: 'onError'
    },
    beforeSessionCheck: {
        phase: 'middleware',
        canModify: false,
        errorHook: 'onError'
    },
    afterSessionDecode: {
        phase: 'middleware',
        canModify: true,
        errorHook: 'onSessionInvalid'
    },
    beforeUserEnrich: {
        phase: 'middleware',
        canModify: false,
        errorHook: 'onUserEnrichError'
    },
    afterUserEnrich: {
        phase: 'middleware',
        canModify: true,
        errorHook: 'onUserEnrichError'
    },
    beforeTokenRefresh: {
        phase: 'middleware',
        canModify: false,
        errorHook: 'onTokenRefreshError'
    },
    afterTokenRefresh: {
        phase: 'middleware',
        canModify: false,
        errorHook: 'onTokenRefreshError'
    },
    beforeSessionUpdate: {
        phase: 'middleware',
        canModify: true,
        errorHook: 'onError'
    },
    onRefreshStart: {
        phase: 'refresh',
        canModify: false,
        errorHook: 'onRefreshError'
    },
    onRefreshSuccess: {
        phase: 'refresh',
        canModify: false,
        errorHook: 'onError'
    },
    beforeLogout: {
        phase: 'logout',
        canModify: false,
        errorHook: 'onError'
    },
    afterSessionDelete: {
        phase: 'logout',
        canModify: false,
        errorHook: 'onError'
    },
    beforeIdpLogout: {
        phase: 'logout',
        canModify: true,
        errorHook: 'onError'
    },
    afterLogout: {
        phase: 'logout',
        canModify: false,
        errorHook: 'onError'
    },
    onCallbackError: {
        phase: 'error',
        canModify: false,
        errorHook: null
    },
    onTokenExchangeError: {
        phase: 'error',
        canModify: false,
        errorHook: null
    },
    onTokenValidationError: {
        phase: 'error',
        canModify: false,
        errorHook: null
    },
    onUserNotFound: {
        phase: 'error',
        canModify: true,
        errorHook: null
    },
    onUserCreateError: {
        phase: 'error',
        canModify: false,
        errorHook: null
    },
    onUserUpdateError: {
        phase: 'error',
        canModify: false,
        errorHook: null
    },
    onSessionInvalid: {
        phase: 'error',
        canModify: true,
        errorHook: null
    },
    onSessionExpired: {
        phase: 'error',
        canModify: true,
        errorHook: null
    },
    onTokenRefreshError: {
        phase: 'error',
        canModify: true,
        errorHook: null
    },
    onUserEnrichError: {
        phase: 'error',
        canModify: true,
        errorHook: null
    },
    onRefreshError: {
        phase: 'error',
        canModify: false,
        errorHook: null
    },
    onError: {
        phase: 'error',
        canModify: false,
        errorHook: null
    }
};
export class CookieHelpers {
    context;
    config;
    cookiePrefix;
    defaults;
    constructor(context, config = {}) {
        this.context = context;
        this.config = config;
        this.cookiePrefix = config.cookiePrefix || '';
        this.defaults = {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: 86400,
            domain: ''
        };
    }
    _prefixName(name) {
        return this.cookiePrefix ? `${this.cookiePrefix}_${name}` : name;
    }
    setCookie(name, value, options = {}) {
        const prefixedName = this._prefixName(name);
        const mergedOptions = { ...this.defaults, ...options };
        honoSetCookie(this.context, prefixedName, value, mergedOptions);
        logger.debug({
            httpOnly: mergedOptions.httpOnly,
            maxAge: mergedOptions.maxAge
        }, `Cookie set: ${prefixedName}`);
    }
    getCookie(name) {
        const prefixedName = this._prefixName(name);
        return honoGetCookie(this.context, prefixedName);
    }
    deleteCookie(name, options = {}) {
        const prefixedName = this._prefixName(name);
        const mergedOptions = { ...this.defaults, ...options, maxAge: -1 };
        honoDeleteCookie(this.context, prefixedName, mergedOptions);
        logger.debug({ prefixedName }, `Cookie deleted: ${prefixedName}`);
    }
    setJsonCookie(name, data, options = {}) {
        try {
            const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
            this.setCookie(name, encoded, { ...options, httpOnly: options.httpOnly !== undefined ? options.httpOnly : true });
        }
        catch (error) {
            const prefixedName = this._prefixName(name);
            logger.error({ error, prefixedName }, `Failed to set JSON cookie: ${prefixedName}`);
            throw error;
        }
    }
    getJsonCookie(name) {
        try {
            const value = this.getCookie(name);
            if (!value)
                return undefined;
            const decoded = Buffer.from(value, 'base64').toString('utf-8');
            return JSON.parse(decoded);
        }
        catch (error) {
            const prefixedName = this._prefixName(name);
            logger.error({ error, prefixedName }, `Failed to get JSON cookie: ${prefixedName}`);
            return undefined;
        }
    }
    getSessionId() {
        return this.context.get('sessionId');
    }
    getSessionData() {
        return this.context.get('sessionData');
    }
}
export class HookExecutor {
    config;
    logger;
    metrics;
    constructor(config, customLogger) {
        this.config = config;
        this.logger = customLogger || logger;
        this.metrics = {
            executions: {},
            errors: {},
            totalDuration: {}
        };
    }
    getHooks(hookName) {
        const hooks = this.config.hooks?.[hookName];
        if (!hooks)
            return [];
        return Array.isArray(hooks) ? hooks : [hooks];
    }
    async executeHooks(hookName, params, options = {}) {
        const { stopOnError = false, mergeResults = true } = options;
        const hooks = this.getHooks(hookName);
        const definition = HOOK_DEFINITIONS[hookName];
        if (!definition) {
            this.logger.warn({ hookName }, `Unknown hook: ${hookName}`);
            return params;
        }
        if (hooks.length === 0) {
            this.logger.debug({ hookName }, `No hooks configured for: ${hookName}`);
            return params;
        }
        this.logger.debug({
            hookName,
            hookCount: hooks.length,
            phase: definition.phase,
            canModify: definition.canModify
        }, `Executing ${hooks.length} hook(s) for: ${hookName}`);
        let result = { ...params };
        const startTime = Date.now();
        for (let i = 0; i < hooks.length; i++) {
            const hook = hooks[i];
            const hookIndex = i + 1;
            try {
                const hookStart = Date.now();
                const hookResult = await hook(result);
                const hookDuration = Date.now() - hookStart;
                const metricKey = `${hookName}[${hookIndex}]`;
                this.metrics.executions[metricKey] = (this.metrics.executions[metricKey] || 0) + 1;
                this.metrics.totalDuration[metricKey] = (this.metrics.totalDuration[metricKey] || 0) + hookDuration;
                if (definition.canModify && hookResult && typeof hookResult === 'object' && mergeResults) {
                    result = { ...result, ...hookResult };
                    this.logger.debug({
                        hookName,
                        hookIndex,
                        duration: hookDuration,
                        modified: true
                    }, `Hook ${hookName}[${hookIndex}] modified params`);
                }
                else {
                    this.logger.debug({
                        hookName,
                        hookIndex,
                        duration: hookDuration,
                        modified: false
                    }, `Hook ${hookName}[${hookIndex}] executed`);
                }
            }
            catch (error) {
                const metricKey = `${hookName}[${hookIndex}]`;
                this.metrics.errors[metricKey] = (this.metrics.errors[metricKey] || 0) + 1;
                this.logger.error({ hookName, hookIndex, error }, `Hook ${hookName}[${hookIndex}] failed`);
                if (definition.errorHook) {
                    try {
                        const errorResult = await this.executeErrorHook(definition.errorHook, {
                            error,
                            hookName,
                            hookIndex,
                            phase: definition.phase,
                            ...result
                        });
                        if (errorResult) {
                            this.logger.info({ errorHook: definition.errorHook, hookName, hookIndex }, `Error hook ${definition.errorHook} handled error from ${hookName}[${hookIndex}]`);
                            return errorResult;
                        }
                    }
                    catch (errorHookError) {
                        this.logger.error({ errorHook: definition.errorHook, errorHookError }, `Error hook ${definition.errorHook} also failed`);
                    }
                }
                if (stopOnError) {
                    throw error;
                }
            }
        }
        const totalDuration = Date.now() - startTime;
        this.logger.debug({
            hookName,
            hookCount: hooks.length,
            duration: totalDuration,
            phase: definition.phase
        }, `Completed ${hookName} (${hooks.length} hook(s))`);
        return result;
    }
    async executeErrorHook(errorHookName, params) {
        const errorHooks = this.getHooks(errorHookName);
        if (errorHooks.length === 0)
            return null;
        for (const errorHook of errorHooks) {
            try {
                const result = await errorHook(params);
                if (result)
                    return result;
            }
            catch (err) {
                this.logger.error({ errorHookName, error: err }, `Error hook ${errorHookName} threw error`);
            }
        }
        return null;
    }
    getMetrics() {
        return {
            executions: { ...this.metrics.executions },
            errors: { ...this.metrics.errors },
            totalDuration: { ...this.metrics.totalDuration }
        };
    }
    resetMetrics() {
        this.metrics = {
            executions: {},
            errors: {},
            totalDuration: {}
        };
    }
}
export function createHookExecutor(config, customLogger) {
    return new HookExecutor(config, customLogger || logger);
}
export function createCookieHelpers(context, config = {}) {
    return new CookieHelpers(context, config);
}
//# sourceMappingURL=oidc-hooks.js.map