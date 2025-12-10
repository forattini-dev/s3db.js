import { unauthorized } from '../utils/response-formatter.js';
import { createLogger } from '../../../concerns/logger.js';
import { verifyPassword } from '../../../concerns/password-hashing.js'; // Changed: import comparePassword
import { getCookie } from 'hono/cookie';
import { BasicAuthResourceManager } from './resource-manager.js';
const logger = createLogger({ name: 'BasicAuth', level: 'info' });
export function parseBasicAuth(authHeader) {
    if (!authHeader)
        return null;
    const match = authHeader.match(/^Basic\s+(.+)$/i);
    if (!match || !match[1])
        return null;
    try {
        const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
        const [username, ...passwordParts] = decoded.split(':');
        const password = passwordParts.join(':');
        if (!username || !password)
            return null;
        return { username, password };
    }
    catch {
        return null;
    }
}
export async function createBasicAuthHandler(config = {}, database) {
    const { realm = 'API Access', usernameField = 'email', passwordField = 'password', optional = false, adminUser = null, cookieName = null, tokenField = 'apiToken' } = config;
    if (!database) {
        throw new Error('Basic Auth driver: database is required');
    }
    const manager = new BasicAuthResourceManager(database, 'basic', config);
    const authResource = await manager.getOrCreateResource();
    logger.debug(`Basic Auth driver initialized with resource: ${authResource.name}, usernameField: ${usernameField}`);
    return async (c, next) => {
        const authHeader = c.req.header('authorization');
        if (!authHeader && cookieName) {
            try {
                const token = getCookie(c, cookieName);
                if (token) {
                    const users = await authResource.query({ [tokenField]: token }, { limit: 1 });
                    if (users && users.length > 0) {
                        const user = users[0];
                        if (user.active === false) {
                            const response = unauthorized('User account is inactive');
                            return c.json(response, response._status);
                        }
                        c.set('user', user);
                        c.set('authMethod', 'basic-cookie');
                        return await next();
                    }
                }
            }
            catch (_) { /* ignore */ }
        }
        if (!authHeader) {
            if (optional)
                return await next();
            c.header('WWW-Authenticate', `Basic realm="${realm}"`);
            const response = unauthorized('Basic authentication required');
            return c.json(response, response._status);
        }
        const credentials = parseBasicAuth(authHeader);
        if (!credentials) {
            c.header('WWW-Authenticate', `Basic realm="${realm}"`);
            const response = unauthorized('Invalid Basic authentication format');
            return c.json(response, response._status);
        }
        const { username, password } = credentials;
        if (adminUser && adminUser.enabled === true) {
            if (username === adminUser.username && password === adminUser.password) {
                c.set('user', {
                    id: 'root',
                    username: adminUser.username,
                    email: adminUser.username,
                    scopes: adminUser.scopes || ['admin'],
                    authMethod: 'basic-admin'
                });
                c.set('authMethod', 'basic');
                return await next();
            }
        }
        try {
            const users = await authResource.query({ [usernameField]: username }, { limit: 1 });
            if (!users || users.length === 0) {
                c.header('WWW-Authenticate', `Basic realm="${realm}"`);
                const response = unauthorized('Invalid credentials');
                return c.json(response, response._status);
            }
            const user = users[0];
            const storedPassword = user[passwordField];
            if (!storedPassword) {
                c.header('WWW-Authenticate', `Basic realm="${realm}"`);
                const response = unauthorized('Invalid credentials');
                return c.json(response, response._status);
            }
            const isValid = await verifyPassword(password, storedPassword); // Changed: use comparePassword
            if (!isValid) {
                c.header('WWW-Authenticate', `Basic realm="${realm}"`);
                const response = unauthorized('Invalid credentials');
                return c.json(response, response._status);
            }
            if (user.active === false) {
                c.header('WWW-Authenticate', `Basic realm="${realm}"`);
                const response = unauthorized('User account is inactive');
                return c.json(response, response._status);
            }
            c.set('user', user);
            c.set('authMethod', 'basic');
            return await next();
        }
        catch (err) {
            logger.error({ error: err.message }, 'Error validating Basic Auth credentials');
            c.header('WWW-Authenticate', `Basic realm="${realm}"`);
            const response = unauthorized('Authentication error');
            return c.json(response, response._status);
        }
    };
}
export default {
    parseBasicAuth,
    createBasicAuthHandler
};
//# sourceMappingURL=basic-auth.js.map