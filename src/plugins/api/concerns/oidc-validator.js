/**
 * OIDC Token Validation Utilities
 *
 * Validates tokens, claims, and provider responses according to OIDC spec.
 *
 * @module api/concerns/oidc-validator
 */

/**
 * Validate ID token claims
 *
 * @param {Object} claims - Parsed ID token claims
 * @param {Object} config - OIDC configuration
 * @param {Object} options - Validation options
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateIdToken(claims, config, options = {}) {
  const errors = [];
  const now = Math.floor(Date.now() / 1000);

  // 1. Issuer validation (REQUIRED)
  if (!claims.iss) {
    errors.push('Missing issuer (iss) claim');
  } else if (config.issuer && claims.iss !== config.issuer) {
    errors.push(`Invalid issuer: expected "${config.issuer}", got "${claims.iss}"`);
  }

  // 2. Audience validation (REQUIRED)
  if (!claims.aud) {
    errors.push('Missing audience (aud) claim');
  } else {
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(config.clientId)) {
      errors.push(`Invalid audience: expected "${config.clientId}", got "${claims.aud}"`);
    }
  }

  // 3. Expiration validation (REQUIRED)
  if (!claims.exp) {
    errors.push('Missing expiration (exp) claim');
  } else if (now > claims.exp + (options.clockTolerance || 60)) {
    const expired = new Date(claims.exp * 1000).toISOString();
    errors.push(`Token expired at ${expired}`);
  }

  // 4. Issued at validation
  if (claims.iat) {
    const maxAge = options.maxAge || 86400; // 24 hours default
    if (now > claims.iat + maxAge + (options.clockTolerance || 60)) {
      errors.push(`Token too old (issued ${Math.floor((now - claims.iat) / 3600)} hours ago)`);
    }

    // Future token check
    if (claims.iat > now + (options.clockTolerance || 60)) {
      errors.push('Token issued in the future');
    }
  }

  // 5. Not before validation
  if (claims.nbf && now < claims.nbf - (options.clockTolerance || 60)) {
    const notBefore = new Date(claims.nbf * 1000).toISOString();
    errors.push(`Token not valid before ${notBefore}`);
  }

  // 6. Nonce validation (if provided)
  if (options.nonce) {
    if (!claims.nonce) {
      errors.push('Missing nonce claim');
    } else if (claims.nonce !== options.nonce) {
      errors.push('Invalid nonce (possible replay attack)');
    }
  }

  // 7. Authorized party validation (azp) - for multiple audiences
  if (Array.isArray(claims.aud) && claims.aud.length > 1) {
    if (!claims.azp) {
      errors.push('Missing azp claim (required for multiple audiences)');
    } else if (claims.azp !== config.clientId) {
      errors.push(`Invalid azp: expected "${config.clientId}", got "${claims.azp}"`);
    }
  }

  // 8. Subject validation (REQUIRED)
  if (!claims.sub) {
    errors.push('Missing subject (sub) claim');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Validate access token (basic checks)
 *
 * @param {string} accessToken - Access token string
 * @param {Object} config - OIDC configuration
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateAccessToken(accessToken, config) {
  if (!accessToken || typeof accessToken !== 'string') {
    return { valid: false, error: 'Invalid access token format' };
  }

  if (accessToken.length < 10) {
    return { valid: false, error: 'Access token too short' };
  }

  return { valid: true, error: null };
}

/**
 * Validate refresh token
 *
 * @param {string} refreshToken - Refresh token string
 * @param {Object} config - OIDC configuration
 * @returns {Object} { valid: boolean, error: string|null }
 */
export function validateRefreshToken(refreshToken, config) {
  if (!refreshToken || typeof refreshToken !== 'string') {
    return { valid: false, error: 'Invalid refresh token format' };
  }

  if (refreshToken.length < 10) {
    return { valid: false, error: 'Refresh token too short' };
  }

  return { valid: true, error: null };
}

/**
 * Validate token response from provider
 *
 * @param {Object} tokenResponse - Token response from provider
 * @param {Object} config - OIDC configuration
 * @returns {Object} { valid: boolean, errors: Array<string>|null }
 */
export function validateTokenResponse(tokenResponse, config) {
  const errors = [];

  // 1. Check required fields
  if (!tokenResponse) {
    errors.push('Empty token response');
    return { valid: false, errors };
  }

  if (!tokenResponse.access_token) {
    errors.push('Missing access_token in response');
  }

  if (!tokenResponse.id_token) {
    errors.push('Missing id_token in response');
  }

  if (!tokenResponse.token_type) {
    errors.push('Missing token_type in response');
  } else if (tokenResponse.token_type.toLowerCase() !== 'bearer') {
    errors.push(`Invalid token_type: expected "Bearer", got "${tokenResponse.token_type}"`);
  }

  // 2. Check expiration
  if (!tokenResponse.expires_in) {
    errors.push('Missing expires_in in response');
  } else if (typeof tokenResponse.expires_in !== 'number' || tokenResponse.expires_in <= 0) {
    errors.push(`Invalid expires_in: ${tokenResponse.expires_in}`);
  }

  // 3. Refresh token (optional but recommended)
  if (config.scope?.includes('offline_access') && !tokenResponse.refresh_token) {
    errors.push('Missing refresh_token (offline_access scope requested)');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Validate userinfo response
 *
 * @param {Object} userinfo - Userinfo response from provider
 * @param {Object} idTokenClaims - Claims from ID token
 * @returns {Object} { valid: boolean, errors: Array<string>|null }
 */
export function validateUserinfo(userinfo, idTokenClaims) {
  const errors = [];

  if (!userinfo) {
    errors.push('Empty userinfo response');
    return { valid: false, errors };
  }

  // Subject must match ID token
  if (!userinfo.sub) {
    errors.push('Missing sub claim in userinfo');
  } else if (userinfo.sub !== idTokenClaims.sub) {
    errors.push(`Userinfo sub mismatch: ID token="${idTokenClaims.sub}", userinfo="${userinfo.sub}"`);
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Get user-friendly error message for validation failures
 *
 * @param {Array<string>} errors - Validation errors
 * @param {string} context - Error context (e.g., 'id_token', 'token_response')
 * @returns {string} User-friendly error message
 */
export function getUserFriendlyError(errors, context = 'authentication') {
  if (!errors || errors.length === 0) {
    return 'Authentication failed. Please try again.';
  }

  const firstError = errors[0].toLowerCase();

  // Token expiration
  if (firstError.includes('expired') || firstError.includes('too old')) {
    return 'Your session has expired. Please sign in again.';
  }

  // Issuer/audience mismatch (misconfiguration)
  if (firstError.includes('issuer') || firstError.includes('audience')) {
    return 'Authentication configuration error. Please contact support.';
  }

  // Nonce mismatch (replay attack)
  if (firstError.includes('nonce')) {
    return 'Invalid authentication state. Please try signing in again.';
  }

  // Missing tokens
  if (firstError.includes('missing') && firstError.includes('token')) {
    return 'Authentication incomplete. Please try again.';
  }

  // Generic
  return `Authentication failed: ${errors[0]}`;
}

/**
 * Validate OIDC configuration
 *
 * @param {Object} config - OIDC configuration
 * @returns {Object} { valid: boolean, errors: Array<string>|null }
 */
export function validateConfig(config) {
  const errors = [];

  // Required fields
  if (!config.issuer) {
    errors.push('Missing required field: issuer');
  } else {
    try {
      new URL(config.issuer);
    } catch (e) {
      errors.push(`Invalid issuer URL: ${config.issuer}`);
    }
  }

  if (!config.clientId) {
    errors.push('Missing required field: clientId');
  }

  if (!config.clientSecret) {
    errors.push('Missing required field: clientSecret');
  }

  if (!config.redirectUri) {
    errors.push('Missing required field: redirectUri');
  } else {
    try {
      new URL(config.redirectUri);
    } catch (e) {
      errors.push(`Invalid redirectUri URL: ${config.redirectUri}`);
    }
  }

  if (!config.cookieSecret) {
    errors.push('Missing required field: cookieSecret');
  } else if (config.cookieSecret.length < 32) {
    errors.push('cookieSecret must be at least 32 characters long');
  }

  // Validate scopes
  if (config.scope) {
    const scopes = config.scope.split(' ');
    if (!scopes.includes('openid')) {
      errors.push('scope must include "openid" for OIDC');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
}
