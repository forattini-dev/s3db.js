export interface DerivedKeys {
    encryption: Buffer;
    signing: Buffer;
}
export interface KeystoreResult {
    current: DerivedKeys;
    keystore: DerivedKeys[];
}
export interface JwtKeyResult {
    current: {
        signing: Buffer;
        encryption: Buffer;
    };
    keystore: DerivedKeys[];
}
export declare function deriveKey(secret: string | Buffer, context: string, length?: number): Buffer;
export declare function deriveKeystore(secret: string | string[], encryptionContext: string, signingContext: string): KeystoreResult;
export declare function deriveOidcKeys(cookieSecret: string | string[]): KeystoreResult;
export declare function deriveJwtKeys(jwtSecret: string | string[]): JwtKeyResult;
//# sourceMappingURL=crypto.d.ts.map