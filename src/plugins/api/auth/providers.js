/**
 * Provider presets to simplify OAuth2/OIDC configuration for common IdPs.
 *
 * Supports filling sensible defaults like issuer (and some endpoints) from
 * minimal inputs (domain/tenant/realm/region), while still allowing explicit
 * overrides and discovery to refine values at runtime.
 */

function trimEndSlash(s = '') {
  return String(s || '').replace(/\/$/, '');
}

export function applyProviderPreset(kind, cfg = {}) {
  const config = { ...(cfg || {}) };
  const provider = (config.provider || config.idp || '').toLowerCase();

  if (!provider) return config;

  // Azure AD / Entra
  if (['azure', 'azure-ad', 'entra'].includes(provider)) {
    const tenantId = config.tenantId || config.tenant || 'common';
    if (!config.issuer) {
      config.issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
    }

    // Reasonable defaults for Microsoft Entra ID (optional, overridable)
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

  // Auth0
  if (provider === 'auth0') {
    const domain = trimEndSlash(config.domain || config.host || '');
    if (domain && !config.issuer) {
      const issuer = domain.startsWith('https://') ? domain : `https://${domain}`;
      config.issuer = issuer;
    }
  }

  // Keycloak
  if (provider === 'keycloak') {
    const baseUrl = trimEndSlash(config.baseUrl || config.host || '');
    const realm = config.realm || 'master';
    if (baseUrl && !config.issuer) {
      config.issuer = `${baseUrl}/realms/${realm}`;
    }
    // Reasonable default for introspection (can be overridden or discovered)
    if (kind === 'oauth2') {
      const intCfg = config.introspection || {};
      if (intCfg.enabled && !intCfg.endpoint && config.issuer) {
        intCfg.endpoint = `${trimEndSlash(config.issuer)}/protocol/openid-connect/token/introspect`;
        config.introspection = intCfg;
      }
    }
  }

  // AWS Cognito
  if (['cognito', 'aws-cognito'].includes(provider)) {
    const region = config.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
    const userPoolId = config.userPoolId || config.userPool || process.env.COGNITO_USER_POOL_ID;
    if (region && userPoolId && !config.issuer) {
      config.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    }
  }

  return config;
}

/**
 * 🎯 NEW: Provider-specific authorization URL quirks
 * Inspired by @hono/oidc-auth
 *
 * Some OAuth2/OIDC providers require specific query parameters to work correctly.
 * This function applies known quirks automatically based on issuer URL.
 *
 * @param {URL} authUrl - Authorization URL to modify
 * @param {string} issuer - OIDC issuer URL
 * @param {Object} config - Provider configuration
 */
export function applyProviderQuirks(authUrl, issuer, config = {}) {
  if (!authUrl || !issuer) return;

  const issuerLower = issuer.toLowerCase();

  // 🔍 Google OAuth2 quirks
  // Google requires 'access_type=offline' and 'prompt=consent' to obtain refresh_token
  // Without these, no refresh_token is returned and session can't be extended
  if (issuerLower.includes('accounts.google.com')) {
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    return;
  }

  // 🔍 Azure AD / Microsoft Entra quirks
  // Default prompt to 'select_account' for better UX (allows account switching)
  // Add max_age=0 to force fresh authentication and prevent PKCE verifier mismatches
  if (issuerLower.includes('login.microsoftonline.com')) {
    if (!authUrl.searchParams.has('prompt')) {
      authUrl.searchParams.set('prompt', 'select_account');
    }
    // CRITICAL: max_age=0 prevents Azure AD from reusing cached authentication
    // This prevents PKCE code_verifier mismatches when multiple login attempts occur
    // Without this, Azure AD may return a code based on an old code_challenge
    // while the application has a new code_verifier in the state cookie
    if (!authUrl.searchParams.has('max_age')) {
      authUrl.searchParams.set('max_age', '0');
    }
    return;
  }

  // 🔍 Auth0 quirks
  // If audience is configured, pass it to get proper access_token
  // Auth0 requires 'audience' parameter to receive non-opaque access tokens
  if (issuerLower.includes('.auth0.com') && config.audience) {
    authUrl.searchParams.set('audience', config.audience);
    return;
  }

  // 🔍 GitHub OAuth quirks
  // GitHub doesn't support offline_access scope - remove it
  if (issuerLower.includes('github.com')) {
    const scope = authUrl.searchParams.get('scope') || '';
    const filteredScope = scope.split(' ').filter(s => s !== 'offline_access').join(' ');
    if (filteredScope !== scope) {
      authUrl.searchParams.set('scope', filteredScope);
    }
    return;
  }

  // 🔍 Slack OAuth quirks
  // Slack requires 'team' parameter if team ID is provided
  if (issuerLower.includes('slack.com') && config.teamId) {
    authUrl.searchParams.set('team', config.teamId);
    return;
  }

  // 🔍 GitLab quirks
  // GitLab supports offline_access but prefers explicit scope
  if (issuerLower.includes('gitlab.com')) {
    const scope = authUrl.searchParams.get('scope') || '';
    if (!scope.includes('read_user')) {
      authUrl.searchParams.set('scope', scope ? `${scope} read_user` : 'read_user');
    }
    return;
  }
}

export default { applyProviderPreset, applyProviderQuirks };
