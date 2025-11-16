/**
 * Auth Resource Manager - Manages resource creation and validation for auth drivers
 *
 * Each auth driver needs a resource with specific fields. This helper:
 * 1. Auto-creates resources with minimal schema (if createResource: true)
 * 2. Validates existing resources have required fields (if createResource: false)
 * 3. Provides clear error messages when fields are missing
 */

import { createLogger } from '../../../concerns/logger.js';

/**
 * Base Auth Resource Manager
 */
export class AuthResourceManager {
  constructor(database, driverName, config) {
    this.database = database;
    this.driverName = driverName;
    this.config = config;
    this.logger = createLogger({ name: `AuthResource:${driverName}`, level: 'info' });
  }

  /**
   * Get or create resource for this driver
   * @returns {Promise<Resource>} Resource instance
   */
  async getOrCreateResource() {
    const resourceName = this.config.resource || this.getDefaultResourceName();
    const createResource = this.config.createResource !== false; // Default: true

    // Check if resource exists
    const existingResource = this.database.resources[resourceName];

    if (existingResource) {
      this.logger.debug(`Using existing resource: ${resourceName}`);

      // Validate required fields (only checks existence, not type)
      this.validateResourceFields(existingResource);

      return existingResource;
    }

    // Resource doesn't exist
    if (!createResource) {
      throw new Error(
        `${this.driverName} driver: Resource '${resourceName}' not found.\n\n` +
        `Options:\n` +
        `1. Create the resource manually with required fields: ${this.getRequiredFieldNames().join(', ')}\n` +
        `2. Set createResource: true to auto-create\n` +
        `3. Use a different resource name\n\n` +
        `Available resources: ${Object.keys(this.database.resources).join(', ') || '(none)'}`
      );
    }

    // Auto-create resource
    this.logger.info(`Auto-creating resource: ${resourceName}`);
    return await this.createDefaultResource(resourceName);
  }

  /**
   * Get default resource name for this driver
   */
  getDefaultResourceName() {
    return `plg_api_${this.driverName}_users`;
  }

  /**
   * Get required field names for validation
   */
  getRequiredFieldNames() {
    const schema = this.getMinimalSchema();
    return Object.keys(schema);
  }

  /**
   * Validate existing resource has required fields
   * @throws {Error} If required fields are missing
   */
  validateResourceFields(resource) {
    const requiredFields = this.getRequiredFieldNames();
    const existingFields = Object.keys(resource.schema.attributes);

    const missingFields = requiredFields.filter(
      field => !existingFields.includes(field)
    );

    if (missingFields.length > 0) {
      throw new Error(
        `${this.driverName} driver: Resource '${resource.name}' is missing required fields:\n` +
        `${missingFields.map(f => `  - ${f}`).join('\n')}\n\n` +
        `Options:\n` +
        `1. Add missing fields to your resource schema\n` +
        `2. Set createResource: true to auto-create a new resource\n` +
        `3. Use field mapping to match existing fields (e.g., userField: 'username')`
      );
    }

    this.logger.debug(`Resource validation passed: ${resource.name}`);
  }

  /**
   * Create resource with minimal schema for this driver
   */
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

  /**
   * Get minimal schema for this driver (override in subclasses)
   */
  getMinimalSchema() {
    throw new Error('getMinimalSchema() must be implemented by driver resource manager');
  }
}

/**
 * JWT Resource Manager
 */
export class JWTResourceManager extends AuthResourceManager {
  getMinimalSchema() {
    const userField = this.config.userField || 'email';
    const passwordField = this.config.passwordField || 'password';

    return {
      id: 'string|required',
      [userField]: userField === 'email'
        ? 'string|required|email'
        : 'string|required|minlength:3',
      [passwordField]: 'secret|required|minlength:8',
      role: 'string|default:user',
      scopes: 'array|items:string|optional',
      active: 'boolean|default:true',
      lastLoginAt: 'string|optional'
    };
  }
}

/**
 * API Key Resource Manager
 */
export class APIKeyResourceManager extends AuthResourceManager {
  getMinimalSchema() {
    const keyField = this.config.keyField || 'apiKey';

    return {
      id: 'string|required',
      [keyField]: 'string|required|minlength:16',
      active: 'boolean|default:true',
      name: 'string|optional',        // Client/app name
      scopes: 'array|items:string|optional',
      lastUsedAt: 'string|optional'
    };
  }
}

/**
 * Basic Auth Resource Manager
 */
export class BasicAuthResourceManager extends AuthResourceManager {
  getMinimalSchema() {
    const usernameField = this.config.usernameField || 'email';
    const passwordField = this.config.passwordField || 'password';

    return {
      id: 'string|required',
      [usernameField]: usernameField === 'email'
        ? 'string|required|email'
        : 'string|required|minlength:3',
      [passwordField]: 'secret|required|minlength:8',
      active: 'boolean|default:true',
      role: 'string|default:user'
    };
  }
}

/**
 * OAuth2 Resource Manager
 */
export class OAuth2ResourceManager extends AuthResourceManager {
  getMinimalSchema() {
    // OAuth2 is a resource server - users come from tokens
    // We store minimal info for local user management
    return {
      id: 'string|required',
      email: 'string|optional|email',
      username: 'string|optional',
      role: 'string|default:user',
      scopes: 'array|items:string|optional',
      active: 'boolean|default:true',
      providerId: 'string|optional' // Original 'sub' from token
    };
  }
}

/**
 * OIDC Resource Manager
 */
export class OIDCResourceManager extends AuthResourceManager {
  getMinimalSchema() {
    // OIDC creates users from IdP claims
    return {
      id: 'string|required',
      email: 'string|required|email',
      username: 'string|optional',
      role: 'string|default:user',
      scopes: 'array|items:string|optional',
      active: 'boolean|default:true',
      provider: 'string|optional',     // 'azure', 'google', 'keycloak'
      providerId: 'string|optional',   // Original 'sub' from IdP
      lastLoginAt: 'string|optional',
      metadata: 'json|optional'        // Extra claims/data
    };
  }
}
