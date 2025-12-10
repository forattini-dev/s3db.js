import crypto from 'crypto';
export function deriveKey(secret, context, length = 32) {
    const secretBuffer = typeof secret === 'string'
        ? Buffer.from(secret, 'utf8')
        : secret;
    const derived = crypto.hkdfSync('sha256', secretBuffer, Buffer.alloc(0), context, length);
    return Buffer.from(derived);
}
export function deriveKeystore(secret, encryptionContext, signingContext) {
    const secrets = Array.isArray(secret) ? secret : [secret];
    const currentSecret = secrets[0];
    const current = {
        encryption: deriveKey(currentSecret, encryptionContext),
        signing: deriveKey(currentSecret, signingContext),
    };
    const keystore = secrets.map(s => ({
        encryption: deriveKey(s, encryptionContext),
        signing: deriveKey(s, signingContext),
    }));
    return { current, keystore };
}
export function deriveOidcKeys(cookieSecret) {
    return deriveKeystore(cookieSecret, 'OIDC Session Encryption', 'OIDC Cookie Signing');
}
export function deriveJwtKeys(jwtSecret) {
    return deriveKeystore(jwtSecret, 'JWT Token Encryption', 'JWT Token Signing');
}
//# sourceMappingURL=crypto.js.map