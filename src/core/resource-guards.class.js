/**
 * ResourceGuards handles authorization/access control for a Resource.
 * Guards are functions that determine if an operation is allowed based on user context.
 */
export class ResourceGuards {
    /**
     * Create a new ResourceGuards instance
     * @param {Object} resource - Parent Resource instance
     * @param {Object} config - Configuration options
     * @param {Object|Array} [config.guard] - Guard configuration
     */
    constructor(resource, config = {}) {
        this.resource = resource;
        this._guard = this._normalize(config.guard);
    }

    /**
     * Get the normalized guard configuration
     * @returns {Object|null}
     */
    getGuard() {
        return this._guard;
    }

    /**
     * Normalize guard configuration
     * @param {Object|Array|undefined} guard - Guard configuration
     * @returns {Object|null} Normalized guard config
     * @private
     */
    _normalize(guard) {
        if (!guard) return null;

        // Simple string array → applies to every operation
        if (Array.isArray(guard)) {
            return { '*': guard };
        }

        return guard;
    }

    /**
     * Execute guard for operation
     * @param {string} operation - Operation name (list, get, insert, update, etc)
     * @param {Object} context - Framework-agnostic context
     * @param {Object} context.user - Decoded JWT token
     * @param {Object} context.params - Route params
     * @param {Object} context.body - Request body
     * @param {Object} context.query - Query string
     * @param {Object} context.headers - Request headers
     * @param {Function} context.setPartition - Helper to set partition
     * @param {Object} [record] - Resource record (for get/update/delete)
     * @returns {Promise<boolean>} True if allowed, false if denied
     */
    async execute(operation, context, record = null) {
        if (!this._guard) return true;  // No guard = allow

        // 1. Try operation-specific guard
        let guardFn = this._guard[operation];

        // 2. Fallback to wildcard
        if (!guardFn) {
            guardFn = this._guard['*'];
        }

        // 3. No guard = allow
        if (!guardFn) return true;

        // 4. Boolean simple
        if (typeof guardFn === 'boolean') {
            return guardFn;
        }

        // 5. Array of roles/scopes
        if (Array.isArray(guardFn)) {
            return this._checkRolesScopes(guardFn, context.user);
        }

        // 6. Custom function
        if (typeof guardFn === 'function') {
            try {
                const result = await guardFn(context, record);
                return result === true;  // Force boolean
            } catch (err) {
                // Guard error = deny access
                this.resource.logger?.error(
                    { operation, error: err.message, stack: err.stack },
                    `guard error for ${operation}`
                );
                return false;
            }
        }

        return false;  // Default: deny
    }

    /**
     * Check if user has required roles or scopes
     * Supports multiple JWT formats: Keycloak, Azure AD, standard OpenID
     *
     * @param {Array<string>} requiredRolesScopes - Required roles/scopes
     * @param {Object} user - User from JWT token
     * @returns {boolean} True if user has any of required roles/scopes
     * @private
     */
    _checkRolesScopes(requiredRolesScopes, user) {
        if (!user) return false;

        // User scopes (OpenID scope claim)
        const userScopes = user.scope?.split(' ') || [];

        // User roles - support multiple formats (Keycloak, Azure AD)
        const clientId = user.azp || process.env.CLIENT_ID || 'default';
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
     * Check if a guard is defined for an operation
     * @param {string} operation - Operation name
     * @returns {boolean}
     */
    hasGuard(operation) {
        if (!this._guard) return false;
        return this._guard[operation] !== undefined || this._guard['*'] !== undefined;
    }

    /**
     * Update the guard configuration
     * @param {Object|Array} guard - New guard configuration
     */
    setGuard(guard) {
        this._guard = this._normalize(guard);
    }
}
