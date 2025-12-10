import { SessionStore } from './session-store.js';
import type { SessionData, StoreStats } from './session-store.js';
import { createLogger } from '../../../concerns/logger.js';
import type { Logger, LogLevel } from '../../../concerns/logger.js';

export interface ResourceLike {
  name: string;
  get(id: string): Promise<SessionData | null>;
  update(id: string, data: SessionData): Promise<SessionData>;
  insert(data: SessionData & { id: string }): Promise<SessionData>;
  delete(id: string): Promise<void>;
  patch(id: string, data: Partial<SessionData>): Promise<SessionData>;
  list(options?: { limit?: number }): Promise<{ total?: number; items?: SessionData[] }>;
  query(): Promise<SessionData[]>;
}

export interface ResourceSessionStoreOptions {
  logLevel?: string;
  logger?: Logger;
}

interface SessionWithId extends SessionData {
  id: string;
}

interface NotFoundError extends Error {
  code?: string;
  statusCode?: number;
}

function isNotFoundError(err: unknown): boolean {
  const error = err as NotFoundError;
  return (
    error.message?.includes('NotFound') ||
    error.code === 'ENOTFOUND' ||
    error.statusCode === 404
  );
}

export class ResourceSessionStore extends SessionStore {
  private resource: ResourceLike;
  private logLevel: string;
  private logger: Logger;

  constructor(resource: ResourceLike, options: ResourceSessionStoreOptions = {}) {
    if (!resource) {
      throw new Error('ResourceSessionStore requires a resource argument');
    }

    super();
    this.resource = resource;
    this.logLevel = options.logLevel || 'info';

    if (options.logger) {
      this.logger = options.logger;
    } else {
      this.logger = createLogger({ name: 'ResourceSessionStore', level: this.logLevel as LogLevel });
    }

    this.logger.debug({ resourceName: resource.name }, `Initialized with resource: ${resource.name}`);
  }

  override async get(sessionId: string): Promise<SessionData | null> {
    try {
      const session = await this.resource.get(sessionId);

      this.logger.debug({ sessionId }, `Retrieved session: ${sessionId}`);

      return session;
    } catch (err) {
      if (isNotFoundError(err)) {
        return null;
      }

      throw err;
    }
  }

  override async set(sessionId: string, sessionData: SessionData, ttl: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttl).toISOString();

    try {
      await this.resource.update(sessionId, {
        ...sessionData,
        expiresAt
      });

      this.logger.debug({ sessionId }, `Updated session: ${sessionId}`);
    } catch (err) {
      if (isNotFoundError(err)) {
        await this.resource.insert({
          id: sessionId,
          ...sessionData,
          expiresAt
        });

        this.logger.debug({ sessionId }, `Created session: ${sessionId}`);
      } else {
        throw err;
      }
    }
  }

  override async destroy(sessionId: string): Promise<void> {
    try {
      await this.resource.delete(sessionId);

      this.logger.debug({ sessionId }, `Deleted session: ${sessionId}`);
    } catch (err) {
      if (!isNotFoundError(err)) {
        throw err;
      }

      this.logger.debug({ sessionId }, `Session not found (already deleted): ${sessionId}`);
    }
  }

  override async touch(sessionId: string, ttl: number): Promise<void> {
    const session = await this.get(sessionId);
    if (session) {
      const expiresAt = new Date(Date.now() + ttl).toISOString();
      await this.resource.patch(sessionId, { expiresAt });

      this.logger.debug({ sessionId }, `Touched session: ${sessionId}`);
    }
  }

  async getStats(): Promise<StoreStats & { resourceName?: string }> {
    try {
      const list = await this.resource.list({ limit: 1 });
      return {
        count: list.total || 0,
        resourceName: this.resource.name
      };
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, `Error getting stats: ${(err as Error).message}`);
      return { count: 0, error: (err as Error).message };
    }
  }

  async clear(): Promise<number> {
    try {
      const sessions = await this.resource.query() as SessionWithId[];
      let deleted = 0;

      for (const session of sessions) {
        try {
          await this.resource.delete(session.id);
          deleted++;
        } catch (err) {
          this.logger.warn({ sessionId: session.id, error: (err as Error).message }, `Failed to delete session ${session.id}: ${(err as Error).message}`);
        }
      }

      this.logger.debug({ deleted }, `Cleared ${deleted} sessions`);

      return deleted;
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, `Error clearing sessions: ${(err as Error).message}`);
      return 0;
    }
  }
}
