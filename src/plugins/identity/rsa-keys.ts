/**
 * RSA Key Management for OAuth2/OIDC
 *
 * Manages RS256 key pairs for signing and verifying JWTs
 * Zero external dependencies - uses Node.js crypto only
 */

import { generateKeyPairSync, createSign, createVerify, createHash, createPublicKey } from 'crypto';
import { PluginError } from '../../errors.js';

export interface KeyPairResult {
  publicKey: string;
  privateKey: string;
  kid: string;
  algorithm: string;
  use: string;
  createdAt: string;
}

export interface JWK {
  kty: string;
  use: string;
  alg: string;
  kid: string;
  n: string;
  e: string;
}

export interface JWKS {
  keys: JWK[];
}

export interface JWTHeader {
  alg: string;
  typ: string;
  kid: string;
}

export interface JWTPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  [key: string]: any;
}

export interface KeyRecord {
  id?: string;
  kid: string;
  publicKey: string;
  privateKey: string;
  algorithm?: string;
  use?: string;
  active: boolean;
  createdAt?: string;
  purpose?: string;
}

export interface KeyEntry {
  publicKey: string;
  privateKey: string;
  kid: string;
  createdAt?: string;
  active: boolean;
  purpose: string;
  id?: string;
}

export interface VerifyTokenResult {
  payload: JWTPayload;
  header: JWTHeader;
  kid: string;
}

interface KeyResource {
  list: () => Promise<KeyRecord[]>;
  query: (filter: Record<string, any>) => Promise<KeyRecord[]>;
  insert: (data: Record<string, any>) => Promise<KeyRecord>;
  update: (id: string, data: Record<string, any>) => Promise<KeyRecord>;
}

export function generateKeyPair(modulusLength: number = 2048): KeyPairResult {
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

export function pemToJwk(publicKeyPem: string, kid: string): JWK {
  const keyObject = createPublicKey(publicKeyPem);
  const exported = keyObject.export({ format: 'jwk' }) as { n: string; e: string };

  return {
    kty: 'RSA',
    use: 'sig',
    alg: 'RS256',
    kid,
    n: exported.n,
    e: exported.e
  };
}

export function createRS256Token(payload: JWTPayload, privateKey: string, kid: string, expiresIn: string = '15m'): string {
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
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const expiresInSeconds = parseInt(value!) * multipliers[unit!]!;

  const header: JWTHeader = {
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

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(data)).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${encodedHeader}.${encodedPayload}`);
  sign.end();

  const signature = sign.sign(privateKey, 'base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyRS256Token(token: string, publicKey: string): [boolean, JWTPayload | null, JWTHeader | null] {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return [false, null, null];
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    const verify = createVerify('RSA-SHA256');
    verify.update(`${encodedHeader}.${encodedPayload}`);
    verify.end();

    const isValid = verify.verify(publicKey, signature as string, 'base64url');

    const header = JSON.parse(Buffer.from(encodedHeader!, 'base64url').toString()) as JWTHeader;
    const payload = JSON.parse(Buffer.from(encodedPayload!, 'base64url').toString()) as JWTPayload;

    if (header.alg !== 'RS256') {
      return [false, null, header];
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return [false, payload, header];
    }

    return [isValid, payload, header];
  } catch {
    return [false, null, null];
  }
}

export function getKidFromToken(token: string): string | null {
  try {
    const [encodedHeader] = token.split('.');
    const header = JSON.parse(Buffer.from(encodedHeader!, 'base64url').toString()) as JWTHeader;
    return header.kid || null;
  } catch {
    return null;
  }
}

export class KeyManager {
  private keyResource: KeyResource;
  private keysByPurpose: Map<string, Map<string, KeyEntry>>;
  private currentKeys: Map<string, KeyEntry>;
  private keysByKid: Map<string, KeyEntry>;

  constructor(keyResource: KeyResource) {
    this.keyResource = keyResource;
    this.keysByPurpose = new Map();
    this.currentKeys = new Map();
    this.keysByKid = new Map();
  }

  async initialize(): Promise<void> {
    const existingKeys = await this.keyResource.list();

    if (existingKeys.length > 0) {
      for (const keyRecord of existingKeys) {
        this._storeKeyRecord({
          ...keyRecord,
          purpose: keyRecord.purpose || 'oauth'
        });
      }
    }

    if (!this.currentKeys.get('oauth')) {
      await this.rotateKey('oauth');
    }
  }

  async rotateKey(purpose: string = 'oauth'): Promise<KeyRecord> {
    const normalizedPurpose = this._normalizePurpose(purpose);
    const keyPair = generateKeyPair();

    const oldKeys = await this.keyResource.query({ active: true, purpose: normalizedPurpose });
    for (const oldKey of oldKeys) {
      await this.keyResource.update(oldKey.id!, { active: false });
      const stored = this.keysByKid.get(oldKey.kid);
      if (stored) {
        stored.active = false;
      }
    }

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

  getCurrentKey(purpose: string = 'oauth'): KeyEntry | null {
    return this.currentKeys.get(this._normalizePurpose(purpose)) || null;
  }

  async getKey(kid: string): Promise<KeyEntry | null> {
    const cached = this.keysByKid.get(kid);
    if (cached) {
      return cached;
    }

    if (this.keyResource) {
      const [found] = await this.keyResource.query({ kid });
      if (found) {
        this._storeKeyRecord(found);
        return this.keysByKid.get(kid) || null;
      }
    }

    return null;
  }

  async ensurePurpose(purpose: string = 'oauth'): Promise<KeyEntry> {
    const normalizedPurpose = this._normalizePurpose(purpose);
    const current = this.currentKeys.get(normalizedPurpose);

    if (current) {
      return current;
    }

    const [active] = await this.keyResource.query({ purpose: normalizedPurpose, active: true });
    if (active) {
      this._storeKeyRecord({
        ...active,
        purpose: active.purpose || normalizedPurpose
      });
      return this.currentKeys.get(normalizedPurpose)!;
    }

    const keyRecord = await this.rotateKey(normalizedPurpose);
    return this.currentKeys.get(normalizedPurpose)!;
  }

  async getJWKS(): Promise<JWKS> {
    const keys = Array.from(this.keysByKid.values())
      .filter(key => key.active)
      .map(key => {
        const jwk = pemToJwk(key.publicKey, key.kid);
        return {
          ...jwk,
          kty: 'RSA',
          use: 'sig',
          alg: 'RS256',
          kid: key.kid
        };
      });

    return { keys };
  }

  createToken(payload: JWTPayload, expiresIn: string = '15m', purpose: string = 'oauth'): string {
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

  async verifyToken(token: string): Promise<VerifyTokenResult | null> {
    const kid = getKidFromToken(token);

    if (!kid) {
      return null;
    }

    const key = await this.getKey(kid);

    if (!key) {
      return null;
    }

    const [valid, payload, header] = verifyRS256Token(token, key.publicKey);

    if (!valid || !payload) {
      return null;
    }

    return { payload, header: header!, kid };
  }

  private _normalizePurpose(purpose: string): string {
    return typeof purpose === 'string' && purpose.trim().length > 0
      ? purpose.trim()
      : 'oauth';
  }

  private _storeKeyRecord(record: KeyRecord): void {
    const purpose = this._normalizePurpose(record.purpose || 'oauth');
    const entry: KeyEntry = {
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

    this.keysByPurpose.get(purpose)!.set(entry.kid, entry);
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
