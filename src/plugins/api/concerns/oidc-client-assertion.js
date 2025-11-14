/**
 * OIDC Client Assertion with JWK - RFC 7523
 *
 * Supports asymmetric client authentication using private_key_jwt.
 * More secure than client_secret for confidential clients.
 *
 * @module api/concerns/oidc-client-assertion
 * @see https://datatracker.ietf.org/doc/html/rfc7523
 */

import crypto from 'crypto';
import { SignJWT, importJWK } from 'jose';

/**
 * Generate client assertion JWT (private_key_jwt)
 *
 * @param {Object} options - Options
 * @param {string} options.clientId - Client ID
 * @param {string} options.tokenEndpoint - Token endpoint URL
 * @param {Object} options.privateKey - Private key (JWK format)
 * @param {string} [options.algorithm='RS256'] - Signing algorithm
 * @param {number} [options.expiresIn=300] - Expiration time in seconds
 * @returns {Promise<string>} Signed JWT assertion
 */
export async function generateClientAssertion(options) {
  const {
    clientId,
    tokenEndpoint,
    privateKey,
    algorithm = 'RS256',
    expiresIn = 300  // 5 minutes
  } = options;

  if (!clientId) {
    throw new Error('clientId is required for client assertion');
  }

  if (!tokenEndpoint) {
    throw new Error('tokenEndpoint is required for client assertion');
  }

  if (!privateKey) {
    throw new Error('privateKey is required for client assertion');
  }

  // Import JWK private key
  const key = await importJWK(privateKey, algorithm);

  // Generate unique JWT ID
  const jti = crypto.randomBytes(16).toString('hex');

  // Current time and expiration
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresIn;

  // Build JWT
  const jwt = await new SignJWT({})
    .setProtectedHeader({
      alg: algorithm,
      typ: 'JWT',
      ...(privateKey.kid ? { kid: privateKey.kid } : {})
    })
    .setIssuer(clientId)
    .setSubject(clientId)
    .setAudience(tokenEndpoint)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(jti)
    .sign(key);

  return jwt;
}

/**
 * Create client authentication object for token endpoint
 *
 * @param {Object} config - OIDC configuration
 * @param {string} tokenEndpoint - Token endpoint URL
 * @returns {Promise<Object>} Client authentication object
 */
export async function createClientAuth(config, tokenEndpoint) {
  const { clientId, clientSecret, privateKey, tokenEndpointAuthMethod } = config;

  // Determine auth method
  const authMethod = tokenEndpointAuthMethod || (clientSecret ? 'client_secret_basic' : 'none');

  switch (authMethod) {
    case 'client_secret_basic':
      // Basic authentication (Authorization header)
      return {
        method: 'client_secret_basic',
        clientId,
        clientSecret
      };

    case 'client_secret_post':
      // POST body authentication
      return {
        method: 'client_secret_post',
        clientId,
        clientSecret
      };

    case 'private_key_jwt':
      // Private key JWT assertion
      if (!privateKey) {
        throw new Error('privateKey required for private_key_jwt authentication');
      }

      const assertion = await generateClientAssertion({
        clientId,
        tokenEndpoint,
        privateKey,
        algorithm: privateKey.alg || 'RS256'
      });

      return {
        method: 'private_key_jwt',
        clientId,
        clientAssertion: assertion,
        clientAssertionType: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
      };

    case 'none':
      // Public client (no authentication)
      return {
        method: 'none',
        clientId
      };

    default:
      throw new Error(`Unsupported token endpoint auth method: ${authMethod}`);
  }
}

/**
 * Apply client authentication to fetch request
 *
 * @param {Object} clientAuth - Client auth object from createClientAuth
 * @param {Object} requestOptions - Fetch request options
 * @returns {Object} Modified request options
 */
export function applyClientAuth(clientAuth, requestOptions) {
  const { method, clientId, clientSecret, clientAssertion, clientAssertionType } = clientAuth;

  // Clone options to avoid mutation
  const options = { ...requestOptions };
  const body = new URLSearchParams(options.body || {});

  switch (method) {
    case 'client_secret_basic':
      // Add Authorization header
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      options.headers = {
        ...options.headers,
        'Authorization': `Basic ${credentials}`
      };
      break;

    case 'client_secret_post':
      // Add to POST body
      body.append('client_id', clientId);
      body.append('client_secret', clientSecret);
      break;

    case 'private_key_jwt':
      // Add client assertion to POST body
      body.append('client_id', clientId);
      body.append('client_assertion_type', clientAssertionType);
      body.append('client_assertion', clientAssertion);
      break;

    case 'none':
      // Public client - just add client_id
      body.append('client_id', clientId);
      break;
  }

  options.body = body;
  return options;
}

/**
 * Validate JWK private key
 *
 * @param {Object} jwk - JWK object
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
export function validatePrivateKey(jwk) {
  const errors = [];

  if (!jwk) {
    errors.push('Private key is required');
    return { valid: false, errors };
  }

  if (!jwk.kty) {
    errors.push('JWK missing "kty" (key type)');
  }

  if (!jwk.alg && !jwk.use) {
    errors.push('JWK should specify "alg" (algorithm) or "use" (key usage)');
  }

  // Check for private key components
  const supportedKeyTypes = ['RSA', 'EC', 'OKP'];
  if (!supportedKeyTypes.includes(jwk.kty)) {
    errors.push(`Unsupported key type "${jwk.kty}". Supported: ${supportedKeyTypes.join(', ')}`);
  }

  // RSA private key must have 'd' component
  if (jwk.kty === 'RSA' && !jwk.d) {
    errors.push('RSA private key missing "d" component');
  }

  // EC private key must have 'd' component
  if (jwk.kty === 'EC' && !jwk.d) {
    errors.push('EC private key missing "d" component');
  }

  // OKP private key must have 'd' component
  if (jwk.kty === 'OKP' && !jwk.d) {
    errors.push('OKP private key missing "d" component');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Generate RSA key pair for client assertion
 *
 * Utility function to generate a new RSA key pair in JWK format
 *
 * @param {Object} options - Options
 * @param {number} [options.modulusLength=2048] - Key size in bits
 * @param {string} [options.keyId] - Optional key ID
 * @returns {Promise<Object>} { privateKey, publicKey } in JWK format
 */
export async function generateRSAKeyPair(options = {}) {
  const { modulusLength = 2048, keyId } = options;

  // Generate key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // Convert to JWK format (requires jose library in production)
  const { importPKCS8, importSPKI, exportJWK } = await import('jose');

  const privateKeyObject = await importPKCS8(privateKey, 'RS256');
  const publicKeyObject = await importSPKI(publicKey, 'RS256');

  const privateJWK = await exportJWK(privateKeyObject);
  const publicJWK = await exportJWK(publicKeyObject);

  // Add key ID if provided
  if (keyId) {
    privateJWK.kid = keyId;
    publicJWK.kid = keyId;
  }

  return {
    privateKey: { ...privateJWK, alg: 'RS256', use: 'sig' },
    publicKey: { ...publicJWK, alg: 'RS256', use: 'sig' }
  };
}
