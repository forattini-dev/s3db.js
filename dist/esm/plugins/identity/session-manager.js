/**
 * Session Manager - Handles user sessions for Identity Provider
 *
 * Manages session lifecycle using S3DB resource as storage:
 * - Create/validate/destroy sessions
 * - Cookie-based session handling
 * - Automatic session cleanup (expired sessions)
 * - IP address and user agent tracking
 */
import { generateSessionId, calculateExpiration, isExpired } from './concerns/token-generator.js';
import { tryFn } from '../../concerns/try-fn.js';
import { PluginError } from '../../errors.js';
import { getCronManager } from '../../concerns/cron-manager.js';
const DEFAULT_CONFIG = {
    sessionExpiry: '24h',
    cookieName: 's3db_session',
    cookiePath: '/',
    cookieHttpOnly: true,
    cookieSecure: false,
    cookieSameSite: 'Lax',
    cleanupInterval: 3600000,
    enableCleanup: true
};
export class SessionManager {
    sessionResource;
    config;
    cronManager;
    cleanupJobName;
    logger;
    constructor(options) {
        this.sessionResource = options.sessionResource;
        this.config = { ...DEFAULT_CONFIG, ...options.config };
        this.cronManager = getCronManager();
        this.cleanupJobName = null;
        this.logger = console;
        if (!this.sessionResource) {
            throw new PluginError('SessionManager requires a sessionResource', {
                pluginName: 'IdentityPlugin',
                operation: 'SessionManager.constructor',
                statusCode: 400,
                retriable: false,
                suggestion: 'Pass { sessionResource } when initializing IdentityPlugin or SessionManager.'
            });
        }
        if (this.config.enableCleanup) {
            this._startCleanup();
        }
    }
    async createSession(data) {
        const { userId, metadata = {}, ipAddress, userAgent, duration } = data;
        if (!userId) {
            throw new PluginError('userId is required to create a session', {
                pluginName: 'IdentityPlugin',
                operation: 'SessionManager.createSession',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide data.userId when calling createSession().'
            });
        }
        const sessionId = generateSessionId();
        const expiresAt = calculateExpiration(duration || this.config.sessionExpiry);
        const sessionData = {
            userId,
            expiresAt: new Date(expiresAt).toISOString(),
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
            metadata,
            createdAt: new Date().toISOString()
        };
        const [ok, err, session] = await tryFn(() => this.sessionResource.insert(sessionData));
        if (!ok || !session) {
            throw new PluginError(`Failed to create session: ${err?.message}`, {
                pluginName: 'IdentityPlugin',
                operation: 'SessionManager.createSession',
                statusCode: 500,
                retriable: false,
                suggestion: 'Check session resource permissions and database connectivity.',
                cause: err
            });
        }
        return {
            sessionId: session.id,
            expiresAt,
            session
        };
    }
    async validateSession(sessionId) {
        if (!sessionId) {
            return { valid: false, session: null, reason: 'No session ID provided' };
        }
        const [ok, , session] = await tryFn(() => this.sessionResource.get(sessionId));
        if (!ok || !session) {
            return { valid: false, session: null, reason: 'Session not found' };
        }
        if (isExpired(session.expiresAt)) {
            await this.destroySession(sessionId);
            return { valid: false, session: null, reason: 'Session expired' };
        }
        return { valid: true, session, reason: null };
    }
    async getSession(sessionId) {
        if (!sessionId) {
            return null;
        }
        const [ok, , session] = await tryFn(() => this.sessionResource.get(sessionId));
        return ok ? session : null;
    }
    async updateSession(sessionId, metadata) {
        if (!sessionId) {
            throw new PluginError('sessionId is required', {
                pluginName: 'IdentityPlugin',
                operation: 'SessionManager.updateSession',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide a sessionId when calling updateSession().'
            });
        }
        const session = await this.getSession(sessionId);
        if (!session) {
            throw new PluginError('Session not found', {
                pluginName: 'IdentityPlugin',
                operation: 'SessionManager.updateSession',
                statusCode: 404,
                retriable: false,
                suggestion: 'Ensure the session exists before updating metadata.',
                metadata: { sessionId }
            });
        }
        const updatedMetadata = { ...session.metadata, ...metadata };
        const [ok, err, updated] = await tryFn(() => this.sessionResource.update(sessionId, {
            metadata: updatedMetadata
        }));
        if (!ok || !updated) {
            throw new PluginError(`Failed to update session: ${err?.message}`, {
                pluginName: 'IdentityPlugin',
                operation: 'SessionManager.updateSession',
                statusCode: 500,
                retriable: false,
                suggestion: 'Check session resource permissions and database connectivity.',
                cause: err
            });
        }
        return updated;
    }
    async destroySession(sessionId) {
        if (!sessionId) {
            return false;
        }
        const [ok] = await tryFn(() => this.sessionResource.delete(sessionId));
        return ok;
    }
    async destroyUserSessions(userId) {
        if (!userId) {
            return 0;
        }
        const [ok, , sessions] = await tryFn(() => this.sessionResource.query({ userId }));
        if (!ok || !sessions || sessions.length === 0) {
            return 0;
        }
        let count = 0;
        for (const session of sessions) {
            const destroyed = await this.destroySession(session.id);
            if (destroyed)
                count++;
        }
        return count;
    }
    async getUserSessions(userId) {
        if (!userId) {
            return [];
        }
        const [ok, , sessions] = await tryFn(() => this.sessionResource.query({ userId }));
        if (!ok || !sessions) {
            return [];
        }
        const activeSessions = [];
        for (const session of sessions) {
            if (!isExpired(session.expiresAt)) {
                activeSessions.push(session);
            }
            else {
                await this.destroySession(session.id);
            }
        }
        return activeSessions;
    }
    setSessionCookie(res, sessionId, expiresAt) {
        const expires = new Date(expiresAt);
        const cookieOptions = [
            `${this.config.cookieName}=${sessionId}`,
            `Path=${this.config.cookiePath}`,
            `Expires=${expires.toUTCString()}`,
            `Max-Age=${Math.floor((expiresAt - Date.now()) / 1000)}`
        ];
        if (this.config.cookieHttpOnly) {
            cookieOptions.push('HttpOnly');
        }
        if (this.config.cookieSecure) {
            cookieOptions.push('Secure');
        }
        if (this.config.cookieSameSite) {
            cookieOptions.push(`SameSite=${this.config.cookieSameSite}`);
        }
        const cookieValue = cookieOptions.join('; ');
        if (typeof res.setHeader === 'function') {
            res.setHeader('Set-Cookie', cookieValue);
        }
        else if (typeof res.header === 'function') {
            res.header('Set-Cookie', cookieValue);
        }
        else {
            throw new PluginError('Unsupported response object for session cookies', {
                pluginName: 'IdentityPlugin',
                operation: 'SessionManager.setSessionCookie',
                statusCode: 400,
                retriable: false,
                suggestion: 'Pass an HTTP response object that implements setHeader() or header().'
            });
        }
    }
    clearSessionCookie(res) {
        const cookieOptions = [
            `${this.config.cookieName}=`,
            `Path=${this.config.cookiePath}`,
            'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
            'Max-Age=0'
        ];
        if (this.config.cookieHttpOnly) {
            cookieOptions.push('HttpOnly');
        }
        if (this.config.cookieSecure) {
            cookieOptions.push('Secure');
        }
        if (this.config.cookieSameSite) {
            cookieOptions.push(`SameSite=${this.config.cookieSameSite}`);
        }
        const cookieValue = cookieOptions.join('; ');
        if (typeof res.setHeader === 'function') {
            res.setHeader('Set-Cookie', cookieValue);
        }
        else if (typeof res.header === 'function') {
            res.header('Set-Cookie', cookieValue);
        }
    }
    getSessionIdFromRequest(req) {
        const cookieHeader = req.headers?.cookie || req.header?.('cookie');
        if (!cookieHeader) {
            return null;
        }
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {});
        return cookies[this.config.cookieName] || null;
    }
    async cleanupExpiredSessions() {
        const [ok, , sessions] = await tryFn(() => this.sessionResource.list({ limit: 1000 }));
        if (!ok || !sessions) {
            return 0;
        }
        let count = 0;
        for (const session of sessions) {
            if (isExpired(session.expiresAt)) {
                const destroyed = await this.destroySession(session.id);
                if (destroyed)
                    count++;
            }
        }
        return count;
    }
    _startCleanup() {
        if (this.cleanupJobName) {
            return;
        }
        this.cleanupJobName = `session-cleanup-${Date.now()}`;
        this.cronManager.scheduleInterval(this.config.cleanupInterval, async () => {
            try {
                const count = await this.cleanupExpiredSessions();
                if (count > 0) {
                    this.logger.info(`[SessionManager] Cleaned up ${count} expired sessions`);
                }
            }
            catch (error) {
                this.logger.error('[SessionManager] Cleanup error:', error.message);
            }
        }, this.cleanupJobName);
    }
    stopCleanup() {
        if (this.cleanupJobName) {
            this.cronManager.stop(this.cleanupJobName);
            this.cleanupJobName = null;
        }
    }
    async getStatistics() {
        const [ok, , sessions] = await tryFn(() => this.sessionResource.list({ limit: 10000 }));
        if (!ok || !sessions) {
            return {
                total: 0,
                active: 0,
                expired: 0,
                users: 0
            };
        }
        let active = 0;
        let expired = 0;
        const uniqueUsers = new Set();
        for (const session of sessions) {
            if (isExpired(session.expiresAt)) {
                expired++;
            }
            else {
                active++;
                uniqueUsers.add(session.userId);
            }
        }
        return {
            total: sessions.length,
            active,
            expired,
            users: uniqueUsers.size
        };
    }
}
export default SessionManager;
//# sourceMappingURL=session-manager.js.map