/**
 * API Plugin - Docs CSP Tests
 *
 * Verifies that /openapi.json and /docs are available by default and that
 * the docs route sets a permissive CSP header (including Redoc CDN).
 * Also verifies that docs.csp overrides route-level CSP when provided.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach
} from '@jest/globals';
import http from 'http';
import { ApiPlugin } from '../../../src/plugins/api/index.js';
import { createMemoryDatabaseForTest } from '../../config.js';

function rawHttpRequest(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: { ...headers }
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function waitForServer(port, path = '/openapi.json', maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await rawHttpRequest(port, path);
      if (res.status && res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server on port ${port} not ready after ${maxAttempts * 100}ms`);
}

describe('API Plugin - Docs CSP', () => {
  let db;
  let apiPlugin;
  let port;

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

  it('serves /openapi.json and /docs with route-level CSP including Redoc CDN by default', async () => {
    port = 4800 + Math.floor(Math.random() * 300);
    const testName = `api-docs-default-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
    await db.connect();

    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: true, ui: 'redoc' },
      logging: { enabled: false },
      resources: {}
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const openapi = await rawHttpRequest(port, '/openapi.json');
    expect(openapi.status).toBe(200);

    const docs = await rawHttpRequest(port, '/docs');
    expect(docs.status).toBe(200);
    const cspHeader = docs.headers['content-security-policy'];
    expect(typeof cspHeader).toBe('string');
    expect(cspHeader).toContain('https://cdn.redoc.ly');
  });

  it('applies docs.csp override when provided', async () => {
    port = 5200 + Math.floor(Math.random() * 300);
    const testName = `api-docs-override-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    db = createMemoryDatabaseForTest(testName, { logLevel: 'silent' });
    await db.connect();

    const customCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'";
    apiPlugin = new ApiPlugin({
      port,
      host: '127.0.0.1',
      logLevel: 'silent',
      docs: { enabled: true, ui: 'redoc', csp: customCsp },
      logging: { enabled: false },
      resources: {}
    });

    await db.usePlugin(apiPlugin);
    await waitForServer(port);

    const docs = await rawHttpRequest(port, '/docs');
    expect(docs.status).toBe(200);
    const cspHeader = docs.headers['content-security-policy'];
    expect(cspHeader).toBe(customCsp);
  });
});

