import { unauthorized } from '../utils/response-formatter.js';
import { createLogger } from '../../../concerns/logger.js';
import { APIKeyResourceManager } from './resource-manager.js';
const logger = createLogger({ name: 'ApiKeyAuth', level: 'info' });
export function generateApiKey(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = '';
    for (let i = 0; i < length; i++) {
        apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return apiKey;
}
export async function createApiKeyHandler(config = {}, database) {
    const { headerName = 'X-API-Key', queryParam = null, keyField = 'apiKey', partitionName = null, optional = false } = config;
    if (!database) {
        throw new Error('API Key driver: database is required');
    }
    const manager = new APIKeyResourceManager(database, 'apikey', config);
    const authResource = await manager.getOrCreateResource();
    const resolvedPartitionName = partitionName || `by${keyField.charAt(0).toUpperCase()}${keyField.slice(1)}`;
    logger.debug(`API Key driver initialized: resource=${authResource.name}, keyField=${keyField}, partition=${resolvedPartitionName}`);
    return async (c, next) => {
        let apiKey = c.req.header(headerName);
        if (!apiKey && queryParam) {
            apiKey = c.req.query(queryParam);
        }
        if (!apiKey) {
            if (optional) {
                return await next();
            }
            const response = unauthorized(queryParam
                ? `Missing ${headerName} header or ${queryParam} query parameter`
                : `Missing ${headerName} header`);
            return c.json(response, response._status);
        }
        try {
            let users;
            const resolvedPartitionName = partitionName || `by${keyField.charAt(0).toUpperCase()}${keyField.slice(1)}`;
            const hasPartition = authResource.partitions && authResource.partitions[resolvedPartitionName];
            if (hasPartition && authResource.listPartition) {
                logger.debug(`Using partition ${resolvedPartitionName} for O(1) API key lookup`);
                users = await authResource.listPartition(resolvedPartitionName, { [keyField]: apiKey }, { limit: 1 });
            }
            else {
                logger.debug(`No partition found (${resolvedPartitionName}), falling back to query (O(n) scan)`);
                users = await authResource.query({ [keyField]: apiKey }, { limit: 1 });
            }
            if (!users || users.length === 0) {
                const response = unauthorized('Invalid API key');
                return c.json(response, response._status);
            }
            const user = users[0];
            if (user.active === false) {
                const response = unauthorized('User account is inactive');
                return c.json(response, response._status);
            }
            if (authResource.schema?.attributes?.lastUsedAt && authResource.patch) {
                authResource.patch(user.id, { lastUsedAt: new Date().toISOString() }).catch(() => { });
            }
            c.set('user', user);
            c.set('authMethod', 'apiKey');
            await next();
        }
        catch (err) {
            logger.error({ error: err.message }, 'Error validating API key');
            const response = unauthorized('Authentication error');
            return c.json(response, response._status);
        }
    };
}
export default {
    generateApiKey,
    createApiKeyHandler
};
//# sourceMappingURL=api-key-auth.js.map