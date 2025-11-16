/**
 * GlobalAuthStrategy - Global authentication for all routes
 *
 * Uses all configured auth drivers with optional=true
 * (guards control actual authorization)
 */

import { BaseAuthStrategy } from './base-strategy.class.js';
import { createAuthMiddleware } from '../index.js';

export class GlobalAuthStrategy extends BaseAuthStrategy {
  async createMiddleware() {
    const methods = [];
    const driverConfigs = this.extractDriverConfigs(null); // all drivers

    for (const driverDef of this.drivers) {
      const driverName = driverDef.driver;

      // Skip oauth2-server and oidc
      if (driverName === 'oauth2-server' || driverName === 'oidc') {
        continue;
      }

      if (!methods.includes(driverName)) {
        methods.push(driverName);
      }
    }

    // 🪵 Debug: global auth methods
    this.logger.debug({ methods }, `Using global auth with methods: ${methods.join(', ')}`);

    return await createAuthMiddleware({
      methods,
      jwt: driverConfigs.jwt,
      apiKey: driverConfigs.apiKey,
      basic: driverConfigs.basic,
      oauth2: driverConfigs.oauth2,
      oidc: this.oidcMiddleware || null,
      database: this.database,
      optional: true  // Let guards handle authorization
    });
  }
}
