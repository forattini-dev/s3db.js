import { BaseAuthStrategy } from './base-strategy.class.js';
import { createPathBasedAuthMiddleware } from '../path-auth-matcher.js';
import { createJWTHandler } from '../jwt-auth.js';
import { createApiKeyHandler } from '../api-key-auth.js';
import { createBasicAuthHandler } from '../basic-auth.js';
import { createOAuth2Handler } from '../oauth2-auth.js';
export class PathRulesAuthStrategy extends BaseAuthStrategy {
    pathRules;
    events;
    constructor({ drivers, authResource, oidcMiddleware, database, pathRules, events, logLevel, logger }) {
        super({ drivers, authResource, oidcMiddleware, database, logLevel, logger });
        this.pathRules = pathRules;
        this.events = events;
    }
    async createMiddleware() {
        const authMiddlewares = {};
        for (const driverDef of this.drivers) {
            const driverType = driverDef.type || driverDef.driver;
            const driverConfig = driverDef.config || driverDef;
            if (driverType === 'oauth2-server') {
                continue;
            }
            if (driverType === 'oidc') {
                if (this.oidcMiddleware) {
                    authMiddlewares.oidc = this.oidcMiddleware;
                }
                continue;
            }
            if (driverType === 'jwt') {
                authMiddlewares.jwt = await createJWTHandler(driverConfig, this.database);
            }
            if (driverType === 'apiKey') {
                authMiddlewares.apiKey = await createApiKeyHandler(driverConfig, this.database);
            }
            if (driverType === 'basic') {
                authMiddlewares.basic = await createBasicAuthHandler(driverConfig, this.database);
            }
            if (driverType === 'oauth2') {
                const oauth2Handler = await createOAuth2Handler(driverConfig, this.database);
                authMiddlewares.oauth2 = async (c, next) => {
                    const user = await oauth2Handler(c);
                    if (user) {
                        c.set('user', user);
                        c.set('authMethod', 'oauth2');
                        return await next();
                    }
                };
            }
        }
        const availableMethods = Object.keys(authMiddlewares);
        this.logger.debug({ ruleCount: this.pathRules.length, methods: availableMethods }, `Path-based auth with ${this.pathRules.length} rules, methods: ${availableMethods.join(', ')}`);
        return createPathBasedAuthMiddleware({
            rules: this.pathRules,
            authMiddlewares,
            unauthorizedHandler: (c, message) => {
                const acceptHeader = c.req.header('accept') || '';
                const acceptsHtml = acceptHeader.includes('text/html');
                if (acceptsHtml) {
                    if (authMiddlewares.oidc) {
                        return c.redirect('/auth/login', 302);
                    }
                }
                return c.json({
                    error: 'Unauthorized',
                    message
                }, 401);
            },
            events: this.events
        });
    }
}
//# sourceMappingURL=path-rules-strategy.class.js.map