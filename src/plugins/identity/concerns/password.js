/**
 * Password Management - Hashing and Validation
 *
 * Uses bcrypt for secure password hashing with configurable rounds.
 * Provides password strength validation according to policy.
 */

import bcrypt from 'bcrypt';

/**
 * Default password policy
 */
const DEFAULT_PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: false,
  bcryptRounds: 10
};

/**
 * Hash a plaintext password using bcrypt
 * @param {string} password - Plaintext password
 * @param {number} [rounds=10] - Bcrypt cost factor (higher = more secure but slower)
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password, rounds = 10) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  if (password.length > 72) {
    // Bcrypt has a maximum password length of 72 bytes
    throw new Error('Password too long (max 72 characters)');
  }

  return await bcrypt.hash(password, rounds);
}

/**
 * Verify a plaintext password against a hashed password
 * @param {string} plaintext - Plaintext password to verify
 * @param {string} hash - Hashed password to compare against
 * @returns {Promise<boolean>} True if password matches, false otherwise
 */
export async function verifyPassword(plaintext, hash) {
  if (!plaintext || typeof plaintext !== 'string') {
    return false;
  }

  if (!hash || typeof hash !== 'string') {
    return false;
  }

  try {
    return await bcrypt.compare(plaintext, hash);
  } catch (error) {
    // Invalid hash format
    return false;
  }
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

/**
 * Check if password needs rehashing (e.g., bcrypt rounds changed)
 * @param {string} hash - Existing password hash
 * @param {number} [targetRounds=10] - Target bcrypt rounds
 * @returns {boolean} True if password should be rehashed
 */
export function needsRehash(hash, targetRounds = 10) {
  try {
    const rounds = bcrypt.getRounds(hash);
    return rounds < targetRounds;
  } catch (error) {
    // Invalid hash format
    return true;
  }
}

export default {
  hashPassword,
  verifyPassword,
  validatePassword,
  generatePassword,
  needsRehash,
  DEFAULT_PASSWORD_POLICY
};
