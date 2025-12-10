/**
 * Password Authentication Driver
 *
 * Handles password-based authentication using username/email and password.
 * Supports case-insensitive identifier matching and tenant-scoped lookups.
 */
import { AuthDriver } from './auth-driver.interface.js';
import { tryFn } from '../../../concerns/try-fn.js';
import { PluginError } from '../../../errors.js';
export class PasswordAuthDriver extends AuthDriver {
    options;
    usersResource;
    passwordHelper;
    identifierField;
    caseInsensitive;
    constructor(options = {}) {
        super('password', ['password']);
        this.options = options;
        this.usersResource = null;
        this.passwordHelper = null;
        this.identifierField = options.identifierField || 'email';
        this.caseInsensitive = options.caseInsensitive !== false;
    }
    async initialize(context) {
        this.usersResource = context.resources?.users;
        this.passwordHelper = context.helpers?.password || null;
        if (!this.usersResource) {
            throw new PluginError('PasswordAuthDriver requires users resource', {
                pluginName: 'IdentityPlugin',
                operation: 'initializePasswordDriver',
                statusCode: 500,
                retriable: false,
                suggestion: 'Pass users resource via IdentityPlugin({ resources: { users: ... } }) before enabling password driver.'
            });
        }
        if (!this.passwordHelper || typeof this.passwordHelper.verify !== 'function') {
            throw new PluginError('PasswordAuthDriver requires password helper with verify(password, hash)', {
                pluginName: 'IdentityPlugin',
                operation: 'initializePasswordDriver',
                statusCode: 500,
                retriable: false,
                suggestion: 'Ensure IdentityPlugin password helper is registered or provide a custom helper with verify(password, hash).'
            });
        }
    }
    supportsGrant(grantType) {
        return grantType === 'password';
    }
    async authenticate(request = {}) {
        const identifier = request[this.identifierField] || request.email || request.username;
        const password = request.password;
        if (!identifier || !password) {
            return {
                success: false,
                error: 'missing_credentials',
                statusCode: 400
            };
        }
        const normalizedIdentifier = this._normalizeIdentifier(identifier);
        let user = request.user || null;
        if (!user) {
            const queryFilter = { [this.identifierField]: normalizedIdentifier };
            if (request.tenantId) {
                queryFilter.tenantId = request.tenantId;
            }
            const [ok, err, users] = await tryFn(() => this.usersResource.query(queryFilter));
            if (!ok) {
                return {
                    success: false,
                    error: err?.message || 'lookup_failed',
                    statusCode: 500
                };
            }
            if (!users || users.length === 0) {
                return {
                    success: false,
                    error: 'invalid_credentials',
                    statusCode: 401
                };
            }
            user = users[0];
        }
        const passwordHash = user.password;
        if (!passwordHash) {
            return {
                success: false,
                error: 'password_not_set',
                statusCode: 401
            };
        }
        const validPassword = await this.passwordHelper.verify(password, passwordHash);
        if (!validPassword) {
            return {
                success: false,
                error: 'invalid_credentials',
                statusCode: 401
            };
        }
        return {
            success: true,
            user
        };
    }
    _normalizeIdentifier(value) {
        if (value == null)
            return value;
        if (!this.caseInsensitive) {
            return typeof value === 'string' ? value.trim() : value;
        }
        if (typeof value !== 'string') {
            return value;
        }
        return value.trim().toLowerCase();
    }
}
//# sourceMappingURL=password-driver.js.map