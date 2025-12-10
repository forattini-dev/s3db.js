import { createLogger } from '../../../concerns/logger.js';
import type { Logger, LogLevel } from '../../../concerns/logger.js';

export interface SessionData {
  [key: string]: unknown;
}

export interface SessionEntry {
  data: SessionData;
  expiresAt: number;
}

export interface StoreStats {
  count: number;
  maxSessions?: number;
  prefix?: string;
  error?: string;
}

export abstract class SessionStore {
  abstract get(sessionId: string): Promise<SessionData | null>;
  abstract set(sessionId: string, sessionData: SessionData, ttl: number): Promise<void>;
  abstract destroy(sessionId: string): Promise<void>;

  async touch(sessionId: string, ttl: number): Promise<void> {
    const data = await this.get(sessionId);
    if (data) {
      await this.set(sessionId, data, ttl);
    }
  }
}

export interface MemoryStoreOptions {
  maxSessions?: number;
  logLevel?: string;
  logger?: Logger;
}

export class MemoryStore extends SessionStore {
  private sessions: Map<string, SessionEntry>;
  private timers: Map<string, ReturnType<typeof setTimeout>>;
  private maxSessions: number;
  private logLevel: string;
  private logger: Logger;

  constructor(options: MemoryStoreOptions = {}) {
    super();
    this.sessions = new Map();
    this.timers = new Map();
    this.maxSessions = options.maxSessions || 10000;
    this.logLevel = options.logLevel || 'info';

    if (options.logger) {
      this.logger = options.logger;
    } else {
      this.logger = createLogger({ name: 'MemoryStore', level: this.logLevel as LogLevel });
    }
  }

  override async get(sessionId: string): Promise<SessionData | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
      await this.destroy(sessionId);
      return null;
    }

    return entry.data;
  }

  override async set(sessionId: string, sessionData: SessionData, ttl: number): Promise<void> {
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

  override async destroy(sessionId: string): Promise<void> {
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }

    this.sessions.delete(sessionId);

    this.logger.debug({ sessionId, remaining: this.sessions.size }, `Destroyed session ${sessionId} (Remaining: ${this.sessions.size})`);
  }

  override async touch(sessionId: string, ttl: number): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

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

  getStats(): StoreStats {
    return {
      count: this.sessions.size,
      maxSessions: this.maxSessions,
    };
  }

  async clear(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.sessions.clear();
  }
}

export interface Serializer {
  parse(text: string): SessionData;
  stringify(data: SessionData): string;
}

export interface RedisClient {
  get(key: string): Promise<string | null>;
  setEx(key: string, seconds: number, value: string): Promise<unknown>;
  del(key: string | string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
  keys(pattern: string): Promise<string[]>;
}

export interface RedisStoreOptions {
  client: RedisClient;
  prefix?: string;
  serializer?: Serializer;
  logLevel?: string;
  logger?: Logger;
}

export class RedisStore extends SessionStore {
  private client: RedisClient;
  private prefix: string;
  private serializer: Serializer;
  private logLevel: string;
  private logger: Logger;

  constructor(options: RedisStoreOptions) {
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
    } else {
      this.logger = createLogger({ name: 'RedisStore', level: this.logLevel as LogLevel });
    }
  }

  private _getKey(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  override async get(sessionId: string): Promise<SessionData | null> {
    try {
      const key = this._getKey(sessionId);
      const data = await this.client.get(key);

      if (!data) return null;

      return this.serializer.parse(data);
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, '[RedisStore] Get error');
      return null;
    }
  }

  override async set(sessionId: string, sessionData: SessionData, ttl: number): Promise<void> {
    try {
      const key = this._getKey(sessionId);
      const value = this.serializer.stringify(sessionData);
      const ttlSeconds = Math.ceil(ttl / 1000);

      await this.client.setEx(key, ttlSeconds, value);

      this.logger.debug({ sessionId, ttlSeconds }, `Set session ${sessionId} (TTL: ${ttlSeconds}s)`);
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, '[RedisStore] Set error');
      throw err;
    }
  }

  override async destroy(sessionId: string): Promise<void> {
    try {
      const key = this._getKey(sessionId);
      await this.client.del(key);

      this.logger.debug({ sessionId }, `Destroyed session ${sessionId}`);
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, '[RedisStore] Destroy error');
      throw err;
    }
  }

  override async touch(sessionId: string, ttl: number): Promise<void> {
    try {
      const key = this._getKey(sessionId);
      const ttlSeconds = Math.ceil(ttl / 1000);
      await this.client.expire(key, ttlSeconds);

      this.logger.debug({ sessionId, ttlSeconds }, `Touched session ${sessionId} (TTL: ${ttlSeconds}s)`);
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, '[RedisStore] Touch error');
      await super.touch(sessionId, ttl);
    }
  }

  async getStats(): Promise<StoreStats> {
    try {
      const keys = await this.client.keys(`${this.prefix}*`);
      return {
        count: keys.length,
        prefix: this.prefix,
      };
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, '[RedisStore] Stats error');
      return { count: 0, prefix: this.prefix };
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.client.keys(`${this.prefix}*`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, '[RedisStore] Clear error');
    }
  }
}
