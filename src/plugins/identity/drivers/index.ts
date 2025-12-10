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

export function createBuiltInAuthDrivers(options: BuiltInAuthDriversOptions = {}): AuthDriver[] {
  const drivers: AuthDriver[] = [];

  if (options.disablePassword !== true) {
    drivers.push(new PasswordAuthDriver(options.password || {}));
  }

  if (options.disableClientCredentials !== true) {
    drivers.push(new ClientCredentialsAuthDriver(options.clientCredentials || {}));
  }

  return drivers;
}

export { PasswordAuthDriver, ClientCredentialsAuthDriver };
export type { PasswordAuthDriverOptions, ClientCredentialsAuthDriverOptions };
export type {
  AuthDriver,
  AuthDriverContext,
  AuthenticateRequest,
  AuthenticateResult,
  IssueTokensPayload,
  RevokeTokensPayload
} from './auth-driver.interface.js';
