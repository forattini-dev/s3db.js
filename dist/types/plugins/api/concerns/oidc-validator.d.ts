export interface IdTokenClaims {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
    nbf?: number;
    sub?: string;
    nonce?: string;
    azp?: string;
    [key: string]: unknown;
}
export interface OidcConfig {
    issuer?: string;
    clientId: string;
    clientSecret?: string;
    redirectUri?: string;
    cookieSecret?: string;
    scope?: string;
}
export interface ValidationOptions {
    clockTolerance?: number;
    maxAge?: number;
    nonce?: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[] | null;
}
export interface SimpleValidationResult {
    valid: boolean;
    error: string | null;
}
export interface TokenResponse {
    access_token?: string;
    id_token?: string;
    token_type?: string;
    expires_in?: number | string;
    refresh_token?: string;
    [key: string]: unknown;
}
export interface UserinfoResponse {
    sub?: string;
    [key: string]: unknown;
}
export declare function validateIdToken(claims: IdTokenClaims, config: OidcConfig, options?: ValidationOptions): ValidationResult;
export declare function validateAccessToken(accessToken: string, _config: OidcConfig): SimpleValidationResult;
export declare function validateRefreshToken(refreshToken: string, _config: OidcConfig): SimpleValidationResult;
export declare function validateTokenResponse(tokenResponse: TokenResponse, config: OidcConfig): ValidationResult;
export declare function validateUserinfo(userinfo: UserinfoResponse, idTokenClaims: IdTokenClaims): ValidationResult;
export declare function getUserFriendlyError(errors: string[] | null, _context?: string): string;
export declare function validateConfig(config: OidcConfig): ValidationResult;
//# sourceMappingURL=oidc-validator.d.ts.map