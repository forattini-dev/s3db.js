import { encrypt, decrypt } from '../../../concerns/crypto.js';
import { createLogger } from '../../../concerns/logger.js';
import { idGenerator } from '../../../concerns/id.js';
import { getCookie, setCookie } from 'hono/cookie';
const logger = createLogger({ name: 'SessionTracking', level: 'info' });
export function createSessionTrackingMiddleware(config = {}, db) {
    const { enabled = false, resource = null, cookieName = 'session_id', cookieMaxAge = 2592000000, cookieSecure = process.env.NODE_ENV === 'production', cookieSameSite = 'Strict', updateOnRequest = true, passphrase = null, enrichSession = null } = config;
    if (!enabled) {
        return async (_c, next) => await next();
    }
    if (!passphrase) {
        throw new Error('sessionTracking.passphrase is required when sessionTracking.enabled = true');
    }
    const sessionsResource = resource && db ? db.resources[resource] : null;
    return async (c, next) => {
        let session = null;
        let sessionId = null;
        let isNewSession = false;
        const sessionCookie = getCookie(c, cookieName);
        if (sessionCookie) {
            try {
                sessionId = await decrypt(sessionCookie, passphrase);
                if (sessionsResource) {
                    const exists = await sessionsResource.exists(sessionId);
                    if (exists) {
                        session = await sessionsResource.get(sessionId);
                    }
                }
                else {
                    session = { id: sessionId };
                }
            }
            catch (err) {
                const logLevel = c.get('logLevel');
                if (logLevel === 'debug' || logLevel === 'trace') {
                    logger.error({ error: err.message }, '[SessionTracking] Failed to decrypt cookie');
                }
            }
        }
        if (!session) {
            isNewSession = true;
            sessionId = idGenerator();
            const sessionData = {
                id: sessionId,
                userAgent: c.req.header('user-agent') || null,
                ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null,
                referer: c.req.header('referer') || null,
                createdAt: new Date().toISOString(),
                lastSeenAt: new Date().toISOString()
            };
            if (enrichSession && typeof enrichSession === 'function') {
                try {
                    const enriched = await enrichSession({ session: sessionData, context: c });
                    if (enriched && typeof enriched === 'object') {
                        Object.assign(sessionData, enriched);
                    }
                }
                catch (enrichErr) {
                    const logLevel = c.get('logLevel');
                    if (logLevel === 'debug' || logLevel === 'trace') {
                        logger.error({ error: enrichErr.message }, '[SessionTracking] enrichSession failed');
                    }
                }
            }
            if (sessionsResource) {
                try {
                    session = await sessionsResource.insert(sessionData);
                }
                catch (insertErr) {
                    const logLevel = c.get('logLevel');
                    if (logLevel === 'debug' || logLevel === 'trace') {
                        logger.error({ error: insertErr.message }, '[SessionTracking] Failed to insert session');
                    }
                    session = sessionData;
                }
            }
            else {
                session = sessionData;
            }
        }
        else if (updateOnRequest && !isNewSession && sessionsResource && sessionId) {
            const updates = {
                lastSeenAt: new Date().toISOString(),
                lastUserAgent: c.req.header('user-agent') || null,
                lastIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null
            };
            sessionsResource.update(sessionId, updates).catch((updateErr) => {
                const logLevel = c.get('logLevel');
                if (logLevel === 'debug' || logLevel === 'trace') {
                    logger.error({ error: updateErr.message }, '[SessionTracking] Failed to update session');
                }
            });
            Object.assign(session, updates);
        }
        try {
            const encryptedSessionId = await encrypt(sessionId, passphrase);
            setCookie(c, cookieName, encryptedSessionId, {
                maxAge: Math.floor(cookieMaxAge / 1000),
                path: '/',
                httpOnly: true,
                secure: cookieSecure,
                sameSite: cookieSameSite
            });
        }
        catch (encryptErr) {
            const logLevel = c.get('logLevel');
            if (logLevel === 'debug' || logLevel === 'trace') {
                logger.error({ error: encryptErr.message }, '[SessionTracking] Failed to encrypt session ID');
            }
        }
        c.set('sessionId', sessionId);
        c.set('session', session);
        await next();
    };
}
export default createSessionTrackingMiddleware;
//# sourceMappingURL=session-tracking.js.map