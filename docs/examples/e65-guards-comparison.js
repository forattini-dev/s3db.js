/**
 * Guards Comparison Example
 *
 * Compara abordagem atual (middleware manual) vs proposta (guards declarativos)
 */

import Database from 's3db.js';
import { ApiPlugin } from 's3db.js/plugins/api';
import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';

// ============================================================================
// ❌ ABORDAGEM ATUAL - Middleware Manual (Repetitivo)
// ============================================================================

async function currentApproach() {
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/orders-api',
    encryptionKey: 'secret'
  });

  await db.connect();

  // Resource SEM guards
  const ordersResource = await db.createResource({
    name: 'orders',
    attributes: {
      tenantId: 'string|required',
      userId: 'string|required',
      total: 'number'
    },
    partitions: {
      byTenant: { fields: { tenantId: 'string' } },
      byTenantUser: { fields: { tenantId: 'string', userId: 'string' } }
    }
  });

  const apiPlugin = new ApiPlugin({ port: 3000 });

  // ❌ REPETITIVO - Middleware em CADA rota

  // GET /api/orders (list)
  apiPlugin.addRoute({
    path: '/api/orders',
    method: 'GET',
    middleware: [
      requireTenant(),
      requireScope('orders:read:own')
    ],
    handler: async (req, res) => {
      // ❌ Lógica de RLS repetida em handler
      const orders = await ordersResource.listPartition('byTenantUser', {
        tenantId: req.tenantId,
        userId: req.userId
      });
      res.json({ orders });
    },
    auth: 'oauth2'
  });

  // GET /api/orders/:id (get)
  apiPlugin.addRoute({
    path: '/api/orders/:id',
    method: 'GET',
    middleware: [
      requireTenant(),
      requireScope('orders:read:own'),
      requireOwnership(async (req) => {
        const order = await ordersResource.get(req.params.id);
        if (order && order.tenantId !== req.tenantId) return null;
        return order;
      })
    ],
    handler: (req, res) => {
      res.json(req.resource);
    },
    auth: 'oauth2'
  });

  // POST /api/orders (insert)
  apiPlugin.addRoute({
    path: '/api/orders',
    method: 'POST',
    middleware: [
      requireTenant(),
      requireScope('orders:write:own')
    ],
    handler: async (req, res) => {
      // ❌ Força tenantId/userId aqui (fácil esquecer!)
      const order = await ordersResource.insert({
        tenantId: req.tenantId,
        userId: req.userId,
        ...req.body
      });
      res.status(201).json(order);
    },
    auth: 'oauth2'
  });

  // PATCH /api/orders/:id (update)
  apiPlugin.addRoute({
    path: '/api/orders/:id',
    method: 'PATCH',
    middleware: [
      requireTenant(),
      requireScope('orders:write:own'),
      requireOwnership(async (req) => {
        const order = await ordersResource.get(req.params.id);
        if (order && order.tenantId !== req.tenantId) return null;
        return order;
      })
    ],
    handler: async (req, res) => {
      const updated = await ordersResource.update(req.params.id, req.body);
      res.json(updated);
    },
    auth: 'oauth2'
  });

  // DELETE /api/orders/:id (delete)
  apiPlugin.addRoute({
    path: '/api/orders/:id',
    method: 'DELETE',
    middleware: [
      requireTenant(),
      requireAnyScope('orders:delete:own', 'admin'),
      requireOwnership(async (req) => {
        const order = await ordersResource.get(req.params.id);
        if (order && order.tenantId !== req.tenantId) return null;
        return order;
      })
    ],
    handler: async (req, res) => {
      await ordersResource.delete(req.params.id);
      res.status(204).send();
    },
    auth: 'oauth2'
  });

  // ❌ PROBLEMAS:
  // - 70 linhas de código repetitivo
  // - Middleware repetido em TODAS as rotas
  // - RLS logic espalhada pelos handlers
  // - Fácil esquecer proteção em nova rota
  // - Difícil manter consistente

  await db.use(apiPlugin);

  console.log('❌ Abordagem atual: 70+ linhas, muito repetitivo\n');
}

// ============================================================================
// ✅ ABORDAGEM PROPOSTA - Guards Declarativos (DRY)
// ============================================================================

async function guardsApproach() {
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/orders-api',
    encryptionKey: 'secret'
  });

  await db.connect();

  // ✅ Resource COM guards
  const ordersResource = await db.createResource({
    name: 'orders',
    attributes: {
      tenantId: 'string|required',
      userId: 'string|required',
      total: 'number'
    },
    partitions: {
      byTenant: { fields: { tenantId: 'string' } },
      byTenantUser: { fields: { tenantId: 'string', userId: 'string' } }
    },

    // ✅ Guards declarativos!
    guard: {
      // TODAS as operações forçam tenant isolation
      '*': (req, user) => {
        const tenantId = user.tenantId || user.tid;
        if (!tenantId) return false;

        req.tenantId = tenantId;
        return true;
      },

      // List: RLS automático via partition
      list: (req, user) => {
        req.partitionName = 'byTenantUser';
        req.partitionValues = {
          tenantId: user.tenantId,
          userId: user.id
        };
        return true;
      },

      // Insert: Força tenantId/userId do token
      insert: (req, user) => {
        req.body.tenantId = user.tenantId;
        req.body.userId = user.id;
        return true;
      },

      // Get/Update: Ownership check
      get: (req, user, resource) => {
        return resource.userId === user.id && resource.tenantId === user.tenantId;
      },

      update: (req, user, resource) => {
        return resource.userId === user.id && resource.tenantId === user.tenantId;
      },

      // Delete: Ownership OU admin
      delete: (req, user, resource) => {
        const isOwner = resource.userId === user.id && resource.tenantId === user.tenantId;
        const isAdmin = user.roles?.includes('admin');
        return isOwner || isAdmin;
      }
    }
  });

  const apiPlugin = new ApiPlugin({ port: 3000 });

  // ✅ AUTO-GERA rotas protegidas!
  await apiPlugin.addResource(ordersResource);

  // ✅ VANTAGENS:
  // - 20 linhas de guards vs 70+ de rotas
  // - Guards vivem com o schema
  // - RLS automático via partitions
  // - IMPOSSÍVEL esquecer proteção
  // - Fácil manter e entender

  await db.use(apiPlugin);

  console.log('✅ Abordagem guards: 20 linhas, auto-protegido\n');
  console.log('Rotas auto-geradas:');
  console.log('  GET    /api/orders         → list guard');
  console.log('  GET    /api/orders/:id     → get guard');
  console.log('  POST   /api/orders         → insert guard');
  console.log('  PATCH  /api/orders/:id     → update guard');
  console.log('  DELETE /api/orders/:id     → delete guard\n');
}

// ============================================================================
// 📊 COMPARAÇÃO LADO A LADO
// ============================================================================

async function comparison() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Guards vs Middleware - Comparação');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('┌────────────────────────────┬──────────────┬──────────────┐');
  console.log('│ Característica             │ Middleware   │ Guards       │');
  console.log('├────────────────────────────┼──────────────┼──────────────┤');
  console.log('│ Linhas de código           │ 70+          │ 20           │');
  console.log('│ Repetição                  │ Alta         │ Zero         │');
  console.log('│ DRY                        │ ❌           │ ✅           │');
  console.log('│ Auto-documentado           │ ❌           │ ✅           │');
  console.log('│ RLS via partitions         │ Manual       │ Automático   │');
  console.log('│ Fácil esquecer proteção    │ Sim          │ Impossível   │');
  console.log('│ Manutenibilidade           │ Difícil      │ Fácil        │');
  console.log('│ Testabilidade              │ Média        │ Alta         │');
  console.log('│ Type-safety                │ Média        │ Alta         │');
  console.log('│ Debugging                  │ Fácil        │ Médio        │');
  console.log('│ Flexibilidade              │ Máxima       │ Alta         │');
  console.log('└────────────────────────────┴──────────────┴──────────────┘\n');

  console.log('═══════════════════════════════════════════════════════════\n');
}

// ============================================================================
// 🎯 CASOS DE USO
// ============================================================================

async function useCases() {
  console.log('🎯 QUANDO USAR CADA ABORDAGEM:\n');

  console.log('✅ USE GUARDS quando:');
  console.log('  - Autorização é consistente (multi-tenant, RLS)');
  console.log('  - Quer auto-gerar rotas CRUD');
  console.log('  - Precisa de DRY máximo');
  console.log('  - Quer proteção automática\n');

  console.log('✅ USE MIDDLEWARE quando:');
  console.log('  - Lógica muito específica por rota');
  console.log('  - Precisa de controle fino');
  console.log('  - Debugging é crítico');
  console.log('  - Casos edge complexos\n');

  console.log('✅ USE AMBOS quando:');
  console.log('  - Guards para padrão');
  console.log('  - Middleware para overrides específicos\n');

  console.log('Exemplo combinado:');
  console.log('```javascript');
  console.log('// Guard padrão no resource');
  console.log('guard: {');
  console.log('  list: (req, user) => { ... }');
  console.log('}');
  console.log('');
  console.log('// Override com middleware em rota especial');
  console.log('apiPlugin.addRoute({');
  console.log('  path: \'/api/orders/special\',');
  console.log('  middleware: [customMiddleware],  // Override!');
  console.log('  handler: ...');
  console.log('})');
  console.log('```\n');
}

// ============================================================================
// 🚀 EXEMPLOS ESPECÍFICOS
// ============================================================================

async function specificExamples() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Exemplos Específicos de Guards');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('EXEMPLO 1: Multi-Tenant SaaS');
  console.log('─────────────────────────────────────────────');
  console.log('guard: {');
  console.log('  \'*\': (req, user) => {');
  console.log('    req.tenantId = user.tenantId;');
  console.log('    req.partitionValues = { tenantId: user.tenantId };');
  console.log('    return true;');
  console.log('  },');
  console.log('  list: (req, user) => {');
  console.log('    req.partitionName = \'byTenantUser\';');
  console.log('    req.partitionValues = {');
  console.log('      tenantId: user.tenantId,');
  console.log('      userId: user.id');
  console.log('    };');
  console.log('    return true;');
  console.log('  }');
  console.log('}\n');

  console.log('EXEMPLO 2: Admin Override');
  console.log('─────────────────────────────────────────────');
  console.log('guard: {');
  console.log('  list: [\'admin\'],              // Só admin lista tudo');
  console.log('  get: true,                      // Todos podem ler');
  console.log('  insert: [\'user\'],             // Qualquer user cria');
  console.log('  update: (req, user, resource) => {');
  console.log('    return resource.userId === user.id;  // Só dono');
  console.log('  },');
  console.log('  delete: [\'admin\']             // Só admin deleta');
  console.log('}\n');

  console.log('EXEMPLO 3: ABAC com Business Rules');
  console.log('─────────────────────────────────────────────');
  console.log('guard: {');
  console.log('  update: async (req, user, resource) => {');
  console.log('    // 1. Ownership');
  console.log('    if (resource.userId !== user.id) return false;');
  console.log('');
  console.log('    // 2. Status check');
  console.log('    if (resource.status !== \'draft\') return false;');
  console.log('');
  console.log('    // 3. Business hours');
  console.log('    const hour = new Date().getHours();');
  console.log('    if (hour < 9 || hour >= 18) return false;');
  console.log('');
  console.log('    // 4. Amount limit');
  console.log('    const amount = req.body.amount || resource.amount;');
  console.log('    if (amount > 10000 && !user.roles.includes(\'manager\')) {');
  console.log('      return false;');
  console.log('    }');
  console.log('');
  console.log('    return true;');
  console.log('  }');
  console.log('}\n');

  console.log('EXEMPLO 4: Partition Auto-Selection');
  console.log('─────────────────────────────────────────────');
  console.log('guard: {');
  console.log('  list: (req, user) => {');
  console.log('    // Admin vê tudo');
  console.log('    if (user.roles.includes(\'admin\')) {');
  console.log('      req.partitionName = \'byTenant\';');
  console.log('      req.partitionValues = { tenantId: user.tenantId };');
  console.log('    }');
  console.log('    // Manager vê do time');
  console.log('    else if (user.roles.includes(\'manager\')) {');
  console.log('      req.partitionName = \'byTenantTeam\';');
  console.log('      req.partitionValues = {');
  console.log('        tenantId: user.tenantId,');
  console.log('        teamId: user.teamId');
  console.log('      };');
  console.log('    }');
  console.log('    // User vê apenas próprio');
  console.log('    else {');
  console.log('      req.partitionName = \'byTenantUser\';');
  console.log('      req.partitionValues = {');
  console.log('        tenantId: user.tenantId,');
  console.log('        userId: user.id');
  console.log('      };');
  console.log('    }');
  console.log('    return true;');
  console.log('  }');
  console.log('}\n');

  console.log('═══════════════════════════════════════════════════════════\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  await comparison();
  await useCases();
  await specificExamples();

  console.log('💡 CONCLUSÃO:\n');
  console.log('Guards tornam autorização:');
  console.log('  ✅ Declarativa (vive com o schema)');
  console.log('  ✅ DRY (sem repetição)');
  console.log('  ✅ Automática (auto-protegida)');
  console.log('  ✅ Integrada com partitions (RLS O(1))');
  console.log('  ✅ Type-safe (TypeScript friendly)');
  console.log('  ✅ Testável (funções puras)\n');

  console.log('Próximos passos:');
  console.log('  1. Implementar executeGuard() no Resource');
  console.log('  2. Adicionar context parameter (req, user) nos métodos');
  console.log('  3. Atualizar API Plugin para usar guards');
  console.log('  4. Criar testes para guards');
  console.log('  5. Documentar patterns\n');

  console.log('Ver: docs/guards-design.md para design completo\n');
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { currentApproach, guardsApproach, comparison };

// ============================================================================
// HELPER MIDDLEWARE (usado na abordagem atual)
// ============================================================================

function requireTenant() {
  return (req, res, next) => {
    const tenantId = req.user.tenantId || req.user.tid;
    if (!tenantId) {
      return res.status(403).json({ error: 'Tenant ID missing' });
    }
    req.tenantId = tenantId;
    req.userId = req.user.sub;
    next();
  };
}

function requireScope(scope) {
  return (req, res, next) => {
    const userScopes = req.user.scope?.split(' ') || [];
    if (!userScopes.includes(scope)) {
      return res.status(403).json({ error: 'Insufficient scope' });
    }
    next();
  };
}

function requireAnyScope(...scopes) {
  return (req, res, next) => {
    const userScopes = req.user.scope?.split(' ') || [];
    const hasAny = scopes.some(s => userScopes.includes(s));
    if (!hasAny) {
      return res.status(403).json({ error: 'Insufficient scope' });
    }
    next();
  };
}

function requireOwnership(resourceGetter) {
  return async (req, res, next) => {
    const resource = await resourceGetter(req);
    if (!resource) {
      return res.status(404).json({ error: 'Not found' });
    }
    req.resource = resource;
    next();
  };
}
