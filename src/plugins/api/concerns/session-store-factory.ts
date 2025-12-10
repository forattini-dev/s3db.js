import { MemoryStore, RedisStore } from './session-store.js';
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

export async function createSessionStore(
  storeConfig: StoreConfig,
  database?: DatabaseLike
): Promise<SessionStore> {
  if (!storeConfig || !storeConfig.driver) {
    throw new Error('Session store configuration must include a driver');
  }

  const { driver, config = {} } = storeConfig;

  switch (driver) {
    case 's3db':
      return createS3DBSessionStore(config as S3DBStoreConfig, database);

    case 'redis':
      return createRedisSessionStore(config as RedisStoreConfig);

    case 'memory':
      return createMemorySessionStore(config as MemoryStoreConfig);

    default:
      throw new Error(
        `Unknown session store driver: "${driver}". ` +
        `Supported drivers: s3db, redis, memory`
      );
  }
}

function createS3DBSessionStore(config: S3DBStoreConfig, database?: DatabaseLike): ResourceSessionStore {
  if (!database) {
    throw new Error(
      'S3DB session store requires a database instance. ' +
      'Make sure to pass the database as the second argument to createSessionStore().'
    );
  }

  const resourceName = config.resourceName || 'oidc_sessions';

  if (!database.resources[resourceName]) {
    throw new Error(
      `S3DB session store resource not found: "${resourceName}". ` +
      `Create it first with: ` +
      `await db.createResource({ name: '${resourceName}', attributes: { expiresAt: 'string|required' } })`
    );
  }

  const resource = database.resources[resourceName];

  return new ResourceSessionStore(resource, {
    logLevel: config.logLevel || 'info'
  });
}

interface RedisModule {
  createClient(options: { url: string }): RedisClient & { connect(): Promise<void> };
}

async function createRedisSessionStore(config: RedisStoreConfig): Promise<RedisStore> {
  try {
    if (!config.client && !config.url) {
      throw new Error(
        'Redis session store requires either "client" (redis instance) or "url" (connection string)'
      );
    }

    if (config.url && !config.client) {
      try {
        const { createClient } = await import('redis' as string) as RedisModule;
        const client = createClient({ url: config.url });
        await client.connect();
        config.client = client;
      } catch (err) {
        throw new Error(
          `Failed to create Redis client from URL. Is redis package installed? ` +
          `Error: ${(err as Error).message}`
        );
      }
    }

    return new RedisStore({
      client: config.client!,
      prefix: config.prefix || 'session:',
      serializer: config.serializer || JSON,
      logLevel: config.logLevel || 'info'
    });
  } catch (err) {
    if ((err as Error).message?.includes('not installed')) {
      throw new Error(
        'Redis session store requires "redis" package. ' +
        'Install it with: npm install redis'
      );
    }
    throw err;
  }
}

function createMemorySessionStore(config: MemoryStoreConfig): MemoryStore {
  return new MemoryStore({
    maxSessions: config.maxSessions || 10000,
    logLevel: config.logLevel || 'info'
  });
}
