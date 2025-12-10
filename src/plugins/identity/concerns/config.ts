import {
  BASE_USER_ATTRIBUTES,
  BASE_TENANT_ATTRIBUTES,
  BASE_CLIENT_ATTRIBUTES,
  validateResourcesConfig,
  mergeResourceConfig,
  ResourcesConfig,
  ResourceConfig
} from './resource-schemas.js';
import { PluginError } from '../../../errors.js';

export interface PreparedResourceConfigs {
  users: {
    userConfig: ResourceConfig | undefined;
    mergedConfig: ResourceConfig | null;
  };
  tenants: {
    userConfig: ResourceConfig | undefined;
    mergedConfig: ResourceConfig | null;
  };
  clients: {
    userConfig: ResourceConfig | undefined;
    mergedConfig: ResourceConfig | null;
  };
}

export function prepareResourceConfigs(resourcesOptions: ResourcesConfig = {}): PreparedResourceConfigs {
  const resourcesValidation = validateResourcesConfig(resourcesOptions);
  if (!resourcesValidation.valid) {
    throw new PluginError('IdentityPlugin configuration error', {
      pluginName: 'IdentityPlugin',
      operation: 'prepareResourceConfigs',
      statusCode: 400,
      retriable: false,
      suggestion: 'Review the resources configuration and fix the validation errors listed in the metadata.',
      metadata: { validationErrors: resourcesValidation.errors }
    });
  }

  mergeResourceConfig(
    { attributes: BASE_USER_ATTRIBUTES },
    resourcesOptions.users,
    'users'
  );

  mergeResourceConfig(
    { attributes: BASE_TENANT_ATTRIBUTES },
    resourcesOptions.tenants,
    'tenants'
  );

  mergeResourceConfig(
    { attributes: BASE_CLIENT_ATTRIBUTES },
    resourcesOptions.clients,
    'clients'
  );

  return {
    users: {
      userConfig: resourcesOptions.users,
      mergedConfig: null
    },
    tenants: {
      userConfig: resourcesOptions.tenants,
      mergedConfig: null
    },
    clients: {
      userConfig: resourcesOptions.clients,
      mergedConfig: null
    }
  };
}
