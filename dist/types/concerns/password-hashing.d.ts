export declare function hashPasswordSync(password: string, rounds?: number): string;
export declare function hashPassword(password: string, rounds?: number): Promise<string>;
export declare function verifyPassword(plaintext: string, hash: string): Promise<boolean>;
export declare function compactHash(bcryptHash: string): string;
export declare function expandHash(compactHashStr: string, rounds?: number): string;
export declare function isBcryptHash(str: string): boolean;
declare const _default: {
    hashPassword: typeof hashPassword;
    hashPasswordSync: typeof hashPasswordSync;
    verifyPassword: typeof verifyPassword;
    compactHash: typeof compactHash;
    expandHash: typeof expandHash;
    isBcryptHash: typeof isBcryptHash;
};
export default _default;
//# sourceMappingURL=password-hashing.d.ts.map