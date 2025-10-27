/**
 * Resource Schema Definitions - Base attributes for Identity Plugin resources
 *
 * These are the REQUIRED attributes that the Identity Plugin needs to function.
 * Users can extend these with custom attributes, but cannot override base fields.
 */

/**
 * Base attributes for Users resource
 *
 * Required by Identity Plugin for authentication and authorization
 */
export const BASE_USER_ATTRIBUTES = {
  // Authentication
  email: 'string|required|email',
  password: 'password|required',
  emailVerified: 'boolean|default:false',

  // Profile
  name: 'string|optional',
  givenName: 'string|optional',
  familyName: 'string|optional',
  nickname: 'string|optional',
  picture: 'string|optional',
  locale: 'string|optional',

  // Authorization
  scopes: 'array|items:string|optional',
  roles: 'array|items:string|optional',

  // Multi-tenancy
  tenantId: 'string|optional',  // Tenant the user belongs to

  // Status
  active: 'boolean|default:true',

  // Metadata
  metadata: 'object|optional'
};

/**
 * Base attributes for Tenants resource
 *
 * Required by Identity Plugin for multi-tenancy support
 */
export const BASE_TENANT_ATTRIBUTES = {
  // Identity
  name: 'string|required',
  slug: 'string|required',  // URL-friendly identifier

  // Settings
  settings: 'object|optional',

  // Status
  active: 'boolean|default:true',

  // Metadata
  metadata: 'object|optional'
};

/**
 * Base attributes for OAuth2 Clients resource
 *
 * Required by Identity Plugin for OAuth2/OIDC flows
 */
export const BASE_CLIENT_ATTRIBUTES = {
  // OAuth2 Identity
  clientId: 'string|required',
  clientSecret: 'secret|required',

  // Client Info
  name: 'string|required',
  description: 'string|optional',

  // OAuth2 Configuration
  redirectUris: 'array|items:string|required',
  allowedScopes: 'array|items:string|optional',
  grantTypes: 'array|items:string|default:["authorization_code","refresh_token"]',
  responseTypes: 'array|items:string|optional',

  // Multi-tenancy
  tenantId: 'string|optional',  // Tenant the client belongs to

  // Security
  tokenEndpointAuthMethod: 'string|default:client_secret_post',
  requirePkce: 'boolean|default:false',

  // Status
  active: 'boolean|default:true',

  // Metadata
  metadata: 'object|optional'
};

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const output = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        output[key] = deepMerge(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    } else {
      output[key] = source[key];
    }
  }

  return output;
}

/**
 * Validate that user-provided attributes don't conflict with base attributes
 * and that optional fields have defaults
 *
 * @param {Object} baseAttributes - Base attributes from plugin
 * @param {Object} userAttributes - User-provided extra attributes
 * @param {string} resourceType - Type of resource (for error messages)
 * @returns {Object} result - { valid: boolean, errors: string[] }
 */
export function validateExtraAttributes(baseAttributes, userAttributes, resourceType) {
  const errors = [];

  if (!userAttributes || typeof userAttributes !== 'object') {
    return { valid: true, errors: [] };  // No extras = valid
  }

  // Check for conflicts with base attributes
  for (const fieldName of Object.keys(userAttributes)) {
    if (baseAttributes[fieldName]) {
      errors.push(
        `Cannot override base attribute '${fieldName}' in ${resourceType} resource. ` +
        `Base attributes are managed by IdentityPlugin.`
      );
    }
  }

  // Check that optional fields have defaults
  for (const [fieldName, fieldSchema] of Object.entries(userAttributes)) {
    const isOptional = typeof fieldSchema === 'string' && fieldSchema.includes('optional');
    const hasDefault = typeof fieldSchema === 'string' && fieldSchema.includes('default:');

    if (isOptional && !hasDefault) {
      errors.push(
        `Extra attribute '${fieldName}' in ${resourceType} resource is optional but has no default value. ` +
        `Add "|default:value" to the schema or make it required.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Merge base resource config with user-provided config (deep merge)
 *
 * @param {Object} baseConfig - Base resource config from plugin
 * @param {Object} userConfig - User-provided resource config
 * @param {string} resourceType - Type of resource (for error messages)
 * @returns {Object} mergedConfig - Combined resource configuration
 * @throws {Error} If validation fails
 */
export function mergeResourceConfig(baseConfig, userConfig = {}, resourceType) {
  // Validate user attributes if provided
  if (userConfig.attributes) {
    const validation = validateExtraAttributes(
      baseConfig.attributes,
      userConfig.attributes,
      resourceType
    );

    if (!validation.valid) {
      const errorMsg = [
        `Invalid extra attributes for ${resourceType} resource:`,
        ...validation.errors.map(err => `  - ${err}`)
      ].join('\n');
      throw new Error(errorMsg);
    }
  }

  // Deep merge: user config first, then base config (base takes precedence)
  const merged = deepMerge(userConfig, baseConfig);

  // Merge attributes specially to ensure base attributes are preserved
  if (userConfig.attributes || baseConfig.attributes) {
    merged.attributes = {
      ...(userConfig.attributes || {}),  // User extras first
      ...(baseConfig.attributes || {})   // Base overrides (protection)
    };
  }

  return merged;
}

/**
 * Validate required resource configuration from user
 *
 * @param {Object} resourcesConfig - User-provided resources configuration
 * @returns {Object} result - { valid: boolean, errors: string[] }
 */
export function validateResourcesConfig(resourcesConfig) {
  const errors = [];

  if (!resourcesConfig || typeof resourcesConfig !== 'object') {
    errors.push('IdentityPlugin requires "resources" configuration object');
    return { valid: false, errors };
  }

  // Validate users resource
  if (!resourcesConfig.users) {
    errors.push(
      'IdentityPlugin requires "resources.users" configuration.\n' +
      'Example: resources: { users: { name: "users", attributes: {...}, hooks: {...} } }'
    );
  } else {
    if (!resourcesConfig.users.name || typeof resourcesConfig.users.name !== 'string') {
      errors.push('resources.users.name is required and must be a string');
    }
  }

  // Validate tenants resource
  if (!resourcesConfig.tenants) {
    errors.push(
      'IdentityPlugin requires "resources.tenants" configuration.\n' +
      'Example: resources: { tenants: { name: "tenants", attributes: {...}, partitions: {...} } }'
    );
  } else {
    if (!resourcesConfig.tenants.name || typeof resourcesConfig.tenants.name !== 'string') {
      errors.push('resources.tenants.name is required and must be a string');
    }
  }

  // Validate clients resource
  if (!resourcesConfig.clients) {
    errors.push(
      'IdentityPlugin requires "resources.clients" configuration.\n' +
      'Example: resources: { clients: { name: "oauth_clients", attributes: {...}, behavior: "..." } }'
    );
  } else {
    if (!resourcesConfig.clients.name || typeof resourcesConfig.clients.name !== 'string') {
      errors.push('resources.clients.name is required and must be a string');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  BASE_USER_ATTRIBUTES,
  BASE_TENANT_ATTRIBUTES,
  BASE_CLIENT_ATTRIBUTES,
  validateExtraAttributes,
  mergeResourceConfig,
  validateResourcesConfig
};
