import { BaseAuthStrategy } from './base-strategy.class.js';
import { createAuthMiddleware } from '../index.js';
import { findBestMatch } from '../../utils/path-matcher.js';
export class PathBasedAuthStrategy extends BaseAuthStrategy {
    pathAuth;
    constructor({ drivers, authResource, oidcMiddleware, database, pathAuth, logLevel, logger }) {
        super({ drivers, authResource, oidcMiddleware, database, logLevel, logger });
        this.pathAuth = pathAuth;
    }
    async createMiddleware() {
        this.logger.debug('Using legacy pathAuth system');
        const methods = this.drivers
            .map(d => d.driver)
            .filter(d => d !== 'oauth2-server' && d !== 'oidc');
        const driverConfigs = this.extractDriverConfigs(null);
        const globalAuth = await createAuthMiddleware({
            methods,
            jwt: driverConfigs.jwt,
            apiKey: driverConfigs.apiKey,
            basic: driverConfigs.basic,
            oauth2: driverConfigs.oauth2,
            oidc: this.oidcMiddleware || null,
            database: this.database,
            optional: true
        });
        const ruleMiddlewares = new Map();
        return async (c, next) => {
            const requestPath = c.req.path;
            const matchedRule = findBestMatch(this.pathAuth, requestPath);
            if (matchedRule) {
                this.logger.debug({ path: requestPath, pattern: matchedRule.pattern }, `Path ${requestPath} matched rule: ${matchedRule.pattern}`);
            }
            else {
                this.logger.debug({ path: requestPath }, `Path ${requestPath} no pathAuth rule matched (using global auth)`);
            }
            if (!matchedRule) {
                return await globalAuth(c, next);
            }
            if (!matchedRule.required) {
                return await next();
            }
            const ruleKey = JSON.stringify(matchedRule);
            if (!ruleMiddlewares.has(ruleKey)) {
                const ruleMethods = matchedRule.drivers || [];
                const ruleConfigs = this.extractDriverConfigs(ruleMethods);
                const ruleAuth = await createAuthMiddleware({
                    methods: ruleMethods,
                    jwt: ruleConfigs.jwt,
                    apiKey: ruleConfigs.apiKey,
                    basic: ruleConfigs.basic,
                    oauth2: ruleConfigs.oauth2,
                    oidc: this.oidcMiddleware || null,
                    database: this.database,
                    optional: false
                });
                ruleMiddlewares.set(ruleKey, ruleAuth);
            }
            return await ruleMiddlewares.get(ruleKey)(c, next);
        };
    }
}
//# sourceMappingURL=path-based-strategy.class.js.map