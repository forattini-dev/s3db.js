import type { Logger } from '../../../concerns/logger.js';
import { createLogger } from '../../../concerns/logger.js';

export interface ResourceSchema {
  attributes: Record<string, string>;
}

export interface ResourceLike {
  name: string;
  schema: ResourceSchema;
  partitions?: Record<string, unknown>;
  get?: (id: string, options?: Record<string, unknown>) => Promise<unknown>;
  query: (filter: Record<string, unknown>, options?: { limit?: number }) => Promise<unknown[]>;
  listPartition?: (partitionName: string, filter: Record<string, unknown>, options?: { limit?: number }) => Promise<unknown[]>;
  patch?: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  [key: string]: unknown;
}

export interface DatabaseLike {
  resources: Record<string, ResourceLike>;
  createResource: (config: {
    name: string;
    attributes: Record<string, string>;
    behavior?: string;
    timestamps?: boolean;
    createdBy?: string;
  }) => Promise<ResourceLike>;
}

export interface AuthResourceConfig {
  resource?: string;
  createResource?: boolean;
  lookupById?: boolean;
  userField?: string;
  passwordField?: string;
  usernameField?: string;
  keyField?: string;
  [key: string]: unknown;
}

export class AuthResourceManager {
  protected database: DatabaseLike;
  protected driverName: string;
  protected config: AuthResourceConfig;
  protected logger: Logger;

  constructor(database: DatabaseLike, driverName: string, config: AuthResourceConfig) {
    this.database = database;
    this.driverName = driverName;
    this.config = config;
    this.logger = createLogger({ name: `AuthResource:${driverName}`, level: 'info' });
  }

  async getOrCreateResource(): Promise<ResourceLike> {
    const resourceName = this.config.resource || this.getDefaultResourceName();
    const createResource = this.config.createResource !== false;

    const existingResource = this.database.resources[resourceName]!;

    if (existingResource) {
      this.logger.debug(`Using existing resource: ${resourceName}`);
      this.validateResourceFields(existingResource);
      return existingResource;
    }

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

    this.logger.info(`Auto-creating resource: ${resourceName}`);
    return await this.createDefaultResource(resourceName);
  }

  getDefaultResourceName(): string {
    return `plg_api_${this.driverName}_users`;
  }

  getRequiredFieldNames(): string[] {
    const schema = this.getMinimalSchema();
    return Object.keys(schema);
  }

  validateResourceFields(resource: ResourceLike): void {
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

  async createDefaultResource(resourceName: string): Promise<ResourceLike> {
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

  getMinimalSchema(): Record<string, string> {
    throw new Error('getMinimalSchema() must be implemented by driver resource manager');
  }
}

export interface UserLookupResource {
  name?: string;
  get?: (id: string, options?: Record<string, unknown>) => Promise<unknown>;
  query: (filter: Record<string, unknown>, options?: { limit?: number }) => Promise<unknown[]>;
  partitions?: Record<string, unknown>;
  listPartition?: (partitionName: string, filter: Record<string, unknown>, options?: { limit?: number }) => Promise<unknown[]>;
}

const lookupLogger = createLogger({ name: 'AuthLookup', level: 'info' });
const warnedFields = new Set<string>();

function derivePartitionName(field: string): string {
  return `by${field.charAt(0).toUpperCase()}${field.slice(1)}`;
}

function resourceHasPartition(resource: UserLookupResource, partitionName: string): boolean {
  return !!(resource.partitions && resource.partitions[partitionName] && resource.listPartition);
}

function warnScanOnce(resourceName: string, field: string): void {
  const key = `${resourceName}:${field}`;
  if (warnedFields.has(key)) return;
  warnedFields.add(key);
  lookupLogger.warn(
    { field, partition: derivePartitionName(field) },
    `Auth lookup for field "${field}" is doing an O(n) full scan. ` +
    `Add a partition "${derivePartitionName(field)}" on field "${field}", ` +
    `or set lookupById: true if the field value is the resource ID.`
  );
}

function isLookupMissError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    statusCode?: unknown;
    message?: unknown;
    name?: unknown;
  };

  if (candidate.code === 'NoSuchKey' || candidate.code === 'NotFound') {
    return true;
  }

  if (candidate.statusCode === 404) {
    return true;
  }

  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const name = typeof candidate.name === 'string' ? candidate.name : '';

  return /not found/i.test(message) || /NoSuchKey|NotFound/i.test(name);
}

/**
 * Resolves a user from a resource with the following lookup strategy:
 *
 * 1. lookupById: true → resource.get(value) — O(1)
 * 2. Partition exists for field → resource.listPartition() — O(1)
 * 3. Fallback → resource.query() — O(n) with loud warning
 *
 * The partition name is auto-derived from the field: "email" → "byEmail".
 * Override with the partitionName parameter.
 */
export async function resolveUser<T = unknown>(
  resource: UserLookupResource,
  field: string,
  value: string | number,
  lookupById: boolean = false,
  partitionName?: string
): Promise<T | null> {
  if (lookupById && resource.get) {
    try {
      const user = await resource.get(String(value));
      return (user as T) ?? null;
    } catch (error) {
      if (isLookupMissError(error)) {
        return null;
      }
      throw error;
    }
  }

  const resolvedPartition = partitionName || derivePartitionName(field);

  if (resourceHasPartition(resource, resolvedPartition)) {
    const results = await resource.listPartition!(resolvedPartition, { [field]: value }, { limit: 1 });
    return (results[0] as T) ?? null;
  }

  warnScanOnce(resource.name || 'unknown', field);
  const results = await resource.query({ [field]: value }, { limit: 1 });
  return (results[0] as T) ?? null;
}

/**
 * Resolves multiple users from a resource. Same lookup strategy as resolveUser.
 */
export async function resolveUsers<T = unknown>(
  resource: UserLookupResource,
  field: string,
  value: string | number,
  lookupById: boolean = false,
  partitionName?: string
): Promise<T[]> {
  if (lookupById && resource.get) {
    try {
      const user = await resource.get(String(value));
      return user ? [user as T] : [];
    } catch (error) {
      if (isLookupMissError(error)) {
        return [];
      }
      throw error;
    }
  }

  const resolvedPartition = partitionName || derivePartitionName(field);

  if (resourceHasPartition(resource, resolvedPartition)) {
    return await resource.listPartition!(resolvedPartition, { [field]: value }, { limit: 1 }) as T[];
  }

  warnScanOnce(resource.name || 'unknown', field);
  return await resource.query({ [field]: value }, { limit: 1 }) as T[];
}

export class JWTResourceManager extends AuthResourceManager {
  override getMinimalSchema(): Record<string, string> {
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
  override getMinimalSchema(): Record<string, string> {
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
  override getMinimalSchema(): Record<string, string> {
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
  override getMinimalSchema(): Record<string, string> {
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
  override getMinimalSchema(): Record<string, string> {
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
