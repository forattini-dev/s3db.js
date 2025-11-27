/**
 * RSA Key Management for OAuth2/OIDC
 *
 * Manages RS256 key pairs for signing and verifying JWTs
 * Zero external dependencies - uses Node.js crypto only
 */

import { generateKeyPairSync, createSign, createVerify, createHash, createPublicKey } from 'crypto';
import { PluginError } from '../../errors.js';

/**
 * Generate RSA key pair for RS256
 * @param {number} modulusLength - Key size in bits (default: 2048)
 * @returns {Object} { publicKey, privateKey, kid }
 */
export function generateKeyPair(modulusLength = 2048) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // Generate key ID (kid) from public key fingerprint
  const kid = createHash('sha256')
    .update(publicKey)
    .digest('hex')
    .substring(0, 16);

  return {
    publicKey,
    privateKey,
    kid,
    algorithm: 'RS256',
    use: 'sig',
    createdAt: new Date().toISOString()
  };
}

/**
 * Convert PEM public key to JWK format
 * @param {string} publicKeyPem - PEM formatted public key
 * @param {string} kid - Key ID
 * @returns {Object} JWK (JSON Web Key)
 */
export function pemToJwk(publicKeyPem, kid) {
  // Extract key components using Node.js crypto
  const keyObject = createPublicKey(publicKeyPem);
  const exported = keyObject.export({ format: 'jwk' });

  return {
    kty: 'RSA',
    use: 'sig',
    alg: 'RS256',
    kid,
    n: exported.n,  // modulus
    e: exported.e   // exponent
  };
}

/**
 * Create RS256 JWT token
 * @param {Object} payload - Token payload
 * @param {string} privateKey - PEM formatted private key
 * @param {string} kid - Key ID
 * @param {string} expiresIn - Token expiration (e.g., '15m')
 * @returns {string} JWT token
 */
export function createRS256Token(payload, privateKey, kid, expiresIn = '15m') {
  // Parse expiresIn
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new PluginError('Invalid expiresIn format. Use: 60s, 30m, 24h, 7d', {
      pluginName: 'IdentityPlugin',
      operation: 'createToken',
      statusCode: 400,
      retriable: false,
      suggestion: 'Provide a duration string ending with s, m, h, or d (e.g., "15m" for 15 minutes).'
    });
  }

  const [, value, unit] = match;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  const expiresInSeconds = parseInt(value) * multipliers[unit];

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid
  };

  const now = Math.floor(Date.now() / 1000);

  const data = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  // Encode header and payload
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(data)).toString('base64url');

  // Sign with RSA private key
  const sign = createSign('RSA-SHA256');
  sign.update(`${encodedHeader}.${encodedPayload}`);
  sign.end();

  const signature = sign.sign(privateKey, 'base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify RS256 JWT token
 * @param {string} token - JWT token
 * @param {string} publicKey - PEM formatted public key
 * @returns {Object|null} Decoded payload or null if invalid
 */
export function verifyRS256Token(token, publicKey) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const verify = createVerify('RSA-SHA256');
    verify.update(`${encodedHeader}.${encodedPayload}`);
    verify.end();

    const isValid = verify.verify(publicKey, signature, 'base64url');

    if (!isValid) {
      return null;
    }

    // Decode header and payload
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());

    // Verify algorithm
    if (header.alg !== 'RS256') {
      return null;
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Get key ID (kid) from JWT token header
 * @param {string} token - JWT token
 * @returns {string|null} Key ID or null
 */
export function getKidFromToken(token) {
  try {
    const [encodedHeader] = token.split('.');
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString());
    return header.kid || null;
  } catch (err) {
    return null;
  }
}

/**
 * Key Manager class - manages key rotation and storage
 */
export class KeyManager {
  constructor(keyResource) {
    this.keyResource = keyResource;
    this.keysByPurpose = new Map(); // purpose -> Map(kid -> key)
    this.currentKeys = new Map();   // purpose -> active key
    this.keysByKid = new Map();     // kid -> key
  }

  /**
   * Initialize key manager - load or generate keys
   */
  async initialize() {
    // Try to load existing keys
    const existingKeys = await this.keyResource.list();

    if (existingKeys.length > 0) {
      // Load keys into memory
      for (const keyRecord of existingKeys) {
        this._storeKeyRecord({
          ...keyRecord,
          purpose: keyRecord.purpose || 'oauth'
        });
      }
    }

    // If no active key, generate one
    if (!this.currentKeys.get('oauth')) {
      await this.rotateKey('oauth');
    }
  }

  /**
   * Rotate keys - generate new key pair
   */
  async rotateKey(purpose = 'oauth') {
    const normalizedPurpose = this._normalizePurpose(purpose);
    const keyPair = generateKeyPair();

    // Mark old keys as inactive
    const oldKeys = await this.keyResource.query({ active: true, purpose: normalizedPurpose });
    for (const oldKey of oldKeys) {
      await this.keyResource.update(oldKey.id, { active: false });
      const stored = this.keysByKid.get(oldKey.kid);
      if (stored) {
        stored.active = false;
      }
    }

    // Store new key
    const keyRecord = await this.keyResource.insert({
      kid: keyPair.kid,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      algorithm: keyPair.algorithm,
      use: keyPair.use,
      active: true,
      createdAt: keyPair.createdAt,
      purpose: normalizedPurpose
    });

    this._storeKeyRecord(keyRecord);

    return keyRecord;
  }

  /**
   * Get current active key
   */
  getCurrentKey(purpose = 'oauth') {
    return this.currentKeys.get(this._normalizePurpose(purpose)) || null;
  }

  /**
   * Get key by kid, reloading from resource if necessary
   */
  async getKey(kid) {
    const cached = this.keysByKid.get(kid);
    if (cached) {
      return cached;
    }

    // Try to find in resource
    if (this.keyResource) {
      const [found] = await this.keyResource.query({ kid });
      if (found) {
        this._storeKeyRecord(found);
        return this.keysByKid.get(kid);
      }
    }

    return null;
  }

  /**
   * Ensure a purpose has an active key
   * @param {string} purpose
   * @returns {Promise<Object>}
   */
  async ensurePurpose(purpose = 'oauth') {
    const normalizedPurpose = this._normalizePurpose(purpose);
    const current = this.currentKeys.get(normalizedPurpose);

    if (current) {
      return current;
    }

    // Try to find active key in storage
    const [active] = await this.keyResource.query({ purpose: normalizedPurpose, active: true });
    if (active) {
      this._storeKeyRecord({
        ...active,
        purpose: active.purpose || normalizedPurpose
      });
      return this.currentKeys.get(normalizedPurpose);
    }

    return await this.rotateKey(normalizedPurpose);
  }

  /**
   * Get all public keys in JWKS format
   */
  async getJWKS() {
    const keys = Array.from(this.keysByKid.values())
      .filter(key => key.active)
      .map(key => ({
      kty: 'RSA',
      use: 'sig',
      alg: 'RS256',
      kid: key.kid,
      ...pemToJwk(key.publicKey, key.kid)
    }));

    return { keys };
  }

  /**
   * Create JWT with current active key
   */
  createToken(payload, expiresIn = '15m', purpose = 'oauth') {
    const normalizedPurpose = this._normalizePurpose(purpose);
    const activeKey = this.currentKeys.get(normalizedPurpose);

    if (!activeKey) {
      throw new PluginError(`No active key available for purpose "${normalizedPurpose}"`, {
        pluginName: 'IdentityPlugin',
        operation: 'createToken',
        statusCode: 503,
        retriable: true,
        suggestion: 'Generate or rotate keys before issuing tokens for this purpose.',
        metadata: { purpose: normalizedPurpose }
      });
    }

    return createRS256Token(
      payload,
      activeKey.privateKey,
      activeKey.kid,
      expiresIn
    );
  }

  /**
   * Verify JWT token
   */
  async verifyToken(token) {
    const kid = getKidFromToken(token);

    if (!kid) {
      return null;
    }

    const key = await this.getKey(kid);

    if (!key) {
      return null;
    }

    return verifyRS256Token(token, key.publicKey);
  }

  /**
   * Normalize purpose name
   * @param {string} purpose
   * @returns {string}
   * @private
   */
  _normalizePurpose(purpose) {
    return typeof purpose === 'string' && purpose.trim().length > 0
      ? purpose.trim()
      : 'oauth';
  }

  /**
   * Store key record in caches
   * @param {Object} record
   * @private
   */
  _storeKeyRecord(record) {
    const purpose = this._normalizePurpose(record.purpose);
    const entry = {
      publicKey: record.publicKey,
      privateKey: record.privateKey,
      kid: record.kid,
      createdAt: record.createdAt,
      active: record.active,
      purpose,
      id: record.id
    };

    if (!this.keysByPurpose.has(purpose)) {
      this.keysByPurpose.set(purpose, new Map());
    }

    this.keysByPurpose.get(purpose).set(entry.kid, entry);
    this.keysByKid.set(entry.kid, entry);

    if (entry.active) {
      this.currentKeys.set(purpose, entry);
    }
  }
}

export default {
  generateKeyPair,
  pemToJwk,
  createRS256Token,
  verifyRS256Token,
  getKidFromToken,
  KeyManager
};
