/**
 * Password Management - Validation and Generation
 *
 * Uses S3DB native 'password' type for one-way bcrypt hashing.
 * Passwords are hashed automatically on insert/update using bcrypt.
 * Provides password strength validation according to policy.
 */
export interface PasswordPolicy {
    minLength?: number;
    maxLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSymbols?: boolean;
}
export interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
}
declare const DEFAULT_PASSWORD_POLICY: Required<PasswordPolicy>;
export declare function verifyPassword(plaintext: string, storedHash: string): Promise<boolean>;
export declare function validatePassword(password: string, policy?: PasswordPolicy): PasswordValidationResult;
export declare function generatePassword(policy?: PasswordPolicy): string;
export { DEFAULT_PASSWORD_POLICY };
declare const _default: {
    verifyPassword: typeof verifyPassword;
    validatePassword: typeof validatePassword;
    generatePassword: typeof generatePassword;
    DEFAULT_PASSWORD_POLICY: Required<PasswordPolicy>;
};
export default _default;
//# sourceMappingURL=password.d.ts.map