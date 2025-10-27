/**
 * Secure Token Generator
 *
 * Generates cryptographically secure random tokens for various use cases:
 * - Password reset tokens
 * - Email verification tokens
 * - API tokens
 * - Session IDs
 */

import { randomBytes } from 'crypto';
import { idGenerator } from '../../../concerns/id.js';

/**
 * Generate a secure random token
 * @param {number} [bytes=32] - Number of random bytes (default: 32 bytes = 256 bits)
 * @param {string} [encoding='hex'] - Output encoding ('hex', 'base64', 'base64url')
 * @returns {string} Random token
 */
export function generateToken(bytes = 32, encoding = 'hex') {
  const buffer = randomBytes(bytes);

  switch (encoding) {
    case 'hex':
      return buffer.toString('hex');

    case 'base64':
      return buffer.toString('base64');

    case 'base64url':
      return buffer.toString('base64url');

    default:
      throw new Error(`Invalid encoding: ${encoding}. Use 'hex', 'base64', or 'base64url'.`);
  }
}

/**
 * Generate a password reset token (URL-safe)
 * @returns {string} 64-character hex token (32 bytes)
 */
export function generatePasswordResetToken() {
  return generateToken(32, 'hex');
}

/**
 * Generate an email verification token (URL-safe)
 * @returns {string} 64-character hex token (32 bytes)
 */
export function generateEmailVerificationToken() {
  return generateToken(32, 'hex');
}

/**
 * Generate a session ID using nanoid
 * @returns {string} 22-character session ID
 */
export function generateSessionId() {
  return idGenerator();
}

/**
 * Generate an API key (longer, more secure)
 * @returns {string} 64-character hex API key (32 bytes)
 */
export function generateAPIKey() {
  return generateToken(32, 'hex');
}

/**
 * Generate a short numeric code (for 2FA, OTP, etc.)
 * @param {number} [length=6] - Number of digits (default: 6)
 * @returns {string} Numeric code (e.g., "123456")
 */
export function generateNumericCode(length = 6) {
  const max = Math.pow(10, length);
  const min = Math.pow(10, length - 1);

  // Generate random number in range [min, max)
  const randomNum = Math.floor(min + Math.random() * (max - min));

  return randomNum.toString().padStart(length, '0');
}

/**
 * Generate a short alphanumeric code (for invite codes, etc.)
 * @param {number} [length=8] - Number of characters (default: 8)
 * @returns {string} Alphanumeric code (e.g., "A3B7K9M2")
 */
export function generateAlphanumericCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes similar chars (I, O, 0, 1)
  let code = '';

  const buffer = randomBytes(length);

  for (let i = 0; i < length; i++) {
    code += chars[buffer[i] % chars.length];
  }

  return code;
}

/**
 * Generate a CSRF token (medium security)
 * @returns {string} 32-character hex CSRF token (16 bytes)
 */
export function generateCSRFToken() {
  return generateToken(16, 'hex');
}

/**
 * Calculate expiration timestamp
 * @param {string|number} duration - Duration string ('15m', '1h', '7d') or milliseconds
 * @returns {number} Unix timestamp (milliseconds)
 */
export function calculateExpiration(duration) {
  let ms;

  if (typeof duration === 'number') {
    ms = duration;
  } else if (typeof duration === 'string') {
    const match = duration.match(/^(\d+)([smhd])$/);

    if (!match) {
      throw new Error(`Invalid duration format: ${duration}. Use '15m', '1h', '7d', etc.`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': ms = value * 1000; break;           // seconds
      case 'm': ms = value * 60 * 1000; break;      // minutes
      case 'h': ms = value * 60 * 60 * 1000; break; // hours
      case 'd': ms = value * 24 * 60 * 60 * 1000; break; // days
      default:
        throw new Error(`Invalid duration unit: ${unit}`);
    }
  } else {
    throw new Error('Duration must be a string or number');
  }

  return Date.now() + ms;
}

/**
 * Check if token/timestamp is expired
 * @param {number|string} expiresAt - Expiration timestamp (Unix ms) or ISO string
 * @returns {boolean} True if expired, false otherwise
 */
export function isExpired(expiresAt) {
  if (!expiresAt) {
    return true;
  }

  const timestamp = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt;

  return Date.now() > timestamp;
}

export default {
  generateToken,
  generatePasswordResetToken,
  generateEmailVerificationToken,
  generateSessionId,
  generateAPIKey,
  generateNumericCode,
  generateAlphanumericCode,
  generateCSRFToken,
  calculateExpiration,
  isExpired
};
