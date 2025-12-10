import { createHash } from 'crypto';
import { createLogger } from '../../../concerns/logger.js';
import { unauthorized } from '../utils/response-formatter.js';
import { getCookie } from 'hono/cookie';
import { LRUCache } from '../concerns/lru-cache.js';
import { JWTResourceManager } from './resource-manager.js';
import { verifyPassword as comparePassword } from '../../../concerns/password-hashing.js';
const logger = createLogger({ name: 'JwtAuth', level: 'info' });
const tokenCache = new LRUCache({ max: 1000, ttl: 60000 });
export function createToken(payload, secret, expiresIn = '7d') {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
        throw new Error('Invalid expiresIn format. Use: 60s, 30m, 24h, 7d');
    }
    const [, value, unit] = match;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    const expiresInSeconds = parseInt(value) * multipliers[unit];
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const data = {
        ...payload,
        iat: now,
        exp: now + expiresInSeconds
    };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(data)).toString('base64url');
    const signature = createHash('sha256')
        .update(`${encodedHeader}.${encodedPayload}.${secret}`)
        .digest('base64url');
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}
export function verifyToken(token, secret) {
    const cacheKey = `${token}:${secret}`;
    const cached = tokenCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    try {
        const [encodedHeader, encodedPayload, signature] = token.split('.');
        if (!encodedHeader || !encodedPayload || !signature) {
            return null;
        }
        const expectedSignature = createHash('sha256')
            .update(`${encodedHeader}.${encodedPayload}.${secret}`)
            .digest('base64url');
        if (signature !== expectedSignature) {
            return null;
        }
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            return null;
        }
        tokenCache.set(cacheKey, payload);
        return payload;
    }
    catch (err) {
        return null;
    }
}
export async function createJWTHandler(config = {}, database) {
    const { secret, userField = 'email', passwordField = 'password', expiresIn = '7d', optional = false, cookieName = null } = config;
    if (!secret) {
        throw new Error('JWT driver: secret is required');
    }
    if (!database) {
        throw new Error('JWT driver: database is required');
    }
    const manager = new JWTResourceManager(database, 'jwt', config);
    const authResource = await manager.getOrCreateResource();
    logger.debug(`JWT driver initialized with resource: ${authResource.name}, userField: ${userField}`);
    async function verifyPassword(inputPassword, storedPassword) {
        try {
            const isValid = await comparePassword(inputPassword, storedPassword);
            return isValid;
        }
        catch {
            return false;
        }
    }
    return async (c, next) => {
        const authHeader = c.req.header('authorization');
        if (!authHeader) {
            if (cookieName) {
                try {
                    const token = getCookie(c, cookieName);
                    if (token) {
                        const payload = verifyToken(token, secret);
                        if (payload) {
                            const userIdentifier = payload[userField];
                            if (userIdentifier) {
                                try {
                                    const users = await authResource.query({ [userField]: userIdentifier }, { limit: 1 });
                                    const user = users[0];
                                    if (user && user.active !== false) {
                                        c.set('user', user);
                                        c.set('authMethod', 'jwt-cookie');
                                        return await next();
                                    }
                                }
                                catch (__) { }
                            }
                            else {
                                c.set('user', payload);
                                c.set('authMethod', 'jwt-cookie');
                                return await next();
                            }
                        }
                    }
                }
                catch (__) { }
            }
            if (optional) {
                return await next();
            }
            const response = unauthorized('No authorization header provided');
            return c.json(response, response._status);
        }
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (!match) {
            const response = unauthorized('Invalid authorization header format. Use: Bearer <token>');
            return c.json(response, response._status);
        }
        const token = match[1];
        const payload = verifyToken(token, secret);
        if (!payload) {
            const response = unauthorized('Invalid or expired token');
            return c.json(response, response._status);
        }
        const userIdentifier = payload[userField];
        if (userIdentifier) {
            try {
                const users = await authResource.query({ [userField]: userIdentifier }, { limit: 1 });
                const user = users[0];
                if (!user) {
                    const response = unauthorized('User not found');
                    return c.json(response, response._status);
                }
                if (user.active === false) {
                    const response = unauthorized('User account is inactive');
                    return c.json(response, response._status);
                }
                c.set('user', user);
                c.set('authMethod', 'jwt');
            }
            catch (err) {
                logger.error({ error: err.message }, 'Error loading user');
                const response = unauthorized('Authentication error');
                return c.json(response, response._status);
            }
        }
        else {
            c.set('user', payload);
            c.set('authMethod', 'jwt');
        }
        await next();
    };
}
export async function jwtLogin(authResource, username, password, config = {}) {
    const { secret, userField = 'email', passwordField = 'password', expiresIn = '7d' } = config;
    if (!secret) {
        return { success: false, error: 'JWT secret is required' };
    }
    try {
        const users = await authResource.query({ [userField]: username }, { limit: 1 });
        const user = users[0];
        if (!user) {
            return { success: false, error: 'Invalid credentials' };
        }
        if (user.active === false) {
            return { success: false, error: 'User account is inactive' };
        }
        const storedPassword = user[passwordField];
        if (!storedPassword) {
            return { success: false, error: 'Invalid credentials' };
        }
        const isValid = await comparePassword(password, storedPassword);
        if (!isValid) {
            return { success: false, error: 'Invalid credentials' };
        }
        const token = createToken({
            [userField]: user[userField],
            id: user.id,
            role: user.role || 'user',
            scopes: user.scopes || []
        }, secret, expiresIn);
        return { success: true, token, user };
    }
    catch (err) {
        logger.error({ error: err.message }, 'Login error');
        return { success: false, error: 'Authentication error' };
    }
}
export default {
    createToken,
    verifyToken,
    createJWTHandler,
    jwtLogin
};
//# sourceMappingURL=jwt-auth.js.map