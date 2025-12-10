import type { Context, Next } from 'hono';

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

    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', methods.join(', '));
    c.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    c.header('Access-Control-Expose-Headers', exposedHeaders.join(', '));

    if (credentials) {
      c.header('Access-Control-Allow-Credentials', 'true');
    }

    c.header('Access-Control-Max-Age', maxAge.toString());

    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    await next();
  };
}
