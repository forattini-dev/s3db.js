export interface ProviderConfig {
  provider?: string;
  idp?: string;
  tenantId?: string;
  tenant?: string;
  issuer?: string;
  userIdClaim?: string;
  fallbackIdClaims?: string[];
  lookupFields?: string[];
  scopes?: string[];
  apiTokenCookie?: { enabled: boolean; name: string } | undefined;
  domain?: string;
  host?: string;
  baseUrl?: string;
  realm?: string;
  introspection?: {
    enabled?: boolean;
    endpoint?: string;
  };
  region?: string;
  userPoolId?: string;
  userPool?: string;
  audience?: string;
  teamId?: string;
  [key: string]: unknown;
}

function trimEndSlash(s: string = ''): string {
  return String(s || '').replace(/\/$/, '');
}

export function applyProviderPreset(kind: string, cfg: ProviderConfig = {}): ProviderConfig {
  const config = { ...(cfg || {}) };
  const provider = (config.provider || config.idp || '').toLowerCase();

  if (!provider) return config;

  if (['azure', 'azure-ad', 'entra'].includes(provider)) {
    const tenantId = config.tenantId || config.tenant || 'common';
    if (!config.issuer) {
      config.issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
    }

    if (!config.userIdClaim) {
      config.userIdClaim = 'email';
    }
    if (!config.fallbackIdClaims) {
      config.fallbackIdClaims = ['preferred_username', 'upn', 'sub'];
    }
    if (!config.lookupFields) {
      config.lookupFields = ['email', 'preferred_username', 'upn'];
    }
    if (Array.isArray(config.scopes)) {
      const want = ['openid', 'profile', 'email', 'offline_access'];
      config.scopes = Array.from(new Set([...config.scopes, ...want]));
    }
    if (config.apiTokenCookie === undefined) {
      config.apiTokenCookie = { enabled: true, name: 'api_token' };
    }
  }

  if (provider === 'auth0') {
    const domain = trimEndSlash(config.domain || config.host || '');
    if (domain && !config.issuer) {
      const issuer = domain.startsWith('https://') ? domain : `https://${domain}`;
      config.issuer = issuer;
    }
  }

  if (provider === 'keycloak') {
    const baseUrl = trimEndSlash(config.baseUrl || config.host || '');
    const realm = config.realm || 'master';
    if (baseUrl && !config.issuer) {
      config.issuer = `${baseUrl}/realms/${realm}`;
    }
    if (kind === 'oauth2') {
      const intCfg = config.introspection || {};
      if (intCfg.enabled && !intCfg.endpoint && config.issuer) {
        intCfg.endpoint = `${trimEndSlash(config.issuer)}/protocol/openid-connect/token/introspect`;
        config.introspection = intCfg;
      }
    }
  }

  if (['cognito', 'aws-cognito'].includes(provider)) {
    const region = config.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    const userPoolId = config.userPoolId || config.userPool || process.env.COGNITO_USER_POOL_ID;
    if (region && userPoolId && !config.issuer) {
      config.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    }
  }

  return config;
}

export function applyProviderQuirks(authUrl: URL, issuer: string, config: ProviderConfig = {}): void {
  if (!authUrl || !issuer) return;

  const issuerLower = issuer.toLowerCase();

  if (issuerLower.includes('accounts.google.com')) {
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    return;
  }

  if (issuerLower.includes('login.microsoftonline.com')) {
    if (!authUrl.searchParams.has('prompt')) {
      authUrl.searchParams.set('prompt', 'select_account');
    }
    if (!authUrl.searchParams.has('max_age')) {
      authUrl.searchParams.set('max_age', '0');
    }
    return;
  }

  if (issuerLower.includes('.auth0.com') && config.audience) {
    authUrl.searchParams.set('audience', config.audience);
    return;
  }

  if (issuerLower.includes('github.com')) {
    const scope = authUrl.searchParams.get('scope') || '';
    const filteredScope = scope.split(' ').filter(s => s !== 'offline_access').join(' ');
    if (filteredScope !== scope) {
      authUrl.searchParams.set('scope', filteredScope);
    }
    return;
  }

  if (issuerLower.includes('slack.com') && config.teamId) {
    authUrl.searchParams.set('team', config.teamId);
    return;
  }

  if (issuerLower.includes('gitlab.com')) {
    const scope = authUrl.searchParams.get('scope') || '';
    if (!scope.includes('read_user')) {
      authUrl.searchParams.set('scope', scope ? `${scope} read_user` : 'read_user');
    }
    return;
  }
}

export default { applyProviderPreset, applyProviderQuirks };
