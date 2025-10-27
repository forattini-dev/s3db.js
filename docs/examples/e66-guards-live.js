/**
 * Guards Live Example
 *
 * Exemplo funcional de guards com Hono (framework-agnostic).
 * Mostra como usar guards declarativos para autorização automática.
 */

import Database from '../../src/database.class.js';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import {
  createHonoContext,
  applyGuardsToList,
  applyGuardsToGet,
  applyGuardsToInsert,
  applyGuardsToUpdate,
  applyGuardsToDelete
} from '../../src/concerns/guards-helpers.js';

// ============================================================================
// SETUP DATABASE COM GUARDS
// ============================================================================

async function setupDatabase() {
  console.log('🔐 Criando database com guards...\n');

  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/guards-demo',
    encryptionKey: 'guards-secret'
  });

  await db.connect();

  // ========================================
  // Resource COM guards declarativos
  // ========================================
  const ordersResource = await db.createResource({
    name: 'orders',
    attributes: {
      tenantId: 'string|required',
      userId: 'string|required',
      productId: 'string|required',
      quantity: 'number|required',
      total: 'number|required',
      status: 'string'
    },
    partitions: {
      byTenant: {
        fields: { tenantId: 'string' }
      },
      byTenantUser: {
        fields: {
          tenantId: 'string',
          userId: 'string'
        }
      }
    },
    timestamps: true,

    // 🎯 GUARDS DECLARATIVOS!
    guard: {
      // TODAS as operações forçam tenant isolation
      '*': (ctx) => {
        const tenantId = ctx.user.tenantId || ctx.user.tid;

        if (!tenantId) {
          console.log('❌ Guard wildcard: No tenant ID');
          return false;
        }

        // Força tenant em context
        ctx.tenantId = tenantId;
        ctx.userId = ctx.user.sub || ctx.user.id;

        console.log(`✅ Guard wildcard: tenant=${tenantId}, user=${ctx.userId}`);
        return true;
      },

      // List: RLS automático via partition
      list: (ctx) => {
        // Partition automático por tenant + user (O(1)!)
        ctx.setPartition('byTenantUser', {
          tenantId: ctx.tenantId,
          userId: ctx.userId
        });

        console.log(`✅ Guard list: partition=byTenantUser`);
        return true;
      },

      // Insert: Força tenantId/userId do token
      insert: (ctx) => {
        // NUNCA confia no body - força valores do token
        ctx.body.tenantId = ctx.tenantId;
        ctx.body.userId = ctx.userId;

        console.log(`✅ Guard insert: forced tenant=${ctx.tenantId}, user=${ctx.userId}`);
        return true;
      },

      // Get/Update: Ownership check
      get: (ctx, resource) => {
        const allowed = resource.userId === ctx.userId && resource.tenantId === ctx.tenantId;
        console.log(`${allowed ? '✅' : '❌'} Guard get: ownership=${allowed}`);
        return allowed;
      },

      update: (ctx, resource) => {
        const allowed = resource.userId === ctx.userId && resource.tenantId === ctx.tenantId;
        console.log(`${allowed ? '✅' : '❌'} Guard update: ownership=${allowed}`);
        return allowed;
      },

      // Delete: Ownership OU admin
      delete: (ctx, resource) => {
        const isOwner = resource.userId === ctx.userId && resource.tenantId === ctx.tenantId;
        const roles = ctx.user.resource_access?.['orders-api']?.roles || ctx.user.roles || [];
        const isAdmin = roles.includes('admin');

        const allowed = isOwner || isAdmin;
        console.log(`${allowed ? '✅' : '❌'} Guard delete: owner=${isOwner}, admin=${isAdmin}`);
        return allowed;
      }
    }
  });

  console.log('✅ Resource criado com guards\n');

  return { db, ordersResource };
}

// ============================================================================
// HONO API COM GUARDS
// ============================================================================

async function createHonoAPI(ordersResource) {
  const app = new Hono();

  // ========================================
  // Fake auth middleware (simula OAuth2/OIDC)
  // ========================================
  app.use('*', async (c, next) => {
    // Simula user do token JWT
    // Em produção, viria do OIDCClient middleware
    c.set('user', {
      sub: c.req.header('x-user-id') || 'user-123',
      tenantId: c.req.header('x-tenant-id') || 'tenant-1',
      email: 'john@example.com',
      resource_access: {
        'orders-api': {
          roles: c.req.header('x-user-role') === 'admin' ? ['admin'] : ['user']
        }
      }
    });

    await next();
  });

  // ========================================
  // ROTAS COM GUARDS
  // ========================================

  // GET /orders - List with guards
  app.get('/orders', async (c) => {
    try {
      // 1. Create framework-agnostic context
      const context = await createHonoContext(c);

      // 2. Apply guards to list (executa guard + aplica partition)
      const options = await applyGuardsToList(ordersResource, context);

      // 3. List com partition automático do guard (O(1)!)
      const orders = await ordersResource.list(options);

      return c.json({
        orders,
        count: orders.length,
        partition: options.partition,
        partitionValues: options.partitionValues
      });
    } catch (err) {
      console.error('List error:', err);
      return c.json(
        { error: err.message },
        err.message.includes('Forbidden') ? 403 : 500
      );
    }
  });

  // GET /orders/:id - Get with guards
  app.get('/orders/:id', async (c) => {
    try {
      // 1. Create context
      const context = await createHonoContext(c);

      // 2. Get record
      const order = await ordersResource.get(c.req.param('id'));

      // 3. Apply guards (ownership check)
      const allowed = await applyGuardsToGet(ordersResource, context, order);

      if (!allowed) {
        // 404 ao invés de 403 (não revela existência)
        return c.json({ error: 'Order not found' }, 404);
      }

      return c.json(order);
    } catch (err) {
      console.error('Get error:', err);
      return c.json({ error: err.message }, 500);
    }
  });

  // POST /orders - Insert with guards
  app.post('/orders', async (c) => {
    try {
      // 1. Create context
      const context = await createHonoContext(c);

      // 2. Get body
      const body = await c.req.json();

      // 3. Apply guards (força tenantId/userId)
      const data = await applyGuardsToInsert(ordersResource, context, body);

      // 4. Insert com dados modificados pelo guard
      const order = await ordersResource.insert(data);

      return c.json(order, 201);
    } catch (err) {
      console.error('Insert error:', err);
      return c.json(
        { error: err.message },
        err.message.includes('Forbidden') ? 403 : 500
      );
    }
  });

  // PATCH /orders/:id - Update with guards
  app.patch('/orders/:id', async (c) => {
    try {
      // 1. Create context
      const context = await createHonoContext(c);

      // 2. Get current record
      const order = await ordersResource.get(c.req.param('id'));

      // 3. Apply guards (ownership check)
      await applyGuardsToUpdate(ordersResource, context, order);

      // 4. Get body and update
      const body = await c.req.json();
      const updated = await ordersResource.update(c.req.param('id'), body);

      return c.json(updated);
    } catch (err) {
      console.error('Update error:', err);
      return c.json(
        { error: err.message },
        err.message.includes('Forbidden') ? 403 : 500
      );
    }
  });

  // DELETE /orders/:id - Delete with guards
  app.delete('/orders/:id', async (c) => {
    try {
      // 1. Create context
      const context = await createHonoContext(c);

      // 2. Get current record
      const order = await ordersResource.get(c.req.param('id'));

      // 3. Apply guards (ownership OU admin)
      await applyGuardsToDelete(ordersResource, context, order);

      // 4. Delete
      await ordersResource.delete(c.req.param('id'));

      return c.body(null, 204);
    } catch (err) {
      console.error('Delete error:', err);
      return c.json(
        { error: err.message },
        err.message.includes('Forbidden') ? 403 : 500
      );
    }
  });

  // ========================================
  // Start server
  // ========================================
  console.log('✅ Hono API rodando em http://localhost:3000\n');

  return new Promise((resolve) => {
    const server = serve({
      fetch: app.fetch,
      port: 3000
    });
    resolve({ app, server });
  });
}

// ============================================================================
// DEMO: Testar guards
// ============================================================================

async function demo(ordersResource) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  DEMO: Testando Guards');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Simula dois usuários de tenants diferentes
  const user1 = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    email: 'user1@tenant1.com',
    roles: []
  };

  const user2 = {
    sub: 'user-2',
    tenantId: 'tenant-2',
    email: 'user2@tenant2.com',
    roles: []
  };

  const admin = {
    sub: 'admin-1',
    tenantId: 'tenant-1',
    email: 'admin@tenant1.com',
    resource_access: {
      'orders-api': {
        roles: ['admin']
      }
    }
  };

  // ========================================
  // 1. User1 cria order
  // ========================================
  console.log('1️⃣ User1 cria order...');
  const ctx1 = {
    user: user1,
    params: {},
    body: { productId: 'prod-1', quantity: 2, total: 50 },
    query: {},
    headers: {},
    setPartition() {}
  };

  const data1 = await applyGuardsToInsert(ordersResource, ctx1, ctx1.body);
  const order1 = await ordersResource.insert(data1);
  console.log(`   ✅ Order criado: id=${order1.id}, tenant=${order1.tenantId}, user=${order1.userId}\n`);

  // ========================================
  // 2. User2 tenta acessar order do User1 (NEGADO)
  // ========================================
  console.log('2️⃣ User2 tenta acessar order do User1...');
  const ctx2 = {
    user: user2,
    params: { id: order1.id },
    body: {},
    query: {},
    headers: {},
    setPartition() {}
  };

  const allowed2 = await applyGuardsToGet(ordersResource, ctx2, order1);
  console.log(`   ${allowed2 ? '✅' : '❌'} Acesso ${allowed2 ? 'permitido' : 'negado'} (esperado: negado)\n`);

  // ========================================
  // 3. User1 acessa próprio order (PERMITIDO)
  // ========================================
  console.log('3️⃣ User1 acessa próprio order...');
  const allowed1 = await applyGuardsToGet(ordersResource, ctx1, order1);
  console.log(`   ${allowed1 ? '✅' : '❌'} Acesso ${allowed1 ? 'permitido' : 'negado'} (esperado: permitido)\n`);

  // ========================================
  // 4. User1 lista orders (partition automático!)
  // ========================================
  console.log('4️⃣ User1 lista orders (partition automático)...');
  const listCtx = {
    user: user1,
    params: {},
    body: {},
    query: {},
    headers: {},
    tenantId: null,
    userId: null,
    partitionName: null,
    partitionValues: {},
    setPartition(name, values) {
      this.partitionName = name;
      this.partitionValues = values;
    }
  };

  // Execute guards (aplica tenant isolation + partition)
  await ordersResource.executeGuard('*', listCtx);
  await ordersResource.executeGuard('list', listCtx);

  const listOptions = {
    partition: listCtx.partitionName,
    partitionValues: listCtx.partitionValues
  };

  const orders = await ordersResource.list(listOptions);
  console.log(`   ✅ Listou ${orders.length} order(s) via partition=${listCtx.partitionName}`);
  console.log(`   📊 Partition values: ${JSON.stringify(listCtx.partitionValues)}\n`);

  // ========================================
  // 5. User1 tenta deletar order (NEGADO - não é admin)
  // ========================================
  console.log('5️⃣ User1 tenta deletar order (não é admin)...');
  try {
    await applyGuardsToDelete(ordersResource, ctx1, order1);
    console.log('   ✅ Delete permitido (esperado: negado)\n');
  } catch (err) {
    console.log(`   ❌ Delete negado: ${err.message} (esperado: negado)\n`);
  }

  // ========================================
  // 6. Admin deleta order (PERMITIDO - é admin)
  // ========================================
  console.log('6️⃣ Admin deleta order...');
  const ctxAdmin = {
    user: admin,
    params: { id: order1.id },
    body: {},
    query: {},
    headers: {},
    setPartition() {}
  };

  try {
    await applyGuardsToDelete(ordersResource, ctxAdmin, order1);
    await ordersResource.delete(order1.id);
    console.log('   ✅ Delete permitido (admin)\n');
  } catch (err) {
    console.log(`   ❌ Delete negado: ${err.message}\n`);
  }

  console.log('═══════════════════════════════════════════════════════════\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Guards Live Example - Framework-Agnostic Authorization');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Setup
  const { db, ordersResource } = await setupDatabase();

  // Demo programático
  await demo(ordersResource);

  // Hono API
  const { server } = await createHonoAPI(ordersResource);

  console.log('📖 Teste a API com curl:\n');
  console.log('# List orders (User1)');
  console.log('curl http://localhost:3000/orders \\');
  console.log('  -H "x-user-id: user-1" \\');
  console.log('  -H "x-tenant-id: tenant-1"\n');

  console.log('# Create order (User1)');
  console.log('curl -X POST http://localhost:3000/orders \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -H "x-user-id: user-1" \\');
  console.log('  -H "x-tenant-id: tenant-1" \\');
  console.log('  -d \'{"productId":"prod-2","quantity":3,"total":75}\'\n');

  console.log('# Try to access as different user (DENIED)');
  console.log('curl http://localhost:3000/orders/ORDER_ID \\');
  console.log('  -H "x-user-id: user-2" \\');
  console.log('  -H "x-tenant-id: tenant-2"\n');

  console.log('# Delete as admin (ALLOWED)');
  console.log('curl -X DELETE http://localhost:3000/orders/ORDER_ID \\');
  console.log('  -H "x-user-id: admin-1" \\');
  console.log('  -H "x-tenant-id: tenant-1" \\');
  console.log('  -H "x-user-role: admin"\n');

  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('✅ Guards funcionando! API rodando em http://localhost:3000\n');
  console.log('Pressione Ctrl+C para sair\n');
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { setupDatabase, createExpressAPI, demo };
