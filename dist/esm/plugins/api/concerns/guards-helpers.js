export function createExpressContext(req) {
    const context = {
        user: req.user || {},
        params: req.params || {},
        body: req.body || {},
        query: req.query || {},
        headers: req.headers || {},
        partitionName: null,
        partitionValues: {},
        tenantId: null,
        userId: null,
        setPartition(name, values) {
            this.partitionName = name;
            this.partitionValues = values;
        },
        raw: { req }
    };
    return context;
}
export async function createHonoContext(c) {
    const context = {
        user: c.get('user') || {},
        params: c.req.param(),
        body: await c.req.json().catch(() => ({})),
        query: c.req.query(),
        headers: Object.fromEntries(c.req.raw.headers.entries()),
        partitionName: null,
        partitionValues: {},
        tenantId: null,
        userId: null,
        setPartition(name, values) {
            this.partitionName = name;
            this.partitionValues = values;
        },
        raw: { c }
    };
    return context;
}
export function createFastifyContext(request) {
    const context = {
        user: request.user || {},
        params: request.params || {},
        body: request.body || {},
        query: request.query || {},
        headers: request.headers || {},
        partitionName: null,
        partitionValues: {},
        tenantId: null,
        userId: null,
        setPartition(name, values) {
            this.partitionName = name;
            this.partitionValues = values;
        },
        raw: { request }
    };
    return context;
}
export async function applyGuardsToList(resource, context, options = {}) {
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
export async function applyGuardsToGet(resource, context, record) {
    if (!record)
        return null;
    const allowed = await resource.executeGuard('get', context, record);
    if (!allowed) {
        return null;
    }
    return record;
}
export async function applyGuardsToInsert(resource, context, data) {
    const allowed = await resource.executeGuard('insert', context);
    if (!allowed) {
        throw new Error('Forbidden: Guard denied access to insert');
    }
    if (context.body && typeof context.body === 'object') {
        return { ...data, ...context.body };
    }
    return data;
}
export async function applyGuardsToUpdate(resource, context, record) {
    if (!record) {
        throw new Error('Resource not found');
    }
    const allowed = await resource.executeGuard('update', context, record);
    if (!allowed) {
        throw new Error('Forbidden: Guard denied access to update');
    }
    return true;
}
export async function applyGuardsToDelete(resource, context, record) {
    if (!record) {
        throw new Error('Resource not found');
    }
    const allowed = await resource.executeGuard('delete', context, record);
    if (!allowed) {
        throw new Error('Forbidden: Guard denied access to delete');
    }
    return true;
}
export function requireScopes(requiredScopes, mode = 'any') {
    const scopes = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];
    return (ctx) => {
        const userScopes = ctx.user?.scopes || [];
        if (mode === 'all') {
            return scopes.every(scope => userScopes.includes(scope));
        }
        return scopes.some(scope => userScopes.includes(scope));
    };
}
export function requireRole(role) {
    const roles = Array.isArray(role) ? role : [role];
    return (ctx) => {
        const userRole = ctx.user?.role;
        const userRoles = ctx.user?.roles || [];
        if (userRole && roles.includes(userRole)) {
            return true;
        }
        return roles.some(r => userRoles.includes(r));
    };
}
export function requireAdmin() {
    return requireScopes(['admin']);
}
export function requireOwnership(field = 'userId') {
    return (ctx, resource) => {
        if (!resource)
            return false;
        const userId = ctx.user?.sub || ctx.user?.id;
        if (!userId)
            return false;
        return resource[field] === userId;
    };
}
export function anyOf(...guards) {
    return async (ctx, resource) => {
        for (const guard of guards) {
            const result = await guard(ctx, resource);
            if (result)
                return true;
        }
        return false;
    };
}
export function allOf(...guards) {
    return async (ctx, resource) => {
        for (const guard of guards) {
            const result = await guard(ctx, resource);
            if (!result)
                return false;
        }
        return true;
    };
}
export function requireTenant(tenantField = 'tenantId') {
    return (ctx, resource) => {
        if (!resource)
            return true;
        const userTenantId = ctx.tenantId || ctx.user?.tenantId || ctx.user?.tid;
        if (!userTenantId)
            return false;
        return resource[tenantField] === userTenantId;
    };
}
//# sourceMappingURL=guards-helpers.js.map