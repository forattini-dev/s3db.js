import { createLogger } from '../../../concerns/logger.js';
const logger = createLogger({
    name: 'OidcValidator',
    level: (process.env.S3DB_LOG_LEVEL || 'info')
});
export function validateIdToken(claims, config, options = {}) {
    logger.debug({
        iss: claims?.iss,
        aud: claims?.aud,
        exp: claims?.exp,
        sub: claims?.sub?.substring(0, 15) + '...',
        hasNonce: !!claims?.nonce
    }, '[OIDC] Validating ID token claims');
    const errors = [];
    const now = Math.floor(Date.now() / 1000);
    if (!claims.iss) {
        errors.push('Missing issuer (iss) claim');
    }
    else if (config.issuer && claims.iss !== config.issuer) {
        errors.push(`Invalid issuer: expected "${config.issuer}", got "${claims.iss}"`);
    }
    if (!claims.aud) {
        errors.push('Missing audience (aud) claim');
    }
    else {
        const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        if (!audiences.includes(config.clientId)) {
            errors.push(`Invalid audience: expected "${config.clientId}", got "${claims.aud}"`);
        }
    }
    if (!claims.exp) {
        errors.push('Missing expiration (exp) claim');
    }
    else if (now > claims.exp + (options.clockTolerance || 60)) {
        const expired = new Date(claims.exp * 1000).toISOString();
        errors.push(`Token expired at ${expired}`);
    }
    if (claims.iat) {
        const maxAge = options.maxAge || 86400;
        if (now > claims.iat + maxAge + (options.clockTolerance || 60)) {
            errors.push(`Token too old (issued ${Math.floor((now - claims.iat) / 3600)} hours ago)`);
        }
        if (claims.iat > now + (options.clockTolerance || 60)) {
            errors.push('Token issued in the future');
        }
    }
    if (claims.nbf && now < claims.nbf - (options.clockTolerance || 60)) {
        const notBefore = new Date(claims.nbf * 1000).toISOString();
        errors.push(`Token not valid before ${notBefore}`);
    }
    if (options.nonce) {
        if (!claims.nonce) {
            errors.push('Missing nonce claim');
        }
        else if (claims.nonce !== options.nonce) {
            errors.push('Invalid nonce (possible replay attack)');
        }
    }
    if (Array.isArray(claims.aud) && claims.aud.length > 1) {
        if (!claims.azp) {
            errors.push('Missing azp claim (required for multiple audiences)');
        }
        else if (claims.azp !== config.clientId) {
            errors.push(`Invalid azp: expected "${config.clientId}", got "${claims.azp}"`);
        }
    }
    if (!claims.sub) {
        errors.push('Missing subject (sub) claim');
    }
    const isValid = errors.length === 0;
    if (!isValid) {
        logger.warn({
            errors,
            iss: claims?.iss,
            aud: claims?.aud
        }, '[OIDC] ID token validation failed');
    }
    else {
        logger.debug('[OIDC] ID token validation successful');
    }
    return {
        valid: isValid,
        errors: errors.length > 0 ? errors : null
    };
}
export function validateAccessToken(accessToken, _config) {
    if (!accessToken || typeof accessToken !== 'string') {
        return { valid: false, error: 'Invalid access token format' };
    }
    if (accessToken.length < 10) {
        return { valid: false, error: 'Access token too short' };
    }
    return { valid: true, error: null };
}
export function validateRefreshToken(refreshToken, _config) {
    if (!refreshToken || typeof refreshToken !== 'string') {
        return { valid: false, error: 'Invalid refresh token format' };
    }
    if (refreshToken.length < 10) {
        return { valid: false, error: 'Refresh token too short' };
    }
    return { valid: true, error: null };
}
export function validateTokenResponse(tokenResponse, config) {
    const errors = [];
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
    }
    else if (tokenResponse.token_type.toLowerCase() !== 'bearer') {
        errors.push(`Invalid token_type: expected "Bearer", got "${tokenResponse.token_type}"`);
    }
    if (tokenResponse.expires_in === undefined || tokenResponse.expires_in === null) {
        errors.push('Missing expires_in in response');
    }
    else {
        const parsedExpiresIn = Number(tokenResponse.expires_in);
        if (!Number.isFinite(parsedExpiresIn) || parsedExpiresIn < 0) {
            errors.push(`Invalid expires_in: ${tokenResponse.expires_in}`);
        }
        else {
            tokenResponse.expires_in = parsedExpiresIn;
        }
    }
    if (config.scope?.includes('offline_access') && !tokenResponse.refresh_token) {
        errors.push('Missing refresh_token (offline_access scope requested)');
    }
    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : null
    };
}
export function validateUserinfo(userinfo, idTokenClaims) {
    const errors = [];
    if (!userinfo) {
        errors.push('Empty userinfo response');
        return { valid: false, errors };
    }
    if (!userinfo.sub) {
        errors.push('Missing sub claim in userinfo');
    }
    else if (userinfo.sub !== idTokenClaims.sub) {
        errors.push(`Userinfo sub mismatch: ID token="${idTokenClaims.sub}", userinfo="${userinfo.sub}"`);
    }
    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : null
    };
}
export function getUserFriendlyError(errors, _context = 'authentication') {
    if (!errors || errors.length === 0) {
        return 'Authentication failed. Please try again.';
    }
    const firstError = errors[0].toLowerCase();
    if (firstError.includes('expired') || firstError.includes('too old')) {
        return 'Your session has expired. Please sign in again.';
    }
    if (firstError.includes('issuer') || firstError.includes('audience')) {
        return 'Authentication configuration error. Please contact support.';
    }
    if (firstError.includes('nonce')) {
        return 'Invalid authentication state. Please try signing in again.';
    }
    if (firstError.includes('missing') && firstError.includes('token')) {
        return 'Authentication incomplete. Please try again.';
    }
    return `Authentication failed: ${errors[0]}`;
}
export function validateConfig(config) {
    const errors = [];
    if (!config.issuer) {
        errors.push('Missing required field: issuer');
    }
    else {
        try {
            new URL(config.issuer);
        }
        catch {
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
    }
    else {
        try {
            new URL(config.redirectUri);
        }
        catch {
            errors.push(`Invalid redirectUri URL: ${config.redirectUri}`);
        }
    }
    if (!config.cookieSecret) {
        errors.push('Missing required field: cookieSecret');
    }
    else if (config.cookieSecret.length < 32) {
        errors.push('cookieSecret must be at least 32 characters long');
    }
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
//# sourceMappingURL=oidc-validator.js.map