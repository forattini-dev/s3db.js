import { createLogger } from '../../../concerns/logger.js';
import type { Logger } from '../../../concerns/logger.js';

const logger: Logger = createLogger({ name: 'OidcProviderValidator', level: 'info' });

export interface DiscoveryDocument {
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  id_token_signing_alg_values_supported?: string[];
  response_types_supported?: string[];
  response_modes_supported?: string[];
  scopes_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  claims_supported?: string[];
  [key: string]: unknown;
}

export interface OidcConfig {
  idTokenSigningAlg?: string;
  responseType?: string;
  responseMode?: string;
  scope?: string;
  autoRefreshTokens?: boolean;
  usePKCE?: boolean;
  enableLogout?: boolean;
  tokenEndpointAuthMethod?: string;
}

export interface CompatibilityResult {
  warnings: string[];
  errors: string[];
}

export interface LogOptions {
  logLevel?: string;
  throwOnError?: boolean;
}

export interface ProviderCapabilities {
  hasTokenEndpoint: boolean;
  hasUserinfoEndpoint: boolean;
  hasLogoutEndpoint: boolean;
  supportsRefreshTokens: boolean;
  supportsPKCE: boolean;
  supportedScopes: string[];
  supportedResponseTypes: string[];
  supportedSigningAlgs: string[];
  supportedAuthMethods?: string[];
}

export function validateProviderCompatibility(
  discoveryDoc: DiscoveryDocument | null,
  config: OidcConfig
): CompatibilityResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!discoveryDoc) {
    errors.push('Discovery document is missing or empty');
    return { warnings, errors };
  }

  const supportedAlgs = discoveryDoc.id_token_signing_alg_values_supported || [];
  const requestedAlg = config.idTokenSigningAlg || 'RS256';

  if (supportedAlgs.length > 0 && !supportedAlgs.includes(requestedAlg)) {
    warnings.push(
      `ID token signing algorithm "${requestedAlg}" not listed in provider's ` +
      `supported algorithms: ${supportedAlgs.join(', ')}. ` +
      `This may cause token validation failures.`
    );
  }

  const supportedTypes = discoveryDoc.response_types_supported || [];
  const requestedType = config.responseType || 'code';

  if (supportedTypes.length > 0 && !supportedTypes.includes(requestedType)) {
    warnings.push(
      `Response type "${requestedType}" not listed in provider's ` +
      `supported types: ${supportedTypes.join(', ')}. ` +
      `Authorization may fail.`
    );
  }

  const supportedModes = discoveryDoc.response_modes_supported || [];
  const requestedMode = config.responseMode;

  if (requestedMode && supportedModes.length > 0 && !supportedModes.includes(requestedMode)) {
    warnings.push(
      `Response mode "${requestedMode}" not listed in provider's ` +
      `supported modes: ${supportedModes.join(', ')}. ` +
      `Authorization may fail.`
    );
  }

  const supportedScopes = discoveryDoc.scopes_supported || [];
  const requestedScopes = (config.scope || 'openid').split(' ');

  if (supportedScopes.length > 0) {
    const unsupportedScopes = requestedScopes.filter(
      scope => !supportedScopes.includes(scope)
    );

    if (unsupportedScopes.length > 0) {
      warnings.push(
        `Requested scopes not listed in provider's supported scopes: ` +
        `${unsupportedScopes.join(', ')}. ` +
        `Provider may reject authorization or silently ignore these scopes.`
      );
    }
  }

  const supportedGrants = discoveryDoc.grant_types_supported || [];

  if (config.autoRefreshTokens && supportedGrants.length > 0) {
    if (!supportedGrants.includes('refresh_token')) {
      warnings.push(
        'autoRefreshTokens enabled but provider does not list "refresh_token" ' +
        'in supported grant types. Token refresh will likely fail.'
      );
    }
  }

  if (!discoveryDoc.token_endpoint && requestedType === 'code') {
    errors.push(
      'Provider discovery document missing "token_endpoint" but response_type is "code". ' +
      'Token exchange will fail.'
    );
  }

  if (!discoveryDoc.authorization_endpoint) {
    errors.push(
      'Provider discovery document missing "authorization_endpoint". ' +
      'Authorization will fail.'
    );
  }

  const supportedCodeChallengeMethods = discoveryDoc.code_challenge_methods_supported || [];

  if (config.usePKCE && supportedCodeChallengeMethods.length > 0) {
    if (!supportedCodeChallengeMethods.includes('S256')) {
      warnings.push(
        'PKCE enabled but provider does not list "S256" in supported code challenge methods. ' +
        'PKCE may not work correctly.'
      );
    }
  }

  if (config.enableLogout && !discoveryDoc.end_session_endpoint) {
    warnings.push(
      'Logout enabled but provider does not provide "end_session_endpoint". ' +
      'Only local logout will be available (session will remain active at provider).'
    );
  }

  if (!discoveryDoc.userinfo_endpoint) {
    warnings.push(
      'Provider does not provide "userinfo_endpoint". ' +
      'User profile information will only be available from ID token claims.'
    );
  }

  if (config.autoRefreshTokens) {
    const hasOfflineAccess = requestedScopes.includes('offline_access');
    const hasRefreshToken = requestedScopes.includes('refresh_token');

    if (!hasOfflineAccess && !hasRefreshToken) {
      warnings.push(
        'autoRefreshTokens enabled but neither "offline_access" nor "refresh_token" ' +
        'scope is requested. Provider may not issue refresh tokens.'
      );
    }
  }

  const supportedAuthMethods = discoveryDoc.token_endpoint_auth_methods_supported || [];
  const requestedAuthMethod = config.tokenEndpointAuthMethod || 'client_secret_basic';

  if (supportedAuthMethods.length > 0 && !supportedAuthMethods.includes(requestedAuthMethod)) {
    warnings.push(
      `Token endpoint auth method "${requestedAuthMethod}" not listed in provider's ` +
      `supported methods: ${supportedAuthMethods.join(', ')}. ` +
      `Token exchange may fail.`
    );
  }

  const supportedClaims = discoveryDoc.claims_supported || [];

  if (supportedClaims.length > 0) {
    const essentialClaims = ['sub', 'iss', 'aud', 'exp', 'iat'];
    const missingClaims = essentialClaims.filter(
      claim => !supportedClaims.includes(claim)
    );

    if (missingClaims.length > 0) {
      warnings.push(
        `Provider does not list essential claims in supported claims: ` +
        `${missingClaims.join(', ')}. This is unusual and may indicate ` +
        `an incomplete discovery document.`
      );
    }
  }

  return { warnings, errors };
}

export function logProviderCompatibility(result: CompatibilityResult, options: LogOptions = {}): void {
  const { logLevel = 'info', throwOnError = false } = options;

  if (result.errors.length > 0) {
    logger.error('[OIDC] Provider compatibility ERRORS:');
    result.errors.forEach(err => logger.error(`  ❌ ${err}`));

    if (throwOnError) {
      throw new Error(
        `Provider compatibility errors detected:\n${result.errors.join('\n')}`
      );
    }
  }

  if (result.warnings.length > 0 && (logLevel === 'debug' || logLevel === 'trace')) {
    logger.warn('[OIDC] Provider compatibility warnings:');
    result.warnings.forEach(warn => logger.warn(`  ⚠️  ${warn}`));
  }

  if (result.errors.length === 0 && result.warnings.length === 0 && (logLevel === 'debug' || logLevel === 'trace')) {
    logger.info('[OIDC] ✅ Provider compatibility validated successfully');
  }
}

export function getProviderCapabilities(discoveryDoc: DiscoveryDocument | null): ProviderCapabilities {
  if (!discoveryDoc) {
    return {
      hasTokenEndpoint: false,
      hasUserinfoEndpoint: false,
      hasLogoutEndpoint: false,
      supportsRefreshTokens: false,
      supportsPKCE: false,
      supportedScopes: [],
      supportedResponseTypes: [],
      supportedSigningAlgs: []
    };
  }

  return {
    hasTokenEndpoint: !!discoveryDoc.token_endpoint,
    hasUserinfoEndpoint: !!discoveryDoc.userinfo_endpoint,
    hasLogoutEndpoint: !!discoveryDoc.end_session_endpoint,
    supportsRefreshTokens: (discoveryDoc.grant_types_supported || []).includes('refresh_token'),
    supportsPKCE: (discoveryDoc.code_challenge_methods_supported || []).includes('S256'),
    supportedScopes: discoveryDoc.scopes_supported || [],
    supportedResponseTypes: discoveryDoc.response_types_supported || [],
    supportedSigningAlgs: discoveryDoc.id_token_signing_alg_values_supported || [],
    supportedAuthMethods: discoveryDoc.token_endpoint_auth_methods_supported || []
  };
}
