/**
 * Authorization Complete Example
 *
 * Exemplo completo de autorização com:
 * - Multi-tenancy (isolamento por tenant)
 * - Row-Level Security (RLS) via partitions
 * - Scopes granulares (own/team/org/all)
 * - Role-Based Access Control (RBAC)
 * - Attribute-Based Access Control (ABAC)
 * - Audit trail
 */

import Database from 's3db.js';
import { ApiPlugin } from 's3db.js';
import { OIDCClient } from 's3db.js';

// ============================================================================
// AUTHORIZATION MIDDLEWARE
// ============================================================================

/**
 * Require specific scope
 */
function requireScope(scope) {
  return (req, res, next) => {
    const userScopes = req.user.scope?.split(' ') || [];

    if (!userScopes.includes(scope)) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `Scope "${scope}" required`,
        required_scope: scope,
        user_scopes: userScopes
      });
    }

    next();
  };
}

/**
 * Require any of the scopes (OR)
 */
function requireAnyScope(...scopes) {
  return (req, res, next) => {
    const userScopes = req.user.scope?.split(' ') || [];
    const hasAny = scopes.some(scope => userScopes.includes(scope));

    if (!hasAny) {
      return res.status(403).json({
        error: 'insufficient_scope',
        error_description: `One of scopes required: ${scopes.join(', ')}`,
        required_scopes: scopes,
        user_scopes: userScopes
      });
    }

    next();
  };
}

/**
 * Require role
 */
function requireRole(role) {
  return (req, res, next) => {
    // Keycloak: resource_access[clientId].roles
    const clientId = req.user.azp || process.env.CLIENT_ID || 'orders-api';
    const clientRoles = req.user.resource_access?.[clientId]?.roles || [];

    // Keycloak: realm_access.roles
    const realmRoles = req.user.realm_access?.roles || [];

    // Azure AD: roles
    const azureRoles = req.user.roles || [];

    const userRoles = [...clientRoles, ...realmRoles, ...azureRoles];

    if (!userRoles.includes(role)) {
      return res.status(403).json({
        error: 'insufficient_permissions',
        error_description: `Role "${role}" required`,
        required_role: role,
        user_roles: userRoles
      });
    }

    next();
  };
}

/**
 * Multi-tenancy middleware - extracts and validates tenant
 */
function requireTenant() {
  return (req, res, next) => {
    // Tenant ID from token (custom claim)
    const tenantId = req.user.tenantId || req.user.tid;

    if (!tenantId) {
      return res.status(403).json({
        error: 'forbidden',
        error_description: 'Tenant ID missing in token'
      });
    }

    req.tenantId = tenantId;
    req.userId = req.user.sub;

    next();
  };
}

/**
 * Ownership check - validates user owns the resource
 */
function requireOwnership(resourceGetter, ownerField = 'userId') {
  return async (req, res, next) => {
    try {
      const resource = await resourceGetter(req);

      if (!resource) {
        // 404 instead of 403 to avoid information leakage
        return res.status(404).json({ error: 'Resource not found' });
      }

      const resourceOwnerId = resource[ownerField];
      const requestUserId = req.user.sub;

      if (resourceOwnerId !== requestUserId) {
        // 404 instead of 403
        return res.status(404).json({ error: 'Resource not found' });
      }

      // Attach resource to request for handler
      req.resource = resource;
      next();
    } catch (err) {
      console.error('Ownership check error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// ============================================================================
// ABAC POLICY ENGINE
// ============================================================================

class ABACPolicy {
  constructor(name, evaluate) {
    this.name = name;
    this.evaluate = evaluate;
  }

  async check(context) {
    return await this.evaluate(context);
  }
}

class PolicyEngine {
  constructor() {
    this.policies = new Map();
  }

  register(policy) {
    this.policies.set(policy.name, policy);
  }

  async evaluate(policyNames, context) {
    const results = [];

    for (const name of policyNames) {
      const policy = this.policies.get(name);

      if (!policy) {
        throw new Error(`Policy "${name}" not found`);
      }

      const result = await policy.check(context);
      results.push({ policy: name, result });

      if (!result) {
        return { allowed: false, failedPolicy: name, results };
      }
    }

    return { allowed: true, results };
  }
}

const policyEngine = new PolicyEngine();

// ========================================
// Define ABAC Policies
// ========================================

// Policy: Tenant isolation
const sameTenant = new ABACPolicy('sameTenant', async (ctx) => {
  return ctx.resource.tenantId === ctx.user.tenantId;
});

// Policy: Business hours only (9am - 6pm)
const isBusinessHours = new ABACPolicy('isBusinessHours', async (ctx) => {
  const hour = new Date().getHours();
  return hour >= 9 && hour < 18;
});

// Policy: Can approve based on limit
const canApprove = new ABACPolicy('canApprove', async (ctx) => {
  const orderTotal = ctx.resource.total || 0;
  const userLimit = ctx.user.approvalLimit || 0;
  return orderTotal <= userLimit;
});

// Policy: Same team
const sameTeam = new ABACPolicy('sameTeam', async (ctx) => {
  return ctx.resource.teamId === ctx.user.teamId;
});

// Register policies
policyEngine.register(sameTenant);
policyEngine.register(isBusinessHours);
policyEngine.register(canApprove);
policyEngine.register(sameTeam);

/**
 * ABAC middleware - evaluates policies
 */
function requirePolicies(...policyNames) {
  return async (req, res, next) => {
    const context = {
      user: {
        ...req.user,
        tenantId: req.tenantId,
        userId: req.userId
      },
      resource: req.resource,
      request: req,
      timestamp: new Date()
    };

    try {
      const result = await policyEngine.evaluate(policyNames, context);

      if (!result.allowed) {
        // Log denial
        console.warn('Policy violation:', {
          userId: req.userId,
          tenantId: req.tenantId,
          failedPolicy: result.failedPolicy,
          resource: req.resource?.id
        });

        return res.status(403).json({
          error: 'policy_violation',
          error_description: `Policy "${result.failedPolicy}" denied access`,
          failed_policy: result.failedPolicy
        });
      }

      next();
    } catch (err) {
      console.error('Policy evaluation error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// ============================================================================
// CREATE API WITH COMPLETE AUTHORIZATION
// ============================================================================

async function createAuthorizedAPI() {
  console.log('🔐 Criando API com autorização completa...\n');

  // ========================================
  // 1. Setup Database
  // ========================================
  const db = new Database({
    connectionString: 'http://minioadmin:minioadmin@localhost:9000/orders-api',
    encryptionKey: 'orders-secret-key'
  });

  await db.connect();

  // ========================================
  // 2. Create Resources with Partitions
  // ========================================

  // Orders resource - multi-tenant with RLS
  const ordersResource = await db.createResource({
    name: 'orders',
    attributes: {
      tenantId: 'string|required',     // Organization
      userId: 'string|required',        // Owner
      teamId: 'string',                 // Team (optional)
      productId: 'string|required',
      quantity: 'number|required',
      total: 'number|required',
      status: 'string',                 // pending, approved, rejected
      approvedBy: 'string',
      approvedAt: 'string'
    },
    partitions: {
      byTenant: {
        fields: { tenantId: 'string' }  // Tenant isolation
      },
      byTenantUser: {
        fields: {
          tenantId: 'string',
          userId: 'string'                // RLS - user's own orders
        }
      },
      byTenantTeam: {
        fields: {
          tenantId: 'string',
          teamId: 'string'                // Team-level access
        }
      }
    },
    timestamps: true
  });

  // Audit log resource
  const auditResource = await db.createResource({
    name: 'audit_log',
    attributes: {
      tenantId: 'string|required',
      userId: 'string|required',
      action: 'string|required',         // create, read, update, delete
      resource: 'string|required',       // orders, users, etc
      resourceId: 'string',
      decision: 'string',                // allowed, denied
      reason: 'string',
      metadata: 'object'
    },
    partitions: {
      byTenant: {
        fields: { tenantId: 'string' }
      }
    },
    timestamps: true
  });

  console.log('✅ Resources criados com partitions\n');

  // ========================================
  // 3. Configure OAuth2/OIDC
  // ========================================
  const oidcClient = new OIDCClient({
    issuer: process.env.OIDC_ISSUER || 'http://localhost:8080/realms/production',
    audience: process.env.OIDC_AUDIENCE || 'orders-api',
    discoveryUri: process.env.OIDC_DISCOVERY_URI,
    jwksCacheTTL: 3600000,
    autoRefreshJWKS: true,
    clockTolerance: 60
  });

  await oidcClient.initialize();
  console.log('✅ OIDC Client inicializado\n');

  // ========================================
  // 4. Create API Plugin
  // ========================================
  const apiPlugin = new ApiPlugin({
    port: 3000,
    apiPrefix: '/api',
    cors: {
      origin: '*',
      credentials: true
    }
  });

  apiPlugin.addAuthDriver('oauth2', oidcClient.middleware.bind(oidcClient));

  // ========================================
  // 5. Audit Logger Middleware
  // ========================================
  apiPlugin.use(async (req, res, next) => {
    // Skip for health check
    if (req.path === '/health') return next();

    // Skip if not authenticated
    if (!req.user) return next();

    const originalJson = res.json.bind(res);
    const startTime = Date.now();

    res.json = function (data) {
      // Log after response
      const duration = Date.now() - startTime;
      const statusCode = res.statusCode;

      auditResource.insert({
        tenantId: req.tenantId || 'unknown',
        userId: req.user.sub,
        action: req.method,
        resource: req.path,
        resourceId: req.params?.id,
        decision: statusCode < 400 ? 'allowed' : 'denied',
        reason: statusCode >= 400 ? data.error || 'unknown' : 'success',
        metadata: {
          method: req.method,
          path: req.path,
          statusCode,
          duration,
          userAgent: req.headers['user-agent']
        }
      }).catch(err => console.error('Audit log error:', err));

      return originalJson(data);
    };

    next();
  });

  // ========================================
  // 6. Routes with Complete Authorization
  // ========================================

  // Health check (public)
  apiPlugin.addRoute({
    path: '/health',
    method: 'GET',
    handler: (req, res) => {
      res.json({
        status: 'ok',
        service: 'orders-api',
        auth: 'OAuth2/OIDC',
        authorization: 'Multi-tenant + RLS + ABAC',
        timestamp: new Date().toISOString()
      });
    },
    auth: false
  });

  // Get user info (authenticated)
  apiPlugin.addRoute({
    path: '/api/me',
    method: 'GET',
    handler: (req, res) => {
      res.json({
        user: {
          id: req.user.sub,
          email: req.user.email,
          username: req.user.preferred_username,
          tenantId: req.user.tenantId || req.user.tid,
          roles: req.user.resource_access?.['orders-api']?.roles || [],
          scopes: req.user.scope?.split(' ') || []
        }
      });
    },
    auth: 'oauth2'
  });

  // ========================================
  // ORDERS ROUTES
  // ========================================

  // List own orders (RLS via partition)
  apiPlugin.addRoute({
    path: '/api/orders/my',
    method: 'GET',
    middleware: [
      requireTenant(),
      requireScope('orders:read:own')
    ],
    handler: async (req, res) => {
      // O(1) lookup via double partition (tenant + user)
      const orders = await ordersResource.listPartition('byTenantUser', {
        tenantId: req.tenantId,
        userId: req.userId
      });

      res.json({
        orders,
        count: orders.length,
        scope: 'own'
      });
    },
    auth: 'oauth2'
  });

  // List team orders (requires team scope)
  apiPlugin.addRoute({
    path: '/api/orders/team',
    method: 'GET',
    middleware: [
      requireTenant(),
      requireScope('orders:read:team')
    ],
    handler: async (req, res) => {
      const teamId = req.user.teamId;

      if (!teamId) {
        return res.status(400).json({
          error: 'bad_request',
          error_description: 'User not assigned to a team'
        });
      }

      // O(1) lookup via partition (tenant + team)
      const orders = await ordersResource.listPartition('byTenantTeam', {
        tenantId: req.tenantId,
        teamId
      });

      res.json({
        orders,
        count: orders.length,
        scope: 'team',
        teamId
      });
    },
    auth: 'oauth2'
  });

  // List all orders in tenant (org-level access)
  apiPlugin.addRoute({
    path: '/api/orders',
    method: 'GET',
    middleware: [
      requireTenant(),
      requireAnyScope('orders:read:org', 'orders:read:all')
    ],
    handler: async (req, res) => {
      // List all orders for tenant
      const orders = await ordersResource.listPartition('byTenant', {
        tenantId: req.tenantId
      });

      res.json({
        orders,
        count: orders.length,
        scope: 'org',
        tenantId: req.tenantId
      });
    },
    auth: 'oauth2'
  });

  // Create order (RLS - auto-assigns userId)
  apiPlugin.addRoute({
    path: '/api/orders',
    method: 'POST',
    middleware: [
      requireTenant(),
      requireScope('orders:write:own')
    ],
    handler: async (req, res) => {
      const { productId, quantity, total, teamId } = req.body;

      // NEVER trust userId/tenantId from request body!
      const order = await ordersResource.insert({
        tenantId: req.tenantId,  // From token
        userId: req.userId,      // From token
        teamId: teamId || req.user.teamId,
        productId,
        quantity,
        total,
        status: 'pending'
      });

      res.status(201).json(order);
    },
    auth: 'oauth2'
  });

  // Get single order (ownership + tenant check)
  apiPlugin.addRoute({
    path: '/api/orders/:id',
    method: 'GET',
    middleware: [
      requireTenant(),
      requireScope('orders:read:own'),
      requireOwnership(
        async (req) => {
          const order = await ordersResource.get(req.params.id);

          // Tenant check first
          if (order && order.tenantId !== req.tenantId) {
            return null;  // Return 404
          }

          return order;
        },
        'userId'
      )
    ],
    handler: (req, res) => {
      // req.resource populated by requireOwnership
      res.json(req.resource);
    },
    auth: 'oauth2'
  });

  // Update order (ownership + tenant + ABAC)
  apiPlugin.addRoute({
    path: '/api/orders/:id',
    method: 'PATCH',
    middleware: [
      requireTenant(),
      requireScope('orders:write:own'),
      requireOwnership(
        async (req) => {
          const order = await ordersResource.get(req.params.id);
          if (order && order.tenantId !== req.tenantId) return null;
          return order;
        }
      ),
      requirePolicies('sameTenant', 'isBusinessHours')
    ],
    handler: async (req, res) => {
      const { quantity, total } = req.body;

      const updated = await ordersResource.update(req.params.id, {
        quantity,
        total
      });

      res.json(updated);
    },
    auth: 'oauth2'
  });

  // Delete order (ownership + tenant)
  apiPlugin.addRoute({
    path: '/api/orders/:id',
    method: 'DELETE',
    middleware: [
      requireTenant(),
      requireScope('orders:delete:own'),
      requireOwnership(
        async (req) => {
          const order = await ordersResource.get(req.params.id);
          if (order && order.tenantId !== req.tenantId) return null;
          return order;
        }
      )
    ],
    handler: async (req, res) => {
      await ordersResource.delete(req.params.id);
      res.status(204).send();
    },
    auth: 'oauth2'
  });

  // Approve order (role + ABAC policy)
  apiPlugin.addRoute({
    path: '/api/orders/:id/approve',
    method: 'POST',
    middleware: [
      requireTenant(),
      requireRole('manager'),
      requireOwnership(
        async (req) => {
          const order = await ordersResource.get(req.params.id);
          if (order && order.tenantId !== req.tenantId) return null;
          return order;
        },
        'teamId'  // Manager owns team, not individual order
      ),
      requirePolicies('sameTenant', 'canApprove')
    ],
    handler: async (req, res) => {
      const approved = await ordersResource.update(req.params.id, {
        status: 'approved',
        approvedBy: req.userId,
        approvedAt: new Date().toISOString()
      });

      res.json(approved);
    },
    auth: 'oauth2'
  });

  // ========================================
  // ADMIN ROUTES (super-admin only)
  // ========================================

  // List all tenants (super-admin)
  apiPlugin.addRoute({
    path: '/api/admin/tenants',
    method: 'GET',
    middleware: [requireRole('super-admin')],
    handler: async (req, res) => {
      // Super-admin can see all tenants
      const allOrders = await ordersResource.list({ limit: 10000 });

      const tenants = new Set(allOrders.map(o => o.tenantId));

      res.json({
        tenants: Array.from(tenants),
        count: tenants.size
      });
    },
    auth: 'oauth2'
  });

  // View audit log (admin)
  apiPlugin.addRoute({
    path: '/api/admin/audit',
    method: 'GET',
    middleware: [
      requireTenant(),
      requireRole('admin')
    ],
    handler: async (req, res) => {
      // Admin can see audit log for their tenant
      const logs = await auditResource.listPartition('byTenant', {
        tenantId: req.tenantId
      });

      res.json({
        logs,
        count: logs.length
      });
    },
    auth: 'oauth2'
  });

  // ========================================
  // 7. Start API
  // ========================================
  await db.use(apiPlugin);

  console.log('✅ API rodando em http://localhost:3000\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📖 ENDPOINTS:\n');
  console.log('PUBLIC:');
  console.log('  GET  /health');
  console.log('\nAUTHENTICATED:');
  console.log('  GET  /api/me                    → User info');
  console.log('\nORDERS (RLS - Row-Level Security):');
  console.log('  GET  /api/orders/my             → Own orders (scope: orders:read:own)');
  console.log('  GET  /api/orders/team           → Team orders (scope: orders:read:team)');
  console.log('  GET  /api/orders                → Org orders (scope: orders:read:org)');
  console.log('  POST /api/orders                → Create order (scope: orders:write:own)');
  console.log('  GET  /api/orders/:id            → Get order (ownership check)');
  console.log('  PATCH /api/orders/:id           → Update order (ownership + ABAC)');
  console.log('  DELETE /api/orders/:id          → Delete order (ownership)');
  console.log('  POST /api/orders/:id/approve    → Approve order (role: manager + ABAC)');
  console.log('\nADMIN:');
  console.log('  GET  /api/admin/tenants         → List tenants (role: super-admin)');
  console.log('  GET  /api/admin/audit           → Audit log (role: admin)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('🔒 AUTHORIZATION LAYERS:\n');
  console.log('  1. ✅ Authentication (OAuth2/OIDC token)');
  console.log('  2. ✅ Multi-tenancy (partition by tenantId)');
  console.log('  3. ✅ Scope-based permissions (orders:read:own/team/org)');
  console.log('  4. ✅ Role-based access (admin, manager, user)');
  console.log('  5. ✅ Row-Level Security (ownership via partitions)');
  console.log('  6. ✅ ABAC policies (business hours, approval limits)');
  console.log('  7. ✅ Audit trail (all actions logged)\n');

  return { db, apiPlugin, ordersResource, auditResource };
}

// ============================================================================
// HELPER: Show sample token structure
// ============================================================================

function showSampleToken() {
  console.log('\n📋 SAMPLE TOKEN STRUCTURE (Keycloak):\n');
  console.log(JSON.stringify({
    sub: 'user-123',                     // User ID
    email: 'john@acme.com',
    preferred_username: 'john.doe',
    tenantId: 'acme-corp',               // Custom claim (configure in Keycloak)
    teamId: 'sales-team',                // Custom claim
    approvalLimit: 10000,                // Custom claim (for ABAC policy)
    scope: 'openid profile email orders:read:own orders:write:own orders:delete:own',
    resource_access: {
      'orders-api': {
        roles: ['user']                  // Client-level roles
      }
    },
    realm_access: {
      roles: ['user', 'manager']         // Realm-level roles
    },
    iss: 'http://localhost:8080/realms/production',
    aud: 'orders-api',
    exp: 1234567890,
    iat: 1234567890
  }, null, 2));

  console.log('\n📋 CUSTOM CLAIMS TO ADD IN KEYCLOAK:\n');
  console.log('1. tenantId - Organization ID');
  console.log('2. teamId - Team ID within organization');
  console.log('3. approvalLimit - Max order value user can approve');
  console.log('\nKeycloak: Client → orders-api → Mappers → Create → User Attribute\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Complete Authorization Example');
  console.log('  Multi-tenancy + RLS + RBAC + ABAC');
  console.log('═══════════════════════════════════════════════════════════\n');

  showSampleToken();

  const api = await createAuthorizedAPI();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ API pronta! Aguardando requests...');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  createAuthorizedAPI,
  requireScope,
  requireAnyScope,
  requireRole,
  requireTenant,
  requireOwnership,
  requirePolicies,
  ABACPolicy,
  PolicyEngine,
  policyEngine
};
