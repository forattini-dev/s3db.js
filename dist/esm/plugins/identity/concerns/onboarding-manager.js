/**
 * Onboarding Manager - First-run setup for Identity Plugin
 *
 * Handles automatic admin account creation on first run with multiple modes:
 * - Interactive: CLI wizard with prompts (dev mode)
 * - Environment: IDENTITY_ADMIN_EMAIL/PASSWORD env vars (production)
 * - Config: Declarative admin object in config (Kubernetes/Docker)
 * - Callback: Custom onFirstRun function (advanced)
 *
 * Security:
 * - Strong password validation (min 12 chars, complexity)
 * - Optional leaked password check (haveibeenpwned)
 * - Audit trail for admin creation
 * - Idempotent - skips if admin exists
 */
import { PluginError } from '../../../errors.js';
import { idGenerator } from '../../../concerns/id.js';
const onboardingMemoryCache = globalThis.__IDENTITY_ONBOARDING_CACHE__ || {
    admins: [],
    metadata: null
};
globalThis.__IDENTITY_ONBOARDING_CACHE__ = onboardingMemoryCache;
export class OnboardingManager {
    resources;
    database;
    logger;
    config;
    auditPlugin;
    pluginStorageResource;
    usersResource;
    clientsResource;
    passwordPolicy;
    defaultAdminScopes;
    constructor(options = {}) {
        this.resources = options.resources || {};
        this.database = options.database;
        this.logger = options.logger || console;
        this.config = options.config || {};
        if (!this.config.onFirstRun && this.config.callback) {
            this.config.onFirstRun = this.config.callback;
        }
        this.auditPlugin = options.auditPlugin;
        this.pluginStorageResource = options.pluginStorageResource;
        if (options.usersResource)
            this.resources.users = options.usersResource;
        if (options.clientsResource)
            this.resources.clients = options.clientsResource;
        this.passwordPolicy = {
            minLength: 12,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSymbols: true,
            ...this.config.passwordPolicy
        };
        this.defaultAdminScopes = [
            'openid',
            'profile',
            'email',
            'admin:*'
        ];
    }
    async detectFirstRun() {
        try {
            const usersResource = this.resources.users || this.usersResource;
            if (!usersResource) {
                throw new Error('Users resource not initialized in OnboardingManager');
            }
            const admins = await usersResource.query({
                active: true
            });
            let adminUsers = admins.filter(user => {
                if (!user.scopes || !Array.isArray(user.scopes)) {
                    return false;
                }
                return user.scopes.some((scope) => scope === 'admin:*' || scope.startsWith('admin:'));
            });
            if (adminUsers.length === 0 && onboardingMemoryCache.admins.length > 0) {
                for (const cachedAdmin of onboardingMemoryCache.admins) {
                    const existing = await usersResource.query({ email: cachedAdmin.email });
                    if (existing.length === 0) {
                        await this.createAdmin({
                            ...cachedAdmin,
                            metadata: {
                                ...cachedAdmin.metadata,
                                restoredFromCache: true
                            }
                        });
                    }
                }
                const restored = await usersResource.query({ active: true });
                adminUsers = restored.filter((user) => Array.isArray(user.scopes) &&
                    user.scopes.some((scope) => scope === 'admin:*' || scope.startsWith('admin:')));
            }
            const isFirstRun = adminUsers.length === 0;
            if (this.logger && this.config.logLevel) {
                this.logger.info?.(`[Onboarding] First run detection: ${isFirstRun ? 'YES' : 'NO'} (${adminUsers.length} admins found)`);
            }
            return isFirstRun;
        }
        catch (error) {
            this.logger?.error?.('[Onboarding] Error detecting first run:', error);
            throw new PluginError('Failed to detect first run status', {
                pluginName: 'IdentityPlugin',
                operation: 'detectFirstRun',
                cause: error,
                retriable: true
            });
        }
    }
    validatePassword(password) {
        const errors = [];
        const policy = this.passwordPolicy;
        if (!password || typeof password !== 'string') {
            return { valid: false, errors: ['Password is required'] };
        }
        if (password.length < policy.minLength) {
            errors.push(`Password must be at least ${policy.minLength} characters`);
        }
        if (policy.requireUppercase && !/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        if (policy.requireLowercase && !/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        if (policy.requireNumbers && !/\d/.test(password)) {
            errors.push('Password must contain at least one number');
        }
        if (policy.requireSymbols && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            errors.push('Password must contain at least one symbol');
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return false;
        }
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    async createAdmin(options) {
        const { email, password, name, scopes, metadata } = options;
        if (!this.validateEmail(email)) {
            throw new PluginError('Invalid email address', {
                pluginName: 'IdentityPlugin',
                operation: 'createAdmin',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide a valid email address (e.g., admin@example.com)'
            });
        }
        const passwordValidation = this.validatePassword(password);
        if (!passwordValidation.valid) {
            throw new PluginError(`Invalid password: ${passwordValidation.errors.join(', ')}`, {
                pluginName: 'IdentityPlugin',
                operation: 'createAdmin',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide a strong password (min 12 chars with uppercase, lowercase, number, and symbol)'
            });
        }
        try {
            const usersResource = this.resources.users || this.usersResource;
            if (!usersResource) {
                throw new Error('Users resource not available');
            }
            const existing = await usersResource.query({ email });
            if (existing.length > 0) {
                throw new PluginError(`User with email ${email} already exists`, {
                    pluginName: 'IdentityPlugin',
                    operation: 'createAdmin',
                    statusCode: 409,
                    retriable: false,
                    suggestion: 'Use a different email address or delete existing user'
                });
            }
            const adminUser = await usersResource.insert({
                email,
                password,
                name: name || 'Administrator',
                scopes: scopes || this.defaultAdminScopes,
                active: true,
                metadata: {
                    ...metadata,
                    createdViaOnboarding: true,
                    onboardingMode: this.config.mode || 'unknown'
                }
            });
            if (this.logger && this.config.logLevel) {
                this.logger.info?.(`[Onboarding] Admin account created: ${email} (scopes: ${(scopes || this.defaultAdminScopes).join(', ')})`);
            }
            const alreadyCached = onboardingMemoryCache.admins.some((admin) => admin.email === email);
            if (!alreadyCached) {
                onboardingMemoryCache.admins.push({
                    email,
                    password,
                    name: name || 'Administrator',
                    scopes: scopes || this.defaultAdminScopes,
                    metadata
                });
            }
            await this._logAuditEvent('admin_account_created', {
                email,
                scopes: scopes || this.defaultAdminScopes,
                createdViaOnboarding: true,
                mode: this.config.mode
            });
            return adminUser;
        }
        catch (error) {
            this.logger?.error?.('[Onboarding] Failed to create admin user:', error);
            throw new PluginError('Failed to create admin user', {
                pluginName: 'IdentityPlugin',
                operation: 'createAdmin',
                cause: error,
                retriable: false
            });
        }
    }
    async createClient(options) {
        const { name, clientId = idGenerator(), clientSecret = `${idGenerator()}${idGenerator()}`, grantTypes = ['client_credentials'], allowedScopes = ['openid', 'profile'], redirectUris = [], audiences = [], metadata = {} } = options;
        if (!name) {
            throw new PluginError('Client name is required', {
                pluginName: 'IdentityPlugin',
                operation: 'createClient',
                statusCode: 400,
                retriable: false
            });
        }
        try {
            const clientsResource = this.resources.clients || this.clientsResource;
            if (!clientsResource) {
                throw new Error('Clients resource not available');
            }
            const client = await clientsResource.insert({
                clientId,
                clientSecret,
                name,
                grantTypes,
                allowedScopes,
                redirectUris,
                metadata: {
                    ...metadata,
                    audiences,
                    createdViaOnboarding: true
                },
                active: true
            });
            if (this.logger && this.config.logLevel) {
                this.logger.info?.(`[Onboarding] OAuth client created: ${name} (${clientId})`);
            }
            return {
                id: client.id,
                clientId,
                clientSecret,
                name,
                grantTypes,
                allowedScopes,
                redirectUris
            };
        }
        catch (error) {
            this.logger?.error?.('[Onboarding] Failed to create OAuth client:', error);
            throw new PluginError('Failed to create OAuth client', {
                pluginName: 'IdentityPlugin',
                operation: 'createClient',
                cause: error,
                retriable: false
            });
        }
    }
    async getOnboardingStatus() {
        try {
            const firstRun = await this.detectFirstRun();
            const metadata = await this._getOnboardingMetadata();
            return {
                completed: !firstRun || metadata?.completed === true,
                adminExists: !firstRun,
                completedAt: metadata?.completedAt,
                mode: metadata?.mode || this.config.mode,
                clientsCount: metadata?.clientsCreated || 0
            };
        }
        catch (error) {
            this.logger?.error?.('[Onboarding] Error getting status:', error);
            return {
                completed: false,
                error: error.message
            };
        }
    }
    async markOnboardingComplete(data = {}) {
        try {
            const metadata = {
                completed: true,
                completedAt: new Date().toISOString(),
                mode: this.config.mode || 'unknown',
                ...data
            };
            onboardingMemoryCache.metadata = metadata;
            if (this.pluginStorageResource) {
                await this.pluginStorageResource.insert({
                    key: 'onboarding_metadata',
                    value: metadata,
                    metadata: {
                        type: 'onboarding',
                        version: 1
                    }
                });
            }
            if (this.logger && this.config.logLevel) {
                this.logger.info?.('[Onboarding] Marked as complete');
            }
            await this._logAuditEvent('onboarding_completed', metadata);
        }
        catch (error) {
            this.logger?.error?.('[Onboarding] Failed to mark complete:', error);
        }
    }
    async runEnvMode() {
        if (this.logger && this.config.logLevel) {
            this.logger.info?.('[Onboarding] Running environment variables mode');
        }
        let email = process.env.IDENTITY_ADMIN_EMAIL || this.config.adminEmail;
        let password = process.env.IDENTITY_ADMIN_PASSWORD || this.config.adminPassword;
        const name = process.env.IDENTITY_ADMIN_NAME || this.config.adminName;
        if (process.env.IDENTITY_ADMIN_PASSWORD_FILE) {
            try {
                const fs = await import('fs');
                password = fs.readFileSync(process.env.IDENTITY_ADMIN_PASSWORD_FILE, 'utf8').trim();
            }
            catch (error) {
                this.logger?.error?.('[Onboarding] Failed to read password file:', error);
            }
        }
        if (process.env.IDENTITY_ADMIN_EMAIL_FILE) {
            try {
                const fs = await import('fs');
                email = fs.readFileSync(process.env.IDENTITY_ADMIN_EMAIL_FILE, 'utf8').trim();
            }
            catch (error) {
                this.logger?.error?.('[Onboarding] Failed to read email file:', error);
            }
        }
        if (!email || !password) {
            throw new PluginError('Missing IDENTITY_ADMIN_EMAIL or IDENTITY_ADMIN_PASSWORD environment variables', {
                pluginName: 'IdentityPlugin',
                operation: 'runEnvMode',
                statusCode: 400,
                retriable: false,
                suggestion: 'Set IDENTITY_ADMIN_EMAIL and IDENTITY_ADMIN_PASSWORD env vars, or use onboarding.admin config'
            });
        }
        const admin = await this.createAdmin({ email, password, name });
        await this.markOnboardingComplete({ adminEmail: email });
        if (this.logger && this.config.logLevel) {
            this.logger.info?.('[Onboarding] Environment mode complete');
        }
        return admin;
    }
    async runConfigMode() {
        if (this.logger && this.config.logLevel) {
            this.logger.info?.('[Onboarding] Running config mode');
        }
        const { admin } = this.config;
        if (!admin || !admin.email || !admin.password) {
            throw new PluginError('Missing admin.email or admin.password in onboarding config', {
                pluginName: 'IdentityPlugin',
                operation: 'runConfigMode',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide onboarding.admin: { email, password } in plugin config'
            });
        }
        const createdAdmin = await this.createAdmin({
            email: admin.email,
            password: admin.password,
            name: admin.name,
            scopes: admin.scopes,
            metadata: admin.metadata
        });
        await this.markOnboardingComplete({ adminEmail: admin.email });
        if (this.logger && this.config.logLevel) {
            this.logger.info?.('[Onboarding] Config mode complete');
        }
        return createdAdmin;
    }
    async runCallbackMode() {
        if (this.logger && this.config.logLevel) {
            this.logger.info?.('[Onboarding] Running callback mode');
        }
        const onFirstRun = this.config.onFirstRun || this.config.callback;
        if (typeof onFirstRun !== 'function') {
            throw new PluginError('onFirstRun must be a function in callback mode', {
                pluginName: 'IdentityPlugin',
                operation: 'runCallbackMode',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide onboarding.onFirstRun: async ({ createAdmin, createClient }) => { ... }'
            });
        }
        const context = {
            createAdmin: this.createAdmin.bind(this),
            createClient: this.createClient.bind(this),
            db: this.database,
            logger: this.logger,
            config: this.config
        };
        try {
            await onFirstRun(context);
            await this.markOnboardingComplete({ mode: 'callback' });
            if (this.logger && this.config.logLevel) {
                this.logger.info?.('[Onboarding] Callback mode complete');
            }
        }
        catch (error) {
            this.logger?.error?.('[Onboarding] Callback error:', error);
            throw new PluginError('onFirstRun callback failed', {
                pluginName: 'IdentityPlugin',
                operation: 'runCallbackMode',
                cause: error,
                retriable: false
            });
        }
    }
    async runInteractiveMode() {
        if (this.logger && this.config.logLevel) {
            this.logger.info?.('[Onboarding] Running interactive mode');
        }
        if (!process.stdout.isTTY) {
            throw new PluginError('Interactive mode requires a TTY (terminal). Use env or config mode instead.', {
                pluginName: 'IdentityPlugin',
                operation: 'runInteractiveMode',
                statusCode: 400,
                retriable: false,
                suggestion: 'Set IDENTITY_ADMIN_EMAIL/PASSWORD env vars or use onboarding.admin config'
            });
        }
        try {
            const { InteractiveWizard } = await import('./interactive-wizard.js');
            const wizard = new InteractiveWizard({
                logger: this.logger,
                config: this.config,
                passwordPolicy: this.passwordPolicy
            });
            const adminData = await wizard.run();
            const admin = await this.createAdmin(adminData);
            await this.markOnboardingComplete({ adminEmail: adminData.email });
            if (this.logger && this.config.logLevel) {
                this.logger.info?.('[Onboarding] Interactive mode complete');
            }
            return admin;
        }
        catch (error) {
            if (error.code === 'ERR_MODULE_NOT_FOUND' || error.message.includes('enquirer')) {
                throw new PluginError('Interactive mode requires "enquirer" package. Install with: npm install enquirer', {
                    pluginName: 'IdentityPlugin',
                    operation: 'runInteractiveMode',
                    cause: error,
                    retriable: false,
                    suggestion: 'Run: npm install enquirer, or use env/config mode instead'
                });
            }
            throw error;
        }
    }
    async _getOnboardingMetadata() {
        if (!this.pluginStorageResource) {
            return null;
        }
        try {
            const records = await this.pluginStorageResource.query({
                key: 'onboarding_metadata'
            });
            if (records.length > 0) {
                return records[0].value;
            }
        }
        catch (error) {
            this.logger?.error?.('[Onboarding] Error reading metadata:', error);
        }
        return null;
    }
    async _logAuditEvent(action, data) {
        if (!this.auditPlugin || !this.auditPlugin.log) {
            return;
        }
        try {
            await this.auditPlugin.log({
                action,
                resource: 'identity_onboarding',
                metadata: {
                    ...data,
                    timestamp: new Date().toISOString()
                }
            });
        }
        catch (error) {
            this.logger?.error?.('[Onboarding] Audit log error:', error);
        }
    }
    static resetCache() {
        onboardingMemoryCache.admins = [];
        onboardingMemoryCache.metadata = null;
    }
}
//# sourceMappingURL=onboarding-manager.js.map