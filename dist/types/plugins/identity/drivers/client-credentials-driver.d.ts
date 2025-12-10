/**
 * Client Credentials Authentication Driver
 *
 * Handles OAuth2 client_credentials grant type authentication.
 * Supports both plaintext and hashed client secrets with constant-time comparison.
 */
import { AuthDriver, AuthDriverContext, AuthenticateRequest, AuthenticateResult } from './auth-driver.interface.js';
export interface ClientCredentialsAuthDriverOptions {
}
export declare class ClientCredentialsAuthDriver extends AuthDriver {
    private options;
    private clientResource;
    private passwordHelper;
    constructor(options?: ClientCredentialsAuthDriverOptions);
    initialize(context: AuthDriverContext): Promise<void>;
    supportsGrant(grantType: string): boolean;
    authenticate(request: AuthenticateRequest): Promise<AuthenticateResult>;
    private _verifyAgainstSecrets;
}
//# sourceMappingURL=client-credentials-driver.d.ts.map