import { describe, expect, it } from 'vitest';
import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { HttpApp } from '../../../src/plugins/shared/http-runtime.js';
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

describe('ApiPlugin getApp runtime contract', () => {
  it('returns the mounted root HttpApp instance after startup', async () => {
    const port = 4700 + Math.floor(Math.random() * 1000);
    const testName = `api-plugin-root-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
    let apiPlugin: ApiPlugin | null = null;

    try {
      await db.connect();

      apiPlugin = new ApiPlugin({
        port,
        host: '127.0.0.1',
        logLevel: 'silent',
        docs: { enabled: false },
        logging: { enabled: false },
        resources: []
      });

      await db.usePlugin(apiPlugin);
      await waitForServer(port);

      const app = apiPlugin.getApp();

      expect(app).toBeInstanceOf(HttpApp);
      expect(app).not.toBeNull();

      app!.get('/__runtime-root-check', (c) => c.json({ ok: true }));

      const response = await fetch(`http://127.0.0.1:${port}/__runtime-root-check`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    } finally {
      if (apiPlugin) {
        await apiPlugin.stop();
      }
      await db.disconnect();
    }
  });
});
