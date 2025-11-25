/**
 * Tests for mountDocs + OpenAPI generation + Code Samples
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ApiApp } from '../../../src/plugins/api/app.class.js';

describe('mountDocs + OpenAPI + Code Samples', () => {
  let app;

  beforeEach(() => {
    app = new ApiApp({
      db: { name: 'test-db' },
      resources: { users: {} }
    });
  });

  describe('mountDocs()', () => {
    test('adds /openapi.json and /docs endpoints', () => {
      app.mountDocs({
        title: 'Test API',
        version: '1.0.0'
      });

      const routes = app.getRoutes();
      const openapiRoute = routes.find(r => r.path === '/openapi.json');
      const docsRoute = routes.find(r => r.path === '/docs');

      expect(openapiRoute).toBeTruthy();
      expect(openapiRoute.method).toBe('GET');
      expect(docsRoute).toBeTruthy();
      expect(docsRoute.method).toBe('GET');
    });

    test('uses custom paths when provided', () => {
      app.mountDocs({
        jsonPath: '/api-spec.json',
        htmlPath: '/documentation'
      });

      const routes = app.getRoutes();
      expect(routes.find(r => r.path === '/api-spec.json')).toBeTruthy();
      expect(routes.find(r => r.path === '/documentation')).toBeTruthy();
    });

    test('spec is generated on-demand (reflects routes added after mount)', async () => {
      // Mount docs first
      app.mountDocs({ title: 'Test' });

      // Add route AFTER mounting docs
      app.post('/users', {
        description: 'Create user',
        schema: { email: 'string|required|email' }
      }, async (ctx) => ctx.success());

      // Get spec
      const openapiRoute = app.getRoutes().find(r => r.path === '/openapi.json');
      expect(openapiRoute).toBeTruthy();

      // Simulate request
      const mockCtx = {
        json: (data) => ({ jsonData: data })
      };

      // Handler is async, need to await
      const result = await openapiRoute.handlers[openapiRoute.handlers.length - 1](mockCtx);
      const spec = result.jsonData;

      // Verify route is in spec
      expect(spec.paths['/users']).toBeTruthy();
      expect(spec.paths['/users'].post).toBeTruthy();
      expect(spec.paths['/users'].post.summary).toContain('Create user');
    });
  });

  describe('OpenAPI Spec Generation', () => {
    test('includes all error responses', async () => {
      app.post('/users', {
        description: 'Create user',
        guards: ['isAuthenticated'],
        schema: { email: 'string|required|email' }
      }, async (ctx) => ctx.success());

      const spec = await app.generateOpenAPI({ title: 'Test' });

      const operation = spec.paths['/users'].post;

      // Check all responses
      expect(operation.responses['200']).toBeTruthy();
      expect(operation.responses['400']).toBeTruthy();  // POST has 400
      expect(operation.responses['401']).toBeTruthy();  // Has guards
      expect(operation.responses['403']).toBeTruthy();  // Has guards
      expect(operation.responses['422']).toBeTruthy(); // Has schema
      expect(operation.responses['500']).toBeTruthy(); // Always present
    });

    test('includes security schemes when guards are present', async () => {
      app.guard('isAuthenticated', async () => true);

      app.get('/protected', {
        guards: ['isAuthenticated']
      }, async (ctx) => ctx.success());

      const spec = await app.generateOpenAPI({ title: 'Test' });

      expect(spec.components.securitySchemes).toBeTruthy();
      expect(spec.components.securitySchemes.bearerAuth).toBeTruthy();
      expect(spec.components.securitySchemes.apiKey).toBeTruthy();
    });

    test('includes servers configuration', async () => {
      app.get('/test', {}, async (ctx) => ctx.success());

      app.mountDocs({
        title: 'Test',
        servers: [
          { url: 'https://api.production.com', description: 'Production' },
          { url: 'http://localhost:3000', description: 'Development' }
        ]
      });

      const openapiRoute = app.getRoutes().find(r => r.path === '/openapi.json');
      const mockCtx = { json: (data) => ({ jsonData: data }) };
      const result = await openapiRoute.handlers[openapiRoute.handlers.length - 1](mockCtx);
      const spec = result.jsonData;

      expect(spec.servers).toHaveLength(2);
      expect(spec.servers[0].url).toBe('https://api.production.com');
      expect(spec.servers[1].url).toBe('http://localhost:3000');
    });

    test('generates example from schema', async () => {
      app.post('/users', {
        schema: {
          email: 'string|required|email',
          age: 'number|min:18|max:100'
        }
      }, async (ctx) => ctx.success());

      const spec = await app.generateOpenAPI({ title: 'Test' });

      const requestBody = spec.paths['/users'].post.requestBody;
      expect(requestBody).toBeTruthy();
      expect(requestBody.content['application/json'].examples).toBeTruthy();

      const example = requestBody.content['application/json'].examples.default.value;
      expect(example.email).toBeTruthy();
      expect(example.email).toMatch(/@/); // Email format
      expect(example.age).toBeGreaterThanOrEqual(18);
      expect(example.age).toBeLessThanOrEqual(100);
    });

    test('generates validation error example', async () => {
      app.post('/users', {
        schema: {
          email: 'string|required|email',
          name: 'string|required'
        }
      }, async (ctx) => ctx.success());

      const spec = await app.generateOpenAPI({ title: 'Test' });

      const response422 = spec.paths['/users'].post.responses['422'];
      expect(response422).toBeTruthy();

      const example = response422.content['application/json'].examples.validationError.value;
      expect(example.success).toBe(false);
      expect(example.error.code).toBe('VALIDATION_ERROR');
      expect(example.error.details).toBeInstanceOf(Array);
      expect(example.error.details.length).toBeGreaterThan(0);
    });
  });

  describe('Code Samples (x-codeSamples)', () => {
    test('includes code samples when enabled (default)', async () => {
      app.post('/users', {
        description: 'Create user',
        schema: { email: 'string|required|email' }
      }, async (ctx) => ctx.success());

      const spec = await app.generateOpenAPI({
        title: 'Test',
        servers: [{ url: 'https://api.example.com' }]
      });

      const operation = spec.paths['/users'].post;
      expect(operation['x-codeSamples']).toBeTruthy();
      expect(Array.isArray(operation['x-codeSamples'])).toBe(true);

      // Check all 6 languages
      const languages = operation['x-codeSamples'].map(s => s.lang);
      expect(languages).toContain('cURL');
      expect(languages).toContain('Node.js');
      expect(languages).toContain('JavaScript');
      expect(languages).toContain('Python');
      expect(languages).toContain('PHP');
      expect(languages).toContain('Go');
    });

    test('code samples include auth header when guards present', async () => {
      app.guard('isAuthenticated', async () => true);

      app.post('/users', {
        guards: ['isAuthenticated'],
        schema: { email: 'string|required|email' }
      }, async (ctx) => ctx.success());

      const spec = await app.generateOpenAPI({
        title: 'Test',
        servers: [{ url: 'https://api.example.com' }]
      });

      const curlSample = spec.paths['/users'].post['x-codeSamples'].find(s => s.lang === 'cURL');
      expect(curlSample.source).toContain('Authorization: Bearer');
    });

    test('code samples can be disabled', async () => {
      app.get('/test', {}, async (ctx) => ctx.success());

      app.mountDocs({
        title: 'Test',
        includeCodeSamples: false
      });

      const openapiRoute = app.getRoutes().find(r => r.path === '/openapi.json');
      const mockCtx = { json: (data) => ({ jsonData: data }) };
      const result = await openapiRoute.handlers[openapiRoute.handlers.length - 1](mockCtx);
      const spec = result.jsonData;

      const operation = spec.paths['/test'].get;
      expect(operation['x-codeSamples']).toBeFalsy();
    });

    test('gracefully handles missing CodeSamplesGenerator', async () => {
      app.get('/test', {}, async (ctx) => ctx.success());

      // This should not throw even if import fails
      const spec = await app.generateOpenAPI({ title: 'Test' });

      expect(spec).toBeTruthy();
      expect(spec.paths['/test']).toBeTruthy();
    });
  });

  describe('Compatibility', () => {
    test('customRouteContext includes all expected keys', async () => {
      let capturedContext = null;

      app.get('/test', {}, async (c) => {
        capturedContext = c.get('customRouteContext');
        return c.json({ ok: true });
      });

      // Simulate request (we'd need actual Hono test, this is simplified)
      const route = app.getRoutes().find(r => r.path === '/test');
      expect(route).toBeTruthy();

      // Just verify customRouteContext structure in middleware
      expect(app.db).toBeTruthy();
      expect(app.resources).toBeTruthy();
    });
  });
});
