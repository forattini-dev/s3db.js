import { createLogger } from '../../../concerns/logger.js';
export class SessionStore {
    async touch(sessionId, ttl) {
        const data = await this.get(sessionId);
        if (data) {
            await this.set(sessionId, data, ttl);
        }
    }
}
export class MemoryStore extends SessionStore {
    sessions;
    timers;
    maxSessions;
    logLevel;
    logger;
    constructor(options = {}) {
        super();
        this.sessions = new Map();
        this.timers = new Map();
        this.maxSessions = options.maxSessions || 10000;
        this.logLevel = options.logLevel || 'info';
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            this.logger = createLogger({ name: 'MemoryStore', level: this.logLevel });
        }
    }
    async get(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (!entry)
            return null;
        if (entry.expiresAt < Date.now()) {
            await this.destroy(sessionId);
            return null;
        }
        return entry.data;
    }
    async set(sessionId, sessionData, ttl) {
        if (this.sessions.size >= this.maxSessions && !this.sessions.has(sessionId)) {
            const firstKey = this.sessions.keys().next().value;
            if (firstKey) {
                await this.destroy(firstKey);
            }
        }
        const expiresAt = Date.now() + ttl;
        const existingTimer = this.timers.get(sessionId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const timer = setTimeout(() => {
            this.destroy(sessionId);
        }, ttl);
        this.sessions.set(sessionId, {
            data: sessionData,
            expiresAt,
        });
        this.timers.set(sessionId, timer);
        const ttlSeconds = Math.round(ttl / 1000);
        this.logger.debug({ sessionId, ttlSeconds, totalSessions: this.sessions.size }, `Set session ${sessionId} (TTL: ${ttlSeconds}s, Total: ${this.sessions.size})`);
    }
    async destroy(sessionId) {
        const timer = this.timers.get(sessionId);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(sessionId);
        }
        this.sessions.delete(sessionId);
        this.logger.debug({ sessionId, remaining: this.sessions.size }, `Destroyed session ${sessionId} (Remaining: ${this.sessions.size})`);
    }
    async touch(sessionId, ttl) {
        const entry = this.sessions.get(sessionId);
        if (!entry)
            return;
        entry.expiresAt = Date.now() + ttl;
        const existingTimer = this.timers.get(sessionId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }
        const timer = setTimeout(() => {
            this.destroy(sessionId);
        }, ttl);
        this.timers.set(sessionId, timer);
    }
    getStats() {
        return {
            count: this.sessions.size,
            maxSessions: this.maxSessions,
        };
    }
    async clear() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.sessions.clear();
    }
}
export class RedisStore extends SessionStore {
    client;
    prefix;
    serializer;
    logLevel;
    logger;
    constructor(options) {
        super();
        if (!options.client) {
            throw new Error('RedisStore requires a Redis client (options.client)');
        }
        this.client = options.client;
        this.prefix = options.prefix || 'session:';
        this.serializer = options.serializer || JSON;
        this.logLevel = options.logLevel || 'info';
        if (options.logger) {
            this.logger = options.logger;
        }
        else {
            this.logger = createLogger({ name: 'RedisStore', level: this.logLevel });
        }
    }
    _getKey(sessionId) {
        return `${this.prefix}${sessionId}`;
    }
    async get(sessionId) {
        try {
            const key = this._getKey(sessionId);
            const data = await this.client.get(key);
            if (!data)
                return null;
            return this.serializer.parse(data);
        }
        catch (err) {
            this.logger.error({ error: err.message }, '[RedisStore] Get error');
            return null;
        }
    }
    async set(sessionId, sessionData, ttl) {
        try {
            const key = this._getKey(sessionId);
            const value = this.serializer.stringify(sessionData);
            const ttlSeconds = Math.ceil(ttl / 1000);
            await this.client.setEx(key, ttlSeconds, value);
            this.logger.debug({ sessionId, ttlSeconds }, `Set session ${sessionId} (TTL: ${ttlSeconds}s)`);
        }
        catch (err) {
            this.logger.error({ error: err.message }, '[RedisStore] Set error');
            throw err;
        }
    }
    async destroy(sessionId) {
        try {
            const key = this._getKey(sessionId);
            await this.client.del(key);
            this.logger.debug({ sessionId }, `Destroyed session ${sessionId}`);
        }
        catch (err) {
            this.logger.error({ error: err.message }, '[RedisStore] Destroy error');
            throw err;
        }
    }
    async touch(sessionId, ttl) {
        try {
            const key = this._getKey(sessionId);
            const ttlSeconds = Math.ceil(ttl / 1000);
            await this.client.expire(key, ttlSeconds);
            this.logger.debug({ sessionId, ttlSeconds }, `Touched session ${sessionId} (TTL: ${ttlSeconds}s)`);
        }
        catch (err) {
            this.logger.error({ error: err.message }, '[RedisStore] Touch error');
            await super.touch(sessionId, ttl);
        }
    }
    async getStats() {
        try {
            const keys = await this.client.keys(`${this.prefix}*`);
            return {
                count: keys.length,
                prefix: this.prefix,
            };
        }
        catch (err) {
            this.logger.error({ error: err.message }, '[RedisStore] Stats error');
            return { count: 0, prefix: this.prefix };
        }
    }
    async clear() {
        try {
            const keys = await this.client.keys(`${this.prefix}*`);
            if (keys.length > 0) {
                await this.client.del(keys);
            }
        }
        catch (err) {
            this.logger.error({ error: err.message }, '[RedisStore] Clear error');
        }
    }
}
//# sourceMappingURL=session-store.js.map