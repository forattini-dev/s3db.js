import { GlobalAuthStrategy } from './global-strategy.class.js';
import { PathBasedAuthStrategy } from './path-based-strategy.class.js';
import { PathRulesAuthStrategy } from './path-rules-strategy.class.js';
export class AuthStrategyFactory {
    static create({ drivers, authResource, oidcMiddleware, database, pathRules, pathAuth, events, logLevel, logger }) {
        if (pathRules && pathRules.length > 0) {
            return new PathRulesAuthStrategy({
                drivers,
                authResource,
                oidcMiddleware,
                database,
                pathRules,
                events,
                logLevel,
                logger
            });
        }
        if (pathAuth) {
            return new PathBasedAuthStrategy({
                drivers,
                authResource,
                oidcMiddleware,
                database,
                pathAuth,
                logLevel,
                logger
            });
        }
        return new GlobalAuthStrategy({
            drivers,
            authResource,
            oidcMiddleware,
            database,
            logLevel,
            logger
        });
    }
}
//# sourceMappingURL=factory.class.js.map