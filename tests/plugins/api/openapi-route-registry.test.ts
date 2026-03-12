import { describe, expect, it } from 'vitest';
import { generateOpenAPISpec } from '../../../src/plugins/api/utils/openapi-generator.js';
import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../../config.js';

async function waitForServer(port: number, maxAttempts = 100): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) {
        return;
      }
    } catch {
      // wait for boot
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`API server on port ${port} did not become ready in time`);
}

function buildDatabase() {
  return {
    resources: {
      urls: {
        name: 'urls',
        version: 'v1',
        attributes: {
          slug: 'string|required'
        },
        config: {
          currentVersion: 'v1',
          description: 'URL resource',
          attributes: {
            slug: 'string|required'
          }
        },
        schema: {
          _pluginAttributes: null
        },
        $schema: {
          partitions: {},
          attributes: {
            slug: 'string|required'
          }
        }
      }
    },
    pluginRegistry: {}
  };
}

describe('OpenAPI route registry integration', () => {
  it('uses the explicit route registry when generating operations', () => {
    const spec = generateOpenAPISpec(buildDatabase(), {
      routeRegistry: {
        list: () => [
          {
            kind: 'plugin-custom',
            path: '/ready',
            methods: ['GET'],
            originalKey: 'GET /ready'
          },
          {
            kind: 'docs',
            path: '/docs',
            methods: ['GET']
          }
        ]
      }
    });

    expect(spec.paths['/ready']?.get).toBeDefined();
    expect(spec.paths['/docs']?.get).toBeDefined();
  });

  it('captures mounted runtime routes in the ApiServer route registry', async () => {
    const port = 4800 + Math.floor(Math.random() * 1000);
    const testName = `api-plugin-route-registry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
    let apiPlugin: ApiPlugin | null = null;

    try {
      await db.connect();
      const users = await db.createResource({
        name: 'users',
        attributes: {
          email: 'string|required|email'
        }
      });
      (users.config as Record<string, unknown>).api = {
        'POST /meta/summary': (c) => c.json({ ok: true })
      };

      apiPlugin = new ApiPlugin({
        port,
        host: '127.0.0.1',
        logLevel: 'silent',
        logging: { enabled: false },
        metrics: { enabled: true },
        failban: { enabled: true },
        routes: {
          'GET /ready': (c) => c.json({ ok: true })
        },
        auth: {
          resource: 'plg_api_users',
          drivers: [{
            driver: 'jwt',
            config: {
              secret: 'top-secret',
              resource: 'plg_api_users'
            }
          }]
        },
        resources: ['users']
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const registeredRoutes = apiPlugin.server!.getRegisteredRoutes();

      expect(registeredRoutes.some((route) => route.kind === 'root' && route.path === '/')).toBe(true);
      expect(registeredRoutes.some((route) => route.kind === 'docs' && route.path === '/docs')).toBe(true);
      expect(registeredRoutes.some((route) => route.kind === 'plugin-custom' && route.path === '/ready')).toBe(true);
      expect(registeredRoutes.some((route) => route.kind === 'resource' && route.path === '/users')).toBe(true);
      expect(registeredRoutes.some((route) => route.kind === 'resource-custom' && route.path === '/users/meta/summary')).toBe(true);
      expect(registeredRoutes.some((route) => route.kind === 'auth' && route.path === '/auth/login')).toBe(true);
      expect(registeredRoutes.some((route) => route.kind === 'metrics' && route.path === '/metrics')).toBe(true);
      expect(registeredRoutes.some((route) => route.kind === 'admin' && route.path === '/admin/security/stats')).toBe(true);

      const openApiResponse = await fetch(`http://127.0.0.1:${port}/openapi.json`);
      expect(openApiResponse.status).toBe(200);
      const spec = await openApiResponse.json();
      expect(spec.paths['/users/meta/summary']?.post).toBeDefined();
    } finally {
      if (apiPlugin) {
        await apiPlugin.stop();
      }
      await db.disconnect();
    }
  });
});
