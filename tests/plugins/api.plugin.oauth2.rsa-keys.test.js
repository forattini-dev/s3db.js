/**
 * RSA Keys Unit Tests
 *
 * Testa geração de chaves, assinatura e verificação de tokens RS256
 */

import {
  generateKeyPair,
  pemToJwk,
  createRS256Token,
  verifyRS256Token,
  getKidFromToken,
  KeyManager
} from '../../src/plugins/api/auth/rsa-keys.js';
import Database from '../../src/database.class.js';

describe('RSA Keys - Unit Tests', () => {
  describe('generateKeyPair()', () => {
    test('generates valid RSA key pair with default length', () => {
      const keyPair = generateKeyPair();

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.kid).toBeDefined();
      expect(keyPair.algorithm).toBe('RS256');
      expect(keyPair.use).toBe('sig');
      expect(keyPair.createdAt).toBeDefined();

      // Verify PEM format
      expect(keyPair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keyPair.privateKey).toContain('-----BEGIN PRIVATE KEY-----');

      // Verify kid is 16 chars (SHA256 hash truncated)
      expect(keyPair.kid.length).toBe(16);
    });

    test('generates key pair with custom modulus length', () => {
      const keyPair = generateKeyPair(4096);

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey.length).toBeGreaterThan(500); // 4096-bit keys are larger
    });

    test('generates different kids for different keys', () => {
      const key1 = generateKeyPair();
      const key2 = generateKeyPair();

      expect(key1.kid).not.toBe(key2.kid);
    });
  });

  describe('pemToJwk()', () => {
    test('converts PEM public key to JWK format', () => {
      const keyPair = generateKeyPair();
      const jwk = pemToJwk(keyPair.publicKey, keyPair.kid);

      expect(jwk.kty).toBe('RSA');
      expect(jwk.use).toBe('sig');
      expect(jwk.alg).toBe('RS256');
      expect(jwk.kid).toBe(keyPair.kid);
      expect(jwk.n).toBeDefined(); // modulus
      expect(jwk.e).toBeDefined(); // exponent
    });
  });

  describe('createRS256Token()', () => {
    let keyPair;

    beforeAll(() => {
      keyPair = generateKeyPair();
    });

    test('creates valid JWT with default expiration (15m)', () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com'
      };

      const token = createRS256Token(payload, keyPair.privateKey, keyPair.kid);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Verify JWT structure (header.payload.signature)
      const parts = token.split('.');
      expect(parts.length).toBe(3);

      // Decode and verify header
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.alg).toBe('RS256');
      expect(header.typ).toBe('JWT');
      expect(header.kid).toBe(keyPair.kid);

      // Decode and verify payload
      const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(decodedPayload.sub).toBe('user-123');
      expect(decodedPayload.email).toBe('test@example.com');
      expect(decodedPayload.iat).toBeDefined();
      expect(decodedPayload.exp).toBeDefined();
      expect(decodedPayload.exp).toBeGreaterThan(decodedPayload.iat);
    });

    test('creates token with custom expiration', () => {
      const token = createRS256Token({ sub: 'user-123' }, keyPair.privateKey, keyPair.kid, '30m');
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

      const expectedExp = payload.iat + (30 * 60); // 30 minutes
      expect(payload.exp).toBe(expectedExp);
    });

    test('supports various expiration formats', () => {
      const formats = ['60s', '15m', '2h', '7d'];

      for (const format of formats) {
        const token = createRS256Token({ sub: 'user-123' }, keyPair.privateKey, keyPair.kid, format);
        expect(token).toBeDefined();

        const parts = token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        expect(payload.exp).toBeGreaterThan(payload.iat);
      }
    });

    test('throws error on invalid expiration format', () => {
      expect(() => {
        createRS256Token({ sub: 'user-123' }, keyPair.privateKey, keyPair.kid, 'invalid');
      }).toThrow('Invalid expiresIn format');
    });
  });

  describe('verifyRS256Token()', () => {
    let keyPair;
    let validToken;

    beforeAll(() => {
      keyPair = generateKeyPair();
      validToken = createRS256Token(
        { sub: 'user-123', email: 'test@example.com' },
        keyPair.privateKey,
        keyPair.kid,
        '15m'
      );
    });

    test('verifies valid token successfully', () => {
      const result = verifyRS256Token(validToken, keyPair.publicKey);

      expect(result).not.toBeNull();
      expect(result.header).toBeDefined();
      expect(result.payload).toBeDefined();
      expect(result.header.alg).toBe('RS256');
      expect(result.payload.sub).toBe('user-123');
      expect(result.payload.email).toBe('test@example.com');
    });

    test('rejects token with invalid signature', () => {
      const parts = validToken.split('.');
      parts[2] = 'invalid-signature';
      const tamperedToken = parts.join('.');

      const result = verifyRS256Token(tamperedToken, keyPair.publicKey);
      expect(result).toBeNull();
    });

    test('rejects token with wrong public key', () => {
      const anotherKeyPair = generateKeyPair();
      const result = verifyRS256Token(validToken, anotherKeyPair.publicKey);
      expect(result).toBeNull();
    });

    test('rejects token with tampered payload', () => {
      const parts = validToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      payload.sub = 'hacker-456';
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = parts.join('.');

      const result = verifyRS256Token(tamperedToken, keyPair.publicKey);
      expect(result).toBeNull();
    });

    test('rejects expired token', async () => {
      // Create token that expired in the past
      const now = Math.floor(Date.now() / 1000);
      const header = { alg: 'RS256', typ: 'JWT', kid: keyPair.kid };
      const payload = {
        sub: 'user-123',
        iat: now - 1000, // Issued 1000 seconds ago
        exp: now - 500   // Expired 500 seconds ago
      };

      const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

      const { createSign } = await import('crypto');
      const sign = createSign('RSA-SHA256');
      sign.update(`${encodedHeader}.${encodedPayload}`);
      sign.end();
      const signature = sign.sign(keyPair.privateKey, 'base64url');

      const expiredToken = `${encodedHeader}.${encodedPayload}.${signature}`;

      const result = verifyRS256Token(expiredToken, keyPair.publicKey);
      expect(result).toBeNull();
    });

    test('rejects malformed token', () => {
      expect(verifyRS256Token('invalid', keyPair.publicKey)).toBeNull();
      expect(verifyRS256Token('invalid.token', keyPair.publicKey)).toBeNull();
      expect(verifyRS256Token('', keyPair.publicKey)).toBeNull();
    });

    test('rejects token with wrong algorithm', () => {
      const parts = validToken.split('.');
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      header.alg = 'HS256';
      parts[0] = Buffer.from(JSON.stringify(header)).toString('base64url');
      const wrongAlgToken = parts.join('.');

      const result = verifyRS256Token(wrongAlgToken, keyPair.publicKey);
      expect(result).toBeNull();
    });
  });

  describe('getKidFromToken()', () => {
    test('extracts kid from valid token', () => {
      const keyPair = generateKeyPair();
      const token = createRS256Token({ sub: 'user-123' }, keyPair.privateKey, keyPair.kid);

      const kid = getKidFromToken(token);
      expect(kid).toBe(keyPair.kid);
    });

    test('returns null for token without kid', () => {
      // Create token without kid
      const keyPair = generateKeyPair();
      const header = { alg: 'RS256', typ: 'JWT' };
      const payload = { sub: 'user-123', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 };

      const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const fakeToken = `${encodedHeader}.${encodedPayload}.fake-signature`;

      const kid = getKidFromToken(fakeToken);
      expect(kid).toBeNull();
    });

    test('returns null for malformed token', () => {
      expect(getKidFromToken('invalid')).toBeNull();
      expect(getKidFromToken('invalid.token')).toBeNull();
    });
  });

  describe('KeyManager', () => {
    let db, keyResource, keyManager;

    beforeAll(async () => {
      const { MemoryClient } = await import('../../src/clients/memory-client.class.js');

      db = new Database({
        client: new MemoryClient(),
        bucketName: 'rsa-keys-test',
        encryptionKey: 'test-key'
      });

      await db.connect();

      keyResource = await db.createResource({
        name: 'oauth_keys',
        attributes: {
          kid: 'string|required',
          publicKey: 'string|required',
          privateKey: 'secret|required',
          algorithm: 'string',
          use: 'string',
          active: 'boolean',
          createdAt: 'string'
        }
      });
    });

    afterAll(async () => {
      await db.disconnect();
    });

    beforeEach(async () => {
      // Clear keys before each test
      const allKeys = await keyResource.list();
      for (const key of allKeys) {
        await keyResource.delete(key.id);
      }

      keyManager = new KeyManager(keyResource);
    });

    test('initialize() generates new key if none exist', async () => {
      await keyManager.initialize();

      expect(keyManager.currentKey).not.toBeNull();
      expect(keyManager.currentKey.kid).toBeDefined();
      expect(keyManager.currentKey.active).toBe(true);

      const keys = await keyResource.list();
      expect(keys.length).toBe(1);
    });

    test('initialize() loads existing keys', async () => {
      // Create a key manually
      const keyPair = generateKeyPair();
      await keyResource.insert({
        ...keyPair,
        active: true
      });

      await keyManager.initialize();

      expect(keyManager.currentKey).not.toBeNull();
      expect(keyManager.currentKey.kid).toBe(keyPair.kid);
    });

    test('rotateKey() creates new key and marks old as inactive', async () => {
      await keyManager.initialize();
      const oldKid = keyManager.currentKey.kid;

      await keyManager.rotateKey();

      expect(keyManager.currentKey.kid).not.toBe(oldKid);
      expect(keyManager.currentKey.active).toBe(true);

      // Check old key is inactive
      const oldKey = await keyResource.get(keyManager.currentKey.id);
      expect(keyManager.currentKey.active).toBe(true);

      const allKeys = await keyResource.list();
      expect(allKeys.length).toBe(2);

      const activeKeys = allKeys.filter(k => k.active);
      expect(activeKeys.length).toBe(1);
      expect(activeKeys[0].kid).toBe(keyManager.currentKey.kid);
    });

    test('getCurrentKey() returns current active key', async () => {
      await keyManager.initialize();

      const currentKey = keyManager.getCurrentKey();
      expect(currentKey).not.toBeNull();
      expect(currentKey.active).toBe(true);
    });

    test('getKey(kid) returns specific key', async () => {
      await keyManager.initialize();
      const kid = keyManager.currentKey.kid;

      const key = keyManager.getKey(kid);
      expect(key).not.toBeNull();
      expect(key.kid).toBe(kid);
    });

    test('getJWKS() returns all keys in JWKS format', async () => {
      await keyManager.initialize();

      const jwks = await keyManager.getJWKS();
      expect(jwks.keys).toBeDefined();
      expect(Array.isArray(jwks.keys)).toBe(true);
      expect(jwks.keys.length).toBeGreaterThan(0);

      const key = jwks.keys[0];
      expect(key.kty).toBe('RSA');
      expect(key.use).toBe('sig');
      expect(key.alg).toBe('RS256');
      expect(key.kid).toBeDefined();
    });

    test('createToken() creates valid JWT with current key', async () => {
      await keyManager.initialize();

      const token = keyManager.createToken({ sub: 'user-123' }, '15m');
      expect(token).toBeDefined();

      const parts = token.split('.');
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.kid).toBe(keyManager.currentKey.kid);
    });

    test('verifyToken() verifies JWT with correct key', async () => {
      await keyManager.initialize();

      const token = keyManager.createToken({ sub: 'user-123' }, '15m');
      const result = await keyManager.verifyToken(token);

      expect(result).not.toBeNull();
      expect(result.payload.sub).toBe('user-123');
    });

    test('verifyToken() returns null for invalid token', async () => {
      await keyManager.initialize();

      const result = await keyManager.verifyToken('invalid.token.here');
      expect(result).toBeNull();
    });

    test('verifyToken() works after key rotation', async () => {
      await keyManager.initialize();

      // Create token with first key
      const token1 = keyManager.createToken({ sub: 'user-123' }, '15m');

      // Rotate key
      await keyManager.rotateKey();

      // Old token should still verify (old key still in cache)
      const result1 = await keyManager.verifyToken(token1);
      expect(result1).not.toBeNull();

      // New token with new key
      const token2 = keyManager.createToken({ sub: 'user-456' }, '15m');
      const result2 = await keyManager.verifyToken(token2);
      expect(result2).not.toBeNull();
    });
  });
});
