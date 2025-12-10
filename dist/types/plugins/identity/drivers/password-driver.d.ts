/**
 * Password Authentication Driver
 *
 * Handles password-based authentication using username/email and password.
 * Supports case-insensitive identifier matching and tenant-scoped lookups.
 */
import { AuthDriver, AuthDriverContext, AuthenticateRequest, AuthenticateResult } from './auth-driver.interface.js';
export interface PasswordAuthDriverOptions {
    identifierField?: string;
    caseInsensitive?: boolean;
}
export declare class PasswordAuthDriver extends AuthDriver {
    private options;
    private usersResource;
    private passwordHelper;
    private identifierField;
    private caseInsensitive;
    constructor(options?: PasswordAuthDriverOptions);
    initialize(context: AuthDriverContext): Promise<void>;
    supportsGrant(grantType: string): boolean;
    authenticate(request?: AuthenticateRequest): Promise<AuthenticateResult>;
    private _normalizeIdentifier;
}
//# sourceMappingURL=password-driver.d.ts.map