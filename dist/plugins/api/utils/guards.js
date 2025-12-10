import { createLogger } from '../../../concerns/logger.js';
const logger = createLogger({ name: 'Guards', level: 'info' });
export function checkGuard(ctxOrUser, guard, recordOrContext = null) {
    if (!guard) {
        return true;
    }
    const isRouteContext = ctxOrUser && typeof ctxOrUser === 'object' &&
        ('user' in ctxOrUser || '_currentResource' in ctxOrUser);
    const ctx = isRouteContext ? ctxOrUser : null;
    const user = isRouteContext ? ctxOrUser.user : ctxOrUser;
    const record = isRouteContext ? recordOrContext : null;
    const legacyContext = isRouteContext ? {} : (recordOrContext || {});
    if (!user && guard !== true) {
        return false;
    }
    if (typeof guard === 'boolean') {
        return guard;
    }
    if (typeof guard === 'function') {
        try {
            if (ctx) {
                const guardLength = guard.length;
                if (guardLength >= 2 && record !== null) {
                    return guard(ctx, record);
                }
                else {
                    return guard(ctx);
                }
            }
            else {
                return guard(user, legacyContext);
            }
        }
        catch (err) {
            logger.error({ error: err.message }, '[Guards] Error executing guard function');
            return false;
        }
    }
    if (typeof guard === 'string') {
        return hasScope(user, guard);
    }
    if (Array.isArray(guard)) {
        return guard.some(scope => hasScope(user, scope));
    }
    if (typeof guard === 'object') {
        const guardObj = guard;
        if (guardObj.role) {
            if (Array.isArray(guardObj.role)) {
                if (!guardObj.role.includes(user?.role || '')) {
                    return false;
                }
            }
            else if (user?.role !== guardObj.role) {
                return false;
            }
        }
        if (guardObj.scopes) {
            const requiredScopes = Array.isArray(guardObj.scopes) ? guardObj.scopes : [guardObj.scopes];
            if (!requiredScopes.every(scope => hasScope(user, scope))) {
                return false;
            }
        }
        if (guardObj.check && typeof guardObj.check === 'function') {
            try {
                if (ctx) {
                    return guardObj.check(ctx, record);
                }
                else {
                    return guardObj.check(user, legacyContext);
                }
            }
            catch (err) {
                logger.error({ error: err.message }, '[Guards] Error executing guard.check function');
                return false;
            }
        }
        return true;
    }
    return false;
}
export function hasScope(user, scope) {
    if (!user || !user.scopes) {
        return false;
    }
    if (!Array.isArray(user.scopes)) {
        return false;
    }
    if (user.scopes.includes(scope)) {
        return true;
    }
    const wildcards = user.scopes.filter(s => s.endsWith(':*'));
    for (const wildcard of wildcards) {
        const prefix = wildcard.slice(0, -2);
        if (scope.startsWith(prefix + ':')) {
            return true;
        }
    }
    if (user.scopes.includes('*')) {
        return true;
    }
    return false;
}
export function getOperationGuard(guards, operation) {
    if (!guards) {
        return null;
    }
    if (typeof guards === 'function' || typeof guards === 'string' || Array.isArray(guards)) {
        return guards;
    }
    if (typeof guards === 'object' && !Array.isArray(guards)) {
        const guardsConfig = guards;
        if (guardsConfig[operation] !== undefined) {
            return guardsConfig[operation];
        }
        if (guardsConfig.all !== undefined) {
            return guardsConfig.all;
        }
        const aliases = {
            list: 'read',
            get: 'read',
            create: 'write',
            update: 'write',
            delete: 'write'
        };
        if (aliases[operation] && guardsConfig[aliases[operation]] !== undefined) {
            return guardsConfig[aliases[operation]];
        }
    }
    return null;
}
export function guardMiddleware(guards, operation, options = {}) {
    return async (c, next) => {
        const { RouteContext } = await import('../concerns/route-context.js');
        const legacyContext = c.get('customRouteContext') || {};
        const { database, resource, plugins = {}, globalGuards = null } = { ...legacyContext, ...options };
        const ctx = new RouteContext(c, database, resource, plugins);
        let guard = getOperationGuard(guards, operation);
        if (guard === null && globalGuards) {
            guard = getOperationGuard(globalGuards, operation);
        }
        const authorized = checkGuard(ctx, guard, null);
        if (!authorized) {
            return c.json({
                success: false,
                error: {
                    message: 'Forbidden: Insufficient permissions',
                    code: 'FORBIDDEN',
                    details: {
                        operation,
                        user: ctx.user ? { id: ctx.user.id, role: ctx.user.role } : null
                    }
                },
                _status: 403
            }, 403);
        }
        if (ctx.hasPartitionFilters?.()) {
            c.set('partitionFilters', ctx.getPartitionFilters?.());
        }
        await next();
    };
}
export default {
    checkGuard,
    hasScope,
    getOperationGuard,
    guardMiddleware
};
//# sourceMappingURL=guards.js.map