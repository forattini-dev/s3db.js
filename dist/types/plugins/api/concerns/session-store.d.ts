import type { Logger } from '../../../concerns/logger.js';
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
export declare abstract class SessionStore {
    abstract get(sessionId: string): Promise<SessionData | null>;
    abstract set(sessionId: string, sessionData: SessionData, ttl: number): Promise<void>;
    abstract destroy(sessionId: string): Promise<void>;
    touch(sessionId: string, ttl: number): Promise<void>;
}
export interface MemoryStoreOptions {
    maxSessions?: number;
    logLevel?: string;
    logger?: Logger;
}
export declare class MemoryStore extends SessionStore {
    private sessions;
    private timers;
    private maxSessions;
    private logLevel;
    private logger;
    constructor(options?: MemoryStoreOptions);
    get(sessionId: string): Promise<SessionData | null>;
    set(sessionId: string, sessionData: SessionData, ttl: number): Promise<void>;
    destroy(sessionId: string): Promise<void>;
    touch(sessionId: string, ttl: number): Promise<void>;
    getStats(): StoreStats;
    clear(): Promise<void>;
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
export declare class RedisStore extends SessionStore {
    private client;
    private prefix;
    private serializer;
    private logLevel;
    private logger;
    constructor(options: RedisStoreOptions);
    private _getKey;
    get(sessionId: string): Promise<SessionData | null>;
    set(sessionId: string, sessionData: SessionData, ttl: number): Promise<void>;
    destroy(sessionId: string): Promise<void>;
    touch(sessionId: string, ttl: number): Promise<void>;
    getStats(): Promise<StoreStats>;
    clear(): Promise<void>;
}
//# sourceMappingURL=session-store.d.ts.map