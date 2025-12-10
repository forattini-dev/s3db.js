import type { StringRecord } from '../types/common.types.js';

export interface Logger {
  error(context: StringRecord, message: string): void;
}

export interface Resource {
  name: string;
  logger?: Logger;
}

export interface JWTUser {
  scope?: string;
  azp?: string;
  resource_access?: {
    [clientId: string]: {
      roles?: string[];
    };
  };
  realm_access?: {
    roles?: string[];
  };
  roles?: string[];
  [key: string]: unknown;
}

export interface GuardContext {
  user?: JWTUser;
  params?: StringRecord;
  body?: unknown;
  query?: StringRecord;
  headers?: StringRecord;
  setPartition?: (partition: string, values?: StringRecord) => void;
}

export type GuardFunction = (context: GuardContext, record?: unknown) => boolean | Promise<boolean>;

export type GuardValue = boolean | string[] | GuardFunction;

export interface GuardConfig {
  [operation: string]: GuardValue;
}

export interface ResourceGuardsConfig {
  guard?: GuardConfig | string[];
}

export class ResourceGuards {
  resource: Resource;
  private _guard: GuardConfig | null;

  constructor(resource: Resource, config: ResourceGuardsConfig = {}) {
    this.resource = resource;
    this._guard = this._normalize(config.guard);
  }

  getGuard(): GuardConfig | null {
    return this._guard;
  }

  private _normalize(guard?: GuardConfig | string[]): GuardConfig | null {
    if (!guard) return null;

    if (Array.isArray(guard)) {
      return { '*': guard };
    }

    return guard;
  }

  async execute(operation: string, context: GuardContext, record: unknown = null): Promise<boolean> {
    if (!this._guard) return true;

    let guardFn: GuardValue | undefined = this._guard[operation];

    if (!guardFn) {
      guardFn = this._guard['*'];
    }

    if (!guardFn) return true;

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
      } catch (err) {
        this.resource.logger?.error(
          { operation, error: (err as Error).message, stack: (err as Error).stack },
          `guard error for ${operation}`
        );
        return false;
      }
    }

    return false;
  }

  private _checkRolesScopes(requiredRolesScopes: string[], user?: JWTUser): boolean {
    if (!user) return false;

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

  hasGuard(operation: string): boolean {
    if (!this._guard) return false;
    return this._guard[operation] !== undefined || this._guard['*'] !== undefined;
  }

  setGuard(guard: GuardConfig | string[]): void {
    this._guard = this._normalize(guard);
  }
}

export default ResourceGuards;
