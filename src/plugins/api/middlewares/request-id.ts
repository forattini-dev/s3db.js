import type { Context, MiddlewareHandler, Next } from 'hono';
import { idGenerator } from '../../../concerns/id.js';

export type IdGeneratorFn = () => string;

export interface RequestIdConfig {
  headerName?: string;
  generator?: IdGeneratorFn;
  includeInResponse?: boolean;
  includeInLogs?: boolean;
}

export function createRequestIdMiddleware(config: RequestIdConfig = {}): MiddlewareHandler {
  const {
    headerName = 'X-Request-ID',
    generator = () => idGenerator(),
    includeInResponse = true,
    includeInLogs = true
  } = config;

  return async (c: Context, next: Next): Promise<void | Response> => {
    let requestId = c.req.header(headerName);

    if (!requestId) {
      requestId = generator();
    }

    c.set('requestId', requestId);

    await next();

    if (includeInResponse) {
      c.header(headerName, requestId);
    }
  };
}

export default createRequestIdMiddleware;
