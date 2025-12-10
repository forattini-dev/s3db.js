/**
 * OIDC Discovery - OpenID Connect Discovery Document Generator
 *
 * Generates .well-known/openid-configuration and JWKS endpoints
 * Implements OpenID Connect Discovery 1.0 specification
 */
export interface DiscoveryDocumentOptions {
    issuer: string;
    grantTypes?: string[];
    responseTypes?: string[];
    scopes?: string[];
}
export interface DiscoveryDocument {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    registration_endpoint: string;
    introspection_endpoint: string;
    revocation_endpoint: string;
    end_session_endpoint: string;
    scopes_supported: string[];
    response_types_supported: string[];
    response_modes_supported: string[];
    grant_types_supported: string[];
    subject_types_supported: string[];
    id_token_signing_alg_values_supported: string[];
    token_endpoint_auth_methods_supported: string[];
    claims_supported: string[];
    code_challenge_methods_supported: string[];
    ui_locales_supported: string[];
    service_documentation: string;
    claim_types_supported: string[];
    claims_parameter_supported: boolean;
    request_parameter_supported: boolean;
    request_uri_parameter_supported: boolean;
    require_request_uri_registration: boolean;
    version: string;
}
export interface ClaimsValidationOptions {
    issuer?: string;
    audience?: string;
    clockTolerance?: number;
}
export interface ClaimsValidationResult {
    valid: boolean;
    error: string | null;
}
export interface UserClaimsPayload {
    iss?: string;
    sub: string;
    iat?: number;
    exp?: number;
    nbf?: number;
    aud?: string | string[];
    scope?: string;
    [key: string]: any;
}
export interface UserObject {
    id: string;
    email?: string;
    emailVerified?: boolean;
    name?: string;
    givenName?: string;
    familyName?: string;
    picture?: string;
    locale?: string;
    zoneinfo?: string;
    birthdate?: string;
    gender?: string;
}
export interface UserClaims {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    locale?: string;
    zoneinfo?: string;
    birthdate?: string;
    gender?: string;
}
export interface ScopeValidationResult {
    valid: boolean;
    error: string | null;
    scopes: string[];
}
export declare function generateDiscoveryDocument(options?: DiscoveryDocumentOptions): DiscoveryDocument;
export declare function validateClaims(payload: UserClaimsPayload, options?: ClaimsValidationOptions): ClaimsValidationResult;
export declare function extractUserClaims(user: UserObject, scopes?: string[]): UserClaims;
export declare function parseScopes(scopeString: string | null | undefined): string[];
export declare function validateScopes(requestedScopes: string[] | string, supportedScopes: string[]): ScopeValidationResult;
export declare function generateAuthCode(length?: number): string;
export declare function generateClientId(): string;
export declare function generateClientSecret(length?: number): string;
declare const _default: {
    generateDiscoveryDocument: typeof generateDiscoveryDocument;
    validateClaims: typeof validateClaims;
    extractUserClaims: typeof extractUserClaims;
    parseScopes: typeof parseScopes;
    validateScopes: typeof validateScopes;
    generateAuthCode: typeof generateAuthCode;
    generateClientId: typeof generateClientId;
    generateClientSecret: typeof generateClientSecret;
};
export default _default;
//# sourceMappingURL=oidc-discovery.d.ts.map