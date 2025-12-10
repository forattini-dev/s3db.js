/**
 * Base Authentication Driver Interface
 *
 * Abstract base class for authentication drivers in the Identity Plugin.
 * All auth drivers must extend this class and implement the required methods.
 */
export interface AuthDriverContext {
    database?: any;
    config?: any;
    resources?: {
        users?: any;
        clients?: any;
        tenants?: any;
    };
    helpers?: {
        password?: {
            hash: (password: string) => Promise<string>;
            verify: (password: string, hash: string) => Promise<boolean>;
        };
        token?: any;
    };
}
export interface AuthenticateRequest {
    email?: string;
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
    user?: any;
    [key: string]: any;
}
export interface AuthenticateResult {
    success: boolean;
    user?: any;
    client?: any;
    error?: string;
    statusCode?: number;
}
export interface IssueTokensPayload {
    user?: any;
    client?: any;
    scopes?: string[];
    [key: string]: any;
}
export interface RevokeTokensPayload {
    token?: string;
    tokenType?: string;
    userId?: string;
    clientId?: string;
    [key: string]: any;
}
export declare class AuthDriver {
    name: string;
    supportedTypes: string[];
    constructor(name: string, supportedTypes?: string[]);
    initialize(_context: AuthDriverContext): Promise<void>;
    authenticate(_request: AuthenticateRequest): Promise<AuthenticateResult>;
    supportsType(type: string): boolean;
    supportsGrant(_grantType: string): boolean;
    issueTokens(_payload: IssueTokensPayload): Promise<any>;
    revokeTokens(_payload: RevokeTokensPayload): Promise<void>;
}
//# sourceMappingURL=auth-driver.interface.d.ts.map