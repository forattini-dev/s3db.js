# Resource Guards - Design Proposal

Sistema de guards declarativos embutidos no resource para autorização automática.

## 🎯 Objetivo

**Problema atual**: Repetir middleware em cada rota
```javascript
// ❌ Repetitivo - mesma lógica em N rotas
apiPlugin.addRoute({
  path: '/api/orders',
  middleware: [requireTenant(), requireScope('orders:read:own')],
  handler: async (req, res) => { ... }
});

apiPlugin.addRoute({
  path: '/api/orders/:id',
  middleware: [requireTenant(), requireScope('orders:read:own')],
  handler: async (req, res) => { ... }
});

// Repetido para get, list, update, delete...
```

**Solução proposta**: Guard declarativo no resource
```javascript
// ✅ Declarativo - define uma vez no resource
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: { ... },
  guard: {
    list: (req, user) => {
      // RLS automático via partition
      req.partitionName = 'byUser';
      req.partitionValues = { userId: user.id };
      return true;
    },
    update: (req, user) => req.params.userId === user.id
  }
});

// Rotas automaticamente protegidas!
```

---

## 📋 API Design

### 1. Guard Simples (Role/Scope Check)

```javascript
// Apenas roles/scopes (string array)
guard: ['admin']                    // Só admin pode tudo
guard: ['admin', 'manager']         // Admin OU manager
guard: ['orders:read:own']          // Scope específico
```

**Comportamento**:
- Verifica se user tem algum dos roles/scopes
- Aplica para TODAS as operações (list, get, insert, update, delete, patch)
- Retorna 403 se não tem permissão

---

### 2. Guard por Operação

```javascript
guard: {
  // Operações CRUD
  list: ['admin'],                              // Só admin lista
  get: true,                                     // Todos podem ler
  insert: ['user'],                              // Qualquer user cria
  update: (req, user) => req.params.userId === user.id,  // Só dono
  patch: (req, user) => req.params.userId === user.id,   // Só dono
  delete: ['admin'],                             // Só admin deleta
  replace: ['admin']                             // Só admin replace
}
```

**Tipos aceitos**:
- `string[]` - Lista de roles/scopes
- `boolean` - `true` permite todos, `false` bloqueia todos
- `function` - Função customizada retorna `true/false` ou Promise

---

### 3. Guard com Wildcard (DRY)

```javascript
guard: {
  '*': (req, user) => {
    // Aplica para TODAS as operações
    req.tenantId = user.tenantId;
    return true;
  },
  delete: ['admin']  // Override específico para delete
}
```

**Precedência**:
1. Guard específico (delete, update, etc)
2. Guard wildcard (`*`)
3. Sem guard = permite tudo

---

### 4. Guard com RLS Automático (Partitions!)

```javascript
guard: {
  // Lista apenas próprios registros via partition (O(1)!)
  list: (req, user) => {
    req.partitionName = 'byUser';
    req.partitionValues = { userId: user.id };
    return true;
  },

  // Get/Update/Delete verificam ownership
  get: async (req, user, resource) => {
    // resource = record atual (já buscado)
    return resource.userId === user.id;
  },

  update: async (req, user, resource) => {
    return resource.userId === user.id;
  },

  delete: async (req, user, resource) => {
    // Só dono OU admin pode deletar
    return resource.userId === user.id || user.roles.includes('admin');
  }
}
```

**Vantagens**:
- ✅ RLS automático via partitions
- ✅ O(1) lookup ao invés de O(n) scan
- ✅ Guard acessa o resource atual (para get/update/delete)
- ✅ Pode ser async (ex: buscar dados adicionais)

---

### 5. Guard Multi-Tenant Automático

```javascript
guard: {
  // TODAS as operações forçam tenantId
  '*': (req, user) => {
    const tenantId = user.tenantId || user.tid;

    if (!tenantId) {
      throw new Error('Tenant ID missing');
    }

    // Força partition por tenant em TODAS as queries
    req.tenantId = tenantId;

    if (!req.partitionValues) {
      req.partitionValues = {};
    }
    req.partitionValues.tenantId = tenantId;

    return true;
  }
}
```

**Resultado**:
- Tenant isolation automático
- IMPOSSÍVEL acessar dados de outro tenant
- Zero código extra nas rotas

---

### 6. Guard com ABAC (Attribute-Based)

```javascript
guard: {
  update: async (req, user, resource) => {
    // Business hours check
    const hour = new Date().getHours();
    if (hour < 9 || hour >= 18) {
      return false;  // Fora do horário comercial
    }

    // Ownership check
    if (resource.userId !== user.id) {
      return false;
    }

    // Amount limit check
    if (req.body.total > 10000 && !user.roles.includes('manager')) {
      return false;  // Precisa ser manager para valores altos
    }

    return true;
  },

  delete: async (req, user, resource) => {
    // Só pode deletar se status = 'draft'
    if (resource.status !== 'draft') {
      return false;
    }

    // E ser o dono OU admin
    return resource.userId === user.id || user.roles.includes('admin');
  }
}
```

---

## 🔧 Integração com API Plugin

### Opção A: Guard no Resource (Recomendado)

```javascript
// 1. Define guard no resource
const ordersResource = await db.createResource({
  name: 'orders',
  attributes: {
    userId: 'string|required',
    tenantId: 'string|required',
    total: 'number'
  },
  partitions: {
    byUser: { fields: { userId: 'string' } },
    byTenant: { fields: { tenantId: 'string' } }
  },
  guard: {
    list: (req, user) => {
      req.partitionName = 'byUser';
      req.partitionValues = { userId: user.id };
      return true;
    },
    update: (req, user, resource) => resource.userId === user.id,
    delete: ['admin']
  }
});

// 2. API Plugin usa guards automaticamente
await db.use(apiPlugin);

// Rotas AUTO-GERADAS e AUTO-PROTEGIDAS!
// GET  /api/orders         → list guard aplicado
// GET  /api/orders/:id     → get guard aplicado
// POST /api/orders         → insert guard aplicado
// PATCH /api/orders/:id    → update guard aplicado
// DELETE /api/orders/:id   → delete guard aplicado
```

**Vantagem**: Zero configuração extra, guards aplicados automaticamente!

---

### Opção B: Guard Override por Rota

```javascript
// Guard padrão no resource
const ordersResource = await db.createResource({
  name: 'orders',
  guard: {
    '*': (req, user) => req.tenantId = user.tenantId && true,
    delete: ['admin']
  }
});

// Override guard em rota específica
apiPlugin.addRoute({
  path: '/api/orders/:id',
  method: 'DELETE',
  guard: (req, user) => {
    // Custom guard só para esta rota
    return user.roles.includes('super-admin');
  },
  handler: async (req, res) => { ... }
});
```

**Vantagem**: Flexibilidade para casos especiais

---

## 🚀 Signature da Guard Function

```typescript
type GuardFunction = (
  req: Request,           // Express request
  user: JWTPayload,       // Decoded token (req.user)
  resource?: Resource     // Resource atual (para get/update/delete)
) => boolean | Promise<boolean>;

type GuardConfig = {
  // Por operação
  list?: GuardFunction | string[] | boolean;
  get?: GuardFunction | string[] | boolean;
  insert?: GuardFunction | string[] | boolean;
  update?: GuardFunction | string[] | boolean;
  patch?: GuardFunction | string[] | boolean;
  delete?: GuardFunction | string[] | boolean;
  replace?: GuardFunction | string[] | boolean;

  // Wildcard
  '*'?: GuardFunction | string[] | boolean;
};

// Resource options
interface ResourceOptions {
  name: string;
  attributes: object;
  partitions?: object;
  guard?: GuardConfig | string[];  // Simple ou completo
}
```

---

## 📦 Implementação no Resource

### resource.class.js

```javascript
class Resource {
  constructor(options) {
    this.name = options.name;
    this.attributes = options.attributes;
    this.guard = this._normalizeGuard(options.guard);
  }

  /**
   * Normaliza guard config
   */
  _normalizeGuard(guard) {
    if (!guard) return null;

    // String array simples → aplica para tudo
    if (Array.isArray(guard)) {
      return { '*': guard };
    }

    return guard;
  }

  /**
   * Executa guard para operação
   */
  async executeGuard(operation, req, user, resource = null) {
    if (!this.guard) return true;  // Sem guard = permite

    // 1. Tenta guard específico
    let guardFn = this.guard[operation];

    // 2. Fallback para wildcard
    if (!guardFn) {
      guardFn = this.guard['*'];
    }

    // 3. Sem guard = permite
    if (!guardFn) return true;

    // 4. Boolean simples
    if (typeof guardFn === 'boolean') {
      return guardFn;
    }

    // 5. Array de roles/scopes
    if (Array.isArray(guardFn)) {
      return this._checkRolesScopes(guardFn, user);
    }

    // 6. Função customizada
    if (typeof guardFn === 'function') {
      const result = await guardFn(req, user, resource);
      return result === true;  // Força boolean
    }

    return false;  // Default: bloqueia
  }

  /**
   * Verifica roles/scopes
   */
  _checkRolesScopes(requiredRolesScopes, user) {
    // User scopes
    const userScopes = user.scope?.split(' ') || [];

    // User roles (Keycloak client + realm + Azure AD)
    const clientId = user.azp || process.env.CLIENT_ID;
    const clientRoles = user.resource_access?.[clientId]?.roles || [];
    const realmRoles = user.realm_access?.roles || [];
    const azureRoles = user.roles || [];
    const userRoles = [...clientRoles, ...realmRoles, ...azureRoles];

    // Check if user has any of required
    return requiredRolesScopes.some(required => {
      return userScopes.includes(required) || userRoles.includes(required);
    });
  }

  /**
   * Wrapper para list com guard
   */
  async list(options = {}, context = {}) {
    // Execute guard
    if (context.req && context.user) {
      const allowed = await this.executeGuard('list', context.req, context.user);

      if (!allowed) {
        throw new Error('Forbidden: Guard denied access');
      }

      // Guard pode ter modificado req (partition, etc)
      if (context.req.partitionName) {
        return this.listPartition(
          context.req.partitionName,
          context.req.partitionValues || {},
          options
        );
      }
    }

    // Original list
    return this._originalList(options);
  }

  /**
   * Wrapper para get com guard
   */
  async get(id, options = {}, context = {}) {
    // Busca resource primeiro
    const resource = await this._originalGet(id, options);

    if (!resource) {
      return null;
    }

    // Execute guard (com acesso ao resource)
    if (context.req && context.user) {
      const allowed = await this.executeGuard('get', context.req, context.user, resource);

      if (!allowed) {
        // Retorna null ao invés de erro (404 ao invés de 403)
        return null;
      }
    }

    return resource;
  }

  /**
   * Wrapper para update com guard
   */
  async update(id, data, options = {}, context = {}) {
    // Busca resource atual
    const resource = await this._originalGet(id, options);

    if (!resource) {
      throw new Error('Resource not found');
    }

    // Execute guard
    if (context.req && context.user) {
      const allowed = await this.executeGuard('update', context.req, context.user, resource);

      if (!allowed) {
        throw new Error('Forbidden: Guard denied access');
      }
    }

    // Original update
    return this._originalUpdate(id, data, options);
  }

  // Similar para insert, patch, delete, replace...
}
```

---

## 🔌 Integração com API Plugin

### api.plugin.js

```javascript
class ApiPlugin {
  /**
   * Auto-gera rotas para resource com guards
   */
  async addResource(resource, options = {}) {
    const basePath = options.basePath || `/api/${resource.name}`;

    // GET /api/orders (list)
    this.addRoute({
      path: basePath,
      method: 'GET',
      handler: async (req, res) => {
        try {
          const records = await resource.list({}, {
            req,
            user: req.user
          });

          res.json({ data: records });
        } catch (err) {
          if (err.message.includes('Forbidden')) {
            return res.status(403).json({ error: err.message });
          }
          throw err;
        }
      },
      auth: options.auth || 'oauth2'
    });

    // GET /api/orders/:id (get)
    this.addRoute({
      path: `${basePath}/:id`,
      method: 'GET',
      handler: async (req, res) => {
        const record = await resource.get(req.params.id, {}, {
          req,
          user: req.user
        });

        if (!record) {
          return res.status(404).json({ error: 'Not found' });
        }

        res.json(record);
      },
      auth: options.auth || 'oauth2'
    });

    // POST /api/orders (insert)
    this.addRoute({
      path: basePath,
      method: 'POST',
      handler: async (req, res) => {
        try {
          const record = await resource.insert(req.body, {}, {
            req,
            user: req.user
          });

          res.status(201).json(record);
        } catch (err) {
          if (err.message.includes('Forbidden')) {
            return res.status(403).json({ error: err.message });
          }
          throw err;
        }
      },
      auth: options.auth || 'oauth2'
    });

    // PATCH /api/orders/:id (update)
    this.addRoute({
      path: `${basePath}/:id`,
      method: 'PATCH',
      handler: async (req, res) => {
        try {
          const record = await resource.update(req.params.id, req.body, {}, {
            req,
            user: req.user
          });

          res.json(record);
        } catch (err) {
          if (err.message.includes('Forbidden')) {
            return res.status(403).json({ error: err.message });
          }
          if (err.message.includes('not found')) {
            return res.status(404).json({ error: 'Not found' });
          }
          throw err;
        }
      },
      auth: options.auth || 'oauth2'
    });

    // DELETE /api/orders/:id (delete)
    this.addRoute({
      path: `${basePath}/:id`,
      method: 'DELETE',
      handler: async (req, res) => {
        try {
          await resource.delete(req.params.id, {}, {
            req,
            user: req.user
          });

          res.status(204).send();
        } catch (err) {
          if (err.message.includes('Forbidden')) {
            return res.status(403).json({ error: err.message });
          }
          if (err.message.includes('not found')) {
            return res.status(404).json({ error: 'Not found' });
          }
          throw err;
        }
      },
      auth: options.auth || 'oauth2'
    });
  }
}
```

---

## 🎯 Exemplos Práticos

### Exemplo 1: Multi-Tenant SaaS

```javascript
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
  guard: {
    // TODAS as operações forçam tenant isolation
    '*': (req, user) => {
      const tenantId = user.tenantId || user.tid;
      if (!tenantId) throw new Error('Tenant ID missing');

      req.tenantId = tenantId;
      req.partitionValues = { tenantId };
      return true;
    },

    // List usa partition dupla (tenant + user)
    list: (req, user) => {
      req.partitionName = 'byTenantUser';
      req.partitionValues = {
        tenantId: user.tenantId,
        userId: user.id
      };
      return true;
    },

    // Insert força tenantId e userId do token
    insert: (req, user) => {
      req.body.tenantId = user.tenantId;
      req.body.userId = user.id;
      return true;
    },

    // Update/Delete verificam ownership
    update: (req, user, resource) => {
      return resource.userId === user.id && resource.tenantId === user.tenantId;
    },

    delete: (req, user, resource) => {
      return resource.userId === user.id || user.roles.includes('admin');
    }
  }
});

// Auto-gera rotas protegidas!
apiPlugin.addResource(ordersResource);

// ✅ Pronto! Multi-tenancy + RLS automático em 30 linhas!
```

---

### Exemplo 2: Admin Override

```javascript
const usersResource = await db.createResource({
  name: 'users',
  attributes: { email: 'string', role: 'string' },
  guard: {
    // Usuários normais só veem próprio perfil
    get: (req, user, resource) => resource.id === user.id,

    // Só admin pode listar todos
    list: ['admin'],

    // Ninguém pode criar (exceto signup public)
    insert: false,

    // Só pode editar próprio perfil
    update: (req, user, resource) => resource.id === user.id,

    // Só admin deleta
    delete: ['admin']
  }
});
```

---

### Exemplo 3: ABAC com Business Rules

```javascript
const expensesResource = await db.createResource({
  name: 'expenses',
  attributes: {
    userId: 'string',
    amount: 'number',
    status: 'string'
  },
  guard: {
    list: (req, user) => {
      req.partitionName = 'byUser';
      req.partitionValues = { userId: user.id };
      return true;
    },

    update: async (req, user, resource) => {
      // 1. Ownership
      if (resource.userId !== user.id) return false;

      // 2. Status check
      if (resource.status !== 'draft') {
        return false;  // Só pode editar draft
      }

      // 3. Amount limit
      const newAmount = req.body.amount || resource.amount;
      if (newAmount > 1000 && !user.roles.includes('manager')) {
        return false;  // Manager aprova valores altos
      }

      // 4. Business hours
      const hour = new Date().getHours();
      if (hour < 9 || hour >= 18) {
        return false;
      }

      return true;
    }
  }
});
```

---

## ✅ Vantagens

1. **Declarativo** - Guard definido uma vez no resource
2. **DRY** - Não repete middleware em N rotas
3. **Automático** - API Plugin aplica guards automaticamente
4. **Integrado com Partitions** - RLS automático O(1)
5. **Flexível** - Simples (string[]) ou complexo (function)
6. **Type-safe** - TypeScript pode tipar guards
7. **Testável** - Guard é função pura (fácil testar)

---

## ⚠️ Trade-offs

### Vantagens sobre Middleware Manual
- ✅ Menos código repetido
- ✅ Guard vive com o schema (melhor DX)
- ✅ Auto-documentado
- ✅ Mais difícil esquecer proteção

### Desvantagens
- ❌ Menos explícito que middleware por rota
- ❌ Guard function pode ficar complexa
- ❌ Debugging pode ser mais difícil

### Quando usar Guards vs Middleware

**Use Guards quando**:
- Autorização é consistente (ex: multi-tenant, RLS)
- Quer auto-gerar rotas CRUD
- Precisa de DRY máximo

**Use Middleware quando**:
- Lógica muito específica por rota
- Precisa de controle fino
- Debugging é crítico

**Use Ambos!**:
```javascript
// Guard padrão no resource
guard: { list: (req, user) => { ... } }

// Override por rota quando necessário
apiPlugin.addRoute({
  path: '/special',
  middleware: [customMiddleware],  // Override guard
  ...
})
```

---

## 🚀 Próximos Passos

1. **Implementar `executeGuard()` no Resource**
2. **Adicionar context parameter** em list/get/update/etc
3. **Atualizar API Plugin** para usar guards
4. **Criar testes** para guards
5. **Documentar** patterns de guards
6. **Exemplo completo** (e65-guards-complete.js)

---

## 📝 Notas de Implementação

### Backward Compatibility

```javascript
// Sem guard - funciona como antes
const resource = await db.createResource({
  name: 'products',
  attributes: { ... }
});

// Com guard - nova funcionalidade
const resource = await db.createResource({
  name: 'orders',
  attributes: { ... },
  guard: { ... }  // Opt-in!
});
```

### Performance

- Guards executam ANTES de buscar dados (list/insert)
- Guards executam DEPOIS de buscar dados (get/update/delete) - para acessar resource
- Usar partitions em guards = O(1) performance!

### Error Handling

```javascript
// Guard retorna false → 403 Forbidden
guard: (req, user) => false;

// Guard lança erro → 500 Internal Server Error
guard: (req, user) => { throw new Error('Custom error'); };

// Guard retorna null/undefined → Bloqueia (403)
guard: (req, user) => {};  // Implicitamente false
```

---

**🎉 Guards = Autorização Declarativa + RLS Automático via Partitions!**
