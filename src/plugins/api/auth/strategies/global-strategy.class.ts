import type { MiddlewareHandler } from 'hono';
import { BaseAuthStrategy, type BaseAuthStrategyOptions } from './base-strategy.class.js';
import { createAuthMiddleware } from '../index.js';

export class GlobalAuthStrategy extends BaseAuthStrategy {
  override async createMiddleware(): Promise<MiddlewareHandler> {
    const methods: string[] = [];
    const driverConfigs = this.extractDriverConfigs(null);

    for (const driverDef of this.drivers) {
      const driverName = driverDef.driver;

      if (driverName === 'oauth2-server' || driverName === 'oidc') {
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
      oidc: this.oidcMiddleware || null,
      database: this.database,
      optional: true
    });
  }
}
