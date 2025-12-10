import { createJWTHandler, createToken, verifyToken } from './jwt-auth.js';
import { createApiKeyHandler, generateApiKey } from './api-key-auth.js';
import { createBasicAuthHandler } from './basic-auth.js';
import { createOAuth2Handler } from './oauth2-auth.js';
import { OIDCClient } from './oidc-client.js';
import { unauthorized } from '../utils/response-formatter.js';
import { getCookie } from 'hono/cookie';
export async function createAuthMiddleware(options) {
    const { methods = [], jwt: jwtConfig = {}, apiKey: apiKeyConfig = {}, basic: basicConfig = {}, oauth2: oauth2Config = {}, oidc: oidcMiddleware = null, database, optional = false, strategy = 'any', priorities = {} } = options;
    if (!database) {
        throw new Error('createAuthMiddleware: database parameter is required');
    }
    if (methods.length === 0) {
        return async (c, next) => await next();
    }
    const middlewares = [];
    if (methods.includes('jwt') && jwtConfig.secret) {
        const jwtHandler = await createJWTHandler(jwtConfig, database);
        middlewares.push({
            name: 'jwt',
            middleware: jwtHandler
        });
    }
    if (methods.includes('apiKey')) {
        const apiKeyHandler = await createApiKeyHandler(apiKeyConfig, database);
        middlewares.push({
            name: 'apiKey',
            middleware: apiKeyHandler
        });
    }
    if (methods.includes('basic')) {
        const basicHandler = await createBasicAuthHandler(basicConfig, database);
        middlewares.push({
            name: 'basic',
            middleware: basicHandler
        });
    }
    if (methods.includes('oauth2') && oauth2Config.issuer) {
        const oauth2Handler = await createOAuth2Handler(oauth2Config, database);
        middlewares.push({
            name: 'oauth2',
            middleware: async (c, next) => {
                const user = await oauth2Handler(c);
                if (user) {
                    c.set('user', user);
                    c.set('authMethod', 'oauth2');
                    return await next();
                }
            }
        });
    }
    if (oidcMiddleware) {
        middlewares.push({
            name: 'oidc',
            middleware: oidcMiddleware
        });
    }
    if (strategy === 'priority' && Object.keys(priorities).length > 0) {
        middlewares.sort((a, b) => {
            const priorityA = priorities[a.name] || 999;
            const priorityB = priorities[b.name] || 999;
            return priorityA - priorityB;
        });
    }
    const hasMultipleMethods = middlewares.length > 1;
    return async (c, next) => {
        let attempted = false;
        let lastErrorResponse = null;
        const hasCredentials = (name) => {
            if (name === 'jwt') {
                if (c.req.header('authorization'))
                    return true;
                if (jwtConfig.cookieName) {
                    try {
                        return !!getCookie(c, jwtConfig.cookieName);
                    }
                    catch {
                        return false;
                    }
                }
                return false;
            }
            if (name === 'apiKey') {
                const headerName = apiKeyConfig.headerName || 'X-API-Key';
                if (c.req.header(headerName))
                    return true;
                if (apiKeyConfig.queryParam) {
                    return !!c.req.query(apiKeyConfig.queryParam);
                }
                return false;
            }
            if (name === 'basic') {
                if (c.req.header('authorization'))
                    return true;
                if (basicConfig.cookieName) {
                    try {
                        return !!getCookie(c, basicConfig.cookieName);
                    }
                    catch {
                        return false;
                    }
                }
                return false;
            }
            if (name === 'oauth2') {
                return !!c.req.header('authorization');
            }
            return false;
        };
        for (const { name, middleware } of middlewares) {
            const credentialsPresent = hasCredentials(name);
            if (!credentialsPresent && hasMultipleMethods) {
                continue;
            }
            attempted = attempted || credentialsPresent || !hasMultipleMethods;
            let authSuccess = false;
            const tempNext = async () => {
                authSuccess = true;
            };
            const result = await middleware(c, tempNext);
            if (result !== undefined && result !== null) {
                const statusCode = typeof result?.status === 'number'
                    ? result.status
                    : (typeof result?._status === 'number' ? result._status : null);
                if (statusCode === 401 || statusCode === 403) {
                    lastErrorResponse = result;
                    continue;
                }
                return result;
            }
            if (authSuccess && c.get('user')) {
                return await next();
            }
        }
        if (!attempted) {
            if (optional) {
                return await next();
            }
            const response = unauthorized(`Authentication required. Supported methods: ${methods.join(', ')}`);
            return c.json(response, response._status);
        }
        if (lastErrorResponse) {
            return lastErrorResponse;
        }
        if (optional) {
            return await next();
        }
        const response = unauthorized(`Authentication required. Supported methods: ${methods.join(', ')}`);
        return c.json(response, response._status);
    };
}
export { OIDCClient, createToken, verifyToken, generateApiKey };
export default {
    createAuthMiddleware,
    createJWTHandler,
    createApiKeyHandler,
    createBasicAuthHandler,
    createOAuth2Handler,
    createToken,
    verifyToken,
    generateApiKey,
    OIDCClient
};
//# sourceMappingURL=index.js.map