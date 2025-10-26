/**
 * OIDC Discovery - OpenID Connect Discovery Document Generator
 *
 * Generates .well-known/openid-configuration and JWKS endpoints
 * Implements OpenID Connect Discovery 1.0 specification
 */

/**
 * Generate OpenID Connect Discovery Document
 * @param {Object} options - Configuration options
 * @param {string} options.issuer - Issuer URL (e.g., 'https://sso.example.com')
 * @param {Array} options.grantTypes - Supported grant types
 * @param {Array} options.responseTypes - Supported response types
 * @param {Array} options.scopes - Supported scopes
 * @returns {Object} OIDC Discovery document
 */
export function generateDiscoveryDocument(options = {}) {
  const {
    issuer,
    grantTypes = ['authorization_code', 'client_credentials', 'refresh_token'],
    responseTypes = ['code', 'token', 'id_token', 'code id_token', 'code token', 'id_token token', 'code id_token token'],
    scopes = ['openid', 'profile', 'email', 'offline_access']
  } = options;

  if (!issuer) {
    throw new Error('Issuer URL is required for OIDC discovery');
  }

  // Remove trailing slash from issuer
  const baseUrl = issuer.replace(/\/$/, '');

  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/auth/authorize`,
    token_endpoint: `${baseUrl}/auth/token`,
    userinfo_endpoint: `${baseUrl}/auth/userinfo`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    registration_endpoint: `${baseUrl}/auth/register`,
    introspection_endpoint: `${baseUrl}/auth/introspect`,
    revocation_endpoint: `${baseUrl}/auth/revoke`,
    end_session_endpoint: `${baseUrl}/auth/logout`,

    // Supported features
    scopes_supported: scopes,
    response_types_supported: responseTypes,
    response_modes_supported: ['query', 'fragment', 'form_post'],
    grant_types_supported: grantTypes,
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'none'
    ],

    // Claims
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'email',
      'email_verified',
      'name',
      'given_name',
      'family_name',
      'picture',
      'locale'
    ],

    // Code challenge methods (PKCE)
    code_challenge_methods_supported: ['plain', 'S256'],

    // UI locales
    ui_locales_supported: ['en', 'pt-BR'],

    // Service documentation
    service_documentation: `${baseUrl}/docs`,

    // Additional metadata
    claim_types_supported: ['normal'],
    claims_parameter_supported: false,
    request_parameter_supported: false,
    request_uri_parameter_supported: false,
    require_request_uri_registration: false,

    // Discovery document version
    version: '1.0'
  };
}

/**
 * Validate OAuth2/OIDC claims in JWT payload
 * @param {Object} payload - JWT payload
 * @param {Object} options - Validation options
 * @param {string} options.issuer - Expected issuer
 * @param {string} options.audience - Expected audience
 * @param {number} options.clockTolerance - Clock skew tolerance in seconds (default: 60)
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateClaims(payload, options = {}) {
  const {
    issuer,
    audience,
    clockTolerance = 60
  } = options;

  const now = Math.floor(Date.now() / 1000);

  // Check required claims
  if (!payload.sub) {
    return { valid: false, error: 'Missing required claim: sub' };
  }

  if (!payload.iat) {
    return { valid: false, error: 'Missing required claim: iat' };
  }

  if (!payload.exp) {
    return { valid: false, error: 'Missing required claim: exp' };
  }

  // Validate issuer
  if (issuer && payload.iss !== issuer) {
    return {
      valid: false,
      error: `Invalid issuer. Expected: ${issuer}, Got: ${payload.iss}`
    };
  }

  // Validate audience
  if (audience) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

    if (!audiences.includes(audience)) {
      return {
        valid: false,
        error: `Invalid audience. Expected: ${audience}, Got: ${audiences.join(', ')}`
      };
    }
  }

  // Validate expiration with clock tolerance
  if (payload.exp < (now - clockTolerance)) {
    return { valid: false, error: 'Token has expired' };
  }

  // Validate not before (if present)
  if (payload.nbf && payload.nbf > (now + clockTolerance)) {
    return { valid: false, error: 'Token not yet valid (nbf)' };
  }

  // Validate issued at (basic sanity check - not in future)
  if (payload.iat > (now + clockTolerance)) {
    return { valid: false, error: 'Token issued in the future' };
  }

  return { valid: true, error: null };
}

/**
 * Extract user claims from user object for ID token
 * @param {Object} user - User object from database
 * @param {Array} scopes - Requested scopes
 * @returns {Object} User claims
 */
export function extractUserClaims(user, scopes = []) {
  const claims = {
    sub: user.id // Subject - user ID
  };

  // Add email claims if 'email' scope requested
  if (scopes.includes('email') && user.email) {
    claims.email = user.email;
    claims.email_verified = user.emailVerified || false;
  }

  // Add profile claims if 'profile' scope requested
  if (scopes.includes('profile')) {
    if (user.name) claims.name = user.name;
    if (user.givenName) claims.given_name = user.givenName;
    if (user.familyName) claims.family_name = user.familyName;
    if (user.picture) claims.picture = user.picture;
    if (user.locale) claims.locale = user.locale;
    if (user.zoneinfo) claims.zoneinfo = user.zoneinfo;
    if (user.birthdate) claims.birthdate = user.birthdate;
    if (user.gender) claims.gender = user.gender;
  }

  return claims;
}

/**
 * Parse scope string into array
 * @param {string} scopeString - Space-separated scopes (e.g., 'openid profile email')
 * @returns {Array} Array of scopes
 */
export function parseScopes(scopeString) {
  if (!scopeString || typeof scopeString !== 'string') {
    return [];
  }

  return scopeString
    .trim()
    .split(/\s+/)
    .filter(s => s.length > 0);
}

/**
 * Validate requested scopes against supported scopes
 * @param {Array} requestedScopes - Scopes requested by client
 * @param {Array} supportedScopes - Scopes supported by server
 * @returns {Object} { valid: boolean, error: string|null, scopes: Array }
 */
export function validateScopes(requestedScopes, supportedScopes) {
  if (!Array.isArray(requestedScopes)) {
    requestedScopes = parseScopes(requestedScopes);
  }

  // Check if all requested scopes are supported
  const invalidScopes = requestedScopes.filter(scope => !supportedScopes.includes(scope));

  if (invalidScopes.length > 0) {
    return {
      valid: false,
      error: `Unsupported scopes: ${invalidScopes.join(', ')}`,
      scopes: []
    };
  }

  return {
    valid: true,
    error: null,
    scopes: requestedScopes
  };
}

/**
 * Generate authorization code (random string)
 * @param {number} length - Code length (default: 32)
 * @returns {string} Authorization code
 */
export function generateAuthCode(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let code = '';

  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return code;
}

/**
 * Generate client ID
 * @returns {string} Client ID (UUID-like)
 */
export function generateClientId() {
  return crypto.randomUUID();
}

/**
 * Generate client secret
 * @param {number} length - Secret length (default: 64)
 * @returns {string} Client secret
 */
export function generateClientSecret(length = 64) {
  return crypto.randomBytes(length / 2).toString('hex');
}

import crypto from 'crypto';

export default {
  generateDiscoveryDocument,
  validateClaims,
  extractUserClaims,
  parseScopes,
  validateScopes,
  generateAuthCode,
  generateClientId,
  generateClientSecret
};
