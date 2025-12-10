/**
 * Base Authentication Driver Interface
 *
 * Abstract base class for authentication drivers in the Identity Plugin.
 * All auth drivers must extend this class and implement the required methods.
 */

import { PluginError } from '../../../errors.js';

export interface AuthDriverContext {
  database?: any;
  config?: any;
  resources?: {
    users?: any;
    clients?: any;
    tenants?: any;
  };
  helpers?: {
    password?: {
      hash: (password: string) => Promise<string>;
      verify: (password: string, hash: string) => Promise<boolean>;
    };
    token?: any;
  };
}

export interface AuthenticateRequest {
  email?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  user?: any;
  [key: string]: any;
}

export interface AuthenticateResult {
  success: boolean;
  user?: any;
  client?: any;
  error?: string;
  statusCode?: number;
}

export interface IssueTokensPayload {
  user?: any;
  client?: any;
  scopes?: string[];
  [key: string]: any;
}

export interface RevokeTokensPayload {
  token?: string;
  tokenType?: string;
  userId?: string;
  clientId?: string;
  [key: string]: any;
}

export class AuthDriver {
  name: string;
  supportedTypes: string[];

  constructor(name: string, supportedTypes: string[] = []) {
    this.name = name;
    this.supportedTypes = supportedTypes;
  }

  async initialize(_context: AuthDriverContext): Promise<void> {
    throw new PluginError('AuthDriver.initialize(context) must be implemented by subclasses', {
      pluginName: 'IdentityPlugin',
      operation: 'initializeDriver',
      statusCode: 500,
      retriable: false,
      suggestion: `Implement initialize(context) in ${this.constructor.name} or use one of the provided drivers.`
    });
  }

  async authenticate(_request: AuthenticateRequest): Promise<AuthenticateResult> {
    throw new PluginError('AuthDriver.authenticate(request) must be implemented by subclasses', {
      pluginName: 'IdentityPlugin',
      operation: 'authenticateDriver',
      statusCode: 500,
      retriable: false,
      suggestion: `Implement authenticate(request) in ${this.constructor.name} to support the configured grant type.`
    });
  }

  supportsType(type: string): boolean {
    if (!type) return false;
    return this.supportedTypes.includes(type);
  }

  supportsGrant(_grantType: string): boolean {
    return false;
  }

  async issueTokens(_payload: IssueTokensPayload): Promise<any> {
    throw new PluginError(`AuthDriver ${this.name} does not implement issueTokens`, {
      pluginName: 'IdentityPlugin',
      operation: 'issueTokens',
      statusCode: 500,
      retriable: false,
      suggestion: 'Provide an issueTokens implementation or delegate token issuance to the OAuth2 server.'
    });
  }

  async revokeTokens(_payload: RevokeTokensPayload): Promise<void> {
    return;
  }
}
