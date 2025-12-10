import { createLogger } from '../../../../concerns/logger.js';
export class BaseAuthStrategy {
    drivers;
    authResource;
    oidcMiddleware;
    database;
    logger;
    constructor({ drivers, authResource, oidcMiddleware, database, logLevel = 'info', logger }) {
        this.drivers = drivers || [];
        this.authResource = authResource;
        this.oidcMiddleware = oidcMiddleware;
        this.database = database;
        if (logger) {
            this.logger = logger;
        }
        else {
            this.logger = createLogger({ name: 'AuthStrategy', level: logLevel });
        }
    }
    extractDriverConfigs(driverNames) {
        const configs = {
            jwt: {},
            apiKey: {},
            basic: {},
            oauth2: {}
        };
        for (const driverDef of this.drivers) {
            const driverName = driverDef.driver;
            const driverConfig = driverDef.config || {};
            if (driverNames && !driverNames.includes(driverName)) {
                continue;
            }
            if (driverName === 'oauth2-server' || driverName === 'oidc') {
                continue;
            }
            if (driverName === 'jwt') {
                configs.jwt = driverConfig;
            }
            else if (driverName === 'apiKey') {
                configs.apiKey = driverConfig;
            }
            else if (driverName === 'basic') {
                configs.basic = driverConfig;
            }
            else if (driverName === 'oauth2') {
                configs.oauth2 = driverConfig;
            }
        }
        return configs;
    }
    async createMiddleware() {
        throw new Error('createMiddleware() must be implemented by subclass');
    }
}
//# sourceMappingURL=base-strategy.class.js.map