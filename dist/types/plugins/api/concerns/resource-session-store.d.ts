import { SessionStore } from './session-store.js';
import type { SessionData, StoreStats } from './session-store.js';
import type { Logger } from '../../../concerns/logger.js';
export interface ResourceLike {
    name: string;
    get(id: string): Promise<SessionData | null>;
    update(id: string, data: SessionData): Promise<SessionData>;
    insert(data: SessionData & {
        id: string;
    }): Promise<SessionData>;
    delete(id: string): Promise<void>;
    patch(id: string, data: Partial<SessionData>): Promise<SessionData>;
    list(options?: {
        limit?: number;
    }): Promise<{
        total?: number;
        items?: SessionData[];
    }>;
    query(): Promise<SessionData[]>;
}
export interface ResourceSessionStoreOptions {
    logLevel?: string;
    logger?: Logger;
}
export declare class ResourceSessionStore extends SessionStore {
    private resource;
    private logLevel;
    private logger;
    constructor(resource: ResourceLike, options?: ResourceSessionStoreOptions);
    get(sessionId: string): Promise<SessionData | null>;
    set(sessionId: string, sessionData: SessionData, ttl: number): Promise<void>;
    destroy(sessionId: string): Promise<void>;
    touch(sessionId: string, ttl: number): Promise<void>;
    getStats(): Promise<StoreStats & {
        resourceName?: string;
    }>;
    clear(): Promise<number>;
}
//# sourceMappingURL=resource-session-store.d.ts.map