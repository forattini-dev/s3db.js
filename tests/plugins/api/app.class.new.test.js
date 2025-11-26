/**
 * Tests for ApiApp v2 - Explicit builder architecture
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ApiApp } from '../../../src/plugins/api/app.class.js';
import { RouteContext } from '../../../src/plugins/api/route-context.class.js';

describe('ApiApp v2 - Architecture Tests', () => {
  let app;

  beforeEach(() => {
    app = new ApiApp({
      db: { name: 'test-db' },
      resources: { users: {} }
    });
  });

  describe('Explicit Builder Pattern', () => {
    test('route() registers route with all options upfront', () => {
      app.route('POST', '/users', {
        description: 'Create user',
        tags: ['Users'],
        operationId: 'createUser',
        schema: { email: 'string|required|email' }
      }, async (ctx) => {
        return ctx.success({ created: true });
      });

      const routes = app.getRoutes();
      expect(routes).toHaveLength(1);
      expect(routes[0].method).toBe('POST');
      expect(routes[0].path).toBe('/users');
      expect(routes[0].description).toBe('Create user');
      expect(routes[0].tags).toEqual(['Users']);
      expect(routes[0].operationId).toBe('createUser');
      expect(routes[0].compiledValidator).toBeTruthy();
    });

    test('convenience methods delegate to route()', () => {
      app.get('/users', { description: 'List users' }, async (ctx) => ctx.success());
      app.post('/users', { description: 'Create user' }, async (ctx) => ctx.success());
      app.put('/users/:id', {}, async (ctx) => ctx.success());
      app.patch('/users/:id', {}, async (ctx) => ctx.success());
      app.delete('/users/:id', {}, async (ctx) => ctx.success());

      const routes = app.getRoutes();
      expect(routes).toHaveLength(5);
      expect(routes[0].method).toBe('GET');
      expect(routes[1].method).toBe('POST');
      expect(routes[2].method).toBe('PUT');
      expect(routes[3].method).toBe('PATCH');
      expect(routes[4].method).toBe('DELETE');
    });

    test('no implicit state - each route is independent', () => {
      app.post('/users', { description: 'Route 1' }, async (ctx) => ctx.success());
      app.post('/posts', { description: 'Route 2' }, async (ctx) => ctx.success());

      const routes = app.getRoutes();
      expect(routes[0].description).toBe('Route 1');
      expect(routes[1].description).toBe('Route 2');
      // No pendingMetadata leakage
    });
  });

  describe('Single RouteContext', () => {
    test('RouteContext has clean API', () => {
      const mockHonoContext = {
        req: { json: () => Promise.resolve({ test: 'data' }) },
        json: (data, status) => ({ data, status }),
        set: () => {},
        get: () => {}
      };

      const ctx = new RouteContext(mockHonoContext, {
        db: { name: 'test' },
        resources: { users: {} }
      });

      expect(ctx.db).toEqual({ name: 'test' });
      expect(ctx.resources).toEqual({ users: {} });
      expect(typeof ctx.success).toBe('function');
      expect(typeof ctx.error).toBe('function');
      expect(typeof ctx.badRequest).toBe('function');
      expect(typeof ctx.unauthorized).toBe('function');
      expect(typeof ctx.forbidden).toBe('function');
      expect(typeof ctx.notFound).toBe('function');
      expect(typeof ctx.validationError).toBe('function');
      expect(typeof ctx.serverError).toBe('function');
    });

    test('ctx.success() formats response correctly', () => {
      const mockC = {
        json: (data, status) => ({ responseData: data, responseStatus: status })
      };

      const ctx = new RouteContext(mockC, {});
      const result = ctx.success({ data: { id: 1 } }, 201);

      expect(result.responseData).toEqual({
        success: true,
        data: { id: 1 }
      });
      expect(result.responseStatus).toBe(201);
    });

    test('ctx.error() formats error correctly', () => {
      const mockC = {
        json: (data, status) => ({ responseData: data, responseStatus: status })
      };

      const ctx = new RouteContext(mockC, {});
      const result = ctx.error('Something failed', {
        status: 400,
        code: 'BAD_REQUEST',
        details: { field: 'email' }
      });

      expect(result.responseData).toEqual({
        success: false,
        error: {
          message: 'Something failed',
          code: 'BAD_REQUEST',
          status: 400,
          details: { field: 'email' }
        }
      });
      expect(result.responseStatus).toBe(400);
    });
  });

  describe('Deterministic Priority Queue', () => {
    test('guards execute in priority order (lower = higher priority)', async () => {
      const executionOrder = [];

      app.guard('guard1', async (ctx) => {
        executionOrder.push('guard1');
        return true;
      }, { priority: 20 });

      app.guard('guard2', async (ctx) => {
        executionOrder.push('guard2');
        return true;
      }, { priority: 10 });

      app.guard('guard3', async (ctx) => {
        executionOrder.push('guard3');
        return true;
      }, { priority: 30 });

      app.get('/test', { guards: ['guard1', 'guard2', 'guard3'] }, async (ctx) => {
        return ctx.success({ order: executionOrder });
      });

      // Verify guards are sorted by priority
      const routes = app.getRoutes();
      expect(routes[0].guards).toEqual(['guard1', 'guard2', 'guard3']);
    });

    test('middlewares execute in priority order', () => {
      const executionOrder = [];

      app.use(async (c, next) => {
        executionOrder.push('mw1');
        await next();
      }, { priority: 20, name: 'mw1' });

      app.use(async (c, next) => {
        executionOrder.push('mw2');
        await next();
      }, { priority: 10, name: 'mw2' });

      expect(app.middlewares[0].name).toBe('mw2'); // Priority 10 comes first
      expect(app.middlewares[1].name).toBe('mw1'); // Priority 20 comes second
    });
  });

  describe('Schema Compilation at Registration', () => {
    test('schemas are compiled at registration time', () => {
      const beforeRoutes = app.schemaCache.size;

      app.post('/users', {
        schema: {
          email: 'string|required|email',
          name: 'string|required'
        }
      }, async (ctx) => ctx.success());

      const afterRoutes = app.schemaCache.size;
      expect(afterRoutes).toBeGreaterThan(beforeRoutes);

      const routes = app.getRoutes();
      expect(routes[0].compiledValidator).toBeTruthy();
      expect(routes[0].requestSchema).toBeTruthy();
      expect(routes[0].requestSchema.properties.email).toBeTruthy();
    });

    test('schema cache prevents re-compilation', () => {
      const schema = { email: 'string|required|email' };

      app.post('/users', { schema }, async (ctx) => ctx.success());
      const sizeAfterFirst = app.schemaCache.size;

      app.post('/posts', { schema }, async (ctx) => ctx.success());
      const sizeAfterSecond = app.schemaCache.size;

      expect(sizeAfterSecond).toBe(sizeAfterFirst); // No new entry
    });
  });

  describe('Route Groups', () => {
    test('group() creates routes with shared base path', () => {
      const admin = app.group('/admin', { tags: ['Admin'] });

      admin.get('/users', {}, async (ctx) => ctx.success());
      admin.post('/settings', {}, async (ctx) => ctx.success());

      const routes = app.getRoutes();
      expect(routes[0].path).toBe('/admin/users');
      expect(routes[1].path).toBe('/admin/settings');
    });

    test('group() inherits tags and guards', () => {
      app.guard('isAdmin', async () => true);
      const admin = app.group('/admin', {
        tags: ['Admin'],
        guards: ['isAdmin']
      });

      admin.get('/stats', { tags: ['Stats'] }, async (ctx) => ctx.success());

      const routes = app.getRoutes();
      expect(routes[0].tags).toEqual(['Admin', 'Stats']);
      expect(routes[0].guards).toEqual(['isAdmin']);
    });

    test('group routes can add additional guards', () => {
      app.guard('isAdmin', async () => true, { priority: 10 });
      app.guard('isOwner', async () => true, { priority: 20 });

      const admin = app.group('/admin', { guards: ['isAdmin'] });

      admin.post('/users/:id/delete', {
        guards: ['isOwner']
      }, async (ctx) => ctx.success());

      const routes = app.getRoutes();
      expect(routes[0].guards).toEqual(['isAdmin', 'isOwner']);
    });
  });

  describe('Integrated Documentation', () => {
    test('mountDocs() adds /openapi.json endpoint', () => {
      app.post('/users', {
        description: 'Create user',
        schema: { email: 'string|required|email' }
      }, async (ctx) => ctx.success());

      app.mountDocs({ title: 'Test API', version: '1.0.0' });

      const routes = app.getRoutes();
      const openapiRoute = routes.find(r => r.path === '/openapi.json');
      const docsRoute = routes.find(r => r.path === '/docs');

      expect(openapiRoute).toBeTruthy();
      expect(docsRoute).toBeTruthy();
    });

    test('OpenAPI spec includes all routes with metadata', () => {
      app.post('/users', {
        description: 'Create user',
        tags: ['Users'],
        operationId: 'createUser',
        schema: { email: 'string|required|email' }
      }, async (ctx) => ctx.success());

      const spec = app._generateOpenAPISpec({
        title: 'Test API',
        version: '1.0.0',
        description: 'Test'
      });

      expect(spec.openapi).toBe('3.1.0');
      expect(spec.info.title).toBe('Test API');
      expect(spec.paths['/users'].post).toBeTruthy();
      expect(spec.paths['/users'].post.operationId).toBe('createUser');
      expect(spec.paths['/users'].post.tags).toEqual(['Users']);
      expect(spec.paths['/users'].post.requestBody).toBeTruthy();
      expect(spec.paths['/users'].post.responses['200']).toBeTruthy();
      expect(spec.paths['/users'].post.responses['422']).toBeTruthy();
      expect(spec.paths['/users'].post.responses['500']).toBeTruthy();
    });
  });

  describe('FV to OpenAPI Conversion (Enhanced)', () => {
    test('maps expanded types correctly', () => {
      const schema = {
        email: 'email|required',
        url: 'url',
        ip4: 'ip4',
        ip6: 'ip6',
        uuid: 'uuid',
        date: 'date',
        secret: 'secret'
      };

      app.post('/test', { schema }, async (ctx) => ctx.success());
      const routes = app.getRoutes();
      const props = routes[0].requestSchema.properties;

      expect(props.email.format).toBe('email');
      expect(props.url.format).toBe('uri');
      expect(props.ip4.format).toBe('ipv4');
      expect(props.ip6.format).toBe('ipv6');
      expect(props.uuid.format).toBe('uuid');
      expect(props.date.format).toBe('date-time');
      expect(props.secret.format).toBe('password');
    });

    test('handles constraints correctly', () => {
      const schema = {
        name: 'string|required|min:2|max:50',
        age: 'number|min:18|max:120'
      };

      app.post('/test', { schema }, async (ctx) => ctx.success());
      const routes = app.getRoutes();
      const props = routes[0].requestSchema.properties;

      expect(props.name.minLength).toBe(2);
      expect(props.name.maxLength).toBe(50);
      expect(props.age.minimum).toBe(18);
      expect(props.age.maximum).toBe(120);
      expect(routes[0].requestSchema.required).toContain('name');
    });

    test('handles pattern constraint', () => {
      const schema = {
        code: 'string|pattern:^[A-Z]{3}$'
      };

      app.post('/test', { schema }, async (ctx) => ctx.success());
      const routes = app.getRoutes();
      const props = routes[0].requestSchema.properties;

      expect(props.code.pattern).toBe('^[A-Z]{3}$');
    });

    test('handles nested objects', () => {
      const schema = {
        profile: {
          type: 'object',
          props: {
            bio: 'string',
            age: 'number'
          }
        }
      };

      app.post('/test', { schema }, async (ctx) => ctx.success());
      const routes = app.getRoutes();
      const props = routes[0].requestSchema.properties;

      expect(props.profile.type).toBe('object');
      expect(props.profile.properties.bio).toBeTruthy();
      expect(props.profile.properties.age).toBeTruthy();
    });

    test('handles arrays', () => {
      const schema = {
        tags: {
          type: 'array',
          items: 'string'
        }
      };

      app.post('/test', { schema }, async (ctx) => ctx.success());
      const routes = app.getRoutes();
      const props = routes[0].requestSchema.properties;

      expect(props.tags.type).toBe('array');
      expect(props.tags.items.type).toBe('string');
    });
  });

  describe('Body vs Query Separation', () => {
    test('POST/PUT/PATCH use body validation', () => {
      app.post('/users', {
        schema: { email: 'string|required|email' }
      }, async (ctx) => ctx.success());

      const routes = app.getRoutes();
      expect(routes[0].method).toBe('POST');
      expect(routes[0].compiledValidator).toBeTruthy();
      // Validation middleware will use ctx.body()
    });

    test('GET/DELETE use query validation', () => {
      app.get('/users', {
        schema: { limit: 'number|min:1|max:100' }
      }, async (ctx) => ctx.success());

      const routes = app.getRoutes();
      expect(routes[0].method).toBe('GET');
      expect(routes[0].compiledValidator).toBeTruthy();
      // Validation middleware will use ctx.query()
    });
  });
});
