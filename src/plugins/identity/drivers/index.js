import { PasswordAuthDriver } from './password-driver.js';
import { ClientCredentialsAuthDriver } from './client-credentials-driver.js';

export function createBuiltInAuthDrivers(options = {}) {
  const drivers = [];

  if (options.disablePassword !== true) {
    drivers.push(new PasswordAuthDriver(options.password || {}));
  }

  if (options.disableClientCredentials !== true) {
    drivers.push(new ClientCredentialsAuthDriver(options.clientCredentials || {}));
  }

  return drivers;
}

export { PasswordAuthDriver, ClientCredentialsAuthDriver };
