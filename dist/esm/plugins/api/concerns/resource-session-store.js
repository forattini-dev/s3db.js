import { SessionStore } from './session-store.js';
import { createLogger } from '../../../concerns/logger.js';
function isNotFoundError(err) {
    const error = err;
    return (error.message?.includes('NotFound') ||
        error.code === 'ENOTFOUND' ||
        error.statusCode === 404);
}
export class ResourceSessionStore extends SessionStore {
    resource;
    logLevel;
    logger;
    constructor(resource, options = {}) {
        if (!resource) {
            throw new Error('ResourceSessionStore requires a resource argument');
        }
        super();
        this.resource = resource;
        this.logLevel = options.logLevel || 'info';
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            this.logger = createLogger({ name: 'ResourceSessionStore', level: this.logLevel });
        }
        this.logger.debug({ resourceName: resource.name }, `Initialized with resource: ${resource.name}`);
    }
    async get(sessionId) {
        try {
            const session = await this.resource.get(sessionId);
            this.logger.debug({ sessionId }, `Retrieved session: ${sessionId}`);
            return session;
        }
        catch (err) {
            if (isNotFoundError(err)) {
                return null;
            }
            throw err;
        }
    }
    async set(sessionId, sessionData, ttl) {
        const expiresAt = new Date(Date.now() + ttl).toISOString();
        try {
            await this.resource.update(sessionId, {
                ...sessionData,
                expiresAt
            });
            this.logger.debug({ sessionId }, `Updated session: ${sessionId}`);
        }
        catch (err) {
            if (isNotFoundError(err)) {
                await this.resource.insert({
                    id: sessionId,
                    ...sessionData,
                    expiresAt
                });
                this.logger.debug({ sessionId }, `Created session: ${sessionId}`);
            }
            else {
                throw err;
            }
        }
    }
    async destroy(sessionId) {
        try {
            await this.resource.delete(sessionId);
            this.logger.debug({ sessionId }, `Deleted session: ${sessionId}`);
        }
        catch (err) {
            if (!isNotFoundError(err)) {
                throw err;
            }
            this.logger.debug({ sessionId }, `Session not found (already deleted): ${sessionId}`);
        }
    }
    async touch(sessionId, ttl) {
        const session = await this.get(sessionId);
        if (session) {
            const expiresAt = new Date(Date.now() + ttl).toISOString();
            await this.resource.patch(sessionId, { expiresAt });
            this.logger.debug({ sessionId }, `Touched session: ${sessionId}`);
        }
    }
    async getStats() {
        try {
            const list = await this.resource.list({ limit: 1 });
            return {
                count: list.total || 0,
                resourceName: this.resource.name
            };
        }
        catch (err) {
            this.logger.error({ error: err.message }, `Error getting stats: ${err.message}`);
            return { count: 0, error: err.message };
        }
    }
    async clear() {
        try {
            const sessions = await this.resource.query();
            let deleted = 0;
            for (const session of sessions) {
                try {
                    await this.resource.delete(session.id);
                    deleted++;
                }
                catch (err) {
                    this.logger.warn({ sessionId: session.id, error: err.message }, `Failed to delete session ${session.id}: ${err.message}`);
                }
            }
            this.logger.debug({ deleted }, `Cleared ${deleted} sessions`);
            return deleted;
        }
        catch (err) {
            this.logger.error({ error: err.message }, `Error clearing sessions: ${err.message}`);
            return 0;
        }
    }
}
//# sourceMappingURL=resource-session-store.js.map