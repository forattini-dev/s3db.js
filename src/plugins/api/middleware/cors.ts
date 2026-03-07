import type { Context, Next } from '#src/plugins/shared/http-runtime.js';

export interface CorsConfig {
  origin: string;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

export async function createCorsMiddleware(
  corsConfig: CorsConfig
): Promise<(c: Context, next: Next) => Promise<Response | void>> {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const { origin, methods, allowedHeaders, exposedHeaders, credentials, maxAge } = corsConfig;
    const requestOrigin = c.req.header('origin');
    const allowOrigin = credentials && origin === '*' && requestOrigin
      ? requestOrigin
      : origin;

    c.header('Access-Control-Allow-Origin', allowOrigin);
    c.header('Access-Control-Allow-Methods', methods.join(', '));
    c.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    c.header('Access-Control-Expose-Headers', exposedHeaders.join(', '));

    if (credentials) {
      c.header('Access-Control-Allow-Credentials', 'true');
    }

    if (allowOrigin !== origin) {
      c.header('Vary', 'Origin');
    }

    c.header('Access-Control-Max-Age', maxAge.toString());

    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    await next();
  };
}
