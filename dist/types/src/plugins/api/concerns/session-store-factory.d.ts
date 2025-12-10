import type { SessionStore, RedisClient, Serializer } from './session-store.js';
import { ResourceSessionStore } from './resource-session-store.js';
import type { ResourceLike } from './resource-session-store.js';
export { ResourceSessionStore };
export interface DatabaseLike {
    resources: Record<string, ResourceLike>;
}
export interface S3DBStoreConfig {
    resourceName?: string;
    logLevel?: string;
}
export interface RedisStoreConfig {
    client?: RedisClient;
    url?: string;
    prefix?: string;
    serializer?: Serializer;
    logLevel?: string;
}
export interface MemoryStoreConfig {
    maxSessions?: number;
    logLevel?: string;
}
export type StoreDriver = 's3db' | 'redis' | 'memory';
export interface StoreConfig {
    driver: StoreDriver;
    config?: S3DBStoreConfig | RedisStoreConfig | MemoryStoreConfig;
}
export declare function createSessionStore(storeConfig: StoreConfig, database?: DatabaseLike): Promise<SessionStore>;
//# sourceMappingURL=session-store-factory.d.ts.map