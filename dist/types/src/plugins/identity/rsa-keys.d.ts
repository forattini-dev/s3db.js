/**
 * RSA Key Management for OAuth2/OIDC
 *
 * Manages RS256 key pairs for signing and verifying JWTs
 * Zero external dependencies - uses Node.js crypto only
 */
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
export declare function generateKeyPair(modulusLength?: number): KeyPairResult;
export declare function pemToJwk(publicKeyPem: string, kid: string): JWK;
export declare function createRS256Token(payload: JWTPayload, privateKey: string, kid: string, expiresIn?: string): string;
export declare function verifyRS256Token(token: string, publicKey: string): [boolean, JWTPayload | null, JWTHeader | null];
export declare function getKidFromToken(token: string): string | null;
export declare class KeyManager {
    private keyResource;
    private keysByPurpose;
    private currentKeys;
    private keysByKid;
    constructor(keyResource: KeyResource);
    initialize(): Promise<void>;
    rotateKey(purpose?: string): Promise<KeyRecord>;
    getCurrentKey(purpose?: string): KeyEntry | null;
    getKey(kid: string): Promise<KeyEntry | null>;
    ensurePurpose(purpose?: string): Promise<KeyEntry>;
    getJWKS(): Promise<JWKS>;
    createToken(payload: JWTPayload, expiresIn?: string, purpose?: string): string;
    verifyToken(token: string): Promise<VerifyTokenResult | null>;
    private _normalizePurpose;
    private _storeKeyRecord;
}
declare const _default: {
    generateKeyPair: typeof generateKeyPair;
    pemToJwk: typeof pemToJwk;
    createRS256Token: typeof createRS256Token;
    verifyRS256Token: typeof verifyRS256Token;
    getKidFromToken: typeof getKidFromToken;
    KeyManager: typeof KeyManager;
};
export default _default;
//# sourceMappingURL=rsa-keys.d.ts.map