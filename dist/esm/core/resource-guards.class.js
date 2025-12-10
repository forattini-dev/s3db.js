export class ResourceGuards {
    resource;
    _guard;
    constructor(resource, config = {}) {
        this.resource = resource;
        this._guard = this._normalize(config.guard);
    }
    getGuard() {
        return this._guard;
    }
    _normalize(guard) {
        if (!guard)
            return null;
        if (Array.isArray(guard)) {
            return { '*': guard };
        }
        return guard;
    }
    async execute(operation, context, record = null) {
        if (!this._guard)
            return true;
        let guardFn = this._guard[operation];
        if (!guardFn) {
            guardFn = this._guard['*'];
        }
        if (!guardFn)
            return true;
        if (typeof guardFn === 'boolean') {
            return guardFn;
        }
        if (Array.isArray(guardFn)) {
            return this._checkRolesScopes(guardFn, context.user);
        }
        if (typeof guardFn === 'function') {
            try {
                const result = await guardFn(context, record);
                return result === true;
            }
            catch (err) {
                this.resource.logger?.error({ operation, error: err.message, stack: err.stack }, `guard error for ${operation}`);
                return false;
            }
        }
        return false;
    }
    _checkRolesScopes(requiredRolesScopes, user) {
        if (!user)
            return false;
        const userScopes = user.scope?.split(' ') || [];
        const clientId = user.azp || process.env.CLIENT_ID || 'default';
        const clientRoles = user.resource_access?.[clientId]?.roles || [];
        const realmRoles = user.realm_access?.roles || [];
        const azureRoles = user.roles || [];
        const userRoles = [...clientRoles, ...realmRoles, ...azureRoles];
        return requiredRolesScopes.some(required => {
            return userScopes.includes(required) || userRoles.includes(required);
        });
    }
    hasGuard(operation) {
        if (!this._guard)
            return false;
        return this._guard[operation] !== undefined || this._guard['*'] !== undefined;
    }
    setGuard(guard) {
        this._guard = this._normalize(guard);
    }
}
export default ResourceGuards;
//# sourceMappingURL=resource-guards.class.js.map