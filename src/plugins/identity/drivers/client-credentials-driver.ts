/**
 * Client Credentials Authentication Driver
 *
 * Handles OAuth2 client_credentials grant type authentication.
 * Supports both plaintext and hashed client secrets with constant-time comparison.
 */

import { AuthDriver, AuthDriverContext, AuthenticateRequest, AuthenticateResult } from './auth-driver.interface.js';
import { PluginError } from '../../../errors.js';
import { tryFn } from '../../../concerns/try-fn.js';

export interface ClientCredentialsAuthDriverOptions {
  // Reserved for future options
}

interface PasswordHelper {
  verify: (password: string, hash: string) => Promise<boolean>;
}

interface ClientRecord {
  clientId: string;
  clientSecret?: string;
  secret?: string;
  secrets?: string[];
  active?: boolean;
  [key: string]: any;
}

function constantTimeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const valueA = Buffer.from(String(a ?? ''), 'utf8');
  const valueB = Buffer.from(String(b ?? ''), 'utf8');

  if (valueA.length !== valueB.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < valueA.length; i += 1) {
    mismatch |= valueA[i]! ^ valueB[i]!;
  }
  return mismatch === 0;
}

export class ClientCredentialsAuthDriver extends AuthDriver {
  private options: ClientCredentialsAuthDriverOptions;
  private clientResource: any;
  private passwordHelper: PasswordHelper | null;

  constructor(options: ClientCredentialsAuthDriverOptions = {}) {
    super('client-credentials', ['client_credentials']);
    this.options = options;
    this.clientResource = null;
    this.passwordHelper = null;
  }

  override async initialize(context: AuthDriverContext): Promise<void> {
    this.clientResource = context.resources?.clients;
    if (!this.clientResource) {
      throw new PluginError('ClientCredentialsAuthDriver requires clients resource', {
        pluginName: 'IdentityPlugin',
        operation: 'initializeClientCredentialsDriver',
        statusCode: 500,
        retriable: false,
        suggestion: 'Map a clients resource in IdentityPlugin resources before enabling client credentials authentication.'
      });
    }
    this.passwordHelper = context.helpers?.password || null;
  }

  override supportsGrant(grantType: string): boolean {
    return grantType === 'client_credentials';
  }

  override async authenticate(request: AuthenticateRequest): Promise<AuthenticateResult> {
    const { clientId, clientSecret } = request;
    if (!clientId || !clientSecret) {
      return { success: false, error: 'invalid_client', statusCode: 401 };
    }

    const [ok, err, clients] = await tryFn(() => this.clientResource.query({ clientId }));
    if (!ok) {
      return {
        success: false,
        error: err?.message || 'lookup_failed',
        statusCode: 500
      };
    }

    if (!clients || clients.length === 0) {
      return { success: false, error: 'invalid_client', statusCode: 401 };
    }

    const client = clients[0] as ClientRecord;

    if (client.active === false) {
      return { success: false, error: 'inactive_client', statusCode: 403 };
    }

    const secrets: string[] = [];
    if (Array.isArray(client.secrets)) {
      secrets.push(...client.secrets);
    }
    if (client.clientSecret) {
      secrets.push(client.clientSecret);
    }
    if (client.secret) {
      secrets.push(client.secret);
    }

    if (!secrets.length) {
      return { success: false, error: 'invalid_client', statusCode: 401 };
    }

    const secretMatches = await this._verifyAgainstSecrets(clientSecret, secrets);
    if (!secretMatches) {
      return { success: false, error: 'invalid_client', statusCode: 401 };
    }

    const sanitizedClient: Record<string, any> = { ...client };
    if (sanitizedClient.clientSecret !== undefined) {
      delete sanitizedClient.clientSecret;
    }
    if (sanitizedClient.secret !== undefined) {
      delete sanitizedClient.secret;
    }
    if (sanitizedClient.secrets !== undefined) {
      delete sanitizedClient.secrets;
    }

    return {
      success: true,
      client: sanitizedClient
    };
  }

  private async _verifyAgainstSecrets(providedSecret: string, storedSecrets: string[]): Promise<boolean> {
    for (const storedSecret of storedSecrets) {
      if (!storedSecret) continue;

      if (typeof storedSecret === 'string' && storedSecret.startsWith('$') && this.passwordHelper?.verify) {
        const ok = await this.passwordHelper.verify(providedSecret, storedSecret);
        if (ok) {
          return true;
        }
        continue;
      }

      if (constantTimeEqual(providedSecret, storedSecret)) {
        return true;
      }
    }

    return false;
  }
}
