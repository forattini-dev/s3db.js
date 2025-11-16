import { ApiPlugin } from '../../../../src/plugins/api/index.js';

const BASE_PORT = 3300;

export function randomPort() {
  return BASE_PORT + Math.floor(Math.random() * 4000);
}

export async function waitForServer(port, options = {}) {
  const {
    path = '/health',
    maxAttempts = 60,
    delayMs = 100
  } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      if (response.ok || response.status === 401 || response.status === 404) {
        return;
      }
    } catch (err) {
      // swallow connection errors until server is ready
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error(`API server on port ${port} did not become ready in time`);
}

export async function startApiPlugin(db, pluginOptions = {}, instanceName) {
  const port = pluginOptions.port ?? randomPort();
  const mergedOptions = {
    host: '127.0.0.1',
    logLevel: 'silent',
    ...pluginOptions,
    port
  };

  if (!mergedOptions.docs) {
    mergedOptions.docs = { enabled: false };
  }
  if (!('logging' in mergedOptions)) {
    mergedOptions.logging = { enabled: false };
  }

  const plugin = new ApiPlugin(mergedOptions);
  const name = instanceName || `api-test-${port}`;
  await db.usePlugin(plugin, name);
  await waitForServer(port);
  return { plugin, port };
}
