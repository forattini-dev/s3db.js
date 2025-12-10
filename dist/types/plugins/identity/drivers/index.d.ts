/**
 * Identity Plugin Authentication Drivers
 *
 * Factory function and exports for built-in authentication drivers.
 */
import { PasswordAuthDriver, PasswordAuthDriverOptions } from './password-driver.js';
import { ClientCredentialsAuthDriver, ClientCredentialsAuthDriverOptions } from './client-credentials-driver.js';
import { AuthDriver } from './auth-driver.interface.js';
export interface BuiltInAuthDriversOptions {
    disablePassword?: boolean;
    disableClientCredentials?: boolean;
    password?: PasswordAuthDriverOptions;
    clientCredentials?: ClientCredentialsAuthDriverOptions;
}
export declare function createBuiltInAuthDrivers(options?: BuiltInAuthDriversOptions): AuthDriver[];
export { PasswordAuthDriver, ClientCredentialsAuthDriver };
export type { PasswordAuthDriverOptions, ClientCredentialsAuthDriverOptions };
export type { AuthDriver, AuthDriverContext, AuthenticateRequest, AuthenticateResult, IssueTokensPayload, RevokeTokensPayload } from './auth-driver.interface.js';
//# sourceMappingURL=index.d.ts.map