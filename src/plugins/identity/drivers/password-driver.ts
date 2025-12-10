/**
 * Password Authentication Driver
 *
 * Handles password-based authentication using username/email and password.
 * Supports case-insensitive identifier matching and tenant-scoped lookups.
 */

import { AuthDriver, AuthDriverContext, AuthenticateRequest, AuthenticateResult } from './auth-driver.interface.js';
import { tryFn } from '../../../concerns/try-fn.js';
import { PluginError } from '../../../errors.js';

export interface PasswordAuthDriverOptions {
  identifierField?: string;
  caseInsensitive?: boolean;
}

interface PasswordHelper {
  hash: (password: string) => Promise<string>;
  verify: (password: string, hash: string) => Promise<boolean>;
}

export class PasswordAuthDriver extends AuthDriver {
  private options: PasswordAuthDriverOptions;
  private usersResource: any;
  private passwordHelper: PasswordHelper | null;
  private identifierField: string;
  private caseInsensitive: boolean;

  constructor(options: PasswordAuthDriverOptions = {}) {
    super('password', ['password']);
    this.options = options;
    this.usersResource = null;
    this.passwordHelper = null;
    this.identifierField = options.identifierField || 'email';
    this.caseInsensitive = options.caseInsensitive !== false;
  }

  override async initialize(context: AuthDriverContext): Promise<void> {
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

  override supportsGrant(grantType: string): boolean {
    return grantType === 'password';
  }

  override async authenticate(request: AuthenticateRequest = {}): Promise<AuthenticateResult> {
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
      const queryFilter: Record<string, any> = { [this.identifierField]: normalizedIdentifier };
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

    const validPassword = await this.passwordHelper!.verify(password, passwordHash);
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

  private _normalizeIdentifier(value: any): any {
    if (value == null) return value;
    if (!this.caseInsensitive) {
      return typeof value === 'string' ? value.trim() : value;
    }
    if (typeof value !== 'string') {
      return value;
    }
    return value.trim().toLowerCase();
  }
}
