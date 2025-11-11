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

export default { applyProviderPreset };

