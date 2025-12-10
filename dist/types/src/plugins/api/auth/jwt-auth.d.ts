import type { Context, Next } from 'hono';
import type { ResourceLike, DatabaseLike } from './resource-manager.js';
export interface JWTPayload {
    iat?: number;
    exp?: number;
    id?: string;
    role?: string;
    scopes?: string[];
    [key: string]: unknown;
}
export interface JWTConfig {
    resource?: string;
    createResource?: boolean;
    secret?: string;
    userField?: string;
    passwordField?: string;
    passphrase?: string;
    expiresIn?: string;
    optional?: boolean;
    cookieName?: string | null;
}
export interface UserRecord {
    id: string;
    active?: boolean;
    role?: string;
    scopes?: string[];
    [key: string]: unknown;
}
export interface LoginResult {
    success: boolean;
    token?: string;
    user?: UserRecord;
    error?: string;
}
export declare function createToken(payload: JWTPayload, secret: string, expiresIn?: string): string;
export declare function verifyToken(token: string, secret: string): JWTPayload | null;
export declare function createJWTHandler(config: JWTConfig | undefined, database: DatabaseLike): Promise<(c: Context, next: Next) => Promise<Response | void>>;
export declare function jwtLogin(authResource: ResourceLike, username: string, password: string, config?: JWTConfig): Promise<LoginResult>;
declare const _default: {
    createToken: typeof createToken;
    verifyToken: typeof verifyToken;
    createJWTHandler: typeof createJWTHandler;
    jwtLogin: typeof jwtLogin;
};
export default _default;
//# sourceMappingURL=jwt-auth.d.ts.map