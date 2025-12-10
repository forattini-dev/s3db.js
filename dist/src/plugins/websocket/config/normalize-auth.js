/**
 * Normalize authentication configuration for WebSocket plugin
 *
 * Supports multiple authentication drivers:
 * - jwt: JSON Web Token validation
 * - apiKey: Static API key validation
 *
 * @param authConfig - Raw auth configuration
 * @param logger - Logger instance
 * @returns Normalized auth configuration
 */
export function normalizeAuthConfig(authConfig, logger) {
    if (!authConfig) {
        return {
            drivers: [],
            required: false
        };
    }
    const normalized = {
        drivers: [],
        required: authConfig.required !== false
    };
    // Handle new format: auth.drivers array
    if (Array.isArray(authConfig.drivers)) {
        for (const driver of authConfig.drivers) {
            const normalizedDriver = normalizeDriver(driver, logger);
            if (normalizedDriver) {
                normalized.drivers.push(normalizedDriver);
            }
        }
        return normalized;
    }
    // Handle legacy format: auth.jwt, auth.apiKey
    if (authConfig.jwt?.enabled !== false && authConfig.jwt) {
        normalized.drivers.push({
            driver: 'jwt',
            config: {
                secret: authConfig.jwt.secret,
                issuer: authConfig.jwt.issuer,
                audience: authConfig.jwt.audience,
                jwksUri: authConfig.jwt.jwksUri
            }
        });
    }
    if (authConfig.apiKey?.enabled !== false && authConfig.apiKey) {
        normalized.drivers.push({
            driver: 'apiKey',
            config: {
                keys: authConfig.apiKey.keys || {},
                header: authConfig.apiKey.header || 'x-api-key',
                queryParam: authConfig.apiKey.queryParam || 'apiKey'
            }
        });
    }
    return normalized;
}
/**
 * Normalize a single auth driver configuration
 * @private
 */
function normalizeDriver(driver, logger) {
    if (!driver || !driver.driver) {
        logger?.warn('Invalid auth driver configuration, skipping');
        return null;
    }
    const driverType = driver.driver.toLowerCase();
    switch (driverType) {
        case 'jwt':
            return {
                driver: 'jwt',
                config: {
                    secret: driver.config?.secret,
                    issuer: driver.config?.issuer,
                    audience: driver.config?.audience,
                    jwksUri: driver.config?.jwksUri,
                    algorithms: driver.config?.algorithms || ['HS256', 'RS256']
                }
            };
        case 'apikey':
        case 'api-key':
            return {
                driver: 'apiKey',
                config: {
                    keys: driver.config?.keys || {},
                    header: driver.config?.header || 'x-api-key',
                    queryParam: driver.config?.queryParam || 'apiKey'
                }
            };
        case 'oidc':
            return {
                driver: 'jwt', // OIDC usually resolves to JWT
                config: {
                    jwksUri: driver.config?.jwksUri || `${driver.config?.issuer}/.well-known/jwks.json`,
                    issuer: driver.config?.issuer,
                    audience: driver.config?.audience || driver.config?.clientId,
                    algorithms: ['RS256', 'ES256'] // Common for OIDC
                }
            };
        default:
            logger?.warn({ driver: driverType }, 'Unknown auth driver type, skipping');
            return null;
    }
}
//# sourceMappingURL=normalize-auth.js.map