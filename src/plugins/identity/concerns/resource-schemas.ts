/**
 * Resource Schema Definitions - Base attributes for Identity Plugin resources
 *
 * These are the REQUIRED attributes that the Identity Plugin needs to function.
 * Users can extend these with custom attributes, but cannot override base fields.
 */
import { PluginError } from '../../../errors.js';

export type AttributeSchema = string;

export interface BaseAttributes {
  [key: string]: AttributeSchema;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ResourceConfig {
  name?: string;
  attributes?: BaseAttributes;
  [key: string]: any;
}

export interface ResourcesConfig {
  users?: ResourceConfig;
  tenants?: ResourceConfig;
  clients?: ResourceConfig;
}

export const BASE_USER_ATTRIBUTES: BaseAttributes = {
  email: 'string|required|email',
  password: 'password|required',
  emailVerified: 'boolean|default:false',
  name: 'string|optional',
  givenName: 'string|optional',
  familyName: 'string|optional',
  nickname: 'string|optional',
  picture: 'string|optional',
  locale: 'string|optional',
  scopes: 'array|items:string|optional',
  roles: 'array|items:string|optional',
  tenantId: 'string|optional',
  active: 'boolean|default:true',
  failedLoginAttempts: 'number|default:0',
  lockedUntil: 'string|optional',
  lastFailedLogin: 'string|optional',
  metadata: 'object|optional'
};

export const BASE_TENANT_ATTRIBUTES: BaseAttributes = {
  name: 'string|required',
  slug: 'string|required',
  settings: 'object|optional',
  active: 'boolean|default:true',
  metadata: 'object|optional'
};

export const BASE_CLIENT_ATTRIBUTES: BaseAttributes = {
  clientId: 'string|required',
  clientSecret: 'secret|required',
  name: 'string|required',
  description: 'string|optional',
  redirectUris: 'array|items:string|required',
  allowedScopes: 'array|items:string|optional',
  grantTypes: 'array|items:string|default:["authorization_code","refresh_token"]',
  responseTypes: 'array|items:string|optional',
  tenantId: 'string|optional',
  tokenEndpointAuthMethod: 'string|default:client_secret_post',
  requirePkce: 'boolean|default:false',
  active: 'boolean|default:true',
  metadata: 'object|optional'
};

function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const output = { ...target } as T;

  for (const key in source) {
    const sourceValue = source[key];
    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
      const targetValue = target[key];
      if (targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
        (output as any)[key] = deepMerge(targetValue as Record<string, any>, sourceValue as Partial<Record<string, any>>);
      } else {
        (output as any)[key] = sourceValue;
      }
    } else {
      (output as any)[key] = sourceValue;
    }
  }

  return output;
}

export function validateExtraAttributes(
  baseAttributes: BaseAttributes,
  userAttributes: BaseAttributes | undefined,
  resourceType: string
): ValidationResult {
  const errors: string[] = [];

  if (!userAttributes || typeof userAttributes !== 'object') {
    return { valid: true, errors: [] };
  }

  for (const fieldName of Object.keys(userAttributes)) {
    if (baseAttributes[fieldName]) {
      errors.push(
        `Cannot override base attribute '${fieldName}' in ${resourceType} resource. ` +
        `Base attributes are managed by IdentityPlugin.`
      );
    }
  }

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

export function mergeResourceConfig(
  baseConfig: ResourceConfig,
  userConfig: ResourceConfig = {},
  resourceType: string
): ResourceConfig {
  if (userConfig.attributes) {
    const validation = validateExtraAttributes(
      baseConfig.attributes || {},
      userConfig.attributes,
      resourceType
    );

    if (!validation.valid) {
      const errorMsg = [
        `Invalid extra attributes for ${resourceType} resource:`,
        ...validation.errors.map(err => `  - ${err}`)
      ].join('\n');
      throw new PluginError('Invalid extra attributes for identity resource', {
        pluginName: 'IdentityPlugin',
        operation: 'mergeResourceConfig',
        statusCode: 400,
        retriable: false,
        suggestion: 'Update the resource schema to match IdentityPlugin validation requirements.',
        description: errorMsg
      });
    }
  }

  const merged = deepMerge(userConfig, baseConfig);

  if (userConfig.attributes || baseConfig.attributes) {
    merged.attributes = {
      ...(userConfig.attributes || {}),
      ...(baseConfig.attributes || {})
    };
  }

  return merged;
}

export function validateResourcesConfig(resourcesConfig: ResourcesConfig | null | undefined): ValidationResult {
  const errors: string[] = [];

  if (!resourcesConfig || typeof resourcesConfig !== 'object') {
    errors.push('IdentityPlugin requires "resources" configuration object');
    return { valid: false, errors };
  }

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
