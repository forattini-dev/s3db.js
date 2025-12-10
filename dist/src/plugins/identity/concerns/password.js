/**
 * Password Management - Validation and Generation
 *
 * Uses S3DB native 'password' type for one-way bcrypt hashing.
 * Passwords are hashed automatically on insert/update using bcrypt.
 * Provides password strength validation according to policy.
 */
import { verifyPassword as bcryptVerify } from '../../../concerns/password-hashing.js';
const DEFAULT_PASSWORD_POLICY = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: false
};
export async function verifyPassword(plaintext, storedHash) {
    return await bcryptVerify(plaintext, storedHash);
}
export function validatePassword(password, policy = {}) {
    const errors = [];
    if (!password || typeof password !== 'string') {
        return { valid: false, errors: ['Password must be a string'] };
    }
    const rules = { ...DEFAULT_PASSWORD_POLICY, ...policy };
    if (password.length < rules.minLength) {
        errors.push(`Password must be at least ${rules.minLength} characters long`);
    }
    if (password.length > rules.maxLength) {
        errors.push(`Password must not exceed ${rules.maxLength} characters`);
    }
    if (rules.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (rules.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (rules.requireNumbers && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    if (rules.requireSymbols && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one symbol');
    }
    return {
        valid: errors.length === 0,
        errors
    };
}
export function generatePassword(policy = {}) {
    const rules = { ...DEFAULT_PASSWORD_POLICY, ...policy };
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{};\':"|,.<>/?';
    let chars = '';
    let password = '';
    chars += lowercase;
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    if (rules.requireUppercase) {
        chars += uppercase;
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
    }
    if (rules.requireNumbers) {
        chars += numbers;
        password += numbers[Math.floor(Math.random() * numbers.length)];
    }
    if (rules.requireSymbols) {
        chars += symbols;
        password += symbols[Math.floor(Math.random() * symbols.length)];
    }
    const remaining = rules.minLength - password.length;
    for (let i = 0; i < remaining; i++) {
        password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password.split('').sort(() => Math.random() - 0.5).join('');
}
export { DEFAULT_PASSWORD_POLICY };
export default {
    verifyPassword,
    validatePassword,
    generatePassword,
    DEFAULT_PASSWORD_POLICY
};
//# sourceMappingURL=password.js.map