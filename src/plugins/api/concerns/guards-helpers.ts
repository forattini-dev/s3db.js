import type { Context as HonoContext } from 'hono';

export interface UserInfo {
  sub?: string;
  id?: string;
  scopes?: string[];
  role?: string;
  roles?: string[];
  tenantId?: string;
  tid?: string;
  verified?: boolean;
  [key: string]: unknown;
}

export interface GuardContext {
  user: UserInfo;
  params: Record<string, string>;
  body: Record<string, unknown>;
  query: Record<string, string>;
  headers: Record<string, string>;
  partitionName: string | null;
  partitionValues: Record<string, unknown>;
  tenantId: string | null;
  userId: string | null;
  setPartition(name: string, values: Record<string, unknown>): void;
  raw: { req?: unknown; c?: HonoContext; request?: unknown };
}

export interface ResourceLike {
  executeGuard(operation: string, context: GuardContext, record?: Record<string, unknown>): Promise<boolean>;
}

export interface ExpressRequest {
  user?: UserInfo;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface FastifyRequest {
  user?: UserInfo;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export type GuardFunction = (ctx: GuardContext, resource?: Record<string, unknown>) => boolean | Promise<boolean>;

export function createExpressContext(req: ExpressRequest): GuardContext {
  const context: GuardContext = {
    user: req.user || {},
    params: req.params || {},
    body: req.body || {},
    query: req.query || {},
    headers: req.headers || {},
    partitionName: null,
    partitionValues: {},
    tenantId: null,
    userId: null,
    setPartition(name: string, values: Record<string, unknown>) {
      this.partitionName = name;
      this.partitionValues = values;
    },
    raw: { req }
  };

  return context;
}

export async function createHonoContext(c: HonoContext): Promise<GuardContext> {
  const context: GuardContext = {
    user: c.get('user') || {},
    params: c.req.param(),
    body: await c.req.json().catch(() => ({})),
    query: c.req.query(),
    headers: Object.fromEntries((c.req.raw.headers as unknown as { entries(): IterableIterator<[string, string]> }).entries()),
    partitionName: null,
    partitionValues: {},
    tenantId: null,
    userId: null,
    setPartition(name: string, values: Record<string, unknown>) {
      this.partitionName = name;
      this.partitionValues = values;
    },
    raw: { c }
  };

  return context;
}

export function createFastifyContext(request: FastifyRequest): GuardContext {
  const context: GuardContext = {
    user: request.user || {},
    params: request.params || {},
    body: request.body || {},
    query: request.query || {},
    headers: request.headers || {},
    partitionName: null,
    partitionValues: {},
    tenantId: null,
    userId: null,
    setPartition(name: string, values: Record<string, unknown>) {
      this.partitionName = name;
      this.partitionValues = values;
    },
    raw: { request }
  };

  return context;
}

export interface ListOptions {
  partition?: string;
  partitionValues?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function applyGuardsToList(
  resource: ResourceLike,
  context: GuardContext,
  options: ListOptions = {}
): Promise<ListOptions> {
  const allowed = await resource.executeGuard('list', context);

  if (!allowed) {
    throw new Error('Forbidden: Guard denied access to list');
  }

  if (context.partitionName) {
    options.partition = context.partitionName;
    options.partitionValues = context.partitionValues || {};
  }

  return options;
}

export async function applyGuardsToGet(
  resource: ResourceLike,
  context: GuardContext,
  record: Record<string, unknown> | null
): Promise<Record<string, unknown> | null> {
  if (!record) return null;

  const allowed = await resource.executeGuard('get', context, record);

  if (!allowed) {
    return null;
  }

  return record;
}

export async function applyGuardsToInsert(
  resource: ResourceLike,
  context: GuardContext,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const allowed = await resource.executeGuard('insert', context);

  if (!allowed) {
    throw new Error('Forbidden: Guard denied access to insert');
  }

  if (context.body && typeof context.body === 'object') {
    return { ...data, ...context.body };
  }

  return data;
}

export async function applyGuardsToUpdate(
  resource: ResourceLike,
  context: GuardContext,
  record: Record<string, unknown> | null
): Promise<boolean> {
  if (!record) {
    throw new Error('Resource not found');
  }

  const allowed = await resource.executeGuard('update', context, record);

  if (!allowed) {
    throw new Error('Forbidden: Guard denied access to update');
  }

  return true;
}

export async function applyGuardsToDelete(
  resource: ResourceLike,
  context: GuardContext,
  record: Record<string, unknown> | null
): Promise<boolean> {
  if (!record) {
    throw new Error('Resource not found');
  }

  const allowed = await resource.executeGuard('delete', context, record);

  if (!allowed) {
    throw new Error('Forbidden: Guard denied access to delete');
  }

  return true;
}

export function requireScopes(requiredScopes: string | string[], mode: 'any' | 'all' = 'any'): GuardFunction {
  const scopes = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];

  return (ctx: GuardContext): boolean => {
    const userScopes = ctx.user?.scopes || [];

    if (mode === 'all') {
      return scopes.every(scope => userScopes.includes(scope));
    }

    return scopes.some(scope => userScopes.includes(scope));
  };
}

export function requireRole(role: string | string[]): GuardFunction {
  const roles = Array.isArray(role) ? role : [role];

  return (ctx: GuardContext): boolean => {
    const userRole = ctx.user?.role;
    const userRoles = ctx.user?.roles || [];

    if (userRole && roles.includes(userRole)) {
      return true;
    }

    return roles.some(r => userRoles.includes(r));
  };
}

export function requireAdmin(): GuardFunction {
  return requireScopes(['admin']);
}

export function requireOwnership(field: string = 'userId'): GuardFunction {
  return (ctx: GuardContext, resource?: Record<string, unknown>): boolean => {
    if (!resource) return false;

    const userId = ctx.user?.sub || ctx.user?.id;
    if (!userId) return false;

    return resource[field] === userId;
  };
}

export function anyOf(...guards: GuardFunction[]): GuardFunction {
  return async (ctx: GuardContext, resource?: Record<string, unknown>): Promise<boolean> => {
    for (const guard of guards) {
      const result = await guard(ctx, resource);
      if (result) return true;
    }
    return false;
  };
}

export function allOf(...guards: GuardFunction[]): GuardFunction {
  return async (ctx: GuardContext, resource?: Record<string, unknown>): Promise<boolean> => {
    for (const guard of guards) {
      const result = await guard(ctx, resource);
      if (!result) return false;
    }
    return true;
  };
}

export function requireTenant(tenantField: string = 'tenantId'): GuardFunction {
  return (ctx: GuardContext, resource?: Record<string, unknown>): boolean => {
    if (!resource) return true;

    const userTenantId = ctx.tenantId || ctx.user?.tenantId || ctx.user?.tid;
    if (!userTenantId) return false;

    return resource[tenantField] === userTenantId;
  };
}
