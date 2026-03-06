import type { Context, Next } from '#src/plugins/shared/http-runtime.js';
import type { ContentfulStatusCode } from '#src/plugins/shared/http-runtime.js';
import type { Logger } from '../../../concerns/logger.js';
import type { ResourceLike, DatabaseLike } from './resource-manager.js';
import { unauthorized } from '../utils/response-formatter.js';
import { createLogger } from '../../../concerns/logger.js';
import { APIKeyResourceManager, resolveUser } from './resource-manager.js';

const logger = createLogger({ name: 'ApiKeyAuth', level: 'info' });

export interface ApiKeyConfig {
  resource?: string;
  createResource?: boolean;
  keyField?: string;
  partitionName?: string | null;
  headerName?: string;
  queryParam?: string | null;
  optional?: boolean;
  lookupById?: boolean;
}

export interface UserRecord {
  id: string;
  active?: boolean;
  isActive?: boolean;
  [key: string]: unknown;
}

export function generateApiKey(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let apiKey = '';

  for (let i = 0; i < length; i++) {
    apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return apiKey;
}

export async function createApiKeyHandler(
  config: ApiKeyConfig = {},
  database: DatabaseLike
): Promise<(c: Context, next: Next) => Promise<Response | void>> {
  const {
    headerName = 'X-API-Key',
    queryParam = null,
    keyField = 'apiKey',
    partitionName = null,
    optional = false,
    lookupById = false
  } = config;

  if (!database) {
    throw new Error('API Key driver: database is required');
  }

  const manager = new APIKeyResourceManager(database, 'apikey', config as unknown as ConstructorParameters<typeof APIKeyResourceManager>[2]);
  const authResource = await manager.getOrCreateResource();

  logger.debug(`API Key driver initialized: resource=${authResource.name}, keyField=${keyField}, lookupById=${lookupById}`);

  return async (c: Context, next: Next): Promise<Response | void> => {
    let apiKey: string | undefined = c.req.header(headerName);

    if (!apiKey && queryParam) {
      apiKey = c.req.query(queryParam);
    }

    if (!apiKey) {
      if (optional) {
        return await next();
      }

      const response = unauthorized(
        queryParam
          ? `Missing ${headerName} header or ${queryParam} query parameter`
          : `Missing ${headerName} header`
      );
      return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
    }

    try {
      const user = await resolveUser<UserRecord>(authResource, keyField, apiKey, lookupById, partitionName || undefined);

      if (!user) {
        const response = unauthorized('Invalid API key');
        return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
      }

      if (user.active === false || user.isActive === false) {
        const response = unauthorized('User account is inactive');
        return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
      }

      if ((authResource.schema?.attributes as Record<string, unknown>)?.lastUsedAt && authResource.patch) {
        authResource.patch(user.id, { lastUsedAt: new Date().toISOString() }).catch(() => {});
      }

      c.set('user', user);
      c.set('authMethod', 'apiKey');

      await next();
    } catch (err) {
      logger.error({ error: (err as Error).message }, 'Error validating API key');
      const response = unauthorized('Authentication error');
      return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
    }
  };
}

export default {
  generateApiKey,
  createApiKeyHandler
};
