import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';

import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../../config.js';

async function waitForServer(port: number, maxAttempts: number = 100): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok || response.status === 503) {
        return;
      }
    } catch {
      // Ignore connection failures while the server is booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`API server on port ${port} did not become ready in time after ${maxAttempts * 100}ms`);
}

describe('API Plugin static file routing', () => {
  let db;
  let apiPlugin: ApiPlugin | null = null;
  let port: number;
  let staticDir: string;

  beforeEach(async () => {
    port = 4300 + Math.floor(Math.random() * 1000);
    staticDir = await mkdtemp(path.join(os.tmpdir(), 's3db-static-assets-'));
    await mkdir(path.join(staticDir, 'heroes', 'icons'), { recursive: true });
    await writeFile(path.join(staticDir, 'index.html'), '<html>assets root</html>');
    await writeFile(path.join(staticDir, 'heroes', 'icons', 'icon_218103810.txt'), 'icon payload');

    const testName = `api-plugin-static-routing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
    await db.connect();
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

    if (staticDir) {
      await rm(staticDir, { recursive: true, force: true });
    }
  });

  test('serves nested assets under basePath with cache and cors headers', async () => {
    apiPlugin = new ApiPlugin({
      logLevel: 'silent',
      host: '127.0.0.1',
      port,
      docs: { enabled: false },
      logging: { enabled: false },
      static: [
        {
          driver: 'filesystem',
          path: '/assets',
          root: staticDir,
          config: {
            index: ['index.html'],
            maxAge: 86_400_000,
            cors: true
          }
        }
      ]
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const nestedAssetResponse = await fetch(`http://127.0.0.1:${port}/api/assets/heroes/icons/icon_218103810.txt`);
    expect(nestedAssetResponse.status).toBe(200);
    expect(await nestedAssetResponse.text()).toBe('icon payload');
    expect(nestedAssetResponse.headers.get('cache-control')).toBe('public, max-age=86400');
    expect(nestedAssetResponse.headers.get('access-control-allow-origin')).toBe('*');

    const indexResponse = await fetch(`http://127.0.0.1:${port}/api/assets/`);
    expect(indexResponse.status).toBe(200);
    expect(await indexResponse.text()).toContain('assets root');

    const unprefixedResponse = await fetch(`http://127.0.0.1:${port}/assets/heroes/icons/icon_218103810.txt`);
    expect(unprefixedResponse.status).toBe(404);
  });

  test('supports SPA mode with default API fallbackIgnore so /api routes are not swallowed', async () => {
    await db.createResource({
      name: 'users',
      attributes: {
        id: 'string|required',
        email: 'string|optional'
      },
      timestamps: true
    });
    await db.resources.users.insert({ id: 'u1', email: 'user1@example.com' });

    apiPlugin = new ApiPlugin({
      logLevel: 'silent',
      host: '127.0.0.1',
      port,
      basePath: '/api',
      docs: { enabled: false },
      logging: { enabled: false },
      static: [
        {
          driver: 'filesystem',
          path: '/',
          root: staticDir,
          spa: true
        }
      ],
      resources: {
        users: {
          versionPrefix: 'api',
          methods: ['GET']
        }
      }
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const apiResponse = await fetch(`http://127.0.0.1:${port}/api/users`);
    expect(apiResponse.status).toBe(200);
    const apiPayload = await apiResponse.json();
    expect(apiPayload.success).toBe(true);

    const spaAssetResponse = await fetch(`http://127.0.0.1:${port}/dashboard`);
    expect(spaAssetResponse.status).toBe(200);
    expect(await spaAssetResponse.text()).toContain('assets root');

    const spaAssetFileResponse = await fetch(`http://127.0.0.1:${port}/heroes/icons/icon_218103810.txt`);
    expect(spaAssetFileResponse.status).toBe(200);
    expect(await spaAssetFileResponse.text()).toBe('icon payload');
  });
});
