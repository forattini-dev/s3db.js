import type { Context, Next } from 'hono';

export interface UserToken {
  id?: string;
  sub?: string;
  email?: string;
  name?: string;
  client_id?: string;
  tenantId?: string;
  token_use?: string;
  token_type?: string;
  service_account?: ServiceAccountMeta;
  scope?: string;
  aud?: string | string[];
}

export interface ServiceAccountMeta {
  clientId?: string;
  name?: string;
  scopes?: string[];
  audiences?: string[];
}

export interface UserProfile {
  id?: string;
  email?: string;
  tenantId?: string;
  scopes: string[];
}

export interface IdentityContext {
  isServiceAccount: () => boolean;
  isUser: () => boolean;
  getServiceAccount: () => ServiceAccountMeta | null;
  getUser: () => UserProfile | null;
}

export function createIdentityContextMiddleware(): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next): Promise<void> => {
    const identityContext: IdentityContext = {
      isServiceAccount: (): boolean => {
        const user = c.get('user') as UserToken | undefined;
        if (!user) return false;

        if (user.token_use === 'service') return true;
        if (user.token_type === 'service') return true;
        if (user.service_account) return true;
        if (typeof user.sub === 'string' && user.sub.startsWith('sa:')) return true;

        return false;
      },

      isUser: (): boolean => {
        const user = c.get('user') as UserToken | undefined;
        if (!user) return false;

        if (user.token_use === 'user') return true;
        if (user.token_type === 'user') return true;
        if (user.email) return true;

        return !identityContext.isServiceAccount();
      },

      getServiceAccount: (): ServiceAccountMeta | null => {
        const user = c.get('user') as UserToken | undefined;
        if (!user || !identityContext.isServiceAccount()) return null;

        return user.service_account || {
          clientId: user.sub?.replace('sa:', '') || user.client_id,
          name: user.name || user.client_id,
          scopes: user.scope ? user.scope.split(' ') : [],
          audiences: Array.isArray(user.aud) ? user.aud : [user.aud!]
        };
      },

      getUser: (): UserProfile | null => {
        const user = c.get('user') as UserToken | undefined;
        if (!user || !identityContext.isUser()) return null;

        return {
          id: user.sub,
          email: user.email,
          tenantId: user.tenantId,
          scopes: user.scope ? user.scope.split(' ') : []
        };
      }
    };

    c.set('identity', identityContext);

    if (identityContext.isServiceAccount()) {
      c.set('serviceAccount', identityContext.getServiceAccount());
    } else if (identityContext.isUser()) {
      c.set('userProfile', identityContext.getUser());
    }

    await next();
  };
}
