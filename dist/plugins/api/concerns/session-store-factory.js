import { MemoryStore, RedisStore } from './session-store.js';
import { ResourceSessionStore } from './resource-session-store.js';
export { ResourceSessionStore };
export async function createSessionStore(storeConfig, database) {
    if (!storeConfig || !storeConfig.driver) {
        throw new Error('Session store configuration must include a driver');
    }
    const { driver, config = {} } = storeConfig;
    switch (driver) {
        case 's3db':
            return createS3DBSessionStore(config, database);
        case 'redis':
            return createRedisSessionStore(config);
        case 'memory':
            return createMemorySessionStore(config);
        default:
            throw new Error(`Unknown session store driver: "${driver}". ` +
                `Supported drivers: s3db, redis, memory`);
    }
}
function createS3DBSessionStore(config, database) {
    if (!database) {
        throw new Error('S3DB session store requires a database instance. ' +
            'Make sure to pass the database as the second argument to createSessionStore().');
    }
    const resourceName = config.resourceName || 'oidc_sessions';
    if (!database.resources[resourceName]) {
        throw new Error(`S3DB session store resource not found: "${resourceName}". ` +
            `Create it first with: ` +
            `await db.createResource({ name: '${resourceName}', attributes: { expiresAt: 'string|required' } })`);
    }
    const resource = database.resources[resourceName];
    return new ResourceSessionStore(resource, {
        logLevel: config.logLevel || 'info'
    });
}
async function createRedisSessionStore(config) {
    try {
        if (!config.client && !config.url) {
            throw new Error('Redis session store requires either "client" (redis instance) or "url" (connection string)');
        }
        if (config.url && !config.client) {
            try {
                const { createClient } = await import('redis');
                const client = createClient({ url: config.url });
                await client.connect();
                config.client = client;
            }
            catch (err) {
                throw new Error(`Failed to create Redis client from URL. Is redis package installed? ` +
                    `Error: ${err.message}`);
            }
        }
        return new RedisStore({
            client: config.client,
            prefix: config.prefix || 'session:',
            serializer: config.serializer || JSON,
            logLevel: config.logLevel || 'info'
        });
    }
    catch (err) {
        if (err.message?.includes('not installed')) {
            throw new Error('Redis session store requires "redis" package. ' +
                'Install it with: npm install redis');
        }
        throw err;
    }
}
function createMemorySessionStore(config) {
    return new MemoryStore({
        maxSessions: config.maxSessions || 10000,
        logLevel: config.logLevel || 'info'
    });
}
//# sourceMappingURL=session-store-factory.js.map