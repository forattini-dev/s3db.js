import { timingSafeEqual } from 'crypto';
import type { Context, Next } from '#src/plugins/shared/http-runtime.js';
import type { ContentfulStatusCode } from '#src/plugins/shared/http-runtime.js';
import { unauthorized } from '../utils/response-formatter.js';

export interface HeaderSecretServiceAccount {
  clientId?: string;
  name?: string;
  scopes?: string[];
  audiences?: string[];
  [key: string]: unknown;
}

export interface HeaderSecretConfig {
  headerName?: string;
  secret?: string;
  secrets?: string[];
  optional?: boolean;
  authMethod?: string;
  subject?: string;
  role?: string;
  roles?: string[];
  scopes?: string[];
  user?: Record<string, unknown>;
  serviceAccount?: HeaderSecretServiceAccount | null;
}

function secureStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  const maxLength = Math.max(leftBuffer.length, rightBuffer.length);
  const paddedLeft = Buffer.alloc(maxLength);
  const paddedRight = Buffer.alloc(maxLength);
  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight);
}

function normalizeList(input: unknown): string[] {
  if (!input) {
    return [];
  }

  const values = Array.isArray(input) ? input : [input];
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildAuthenticatedUser(config: HeaderSecretConfig): Record<string, unknown> {
  const baseUser = config.user && typeof config.user === 'object'
    ? { ...config.user }
    : {};

  const configuredRoles = [
    ...normalizeList(config.roles),
    ...normalizeList(config.role)
  ];
  const existingRoles = normalizeList((baseUser as { roles?: unknown }).roles);
  const existingScopes = normalizeList((baseUser as { scopes?: unknown }).scopes);
  const scopes = [...new Set([...existingScopes, ...normalizeList(config.scopes)])];
  const roles = [...new Set([...existingRoles, ...configuredRoles])];

  const serviceAccount = config.serviceAccount === null
    ? null
    : {
      clientId: config.serviceAccount?.clientId || 'internal-service',
      name: config.serviceAccount?.name || 'Internal Service',
      scopes: config.serviceAccount?.scopes || scopes,
      audiences: config.serviceAccount?.audiences || []
    };

  const subject = config.subject
    || (baseUser.sub as string | undefined)
    || (baseUser.id as string | undefined)
    || (serviceAccount?.clientId ? `sa:${serviceAccount.clientId}` : 'sa:internal-service');

  return {
    ...baseUser,
    id: baseUser.id || subject,
    sub: baseUser.sub || subject,
    role: baseUser.role || roles[0] || 'admin',
    roles,
    scopes,
    token_use: (baseUser as { token_use?: string }).token_use || (serviceAccount ? 'service' : 'user'),
    token_type: (baseUser as { token_type?: string }).token_type || (serviceAccount ? 'service' : 'user'),
    ...(serviceAccount ? { service_account: (baseUser as { service_account?: unknown }).service_account || serviceAccount } : {})
  };
}

export async function createHeaderSecretHandler(
  config: HeaderSecretConfig = {}
): Promise<(c: Context, next: Next) => Promise<Response | void>> {
  const {
    headerName = 'x-admin-secret',
    secret,
    secrets = [],
    optional = false,
    authMethod = 'header-secret'
  } = config;

  const expectedSecrets = [...new Set([secret, ...secrets].filter((value): value is string => typeof value === 'string' && value.length > 0))];

  if (expectedSecrets.length === 0) {
    throw new Error('Header secret driver: secret or secrets[] is required');
  }

  return async (c: Context, next: Next): Promise<Response | void> => {
    const providedSecret = c.req.header(headerName);

    if (!providedSecret) {
      if (optional) {
        return await next();
      }

      const response = unauthorized(`Missing ${headerName} header`);
      return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
    }

    const isValid = expectedSecrets.some((expectedSecret) => secureStringEquals(providedSecret, expectedSecret));

    if (!isValid) {
      const response = unauthorized(`Invalid ${headerName} header`);
      return c.json(response, (response as { _status: number })._status as ContentfulStatusCode);
    }

    const user = buildAuthenticatedUser(config);
    c.set('user', user);
    c.set('authMethod', authMethod);

    if ((user as { service_account?: unknown }).service_account) {
      c.set('serviceAccount', (user as { service_account: unknown }).service_account);
    }

    await next();
  };
}

export default {
  createHeaderSecretHandler
};
