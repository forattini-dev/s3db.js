/**
 * OIDC Discovery - OpenID Connect Discovery Document Generator
 *
 * Generates .well-known/openid-configuration and JWKS endpoints
 * Implements OpenID Connect Discovery 1.0 specification
 */
import crypto from 'crypto';
import { PluginError } from '../../errors.js';
export function generateDiscoveryDocument(options = { issuer: '' }) {
    const { issuer, grantTypes = ['authorization_code', 'client_credentials', 'refresh_token'], responseTypes = ['code', 'token', 'id_token', 'code id_token', 'code token', 'id_token token', 'code id_token token'], scopes = ['openid', 'profile', 'email', 'offline_access'] } = options;
    if (!issuer) {
        throw new PluginError('Issuer URL is required for OIDC discovery', {
            pluginName: 'IdentityPlugin',
            operation: 'generateDiscoveryDocument',
            statusCode: 400,
            retriable: false,
            suggestion: 'Provide options.issuer when generating the discovery document.'
        });
    }
    const baseUrl = issuer.replace(/\/$/, '');
    return {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
        jwks_uri: `${baseUrl}/.well-known/jwks.json`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        introspection_endpoint: `${baseUrl}/oauth/introspect`,
        revocation_endpoint: `${baseUrl}/oauth/revoke`,
        end_session_endpoint: `${baseUrl}/logout`,
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
            'locale',
            'client_id',
            'scope',
            'token_use',
            'service_account',
            'user',
            'tenantId',
            'roles',
            'metadata'
        ],
        code_challenge_methods_supported: ['plain', 'S256'],
        ui_locales_supported: ['en', 'pt-BR'],
        service_documentation: `${baseUrl}/docs`,
        claim_types_supported: ['normal'],
        claims_parameter_supported: false,
        request_parameter_supported: false,
        request_uri_parameter_supported: false,
        require_request_uri_registration: false,
        version: '1.0'
    };
}
export function validateClaims(payload, options = {}) {
    const { issuer, audience, clockTolerance = 60 } = options;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub) {
        return { valid: false, error: 'Missing required claim: sub' };
    }
    if (!payload.iat) {
        return { valid: false, error: 'Missing required claim: iat' };
    }
    if (!payload.exp) {
        return { valid: false, error: 'Missing required claim: exp' };
    }
    if (issuer && payload.iss !== issuer) {
        return {
            valid: false,
            error: `Invalid issuer. Expected: ${issuer}, Got: ${payload.iss}`
        };
    }
    if (audience) {
        const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (!audiences.includes(audience)) {
            return {
                valid: false,
                error: `Invalid audience. Expected: ${audience}, Got: ${audiences.join(', ')}`
            };
        }
    }
    if (payload.exp < (now - clockTolerance)) {
        return { valid: false, error: 'Token has expired' };
    }
    if (payload.nbf && payload.nbf > (now + clockTolerance)) {
        return { valid: false, error: 'Token not yet valid (nbf)' };
    }
    if (payload.iat > (now + clockTolerance)) {
        return { valid: false, error: 'Token issued in the future' };
    }
    return { valid: true, error: null };
}
export function extractUserClaims(user, scopes = []) {
    const claims = {
        sub: user.id
    };
    if (scopes.includes('email') && user.email) {
        claims.email = user.email;
        claims.email_verified = user.emailVerified || false;
    }
    if (scopes.includes('profile')) {
        if (user.name)
            claims.name = user.name;
        if (user.givenName)
            claims.given_name = user.givenName;
        if (user.familyName)
            claims.family_name = user.familyName;
        if (user.picture)
            claims.picture = user.picture;
        if (user.locale)
            claims.locale = user.locale;
        if (user.zoneinfo)
            claims.zoneinfo = user.zoneinfo;
        if (user.birthdate)
            claims.birthdate = user.birthdate;
        if (user.gender)
            claims.gender = user.gender;
    }
    return claims;
}
export function parseScopes(scopeString) {
    if (!scopeString || typeof scopeString !== 'string') {
        return [];
    }
    return scopeString
        .trim()
        .split(/\s+/)
        .filter(s => s.length > 0);
}
export function validateScopes(requestedScopes, supportedScopes) {
    let scopes;
    if (!Array.isArray(requestedScopes)) {
        scopes = parseScopes(requestedScopes);
    }
    else {
        scopes = requestedScopes;
    }
    const invalidScopes = scopes.filter(scope => !supportedScopes.includes(scope));
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
        scopes
    };
}
export function generateAuthCode(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
export function generateClientId() {
    return crypto.randomUUID();
}
export function generateClientSecret(length = 64) {
    return crypto.randomBytes(length / 2).toString('hex');
}
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
//# sourceMappingURL=oidc-discovery.js.map