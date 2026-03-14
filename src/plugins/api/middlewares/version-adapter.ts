import type { Context, MiddlewareHandler } from '#src/plugins/shared/http-runtime.js';

export interface VersionAdapter {
  response?: (data: Record<string, unknown>) => Record<string, unknown>;
  request?: (data: Record<string, unknown>) => Record<string, unknown>;
  deprecated?: boolean;
  sunset?: string;
}

export interface VersionsConfig {
  current?: string;
  adapters: Record<string, VersionAdapter>;
}

export function createVersionAdapterMiddleware(adapter: VersionAdapter, versionKey: string): MiddlewareHandler {
  return async (c: Context, next: () => Promise<void>): Promise<void | Response> => {
    if (adapter.request) {
      const method = c.req.method.toUpperCase();
      if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        try {
          const body = await c.req.json() as Record<string, unknown>;
          const transformed = adapter.request(body);
          c.set('transformedBody' as never, transformed as never);
        } catch {
          // no body or invalid JSON — let downstream handler deal with it
        }
      }
    }

    await next();

    const res = c.res;
    if (!res) return;

    if (adapter.deprecated) {
      res.headers.set('Deprecation', 'true');
      if (adapter.sunset) {
        res.headers.set('Sunset', adapter.sunset);
      }
    }

    if (adapter.response && res.headers.get('content-type')?.includes('application/json')) {
      try {
        const original = await res.json() as Record<string, unknown>;
        let transformed: unknown;

        if (original && typeof original === 'object' && 'data' in original) {
          const data = original.data;
          if (Array.isArray(data)) {
            transformed = {
              ...original,
              data: data.map(item =>
                item && typeof item === 'object'
                  ? adapter.response!(item as Record<string, unknown>)
                  : item
              )
            };
          } else if (data && typeof data === 'object') {
            transformed = {
              ...original,
              data: adapter.response(data as Record<string, unknown>)
            };
          } else {
            transformed = original;
          }
        } else {
          transformed = original;
        }

        c.res = new Response(JSON.stringify(transformed), {
          status: res.status,
          headers: res.headers
        });
        c.res!.headers.set('content-type', 'application/json; charset=UTF-8');
        c.res!.headers.set('X-API-Version', versionKey);
      } catch {
        // response not JSON — pass through
      }
    }
  };
}
