import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../../config.js';

async function waitForServer(port: number, maxAttempts = 100): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) {
        return;
      }
    } catch (_err) {
      // swallow connection errors until server is ready
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server on port ${port} did not become ready in time after ${maxAttempts * 100}ms`);
}

describe('API Plugin - USD documentation endpoints', () => {
  let db: ReturnType<typeof createMemoryDatabaseForTest> | null;
  let apiPlugin: ApiPlugin | null;
  let port: number;

  beforeEach(async () => {
    port = 3600 + Math.floor(Math.random() * 1000);
    const testName = `api-plugin-usd-docs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
    await db.connect();
    apiPlugin = null;
  });

  afterEach(async () => {
    if (apiPlugin) {
      await apiPlugin.stop();
      apiPlugin = null;
    }

    if (db) {
      await db.disconnect();
      db = null;
    }
  });

  it('serves USD on legacy and canonical paths with x-usd http protocol', async () => {
    await db!.createResource({
      name: 'docs_check',
      attributes: {
        id: 'string|optional',
        name: 'string|required'
      },
      behavior: 'body-overflow',
      timestamps: true
    });

    apiPlugin = new ApiPlugin({
      logLevel: 'silent',
      port,
      host: '127.0.0.1',
      docs: { enabled: true },
      logging: { enabled: false },
      resources: ['docs_check']
    });

    await db!.usePlugin(apiPlugin);
    await waitForServer(port);

    const legacyUsdResponse = await fetch(`http://127.0.0.1:${port}/api.usd.json`);
    expect(legacyUsdResponse.status).toBe(200);
    const legacyUsd = await legacyUsdResponse.json();
    expect(legacyUsd.usd).toBe('1.0.0');
    expect(legacyUsd.openapi).toBe('3.1.0');
    expect(legacyUsd['x-usd']?.protocols).toContain('http');

    const canonicalUsdJsonResponse = await fetch(`http://127.0.0.1:${port}/docs/usd.json`);
    expect(canonicalUsdJsonResponse.status).toBe(200);
    const canonicalUsdJson = await canonicalUsdJsonResponse.json();
    expect(canonicalUsdJson.usd).toBe('1.0.0');
    expect(canonicalUsdJson['x-usd']?.protocols).toContain('http');

    const canonicalUsdYamlResponse = await fetch(`http://127.0.0.1:${port}/docs/usd.yaml`);
    expect(canonicalUsdYamlResponse.status).toBe(200);
    const canonicalUsdYaml = await canonicalUsdYamlResponse.text();
    expect(canonicalUsdYaml).toMatch(/usd:\s*['"]?1\.0\.0['"]?/);
    expect(canonicalUsdYaml).toContain('x-usd:');

    const docsOpenApiResponse = await fetch(`http://127.0.0.1:${port}/docs/openapi.json`);
    expect(docsOpenApiResponse.status).toBe(200);
    const docsOpenApi = await docsOpenApiResponse.json();
    expect(docsOpenApi.openapi).toBe('3.1.0');
  });

  it('applies basePath to USD and OpenAPI docs aliases', async () => {
    await db!.createResource({
      name: 'docs_check_basepath',
      attributes: {
        id: 'string|optional',
        name: 'string|required'
      },
      behavior: 'body-overflow',
      timestamps: true
    });

    apiPlugin = new ApiPlugin({
      logLevel: 'silent',
      port,
      host: '127.0.0.1',
      basePath: '/api',
      docs: { enabled: true },
      logging: { enabled: false },
      resources: ['docs_check_basepath']
    });

    await db!.usePlugin(apiPlugin);
    await waitForServer(port);

    const legacyUsdResponse = await fetch(`http://127.0.0.1:${port}/api/api.usd.json`);
    expect(legacyUsdResponse.status).toBe(200);

    const canonicalUsdResponse = await fetch(`http://127.0.0.1:${port}/api/docs/usd.json`);
    expect(canonicalUsdResponse.status).toBe(200);

    const canonicalYamlResponse = await fetch(`http://127.0.0.1:${port}/api/docs/usd.yaml`);
    expect(canonicalYamlResponse.status).toBe(200);

    const docsOpenApiResponse = await fetch(`http://127.0.0.1:${port}/api/docs/openapi.json`);
    expect(docsOpenApiResponse.status).toBe(200);

    const rootOpenApiResponse = await fetch(`http://127.0.0.1:${port}/api/openapi.json`);
    expect(rootOpenApiResponse.status).toBe(200);
  });
});
