import crypto from 'crypto';
import { SignJWT, importJWK, importPKCS8, importSPKI, exportJWK } from 'jose';
export async function generateClientAssertion(options) {
    const { clientId, tokenEndpoint, privateKey, algorithm = 'RS256', expiresIn = 300 } = options;
    if (!clientId) {
        throw new Error('clientId is required for client assertion');
    }
    if (!tokenEndpoint) {
        throw new Error('tokenEndpoint is required for client assertion');
    }
    if (!privateKey) {
        throw new Error('privateKey is required for client assertion');
    }
    const key = await importJWK(privateKey, algorithm);
    const jti = crypto.randomBytes(16).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const exp = now + expiresIn;
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
export async function createClientAuth(config, tokenEndpoint) {
    const { clientId, clientSecret, privateKey, tokenEndpointAuthMethod } = config;
    const authMethod = tokenEndpointAuthMethod || (clientSecret ? 'client_secret_basic' : 'none');
    switch (authMethod) {
        case 'client_secret_basic':
            return {
                method: 'client_secret_basic',
                clientId,
                clientSecret
            };
        case 'client_secret_post':
            return {
                method: 'client_secret_post',
                clientId,
                clientSecret
            };
        case 'private_key_jwt':
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
            return {
                method: 'none',
                clientId
            };
        default:
            throw new Error(`Unsupported token endpoint auth method: ${authMethod}`);
    }
}
export function applyClientAuth(clientAuth, requestOptions) {
    const { method, clientId, clientSecret, clientAssertion, clientAssertionType } = clientAuth;
    const options = { ...requestOptions };
    const body = new URLSearchParams(options.body?.toString() || '');
    switch (method) {
        case 'client_secret_basic':
            const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            options.headers = {
                ...options.headers,
                'Authorization': `Basic ${credentials}`
            };
            break;
        case 'client_secret_post':
            body.append('client_id', clientId);
            body.append('client_secret', clientSecret);
            break;
        case 'private_key_jwt':
            body.append('client_id', clientId);
            body.append('client_assertion_type', clientAssertionType);
            body.append('client_assertion', clientAssertion);
            break;
        case 'none':
            body.append('client_id', clientId);
            break;
    }
    options.body = body;
    return options;
}
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
    const supportedKeyTypes = ['RSA', 'EC', 'OKP'];
    if (jwk.kty && !supportedKeyTypes.includes(jwk.kty)) {
        errors.push(`Unsupported key type "${jwk.kty}". Supported: ${supportedKeyTypes.join(', ')}`);
    }
    if (jwk.kty === 'RSA' && !jwk.d) {
        errors.push('RSA private key missing "d" component');
    }
    if (jwk.kty === 'EC' && !jwk.d) {
        errors.push('EC private key missing "d" component');
    }
    if (jwk.kty === 'OKP' && !jwk.d) {
        errors.push('OKP private key missing "d" component');
    }
    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : null
    };
}
export async function generateRSAKeyPair(options = {}) {
    const { modulusLength = 2048, keyId } = options;
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const privateKeyObject = await importPKCS8(privateKey, 'RS256');
    const publicKeyObject = await importSPKI(publicKey, 'RS256');
    const privateJWK = await exportJWK(privateKeyObject);
    const publicJWK = await exportJWK(publicKeyObject);
    if (keyId) {
        privateJWK.kid = keyId;
        publicJWK.kid = keyId;
    }
    return {
        privateKey: { ...privateJWK, alg: 'RS256', use: 'sig' },
        publicKey: { ...publicJWK, alg: 'RS256', use: 'sig' }
    };
}
//# sourceMappingURL=oidc-client-assertion.js.map