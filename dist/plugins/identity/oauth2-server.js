/**
 * OAuth2/OIDC Authorization Server
 *
 * Provides endpoints for OAuth2 + OpenID Connect flows:
 * - /.well-known/openid-configuration (Discovery)
 * - /.well-known/jwks.json (Public keys)
 * - /auth/token (Token endpoint)
 * - /auth/userinfo (User info endpoint)
 * - /auth/introspect (Token introspection)
 */
import { KeyManager, verifyRS256Token } from './rsa-keys.js';
import { generateDiscoveryDocument, validateClaims, extractUserClaims, parseScopes, validateScopes, generateAuthCode, generateClientId, generateClientSecret } from './oidc-discovery.js';
import { tryFn } from '../../concerns/try-fn.js';
import { verifyPassword } from './concerns/password.js';
import { PluginError } from '../../errors.js';
function constantTimeEqual(a, b) {
    const valueA = Buffer.from(String(a ?? ''), 'utf8');
    const valueB = Buffer.from(String(b ?? ''), 'utf8');
    if (valueA.length !== valueB.length) {
        return false;
    }
    let mismatch = 0;
    for (let i = 0; i < valueA.length; i += 1) {
        mismatch |= valueA[i] ^ valueB[i];
    }
    return mismatch === 0;
}
export class OAuth2Server {
    issuer;
    keyResource;
    userResource;
    clientResource;
    authCodeResource;
    supportedScopes;
    supportedGrantTypes;
    supportedResponseTypes;
    accessTokenExpiry;
    idTokenExpiry;
    refreshTokenExpiry;
    authCodeExpiry;
    keyManager;
    identityPlugin;
    logger;
    constructor(options) {
        const { issuer, keyResource, userResource, clientResource, authCodeResource, supportedScopes = ['openid', 'profile', 'email', 'offline_access'], supportedGrantTypes = ['authorization_code', 'client_credentials', 'refresh_token', 'password'], supportedResponseTypes = ['code', 'token', 'id_token'], accessTokenExpiry = '15m', idTokenExpiry = '15m', refreshTokenExpiry = '7d', authCodeExpiry = '10m' } = options;
        if (!issuer) {
            throw new PluginError('Issuer URL is required for OAuth2Server', {
                pluginName: 'IdentityPlugin',
                operation: 'OAuth2Server.constructor',
                statusCode: 400,
                retriable: false,
                suggestion: 'Pass { issuer: "https://auth.example.com" } when initializing OAuth2Server.'
            });
        }
        if (!keyResource) {
            throw new PluginError('keyResource is required for OAuth2Server', {
                pluginName: 'IdentityPlugin',
                operation: 'OAuth2Server.constructor',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide a keyResource (S3DB resource) to store signing keys.'
            });
        }
        if (!userResource) {
            throw new PluginError('userResource is required for OAuth2Server', {
                pluginName: 'IdentityPlugin',
                operation: 'OAuth2Server.constructor',
                statusCode: 400,
                retriable: false,
                suggestion: 'Provide a userResource to look up user accounts during token exchange.'
            });
        }
        this.issuer = issuer.replace(/\/$/, '');
        this.keyResource = keyResource;
        this.userResource = userResource;
        this.clientResource = clientResource;
        this.authCodeResource = authCodeResource;
        this.supportedScopes = supportedScopes;
        this.supportedGrantTypes = supportedGrantTypes;
        this.supportedResponseTypes = supportedResponseTypes;
        this.accessTokenExpiry = accessTokenExpiry;
        this.idTokenExpiry = idTokenExpiry;
        this.refreshTokenExpiry = refreshTokenExpiry;
        this.authCodeExpiry = authCodeExpiry;
        this.keyManager = new KeyManager(keyResource);
        this.identityPlugin = null;
        this.logger = console;
    }
    async initialize() {
        await this.keyManager.initialize();
    }
    setIdentityPlugin(identityPlugin) {
        this.identityPlugin = identityPlugin;
    }
    async discoveryHandler(_req, res) {
        try {
            const document = generateDiscoveryDocument({
                issuer: this.issuer,
                grantTypes: this.supportedGrantTypes,
                responseTypes: this.supportedResponseTypes,
                scopes: this.supportedScopes
            });
            return res.status(200).json(document);
        }
        catch (error) {
            return res.status(500).json({
                error: 'server_error',
                error_description: error.message
            });
        }
    }
    async jwksHandler(_req, res) {
        try {
            const jwks = await this.keyManager.getJWKS();
            return res.status(200).json(jwks);
        }
        catch (error) {
            return res.status(500).json({
                error: 'server_error',
                error_description: error.message
            });
        }
    }
    async tokenHandler(req, res) {
        try {
            const { grant_type, scope, client_id, client_secret } = req.body;
            if (!grant_type) {
                return res.status(400).json({
                    error: 'invalid_request',
                    error_description: 'grant_type is required'
                });
            }
            if (!this.supportedGrantTypes.includes(grant_type)) {
                return res.status(400).json({
                    error: 'unsupported_grant_type',
                    error_description: `Grant type ${grant_type} is not supported`
                });
            }
            if (!client_id) {
                return res.status(400).json({
                    error: 'invalid_request',
                    error_description: 'client_id is required'
                });
            }
            let authenticatedClient = null;
            if (this.clientResource) {
                authenticatedClient = await this.authenticateClient(client_id, client_secret);
                if (!authenticatedClient) {
                    return res.status(401).json({
                        error: 'invalid_client',
                        error_description: 'Client authentication failed'
                    });
                }
            }
            else if (client_id) {
                authenticatedClient = { clientId: client_id };
            }
            req.authenticatedClient = authenticatedClient;
            switch (grant_type) {
                case 'client_credentials':
                    return await this.handleClientCredentials(req, res, {
                        client: authenticatedClient,
                        client_id,
                        scope
                    });
                case 'authorization_code':
                    return await this.handleAuthorizationCode(req, res);
                case 'refresh_token':
                    return await this.handleRefreshToken(req, res, {
                        client: authenticatedClient,
                        scope
                    });
                case 'password':
                    return await this.handlePasswordGrant(req, res, {
                        client: authenticatedClient,
                        scope
                    });
                default:
                    return res.status(400).json({
                        error: 'unsupported_grant_type',
                        error_description: `Grant type ${grant_type} is not supported`
                    });
            }
        }
        catch (error) {
            return res.status(500).json({
                error: 'server_error',
                error_description: error.message
            });
        }
    }
    async handleClientCredentials(_req, res, context = {}) {
        const resolvedClient = context.client || (context.client_id ? { clientId: context.client_id } : null);
        const resolvedClientId = resolvedClient?.clientId || context.client_id;
        if (!resolvedClientId) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'client_id is required'
            });
        }
        const allowedGrantTypes = Array.isArray(resolvedClient?.grantTypes)
            ? resolvedClient.grantTypes
            : Array.isArray(resolvedClient?.allowedGrantTypes)
                ? resolvedClient.allowedGrantTypes
                : null;
        if (allowedGrantTypes && allowedGrantTypes.length > 0 && !allowedGrantTypes.includes('client_credentials')) {
            return res.status(400).json({
                error: 'unauthorized_client',
                error_description: 'Client is not allowed to use client_credentials grant'
            });
        }
        const scopes = parseScopes(context.scope);
        const scopeValidation = validateScopes(scopes, this.supportedScopes);
        if (!scopeValidation.valid) {
            return res.status(400).json({
                error: 'invalid_scope',
                error_description: scopeValidation.error
            });
        }
        const clientRecord = resolvedClient;
        if (Array.isArray(clientRecord?.allowedScopes) && clientRecord.allowedScopes.length > 0) {
            const disallowedScopes = scopeValidation.scopes.filter(scopeValue => !clientRecord.allowedScopes.includes(scopeValue));
            if (disallowedScopes.length > 0) {
                return res.status(400).json({
                    error: 'invalid_scope',
                    error_description: `Client is not allowed to request scopes: ${disallowedScopes.join(', ')}`
                });
            }
        }
        const serviceAccount = this._buildServiceAccountContext(clientRecord, scopeValidation.scopes);
        const audienceClaim = this._formatAudienceClaim(serviceAccount.audiences);
        const accessToken = this.keyManager.createToken({
            iss: this.issuer,
            sub: `sa:${resolvedClientId}`,
            aud: audienceClaim,
            scope: scopeValidation.scopes.join(' '),
            token_type: 'access_token',
            token_use: 'service',
            client_id: resolvedClientId,
            service_account: serviceAccount
        }, this.accessTokenExpiry);
        return res.status(200).json({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: this.parseExpiryToSeconds(this.accessTokenExpiry),
            scope: scopeValidation.scopes.join(' ')
        });
    }
    async handleAuthorizationCode(req, res) {
        if (!this.authCodeResource) {
            return res.status(400).json({
                error: 'unsupported_grant_type',
                error_description: 'Authorization code flow requires authCodeResource'
            });
        }
        const { code, redirect_uri, code_verifier } = req.body;
        if (!code) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'code is required'
            });
        }
        const authCodes = await this.authCodeResource.query({ code });
        if (authCodes.length === 0) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Invalid authorization code'
            });
        }
        const authCode = authCodes[0];
        const expiresAtMs = this.parseAuthCodeExpiry(authCode.expiresAt);
        if (!Number.isFinite(expiresAtMs)) {
            await this.authCodeResource.delete(authCode.id);
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Authorization code is invalid'
            });
        }
        if (expiresAtMs <= Date.now()) {
            await this.authCodeResource.delete(authCode.id);
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Authorization code has expired'
            });
        }
        if (authCode.redirectUri !== redirect_uri) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'redirect_uri mismatch'
            });
        }
        if (authCode.codeChallenge) {
            if (!code_verifier) {
                return res.status(400).json({
                    error: 'invalid_request',
                    error_description: 'code_verifier is required'
                });
            }
            const isValid = await this.validatePKCE(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod);
            if (!isValid) {
                return res.status(400).json({
                    error: 'invalid_grant',
                    error_description: 'Invalid code_verifier'
                });
            }
        }
        const user = await this.userResource.get(authCode.userId);
        if (!user) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'User not found'
            });
        }
        const scopes = parseScopes(authCode.scope);
        const userContext = this._buildUserContext(user);
        const accessToken = this.keyManager.createToken({
            iss: this.issuer,
            sub: user.id,
            aud: authCode.audience || this.issuer,
            scope: scopes.join(' '),
            token_type: 'access_token',
            token_use: 'user',
            client_id: authCode.clientId,
            email: user.email,
            tenantId: user.tenantId,
            user: userContext
        }, this.accessTokenExpiry);
        const response = {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: this.parseExpiryToSeconds(this.accessTokenExpiry)
        };
        if (scopes.includes('openid')) {
            const userClaims = extractUserClaims(user, scopes);
            const idToken = this.keyManager.createToken({
                iss: this.issuer,
                aud: authCode.clientId,
                nonce: authCode.nonce,
                ...userClaims,
                sub: user.id
            }, this.idTokenExpiry);
            response.id_token = idToken;
        }
        if (scopes.includes('offline_access')) {
            const refreshToken = this.keyManager.createToken({
                iss: this.issuer,
                sub: user.id,
                aud: authCode.clientId || this.issuer,
                scope: scopes.join(' '),
                token_type: 'refresh_token',
                token_use: 'refresh',
                client_id: authCode.clientId,
                tenant_id: user.tenantId
            }, this.refreshTokenExpiry);
            response.refresh_token = refreshToken;
        }
        await this.authCodeResource.delete(authCode.id);
        return res.status(200).json(response);
    }
    async handlePasswordGrant(req, res, context = {}) {
        if (!this.identityPlugin || typeof this.identityPlugin.authenticateWithPassword !== 'function') {
            return res.status(400).json({
                error: 'unsupported_grant_type',
                error_description: 'Password grant is not configured'
            });
        }
        const driver = this.identityPlugin.getAuthDriver?.('password');
        if (!driver || (typeof driver.supportsGrant === 'function' && !driver.supportsGrant('password'))) {
            return res.status(400).json({
                error: 'unsupported_grant_type',
                error_description: 'Password grant is not available'
            });
        }
        const client = context.client ?? req.authenticatedClient ?? null;
        if (client) {
            if (client.active === false) {
                return res.status(400).json({
                    error: 'unauthorized_client',
                    error_description: 'Client is inactive'
                });
            }
            const allowedGrantTypes = Array.isArray(client.grantTypes)
                ? client.grantTypes
                : Array.isArray(client.allowedGrantTypes)
                    ? client.allowedGrantTypes
                    : null;
            if (allowedGrantTypes && allowedGrantTypes.length > 0 && !allowedGrantTypes.includes('password')) {
                return res.status(400).json({
                    error: 'unauthorized_client',
                    error_description: 'Client is not allowed to use password grant'
                });
            }
        }
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'username and password are required'
            });
        }
        const authResult = await this.identityPlugin.authenticateWithPassword({
            email: username,
            password
        });
        if (!authResult?.success || !authResult.user) {
            return res.status(authResult?.statusCode || 400).json({
                error: authResult?.error || 'invalid_grant',
                error_description: 'Invalid credentials'
            });
        }
        const user = authResult.user;
        if (user.active !== undefined && user.active === false) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'User account is inactive'
            });
        }
        const requestedScope = context.scope ?? req.body.scope;
        const scopes = parseScopes(requestedScope);
        const scopeValidation = validateScopes(scopes, this.supportedScopes);
        if (!scopeValidation.valid) {
            return res.status(400).json({
                error: 'invalid_scope',
                error_description: scopeValidation.error
            });
        }
        if (client && Array.isArray(client.allowedScopes) && client.allowedScopes.length > 0) {
            const disallowedScopes = scopeValidation.scopes.filter(scopeValue => !client.allowedScopes.includes(scopeValue));
            if (disallowedScopes.length > 0) {
                return res.status(400).json({
                    error: 'invalid_scope',
                    error_description: `Client is not allowed to request scopes: ${disallowedScopes.join(', ')}`
                });
            }
        }
        const resolvedAudience = client?.clientId || req.body.client_id || this.issuer;
        const userContext = this._buildUserContext(user);
        const accessToken = this.keyManager.createToken({
            iss: this.issuer,
            sub: user.id,
            aud: resolvedAudience,
            scope: scopeValidation.scopes.join(' '),
            token_type: 'access_token',
            token_use: 'user',
            client_id: resolvedAudience,
            email: user.email,
            tenantId: user.tenantId,
            user: userContext
        }, this.accessTokenExpiry);
        const response = {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: this.parseExpiryToSeconds(this.accessTokenExpiry),
            scope: scopeValidation.scopes.join(' ')
        };
        const allowRefreshToken = scopeValidation.scopes.includes('offline_access') &&
            this.supportedGrantTypes.includes('refresh_token');
        if (allowRefreshToken) {
            const refreshToken = this.keyManager.createToken({
                iss: this.issuer,
                sub: user.id,
                aud: resolvedAudience,
                scope: scopeValidation.scopes.join(' '),
                token_type: 'refresh_token',
                token_use: 'refresh',
                client_id: resolvedAudience,
                tenant_id: user.tenantId
            }, this.refreshTokenExpiry);
            response.refresh_token = refreshToken;
        }
        if (scopeValidation.scopes.includes('openid')) {
            const userClaims = extractUserClaims(user, scopeValidation.scopes);
            const idToken = this.keyManager.createToken({
                iss: this.issuer,
                aud: resolvedAudience,
                ...userClaims,
                sub: user.id
            }, this.idTokenExpiry);
            response.id_token = idToken;
        }
        return res.status(200).json(response);
    }
    async handleRefreshToken(req, res, context = {}) {
        const { refresh_token, scope } = req.body;
        const client = context.client ?? req.authenticatedClient ?? null;
        if (!refresh_token) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'refresh_token is required'
            });
        }
        const verified = await this.keyManager.verifyToken(refresh_token);
        if (!verified) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Invalid refresh token'
            });
        }
        const { payload } = verified;
        if (payload.token_type !== 'refresh_token') {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Token is not a refresh token'
            });
        }
        if (client?.clientId && payload.aud && payload.aud !== client.clientId) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Refresh token does not belong to this client'
            });
        }
        if (client?.active === false) {
            return res.status(400).json({
                error: 'unauthorized_client',
                error_description: 'Client is inactive'
            });
        }
        const allowedGrantTypes = Array.isArray(client?.grantTypes)
            ? client.grantTypes
            : Array.isArray(client?.allowedGrantTypes)
                ? client.allowedGrantTypes
                : null;
        if (allowedGrantTypes && allowedGrantTypes.length > 0 && !allowedGrantTypes.includes('refresh_token')) {
            return res.status(400).json({
                error: 'unauthorized_client',
                error_description: 'Client is not allowed to use refresh_token grant'
            });
        }
        const claimValidation = validateClaims(payload, {
            issuer: this.issuer,
            clockTolerance: 60
        });
        if (!claimValidation.valid) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: claimValidation.error
            });
        }
        const overrideScope = context.scope ?? scope;
        const requestedScopes = overrideScope ? parseScopes(overrideScope) : parseScopes(payload.scope);
        const originalScopes = parseScopes(payload.scope);
        const invalidScopes = requestedScopes.filter(s => !originalScopes.includes(s));
        if (invalidScopes.length > 0) {
            return res.status(400).json({
                error: 'invalid_scope',
                error_description: `Cannot request scopes not in original grant: ${invalidScopes.join(', ')}`
            });
        }
        if (client && Array.isArray(client.allowedScopes) && client.allowedScopes.length > 0) {
            const disallowedScopes = requestedScopes.filter(scopeValue => !client.allowedScopes.includes(scopeValue));
            if (disallowedScopes.length > 0) {
                return res.status(400).json({
                    error: 'invalid_scope',
                    error_description: `Client is not allowed to request scopes: ${disallowedScopes.join(', ')}`
                });
            }
        }
        const user = await this.userResource.get(payload.sub);
        if (!user) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'User not found'
            });
        }
        const userContext = this._buildUserContext(user);
        const accessToken = this.keyManager.createToken({
            iss: this.issuer,
            sub: user.id,
            aud: payload.aud,
            scope: requestedScopes.join(' '),
            token_type: 'access_token',
            token_use: 'user',
            client_id: payload.client_id || payload.aud,
            email: user.email,
            tenantId: user.tenantId,
            user: userContext
        }, this.accessTokenExpiry);
        const response = {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: this.parseExpiryToSeconds(this.accessTokenExpiry),
            scope: requestedScopes.join(' ')
        };
        if (requestedScopes.includes('openid')) {
            const userClaims = extractUserClaims(user, requestedScopes);
            const idToken = this.keyManager.createToken({
                iss: this.issuer,
                aud: payload.aud,
                ...userClaims,
                sub: user.id
            }, this.idTokenExpiry);
            response.id_token = idToken;
        }
        return res.status(200).json(response);
    }
    async userinfoHandler(req, res) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    error: 'invalid_token',
                    error_description: 'Missing or invalid Authorization header'
                });
            }
            const token = authHeader.substring(7);
            const verified = await this.keyManager.verifyToken(token);
            if (!verified) {
                return res.status(401).json({
                    error: 'invalid_token',
                    error_description: 'Invalid access token'
                });
            }
            const { payload } = verified;
            const claimValidation = validateClaims(payload, {
                issuer: this.issuer,
                clockTolerance: 60
            });
            if (!claimValidation.valid) {
                return res.status(401).json({
                    error: 'invalid_token',
                    error_description: claimValidation.error
                });
            }
            const user = await this.userResource.get(payload.sub);
            if (!user) {
                return res.status(404).json({
                    error: 'not_found',
                    error_description: 'User not found'
                });
            }
            const scopes = parseScopes(payload.scope);
            const userClaims = extractUserClaims(user, scopes);
            return res.status(200).json({
                ...userClaims,
                sub: user.id
            });
        }
        catch (error) {
            return res.status(500).json({
                error: 'server_error',
                error_description: error.message
            });
        }
    }
    async introspectHandler(req, res) {
        try {
            const { token } = req.body;
            if (!token) {
                return res.status(400).json({
                    error: 'invalid_request',
                    error_description: 'token is required'
                });
            }
            const verified = await this.keyManager.verifyToken(token);
            if (!verified) {
                return res.status(200).json({ active: false });
            }
            const { payload } = verified;
            const claimValidation = validateClaims(payload, {
                issuer: this.issuer,
                clockTolerance: 60
            });
            if (!claimValidation.valid) {
                return res.status(200).json({ active: false });
            }
            const response = {
                active: true,
                scope: payload.scope,
                client_id: payload.client_id || payload.aud,
                username: payload.sub,
                token_type: payload.token_type || 'access_token',
                token_use: payload.token_use || (payload.token_type === 'refresh_token' ? 'refresh' : 'user'),
                exp: payload.exp,
                iat: payload.iat,
                sub: payload.sub,
                iss: payload.iss,
                aud: payload.aud
            };
            if (payload.service_account) {
                response.service_account = payload.service_account;
            }
            if (payload.user) {
                response.user = payload.user;
            }
            if (payload.email) {
                response.email = payload.email;
            }
            if (payload.tenant_id || payload.tenantId) {
                response.tenant_id = payload.tenant_id || payload.tenantId;
            }
            return res.status(200).json(response);
        }
        catch (error) {
            return res.status(500).json({
                error: 'server_error',
                error_description: error.message
            });
        }
    }
    async authenticateClient(clientId, clientSecret) {
        if (!this.clientResource) {
            return null;
        }
        const driver = this.identityPlugin?.getAuthDriver?.('client_credentials');
        if (driver) {
            const authResult = await driver.authenticate({ clientId, clientSecret });
            if (authResult?.success) {
                return authResult.client || { clientId };
            }
            return null;
        }
        const [ok, err, clients] = await tryFn(() => this.clientResource.query({ clientId }));
        if (!ok) {
            if (err && (this.identityPlugin?.config?.logLevel === 'debug' || this.identityPlugin?.config?.logLevel === 'trace')) {
                this.logger.error('[Identity Plugin] Failed to query clients resource:', err.message);
            }
            return null;
        }
        if (!clients || clients.length === 0) {
            return null;
        }
        const client = clients[0];
        if (client.active === false) {
            return null;
        }
        const secrets = [];
        if (Array.isArray(client.secrets)) {
            secrets.push(...client.secrets);
        }
        if (client.clientSecret) {
            secrets.push(client.clientSecret);
        }
        if (client.secret) {
            secrets.push(client.secret);
        }
        if (!secrets.length) {
            return null;
        }
        let secretMatches = false;
        for (const storedSecret of secrets) {
            if (!storedSecret)
                continue;
            if (this._isHashedSecret(storedSecret)) {
                try {
                    const okHash = await verifyPassword(clientSecret, storedSecret);
                    if (okHash) {
                        secretMatches = true;
                        break;
                    }
                }
                catch (error) {
                    if (this.identityPlugin?.config?.logLevel === 'debug' || this.identityPlugin?.config?.logLevel === 'trace') {
                        this.logger.error('[Identity Plugin] Failed to verify client secret hash:', error.message);
                    }
                }
                continue;
            }
            if (constantTimeEqual(clientSecret, storedSecret)) {
                secretMatches = true;
                break;
            }
        }
        if (!secretMatches) {
            return null;
        }
        const sanitizedClient = { ...client };
        if (sanitizedClient.clientSecret !== undefined) {
            delete sanitizedClient.clientSecret;
        }
        if (sanitizedClient.secret !== undefined) {
            delete sanitizedClient.secret;
        }
        if (sanitizedClient.secrets !== undefined) {
            delete sanitizedClient.secrets;
        }
        return sanitizedClient;
    }
    _isHashedSecret(value) {
        if (typeof value !== 'string') {
            return false;
        }
        return value.startsWith('$') || value.startsWith('s3db$');
    }
    async validatePKCE(codeVerifier, codeChallenge, codeChallengeMethod = 'plain') {
        if (codeChallengeMethod === 'plain') {
            return codeVerifier === codeChallenge;
        }
        if (codeChallengeMethod === 'S256') {
            const crypto = await import('crypto');
            const hash = crypto.createHash('sha256')
                .update(codeVerifier)
                .digest('base64url');
            return hash === codeChallenge;
        }
        return false;
    }
    parseExpiryToSeconds(expiresIn) {
        const match = expiresIn.match(/^(\d+)([smhd])$/);
        if (!match) {
            throw new PluginError('Invalid expiresIn format', {
                pluginName: 'IdentityPlugin',
                operation: 'parseExpiryToSeconds',
                statusCode: 400,
                retriable: false,
                suggestion: 'Use a duration string such as "15m", "24h", or "30s".'
            });
        }
        const [, value, unit] = match;
        const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
        return parseInt(value) * multipliers[unit];
    }
    _resolveClientAudiences(client) {
        if (!client) {
            return [this.issuer];
        }
        const candidates = [
            client.audiences,
            client.allowedAudiences,
            client.metadata?.audiences,
            client.metadata?.audience,
            client.defaultAudience,
            client.audience
        ];
        for (const entry of candidates) {
            if (!entry)
                continue;
            if (Array.isArray(entry) && entry.length > 0) {
                return entry.filter(Boolean);
            }
            if (typeof entry === 'string' && entry.trim()) {
                return [entry.trim()];
            }
        }
        return [this.issuer];
    }
    _formatAudienceClaim(audiences) {
        if (!Array.isArray(audiences)) {
            return (audiences || this.issuer);
        }
        const filtered = audiences.filter(Boolean);
        if (filtered.length === 0) {
            return this.issuer;
        }
        return filtered.length === 1 ? filtered[0] : filtered;
    }
    _buildServiceAccountContext(client, scopes = []) {
        const audiences = this._resolveClientAudiences(client);
        const context = {
            clientId: client?.clientId || null,
            client_id: client?.clientId || null,
            name: client?.name || client?.clientName || client?.displayName || client?.clientId || 'service-account',
            scopes,
            audiences
        };
        if (client?.tenantId) {
            context.tenantId = client.tenantId;
        }
        if (client?.metadata) {
            context.metadata = client.metadata;
        }
        if (client?.description) {
            context.description = client.description;
        }
        return context;
    }
    _buildUserContext(user) {
        if (!user)
            return null;
        const context = { id: user.id };
        if (user.tenantId) {
            context.tenantId = user.tenantId;
        }
        if (user.email) {
            context.email = user.email;
        }
        if (user.name) {
            context.name = user.name;
        }
        if (Array.isArray(user.roles) && user.roles.length > 0) {
            context.roles = user.roles;
        }
        if (user.metadata) {
            context.metadata = user.metadata;
        }
        return context;
    }
    async authorizeHandler(req, res) {
        try {
            const { response_type, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method = 'plain' } = req.query || {};
            if (!response_type || !client_id || !redirect_uri) {
                return res.status(400).json({
                    error: 'invalid_request',
                    error_description: 'response_type, client_id, and redirect_uri are required'
                });
            }
            if (!this.supportedResponseTypes.includes(response_type)) {
                return res.status(400).json({
                    error: 'unsupported_response_type',
                    error_description: `Response type ${response_type} is not supported`
                });
            }
            if (this.clientResource) {
                const clients = await this.clientResource.query({ clientId: client_id });
                if (clients.length === 0) {
                    return res.status(400).json({
                        error: 'invalid_client',
                        error_description: 'Client not found'
                    });
                }
                const client = clients[0];
                if (!client.redirectUris?.includes(redirect_uri)) {
                    return res.status(400).json({
                        error: 'invalid_request',
                        error_description: 'Invalid redirect_uri'
                    });
                }
                if (scope) {
                    const requestedScopes = scope.split(' ');
                    const invalidScopes = requestedScopes.filter((s) => !client.allowedScopes?.includes(s));
                    if (invalidScopes.length > 0) {
                        return res.status(400).json({
                            error: 'invalid_scope',
                            error_description: `Invalid scopes: ${invalidScopes.join(', ')}`
                        });
                    }
                }
            }
            const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Authorization - ${this.issuer}</title>
  <style>
    body { font-family: system-ui; max-width: 400px; margin: 100px auto; padding: 20px; }
    form { background: #f5f5f5; padding: 20px; border-radius: 8px; }
    input { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; }
    button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #0056b3; }
    .info { background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="info">
    <strong>Application requesting access:</strong><br>
    Client ID: ${client_id}<br>
    Scopes: ${scope || 'none'}<br>
    Redirect: ${redirect_uri}
  </div>
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="response_type" value="${response_type}">
    <input type="hidden" name="client_id" value="${client_id}">
    <input type="hidden" name="redirect_uri" value="${redirect_uri}">
    <input type="hidden" name="scope" value="${scope || ''}">
    <input type="hidden" name="state" value="${state || ''}">
    <input type="hidden" name="code_challenge" value="${code_challenge || ''}">
    <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">

    <input type="email" name="username" placeholder="Email" required>
    <input type="password" name="password" placeholder="Password" required>
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`;
            return res.status(200).header('Content-Type', 'text/html').send(html);
        }
        catch (error) {
            this.logger.error('[OAuth2Server] Authorization error:', error);
            return res.status(500).json({
                error: 'server_error',
                error_description: error.message
            });
        }
    }
    async authorizePostHandler(req, res) {
        try {
            const { response_type, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method = 'plain', username, password } = req.body || {};
            const users = await this.userResource.query({ email: username });
            if (users.length === 0) {
                return res.status(401).json({
                    error: 'access_denied',
                    error_description: 'Invalid credentials'
                });
            }
            const user = users[0];
            const [okVerify, errVerify, isValid] = await tryFn(() => verifyPassword(password, user.password));
            if (!okVerify) {
                this.logger.error('[OAuth2Server] Password verification error:', errVerify);
                return res.status(500).json({
                    error: 'server_error',
                    error_description: 'Authentication failed'
                });
            }
            if (!isValid) {
                return res.status(401).json({
                    error: 'access_denied',
                    error_description: 'Invalid credentials'
                });
            }
            const code = generateAuthCode();
            const expiresAt = new Date(Date.now() + this.parseExpiryToSeconds(this.authCodeExpiry) * 1000).toISOString();
            if (this.authCodeResource) {
                await this.authCodeResource.insert({
                    code,
                    clientId: client_id,
                    userId: user.id,
                    redirectUri: redirect_uri,
                    scope: scope || '',
                    expiresAt,
                    used: false,
                    codeChallenge: code_challenge || null,
                    codeChallengeMethod: code_challenge_method
                });
            }
            const url = new URL(redirect_uri);
            url.searchParams.set('code', code);
            if (state) {
                url.searchParams.set('state', state);
            }
            return res.redirect(url.toString());
        }
        catch (error) {
            this.logger.error('[OAuth2Server] Authorization POST error:', error);
            return res.status(500).json({
                error: 'server_error',
                error_description: error.message
            });
        }
    }
    async registerClientHandler(req, res) {
        try {
            const { redirect_uris, token_endpoint_auth_method = 'client_secret_basic', grant_types, response_types, client_name, client_uri, logo_uri, scope, contacts, tos_uri, policy_uri } = req.body || {};
            if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
                return res.status(400).json({
                    error: 'invalid_redirect_uri',
                    error_description: 'redirect_uris is required and must be a non-empty array'
                });
            }
            for (const uri of redirect_uris) {
                try {
                    new URL(uri);
                }
                catch {
                    return res.status(400).json({
                        error: 'invalid_redirect_uri',
                        error_description: `Invalid redirect URI: ${uri}`
                    });
                }
            }
            const clientId = generateClientId();
            const clientSecret = generateClientSecret();
            const clientData = {
                clientId,
                clientSecret,
                name: client_name || `Client ${clientId}`,
                redirectUris: redirect_uris,
                allowedScopes: scope ? scope.split(' ') : this.supportedScopes,
                grantTypes: grant_types || ['authorization_code', 'refresh_token'],
                responseTypes: response_types || ['code'],
                tokenEndpointAuthMethod: token_endpoint_auth_method,
                active: true
            };
            if (client_uri)
                clientData.clientUri = client_uri;
            if (logo_uri)
                clientData.logoUri = logo_uri;
            if (contacts)
                clientData.contacts = contacts;
            if (tos_uri)
                clientData.tosUri = tos_uri;
            if (policy_uri)
                clientData.policyUri = policy_uri;
            if (!this.clientResource) {
                return res.status(500).json({
                    error: 'server_error',
                    error_description: 'Client registration not available'
                });
            }
            await this.clientResource.insert(clientData);
            return res.status(201).json({
                client_id: clientId,
                client_secret: clientSecret,
                client_id_issued_at: Math.floor(Date.now() / 1000),
                client_secret_expires_at: 0,
                redirect_uris: redirect_uris,
                token_endpoint_auth_method,
                grant_types: clientData.grantTypes,
                response_types: clientData.responseTypes,
                client_name: clientData.name,
                client_uri,
                logo_uri,
                scope: clientData.allowedScopes.join(' '),
                contacts,
                tos_uri,
                policy_uri
            });
        }
        catch (error) {
            this.logger.error('[OAuth2Server] Client registration error:', error);
            return res.status(500).json({
                error: 'server_error',
                error_description: error.message
            });
        }
    }
    async revokeHandler(req, res) {
        try {
            const { token } = req.body || {};
            if (!token) {
                return res.status(400).json({
                    error: 'invalid_request',
                    error_description: 'token is required'
                });
            }
            const currentKey = this.keyManager.getCurrentKey();
            if (!currentKey) {
                return res.status(200).send();
            }
            const [valid] = verifyRS256Token(token, currentKey.publicKey);
            if (!valid) {
                return res.status(200).send();
            }
            return res.status(200).send();
        }
        catch (error) {
            this.logger.error('[OAuth2Server] Token revocation error:', error);
            return res.status(200).send();
        }
    }
    async rotateKeys() {
        return await this.keyManager.rotateKey();
    }
    parseAuthCodeExpiry(value) {
        if (typeof value === 'number') {
            return value > 1e12 ? value : value * 1000;
        }
        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            return Number.isNaN(parsed) ? NaN : parsed;
        }
        return NaN;
    }
}
export default OAuth2Server;
//# sourceMappingURL=oauth2-server.js.map