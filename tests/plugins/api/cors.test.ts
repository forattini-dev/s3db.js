import { createMemoryDatabaseForTest } from '../../config.js';
import { startApiPlugin } from './helpers/server.js';

describe('API Plugin CORS defaults', () => {
  let db;
  let plugin;
  let port;

  beforeEach(async () => {
    const testName = `api-plugin-cors-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
    await db.connect();
  });

  afterEach(async () => {
    if (plugin) {
      await plugin.stop();
      plugin = null;
    }

    if (db) {
      await db.disconnect();
      db = null;
    }
  });

  test('reflects request origin when credentials are enabled with wildcard origin', async () => {
    ({ plugin, port } = await startApiPlugin(db, {
      cors: { enabled: true }
    }));

    const response = await fetch(`http://127.0.0.1:${port}/`, {
      headers: {
        Origin: 'https://admin.example.com'
      }
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://admin.example.com');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('vary')).toBe('Origin');
  });
});
