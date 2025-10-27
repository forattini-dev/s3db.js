/**
 * Password Management - Validation and Generation
 *
 * Uses S3DB native 'password' type for one-way bcrypt hashing.
 * Passwords are hashed automatically on insert/update using bcrypt.
 * Provides password strength validation according to policy.
 */

import { verifyPassword as bcryptVerify } from '../../../concerns/password-hashing.js';

/**
 * Default password policy
 */
const DEFAULT_PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: false
};

/**
 * Verify a plaintext password against a stored bcrypt hash
 *
 * NOTE: With S3DB's `password` type, passwords are auto-hashed on insert/update
 * using bcrypt with compaction (60 → 53 bytes). This function verifies the
 * plaintext password against the stored hash using bcrypt.compare().
 *
 * @param {string} plaintext - Plaintext password to verify
 * @param {string} storedHash - Stored bcrypt hash (compacted, 53 bytes)
 * @returns {Promise<boolean>} True if password matches, false otherwise
 */
export async function verifyPassword(plaintext, storedHash) {
  // Use bcrypt verification from password-hashing.js
  // It handles both full (60 bytes) and compacted (53 bytes) hashes
  return await bcryptVerify(plaintext, storedHash);
}

/**
 * Validate password against policy
 * @param {string} password - Password to validate
 * @param {Object} [policy=DEFAULT_PASSWORD_POLICY] - Password policy rules
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validatePassword(password, policy = DEFAULT_PASSWORD_POLICY) {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password must be a string'] };
  }

  // Merge with defaults
  const rules = { ...DEFAULT_PASSWORD_POLICY, ...policy };

  // Length checks
  if (password.length < rules.minLength) {
    errors.push(`Password must be at least ${rules.minLength} characters long`);
  }

  if (password.length > rules.maxLength) {
    errors.push(`Password must not exceed ${rules.maxLength} characters`);
  }

  // Character type checks
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

/**
 * Generate a random password that meets policy requirements
 * @param {Object} [policy=DEFAULT_PASSWORD_POLICY] - Password policy rules
 * @returns {string} Generated password
 */
export function generatePassword(policy = DEFAULT_PASSWORD_POLICY) {
  const rules = { ...DEFAULT_PASSWORD_POLICY, ...policy };

  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{};\':"|,.<>/?';

  let chars = '';
  let password = '';

  // Always include lowercase
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

  // Fill remaining length with random characters from allowed set
  const remaining = rules.minLength - password.length;
  for (let i = 0; i < remaining; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }

  // Shuffle password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export default {
  verifyPassword,
  validatePassword,
  generatePassword,
  DEFAULT_PASSWORD_POLICY
};
