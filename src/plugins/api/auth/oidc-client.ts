/**
 * OIDC Client Middleware for Resource Servers
 *
 * Validates RS256 JWT tokens issued by an OAuth2/OIDC Authorization Server.
 * Fetches and caches JWKS (public keys) from the issuer's /.well-known/jwks.json endpoint.
 *
 * @example
 * import { OIDCClient } from 's3db.js/plugins/api/auth/oidc-client';
 *
 * const oidcClient = new OIDCClient({
 *   issuer: 'https://sso.example.com',
 *   audience: 'https://api.example.com',
 *   jwksCacheTTL: 3600000 // 1 hour
 * });
 *
 * await oidcClient.initialize();
 *
 * // Use with API plugin
 * apiPlugin.addAuthDriver('oidc', oidcClient.middleware.bind(oidcClient));
 *
 * // Or use directly in routes
 * apiPlugin.addRoute({
 *   path: '/protected',
 *   method: 'GET',
 *   handler: async (req, res) => {
 *     // req.user contains validated token payload
 *     res.json({ user: req.user });
 *   },
 *   auth: 'oidc'
 * });
 */

import { createVerify, createPublicKey } from 'crypto';
import { getCronManager, type CronManager } from '../../../concerns/cron-manager.js';
import { createLogger, type Logger } from '../../../concerns/logger.js';
import { createHttpClient, type HttpClient } from '../../../concerns/http-client.js';

export interface ClaimsValidationOptions {
  issuer?: string;
  audience?: string;
  clockTolerance?: number;
}

export interface ClaimsValidationResult {
  valid: boolean;
  error: string | null;
}

export interface TokenPayload {
  sub?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
  nbf?: number;
  [key: string]: unknown;
}

/**
 * Validate JWT claims
 */
function validateClaims(payload: TokenPayload, options: ClaimsValidationOptions = {}): ClaimsValidationResult {
  const {
    issuer,
    audience,
    clockTolerance = 60
  } = options;

  const now = Math.floor(Date.now() / 1000);

  if (!payload.sub) {
    return { valid: false, error: 'Missing required claim: sub' };
  }

  if (!payload.iat) {
    return { valid: false, error: 'Missing required claim: iat' };
  }

  if (!payload.exp) {
    return { valid: false, error: 'Missing required claim: exp' };
  }

  if (issuer && payload.iss !== issuer) {
    return {
      valid: false,
      error: `Invalid issuer. Expected: ${issuer}, Got: ${payload.iss}`
    };
  }

  if (audience) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

    if (!audiences.includes(audience)) {
      return {
        valid: false,
        error: `Invalid audience. Expected: ${audience}, Got: ${audiences.join(', ')}`
      };
    }
  }

  if (payload.exp < (now - clockTolerance)) {
    return { valid: false, error: 'Token has expired' };
  }

  if (payload.nbf && payload.nbf > (now + clockTolerance)) {
    return { valid: false, error: 'Token not yet valid (nbf)' };
  }

  if (payload.iat > (now + clockTolerance)) {
    return { valid: false, error: 'Token issued in the future' };
  }

  return { valid: true, error: null };
}

export interface JWK {
  kty: string;
  use?: string;
  kid?: string;
  n?: string;
  e?: string;
  alg?: string;
  [key: string]: unknown;
}

export interface JWKS {
  keys: JWK[];
}

export interface DiscoveryDocument {
  issuer?: string;
  jwks_uri?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  introspection_endpoint?: string;
  userinfo_endpoint?: string;
  [key: string]: unknown;
}

export interface OIDCClientOptions {
  issuer: string;
  audience?: string;
  jwksUri?: string;
  jwksCacheTTL?: number;
  clockTolerance?: number;
  autoRefreshJWKS?: boolean;
  discoveryUri?: string;
  logLevel?: string;
  logger?: Logger;
}

export interface TokenVerificationResult {
  valid: boolean;
  error?: string;
  header?: Record<string, unknown>;
  payload?: TokenPayload;
}

export interface IntrospectionResult {
  active: boolean;
  [key: string]: unknown;
}

export interface ExpressRequest {
  headers: {
    authorization?: string;
    [key: string]: string | string[] | undefined;
  };
  user?: TokenPayload;
  token?: string;
}

export interface ExpressResponse {
  status(code: number): ExpressResponse;
  json(data: unknown): void;
}

export type NextFunction = () => void;

/**
 * OIDC Client for validating tokens from Authorization Server
 */
export class OIDCClient {
  private issuer: string;
  private audience?: string;
  private jwksUri: string;
  private discoveryUri: string;
  private jwksCacheTTL: number;
  private clockTolerance: number;
  private autoRefreshJWKS: boolean;
  private logger: Logger;
  private jwksCache: JWKS | null = null;
  private jwksCacheExpiry: number | null = null;
  private discoveryCache: DiscoveryDocument | null = null;
  private keys: Map<string, string> = new Map();
  private cronManager: CronManager;
  private refreshJobName: string | null = null;
  private logLevel: string;
  private _httpClient: HttpClient | null = null;

  constructor(options: OIDCClientOptions) {
    const {
      issuer,
      audience,
      jwksUri,
      jwksCacheTTL = 3600000,
      clockTolerance = 60,
      autoRefreshJWKS = true,
      discoveryUri,
      logger: customLogger
    } = options;

    if (!issuer) {
      throw new Error('issuer is required for OIDCClient');
    }

    this.issuer = issuer.replace(/\/$/, '');
    this.audience = audience;
    this.jwksUri = jwksUri || `${this.issuer}/.well-known/jwks.json`;
    this.discoveryUri = discoveryUri || `${this.issuer}/.well-known/openid-configuration`;
    this.jwksCacheTTL = jwksCacheTTL;
    this.clockTolerance = clockTolerance;
    this.autoRefreshJWKS = autoRefreshJWKS;

    if (customLogger) {
      this.logger = customLogger;
    } else {
      this.logger = createLogger({ name: 'OIDCClient', level: 'info' });
    }

    this.cronManager = getCronManager();
    this.logLevel = 'info';
  }

  /**
   * Get or create HTTP client
   */
  private async _getHttpClient(): Promise<HttpClient> {
    if (!this._httpClient) {
      this._httpClient = await createHttpClient({
        timeout: 10000,
        retry: {
          maxAttempts: 3,
          delay: 1000,
          backoff: 'exponential',
          retryAfter: true,
          retryOn: [429, 500, 502, 503, 504]
        }
      });
    }
    return this._httpClient;
  }

  /**
   * Initialize OIDC client - fetch discovery document and JWKS
   */
  async initialize(): Promise<void> {
    await this.fetchDiscovery();
    await this.fetchJWKS();

    if (this.autoRefreshJWKS) {
      this.startJWKSRefresh();
    }
  }

  /**
   * Fetch OIDC discovery document
   */
  async fetchDiscovery(): Promise<DiscoveryDocument> {
    try {
      const client = await this._getHttpClient();
      const response = await client.get(this.discoveryUri);

      if (!response.ok) {
        throw new Error(`Failed to fetch discovery document: ${response.status}`);
      }

      this.discoveryCache = await response.json() as DiscoveryDocument;

      if (this.discoveryCache.jwks_uri) {
        this.jwksUri = this.discoveryCache.jwks_uri;
      }

      return this.discoveryCache;
    } catch (error) {
      throw new Error(`Failed to fetch OIDC discovery: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch JWKS from issuer
   */
  async fetchJWKS(force: boolean = false): Promise<JWKS> {
    const now = Date.now();

    if (!force && this.jwksCache && this.jwksCacheExpiry && this.jwksCacheExpiry > now) {
      return this.jwksCache;
    }

    try {
      const client = await this._getHttpClient();
      const response = await client.get(this.jwksUri);

      if (!response.ok) {
        throw new Error(`Failed to fetch JWKS: ${response.status}`);
      }

      const jwks = await response.json() as JWKS;

      for (const jwk of jwks.keys) {
        if (jwk.kty === 'RSA' && jwk.use === 'sig' && jwk.kid) {
          const publicKey = this.jwkToPem(jwk);
          this.keys.set(jwk.kid, publicKey);
        }
      }

      this.jwksCache = jwks;
      this.jwksCacheExpiry = now + this.jwksCacheTTL;

      return jwks;
    } catch (error) {
      throw new Error(`Failed to fetch JWKS: ${(error as Error).message}`);
    }
  }

  /**
   * Convert JWK to PEM format
   */
  jwkToPem(jwk: JWK): string {
    try {
      const keyObject = createPublicKey({
        key: jwk as unknown as JsonWebKey,
        format: 'jwk'
      } as Parameters<typeof createPublicKey>[0]);

      return keyObject.export({
        type: 'spki',
        format: 'pem'
      }) as string;
    } catch (error) {
      throw new Error(`Failed to convert JWK to PEM: ${(error as Error).message}`);
    }
  }

  /**
   * Get public key by kid
   */
  async getPublicKey(kid: string): Promise<string | undefined> {
    let publicKey = this.keys.get(kid);

    if (!publicKey) {
      await this.fetchJWKS(true);
      publicKey = this.keys.get(kid);
    }

    return publicKey;
  }

  /**
   * Verify RS256 JWT token
   */
  async verifyToken(token: string): Promise<TokenVerificationResult> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [encodedHeader, encodedPayload, signature] = parts;

      const header = JSON.parse(Buffer.from(encodedHeader!, 'base64url').toString()) as { alg: string; kid?: string };

      if (header.alg !== 'RS256') {
        return { valid: false, error: `Unsupported algorithm: ${header.alg}` };
      }

      const publicKey = await this.getPublicKey(header.kid || '');

      if (!publicKey) {
        return { valid: false, error: `Public key not found for kid: ${header.kid}` };
      }

      const verify = createVerify('RSA-SHA256');
      verify.update(`${encodedHeader}.${encodedPayload}`);
      verify.end();

      const isValid = verify.verify(publicKey!, signature!, 'base64url');

      if (!isValid) {
        return { valid: false, error: 'Invalid signature' };
      }

      const payload = JSON.parse(Buffer.from(encodedPayload!, 'base64url').toString()) as TokenPayload;

      const claimValidation = validateClaims(payload, {
        issuer: this.issuer,
        audience: this.audience,
        clockTolerance: this.clockTolerance
      });

      if (!claimValidation.valid) {
        return { valid: false, error: claimValidation.error || undefined };
      }

      return {
        valid: true,
        header,
        payload
      };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  /**
   * Express middleware for OIDC authentication
   */
  async middleware(req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.status(401).json({
          error: 'unauthorized',
          error_description: 'Missing Authorization header'
        });
        return;
      }

      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'unauthorized',
          error_description: 'Invalid Authorization header format. Expected: Bearer <token>'
        });
        return;
      }

      const token = authHeader.substring(7);

      if (!token) {
        res.status(401).json({
          error: 'unauthorized',
          error_description: 'Missing token'
        });
        return;
      }

      const verification = await this.verifyToken(token);

      if (!verification.valid) {
        res.status(401).json({
          error: 'invalid_token',
          error_description: verification.error
        });
        return;
      }

      req.user = verification.payload;
      req.token = token;

      next();
    } catch (error) {
      res.status(500).json({
        error: 'server_error',
        error_description: (error as Error).message
      });
    }
  }

  /**
   * Start auto-refresh of JWKS
   */
  startJWKSRefresh(): void {
    const refreshInterval = Math.floor(this.jwksCacheTTL / 2);

    this.refreshJobName = `oidc-jwks-refresh-${Date.now()}`;
    this.cronManager.scheduleInterval(
      refreshInterval,
      async () => {
        try {
          await this.fetchJWKS(true);
        } catch (error) {
          this.logger.error({ error: (error as Error).message, stack: (error as Error).stack }, 'Failed to refresh JWKS');
        }
      },
      this.refreshJobName
    );
  }

  /**
   * Stop auto-refresh of JWKS
   */
  stopJWKSRefresh(): void {
    if (this.refreshJobName) {
      this.cronManager.stop(this.refreshJobName);
      this.refreshJobName = null;
    }
  }

  /**
   * Introspect token via Authorization Server (RFC 7662)
   */
  async introspectToken(token: string, clientId: string, clientSecret: string): Promise<IntrospectionResult> {
    if (!this.discoveryCache || !this.discoveryCache.introspection_endpoint) {
      throw new Error('Introspection endpoint not available');
    }

    try {
      const client = await this._getHttpClient();
      const response = await client.post(this.discoveryCache.introspection_endpoint, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({ token }).toString()
      });

      if (!response.ok) {
        throw new Error(`Introspection failed: ${response.status}`);
      }

      return await response.json() as IntrospectionResult;
    } catch (error) {
      throw new Error(`Token introspection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get discovery document
   */
  getDiscovery(): DiscoveryDocument | null {
    return this.discoveryCache;
  }

  /**
   * Get cached JWKS
   */
  getJWKS(): JWKS | null {
    return this.jwksCache;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopJWKSRefresh();
    this.keys.clear();
    this.jwksCache = null;
    this.discoveryCache = null;
  }
}

export interface OIDCMiddleware {
  (req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void>;
  client: OIDCClient;
  destroy: () => void;
}

/**
 * Create OIDC middleware factory for easy integration
 */
export function createOIDCMiddleware(options: OIDCClientOptions): OIDCMiddleware {
  const client = new OIDCClient(options);

  let initialized = false;

  const middleware = async (req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void> => {
    if (!initialized) {
      await client.initialize();
      initialized = true;
    }

    return client.middleware(req, res, next);
  };

  (middleware as OIDCMiddleware).client = client;
  (middleware as OIDCMiddleware).destroy = () => client.destroy();

  return middleware as OIDCMiddleware;
}

export default {
  OIDCClient,
  createOIDCMiddleware
};
