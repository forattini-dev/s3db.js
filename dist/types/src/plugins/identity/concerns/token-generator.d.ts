/**
 * Secure Token Generator
 *
 * Generates cryptographically secure random tokens for various use cases:
 * - Password reset tokens
 * - Email verification tokens
 * - API tokens
 * - Session IDs
 */
export type TokenEncoding = 'hex' | 'base64' | 'base64url';
export declare function generateToken(bytes?: number, encoding?: TokenEncoding): string;
export declare function generatePasswordResetToken(): string;
export declare function generateEmailVerificationToken(): string;
export declare function generateSessionId(): string;
export declare function generateAPIKey(): string;
export declare function generateNumericCode(length?: number): string;
export declare function generateAlphanumericCode(length?: number): string;
export declare function generateCSRFToken(): string;
export declare function calculateExpiration(duration: string | number): number;
export declare function isExpired(expiresAt: number | string | null | undefined): boolean;
declare const _default: {
    generateToken: typeof generateToken;
    generatePasswordResetToken: typeof generatePasswordResetToken;
    generateEmailVerificationToken: typeof generateEmailVerificationToken;
    generateSessionId: typeof generateSessionId;
    generateAPIKey: typeof generateAPIKey;
    generateNumericCode: typeof generateNumericCode;
    generateAlphanumericCode: typeof generateAlphanumericCode;
    generateCSRFToken: typeof generateCSRFToken;
    calculateExpiration: typeof calculateExpiration;
    isExpired: typeof isExpired;
};
export default _default;
//# sourceMappingURL=token-generator.d.ts.map