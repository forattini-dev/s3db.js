/**
 * Cryptographic utilities for API Plugin
 *
 * Provides HKDF key derivation (RFC 5869) for deriving separate encryption
 * and signing keys from a single secret.
 *
 * @module api/concerns/crypto
 */

import crypto from 'crypto';

/**
 * Derive a cryptographic key from a secret using HKDF (RFC 5869)
 *
 * HKDF (HMAC-based Extract-and-Expand Key Derivation Function) is a
 * secure way to derive multiple keys from a single secret. This prevents
 * key reuse vulnerabilities by deriving separate keys for different purposes
 * (e.g., encryption vs signing).
 *
 * @param {string|Buffer} secret - Master secret (minimum 32 bytes recommended)
 * @param {string} context - Context string to derive key for (e.g., 'OIDC Session Encryption')
 * @param {number} [length=32] - Output key length in bytes (default: 32 for AES-256)
 * @returns {Buffer} Derived key
 *
 * @example
 * const encryptionKey = deriveKey(secret, 'OIDC Session Encryption');
 * const signingKey = deriveKey(secret, 'OIDC Cookie Signing');
 * const jwtKey = deriveKey(secret, 'JWT Token Signing');
 *
 * @see https://datatracker.ietf.org/doc/html/rfc5869
 */
export function deriveKey(secret, context, length = 32) {
  const secretBuffer = typeof secret === 'string'
    ? Buffer.from(secret, 'utf8')
    : secret;

  const derived = crypto.hkdfSync(
    'sha256',           // Hash algorithm
    secretBuffer,       // Input key material
    Buffer.alloc(0),    // Salt (empty = extract step uses zeros)
    context,            // Context/info string
    length              // Output length
  );

  // hkdfSync returns an ArrayBuffer in Node.js, convert to Buffer for consistency
  return Buffer.from(derived);
}

/**
 * Derive multiple keys from a single secret with support for key rotation
 *
 * Accepts a single secret or array of secrets for graceful key rotation.
 * Signs with the newest key (first in array), but can verify with any key.
 *
 * @param {string|string[]} secret - Master secret(s) for key derivation
 * @param {string} encryptionContext - Context for encryption key
 * @param {string} signingContext - Context for signing key
 * @returns {{current: {encryption: Buffer, signing: Buffer}, keystore: Array}}
 *   Current keys and keystore for rotation
 *
 * @example
 * // Single secret
 * const { current } = deriveKeystore('my-secret', 'Encrypt', 'Sign');
 *
 * // Key rotation (sign with new, verify with old or new)
 * const { current, keystore } = deriveKeystore(
 *   ['new-secret', 'old-secret'],  // New first
 *   'Encrypt',
 *   'Sign'
 * );
 */
export function deriveKeystore(secret, encryptionContext, signingContext) {
  const secrets = Array.isArray(secret) ? secret : [secret];

  // Current (newest) secret for signing
  const currentSecret = secrets[0];
  const current = {
    encryption: deriveKey(currentSecret, encryptionContext),
    signing: deriveKey(currentSecret, signingContext),
  };

  // Full keystore for verification (newest to oldest)
  const keystore = secrets.map(s => ({
    encryption: deriveKey(s, encryptionContext),
    signing: deriveKey(s, signingContext),
  }));

  return { current, keystore };
}

/**
 * Derive standard OIDC keys from cookie secret
 *
 * Derives encryption and signing keys specifically for OIDC session management.
 *
 * @param {string|string[]} cookieSecret - Cookie secret(s)
 * @returns {{current: {encryption: Buffer, signing: Buffer}, keystore: Array}}
 *
 * @example
 * const { current } = deriveOidcKeys(config.cookieSecret);
 * const jwt = await signJWT(data, current.signing);
 * const encrypted = await encrypt(data, current.encryption);
 */
export function deriveOidcKeys(cookieSecret) {
  return deriveKeystore(
    cookieSecret,
    'OIDC Session Encryption',
    'OIDC Cookie Signing'
  );
}

/**
 * Derive standard JWT keys from secret
 *
 * Derives signing key specifically for JWT token signing.
 *
 * @param {string|string[]} jwtSecret - JWT secret(s)
 * @returns {{current: {signing: Buffer}, keystore: Array}}
 *
 * @example
 * const { current } = deriveJwtKeys(config.jwtSecret);
 * const token = await signJWT(payload, current.signing);
 */
export function deriveJwtKeys(jwtSecret) {
  return deriveKeystore(
    jwtSecret,
    'JWT Token Encryption',  // Not used, but required by keystore
    'JWT Token Signing'
  );
}
