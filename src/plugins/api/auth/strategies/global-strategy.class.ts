import type { MiddlewareHandler } from '#src/plugins/shared/http-runtime.js';
import { BaseAuthStrategy, type BaseAuthStrategyOptions } from './base-strategy.class.js';
import { createAuthMiddleware } from '../index.js';

export class GlobalAuthStrategy extends BaseAuthStrategy {
  override async createMiddleware(): Promise<MiddlewareHandler> {
    const methods: string[] = [];
    const driverConfigs = this.extractDriverConfigs(null);
    const oidcConfig = this.drivers.find((driver) => driver.driver === 'oidc' || driver.type === 'oidc')?.config || {};

    for (const driverDef of this.drivers) {
      const driverName = driverDef.driver;

      if (driverName === 'oauth2-server') {
        continue;
      }

      if (!methods.includes(driverName)) {
        methods.push(driverName);
      }
    }

    this.logger.debug({ methods }, `Using global auth with methods: ${methods.join(', ')}`);

    return await createAuthMiddleware({
      methods,
      jwt: driverConfigs.jwt,
      apiKey: driverConfigs.apiKey,
      basic: driverConfigs.basic,
      oauth2: driverConfigs.oauth2,
      headerSecret: driverConfigs.headerSecret,
      oidc: this.oidcMiddleware || null,
      oidcCookieName: typeof oidcConfig.cookieName === 'string' ? oidcConfig.cookieName : 'oidc_session',
      database: this.database,
      optional: true
    });
  }
}
