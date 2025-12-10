import { createLogger } from '../../../concerns/logger.js';
export class AuthResourceManager {
    database;
    driverName;
    config;
    logger;
    constructor(database, driverName, config) {
        this.database = database;
        this.driverName = driverName;
        this.config = config;
        this.logger = createLogger({ name: `AuthResource:${driverName}`, level: 'info' });
    }
    async getOrCreateResource() {
        const resourceName = this.config.resource || this.getDefaultResourceName();
        const createResource = this.config.createResource !== false;
        const existingResource = this.database.resources[resourceName];
        if (existingResource) {
            this.logger.debug(`Using existing resource: ${resourceName}`);
            this.validateResourceFields(existingResource);
            return existingResource;
        }
        if (!createResource) {
            throw new Error(`${this.driverName} driver: Resource '${resourceName}' not found.\n\n` +
                `Options:\n` +
                `1. Create the resource manually with required fields: ${this.getRequiredFieldNames().join(', ')}\n` +
                `2. Set createResource: true to auto-create\n` +
                `3. Use a different resource name\n\n` +
                `Available resources: ${Object.keys(this.database.resources).join(', ') || '(none)'}`);
        }
        this.logger.info(`Auto-creating resource: ${resourceName}`);
        return await this.createDefaultResource(resourceName);
    }
    getDefaultResourceName() {
        return `plg_api_${this.driverName}_users`;
    }
    getRequiredFieldNames() {
        const schema = this.getMinimalSchema();
        return Object.keys(schema);
    }
    validateResourceFields(resource) {
        const requiredFields = this.getRequiredFieldNames();
        const existingFields = Object.keys(resource.schema.attributes);
        const missingFields = requiredFields.filter(field => !existingFields.includes(field));
        if (missingFields.length > 0) {
            throw new Error(`${this.driverName} driver: Resource '${resource.name}' is missing required fields:\n` +
                `${missingFields.map(f => `  - ${f}`).join('\n')}\n\n` +
                `Options:\n` +
                `1. Add missing fields to your resource schema\n` +
                `2. Set createResource: true to auto-create a new resource\n` +
                `3. Use field mapping to match existing fields (e.g., userField: 'username')`);
        }
        this.logger.debug(`Resource validation passed: ${resource.name}`);
    }
    async createDefaultResource(resourceName) {
        const schema = this.getMinimalSchema();
        const resource = await this.database.createResource({
            name: resourceName,
            attributes: schema,
            behavior: 'body-overflow',
            timestamps: true,
            createdBy: `ApiPlugin:${this.driverName}`
        });
        this.logger.info(`Created resource '${resourceName}' with fields: ${Object.keys(schema).join(', ')}`);
        return resource;
    }
    getMinimalSchema() {
        throw new Error('getMinimalSchema() must be implemented by driver resource manager');
    }
}
export class JWTResourceManager extends AuthResourceManager {
    getMinimalSchema() {
        const userField = this.config.userField || 'email';
        const passwordField = this.config.passwordField || 'password';
        return {
            id: 'string|optional',
            [userField]: userField === 'email'
                ? 'string|required|email'
                : 'string|required|minlength:3',
            [passwordField]: 'password|required|minlength:8',
            role: 'string|default:user',
            scopes: 'array|items:string|optional',
            active: 'boolean|default:true',
            lastLoginAt: 'string|optional'
        };
    }
}
export class APIKeyResourceManager extends AuthResourceManager {
    getMinimalSchema() {
        const keyField = this.config.keyField || 'apiKey';
        return {
            id: 'string|required',
            [keyField]: 'string|required|minlength:16',
            active: 'boolean|default:true',
            name: 'string|optional',
            scopes: 'array|items:string|optional',
            lastUsedAt: 'string|optional'
        };
    }
}
export class BasicAuthResourceManager extends AuthResourceManager {
    getMinimalSchema() {
        const usernameField = this.config.usernameField || 'email';
        const passwordField = this.config.passwordField || 'password';
        return {
            id: 'string|required',
            [usernameField]: usernameField === 'email'
                ? 'string|required|email'
                : 'string|required|minlength:3',
            [passwordField]: 'password|required|minlength:8',
            active: 'boolean|default:true',
            role: 'string|default:user'
        };
    }
}
export class OAuth2ResourceManager extends AuthResourceManager {
    getMinimalSchema() {
        return {
            id: 'string|required',
            email: 'string|optional|email',
            username: 'string|optional',
            role: 'string|default:user',
            scopes: 'array|items:string|optional',
            active: 'boolean|default:true',
            providerId: 'string|optional'
        };
    }
}
export class OIDCResourceManager extends AuthResourceManager {
    getMinimalSchema() {
        return {
            id: 'string|required',
            email: 'string|required|email',
            username: 'string|optional',
            role: 'string|default:user',
            scopes: 'array|items:string|optional',
            active: 'boolean|default:true',
            provider: 'string|optional',
            providerId: 'string|optional',
            lastLoginAt: 'string|optional',
            metadata: 'json|optional'
        };
    }
}
//# sourceMappingURL=resource-manager.js.map